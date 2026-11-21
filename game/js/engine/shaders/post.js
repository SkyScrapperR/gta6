// Post-processing shaders: bright-pass downsample, blurred upsample chain for bloom, luminance
// reduction for auto-exposure, and the final composite (exposure, ACES, vignette, colour grade,
// desaturation for the FLATLINED screen, pause blur dim).

import { GLSL_HEADER } from './common.js';

export const BRIGHT_FS = `${GLSL_HEADER}
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uExposure;
out vec4 fragColor;
void main() {
  vec3 c = vec3(0.0);
  c += texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1, 1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(1, 1)).rgb;
  c *= 0.25 * uExposure;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
  c = min(c * k, vec3(30.0));
  fragColor = vec4(c, 1.0);
}
`;

export const DOWN_FS = `${GLSL_HEADER}
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
out vec4 fragColor;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1, 1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(1, 1)).rgb;
  fragColor = vec4(c / 8.0, 1.0);
}
`;

export const UP_FS = `${GLSL_HEADER}
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uBase;
uniform vec2 uTexel;
uniform float uMix;
out vec4 fragColor;
void main() {
  vec3 c = vec3(0.0);
  c += texture(uSrc, vUv + uTexel * vec2(-1, 0)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2(1, 0)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2(0, -1)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2(0, 1)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1, 1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(1, 1)).rgb;
  c /= 12.0;
  fragColor = vec4(texture(uBase, vUv).rgb + c * uMix, 1.0);
}
`;

/** Average log-luminance from a small HDR mip, read back on the CPU for auto exposure. */
export const LUMA_FS = `${GLSL_HEADER}
in vec2 vUv;
uniform sampler2D uSrc;
out vec4 fragColor;
void main() {
  vec3 c = texture(uSrc, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(vec3(log(max(l, 1e-4)) * 0.1 + 0.5), 1.0);
}
`;

export const COMPOSITE_FS = `${GLSL_HEADER}
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomOn;
uniform float uBloomStrength;
uniform float uExposure;
uniform vec3 uGradeLift;
uniform vec3 uGradeGain;
uniform float uSaturation;
uniform float uVignette;
uniform float uDesat;       // FLATLINED fade
uniform float uDim;         // pause / menus
uniform float uTime;
uniform vec2 uTexel;
out vec4 fragColor;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main() {
  vec3 hdr = texture(uScene, vUv).rgb;
  if (uDim > 0.0) {
    vec3 blur = vec3(0.0);
    for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++)
      blur += texture(uScene, vUv + vec2(i, j) * uTexel * 3.0).rgb;
    hdr = mix(hdr, blur / 25.0, uDim);
  }
  if (uBloomOn > 0.5) hdr += texture(uBloom, vUv).rgb * uBloomStrength;
  vec3 c = aces(hdr * uExposure);
  c = pow(c, vec3(1.0 / 2.2));
  c = c * uGradeGain + uGradeLift * (1.0 - c);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation * (1.0 - uDesat));
  c = mix(c, c * vec3(1.05, 0.92, 0.92), uDesat * 0.5);
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * dot(q, q) * 1.6;
  c *= 1.0 - uDim * 0.45;
  // Ordered dither breaks banding in the dusk gradient.
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c += dither / 255.0;
  if (any(isnan(c))) c = vec3(0.0);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
