// Shared GLSL chunks: hashing and value noise, the analytic sky used both for the dome and for
// reflections, exponential height fog, and NaN-safe helpers. Imported into every shader string.

export const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

export const GLSL_NOISE = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
vec3 safeNormalize(vec3 v) {
  float l = length(v);
  return l > 1e-6 ? v / l : vec3(0.0, 1.0, 0.0);
}
float sstep(float a, float b, float x) {
  float d = b - a;
  float t = clamp((x - a) / (abs(d) < 1e-6 ? 1e-6 : d), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
`;

/** Sky radiance for a direction; uniforms shared by sky dome, reflections and fog tint. */
export const GLSL_SKY = `
uniform vec3 uSunDir;      // towards the sun (or moon at night)
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGlow;     // horizon glow around the sun (sunset)
uniform float uNight;      // 0 day .. 1 full night
uniform float uRain;
vec3 skyColor(vec3 d) {
  d = safeNormalize(d);
  float h = clamp(d.y, -0.2, 1.0);
  float t = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 col = mix(uSkyHorizon, uSkyZenith, t);
  vec3 sd = safeNormalize(uSunDir);
  float sdot = max(dot(d, sd), 0.0);
  float horizonBand = exp(-abs(h) * 6.0);
  col += uSkyGlow * pow(sdot, 6.0) * (0.35 + horizonBand);
  col += uSkyGlow * 0.25 * horizonBand * (0.5 + 0.5 * dot(safeNormalize(vec3(d.x, 0.0, d.z)), safeNormalize(vec3(sd.x, 0.0, sd.z))));
  if (h < 0.0) col = mix(col, uSkyHorizon * 0.35, clamp(-h * 4.0, 0.0, 1.0));
  col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))) * 0.7, uRain * 0.6);
  return col;
}
`;

export const GLSL_FOG = `
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;
vec3 applyFog(vec3 col, vec3 worldPos, vec3 camPos, vec3 viewDir) {
  float dist = length(worldPos - camPos);
  float hfall = exp(-max(worldPos.y, 0.0) / max(uFogHeight, 1.0));
  float f = 1.0 - exp(-dist * uFogDensity * (0.35 + 0.65 * hfall));
  f = clamp(f, 0.0, 0.85);
  vec3 sd = safeNormalize(uSunDir);
  vec3 fogCol = uFogColor + uSkyGlow * 0.35 * pow(max(dot(viewDir, sd), 0.0), 8.0);
  return mix(col, fogCol, f);
}
`;
