// Sky dome as a full-screen pass: analytic gradient, sun disc with halo, moon with phase shading,
// twinkling stars at night and two layers of drifting fbm clouds lit by the sun colour.

import { GLSL_HEADER, GLSL_NOISE, GLSL_SKY } from './common.js';

export const FULLSCREEN_VS = `${GLSL_HEADER}
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SKY_FS = `${GLSL_HEADER}
${GLSL_NOISE}
${GLSL_SKY}
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uMoonDir;
uniform float uTime;
uniform float uCloudCover;
out vec4 fragColor;
void main() {
  vec4 a = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 b = uInvViewProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 dir = safeNormalize(a.xyz / a.w - b.xyz / b.w);
  vec3 col = skyColor(dir);
  vec3 sd = safeNormalize(uSunDir);
  float day = 1.0 - uNight;
  // Sun disc and halo (only while the sun is up).
  float sdot = dot(dir, sd);
  col += uSunColor * sstep(0.9994, 0.9998, sdot) * 6.0 * day * (1.0 - uRain);
  col += uSunColor * pow(max(sdot, 0.0), 300.0) * 1.2 * day;
  // Stars.
  if (uNight > 0.01 && dir.y > 0.0) {
    vec3 sp = dir * 320.0;
    vec3 cell = floor(sp);
    float h = hash13(cell);
    float star = step(0.985, h) * sstep(0.5, 0.0, length(fract(sp) - 0.5));
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h * 80.0);
    col += vec3(0.9, 0.95, 1.0) * star * tw * uNight * sstep(0.0, 0.25, dir.y) * 2.5 * (1.0 - uRain);
  }
  // Moon.
  vec3 md = safeNormalize(uMoonDir);
  float mdot = dot(dir, md);
  if (mdot > 0.9985) {
    float rr = sqrt(max(0.0, 1.0 - (1.0 - mdot) / 0.0015));
    float crater = 0.85 + 0.15 * vnoise(dir.xy * 900.0);
    col = mix(col, vec3(0.95, 0.93, 0.85) * 1.6 * crater, sstep(0.0, 0.15, rr) * uNight);
  }
  col += vec3(0.6, 0.65, 0.8) * pow(max(mdot, 0.0), 120.0) * 0.4 * uNight;
  // Clouds on a virtual plane.
  if (dir.y > 0.01) {
    vec2 cp = dir.xz / (dir.y + 0.08) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(cp * 0.9);
    float c2 = fbm(cp * 2.3 + 11.0);
    float cover = sstep(0.62 - uCloudCover * 0.4, 0.92, c * 0.7 + c2 * 0.4);
    vec3 lit = mix(uSkyHorizon * 1.1, uSunColor * 0.6 + uSkyGlow * 0.6, pow(max(sdot, 0.0), 2.0));
    vec3 cloudCol = mix(lit + uSkyZenith * 0.3, vec3(0.08, 0.08, 0.12), uNight * 0.85);
    cloudCol = mix(cloudCol, vec3(0.32, 0.34, 0.38) * (1.0 - uNight * 0.8), uRain);
    col = mix(col, cloudCol, cover * sstep(0.0, 0.25, dir.y) * 0.85);
  }
  col = max(col, vec3(0.0));
  if (any(isnan(col))) col = vec3(0.0);
  fragColor = vec4(col, 1.0);
}
`;
