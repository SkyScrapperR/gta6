// Particle shaders: camera-facing billboards from per-instance data (position, size, colour, and an
// optional velocity stretch for tracers, sparks and rain streaks). Soft round sprites; smoke gets a
// noisy edge; colours are HDR so fire and muzzle flashes bloom.

import { GLSL_HEADER, GLSL_NOISE, GLSL_FOG, GLSL_SKY } from './common.js';

export const PARTICLE_VS = `${GLSL_HEADER}
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iPosSize;   // xyz, size
layout(location=2) in vec4 iColor;     // rgb (HDR), alpha
layout(location=3) in vec4 iStretch;   // direction xyz, length (0 = round billboard)
layout(location=4) in vec4 iMisc;      // kind, seed, age01, rotation
uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
out vec2 vUv;
out vec4 vColor;
out vec4 vMisc;
out vec3 vWorld;
void main() {
  vec3 p = iPosSize.xyz;
  float s = iPosSize.w;
  vec3 world;
  if (iStretch.w > 0.0) {
    vec3 d = normalize(iStretch.xyz + vec3(1e-5));
    vec3 toCam = normalize(uCamPos - p);
    vec3 side = normalize(cross(d, toCam) + vec3(1e-5));
    world = p + d * aCorner.y * iStretch.w + side * aCorner.x * s;
  } else {
    float c = cos(iMisc.w), sn = sin(iMisc.w);
    vec2 r = vec2(aCorner.x * c - aCorner.y * sn, aCorner.x * sn + aCorner.y * c);
    world = p + (uCamRight * r.x + uCamUp * r.y) * s;
  }
  vUv = aCorner;
  vColor = iColor;
  vMisc = iMisc;
  vWorld = world;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const PARTICLE_FS = `${GLSL_HEADER}
${GLSL_NOISE}
${GLSL_SKY}
${GLSL_FOG}
in vec2 vUv;
in vec4 vColor;
in vec4 vMisc;
in vec3 vWorld;
uniform vec3 uCamPos;
uniform float uAdditive;
uniform vec3 uHemiSky;
out vec4 fragColor;
void main() {
  float r = length(vUv);
  float a;
  int kind = int(vMisc.x + 0.5);
  if (kind == 1) {
    // Smoke: soft, noisy puff lit by the ambient sky (and its own colour for fire-lit smoke).
    float n = fbm(vUv * 2.2 + vMisc.y * 13.0 + vMisc.z * 1.5);
    a = sstep(1.0, 0.2, r + (n - 0.5) * 0.6);
  } else if (kind == 3) {
    // Fireball: a defined, noisy-edged puff, yellow-white in the middle and orange-red at the rim.
    float n = fbm(vUv * 2.6 + vMisc.y * 17.0 + vMisc.z * 2.0);
    a = sstep(0.95, 0.78, r + (n - 0.5) * 0.75);
  } else if (kind == 2) {
    // Streak (tracer, spark, rain): bright core along the length.
    a = sstep(1.0, 0.0, abs(vUv.x)) * sstep(1.0, 0.6, abs(vUv.y));
  } else {
    a = sstep(1.0, 0.0, r);
    a *= a;
  }
  a *= vColor.a;
  if (a < 0.003) discard;
  vec3 col = vColor.rgb;
  if (kind == 1) col *= (uHemiSky * 2.2 + 0.15);
  if (kind == 3) {
    float n2 = fbm(vUv * 4.0 + vMisc.y * 5.0);
    float rim = clamp(r * 1.1 + (n2 - 0.5) * 0.5, 0.0, 1.0);
    col *= mix(vec3(1.0, 0.9, 0.62), vec3(0.75, 0.2, 0.05), rim) * mix(1.7, 0.45, rim);
  }
  if (uAdditive < 0.5) col = applyFog(col, vWorld, uCamPos, normalize(vWorld - uCamPos));
  fragColor = uAdditive > 0.5 ? vec4(col * a, 1.0) : vec4(col, a);
}
`;
