// The main lit shader. One program draws every opaque thing: merged city chunks, instanced props
// and rigged meshes (cars, characters) whose parts follow up to 16 bone matrices. The material id
// travels in the vertex (aExt.y = material + 32 * bone) and selects procedural surface detail:
// facade windows that glow at night, asphalt grime and puddles, clearcoat paint, glass fresnel...
// Lighting: sun/moon with a PCF shadow map, hemisphere ambient, up to 48 forward point/spot lights.

import { GLSL_HEADER, GLSL_NOISE, GLSL_SKY, GLSL_FOG } from './common.js';

export const MAX_LIGHTS = 48;

export const LIT_VS = `${GLSL_HEADER}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in vec2 aExt;
layout(location=4) in vec4 iM0;
layout(location=5) in vec4 iM1;
layout(location=6) in vec4 iM2;
layout(location=7) in vec4 iM3;
layout(location=8) in vec4 iTint;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat4 uBones[16];
uniform float uTime;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out float vEmis;
flat out int vMat;
out vec4 vTint;
void main() {
  float code = aExt.y + 0.5;
  int bone = int(floor(code / 32.0));
  int mat = int(floor(mod(code, 32.0)));
  mat4 inst = mat4(iM0, iM1, iM2, iM3);
  mat4 world = uModel * inst * uBones[bone];
  vec4 wp = world * vec4(aPos, 1.0);
  if (mat == 21) {
    // Foliage sways with the wind, more at the tips.
    float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.21) * 0.06 * max(aPos.y - 1.0, 0.0);
    wp.x += sway;
    wp.z += sway * 0.6;
  }
  vWorld = wp.xyz;
  vNormal = mat3(world) * aNrm;
  vColor = aCol;
  vEmis = aExt.x;
  vMat = mat;
  vTint = iTint;
  gl_Position = uViewProj * wp;
}
`;

export const LIT_FS = `${GLSL_HEADER}
${GLSL_NOISE}
${GLSL_SKY}
${GLSL_FOG}
#define MAXL ${MAX_LIGHTS}
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in float vEmis;
flat in int vMat;
in vec4 vTint;
uniform vec3 uCamPos;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform float uTime;
uniform float uWet;
uniform float uExposureBias;
uniform vec4 uRim;          // rim light colour + strength (characters)
uniform vec4 uCarLights;    // headlights, brake, siren red, siren blue
uniform vec3 uPaint;        // per-draw paint colour for PAINT material (rigged meshes)
uniform float uPaintOn;
uniform float uDamage;      // 0..1 darkens/burns paint
uniform mat4 uShadowMat;
uniform highp sampler2DShadow uShadowMap;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform vec4 uLPos[MAXL];   // xyz, radius
uniform vec4 uLCol[MAXL];   // rgb intensity, unused
uniform vec4 uLDir[MAXL];   // spot direction xyz, cos(cutoff) (-2 = omni)
uniform int uLCount;
out vec4 fragColor;

float shadowAt(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sp = uShadowMat * vec4(wp + n * 0.08, 1.0);
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float s = 0.0;
  float bias = 0.0006;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++)
      s += texture(uShadowMap, vec3(p.xy + vec2(x, y) * uShadowTexel * 1.3, p.z - bias));
  return s / 9.0;
}

// Facade windows: a grid in facade space, per-window hash for lit/unlit, warm or cool tints.
void facade(vec3 wp, vec3 n, bool tower, inout vec3 albedo, inout float spec, inout float gloss, inout vec3 glow, inout float mirror) {
  bool alongZ = abs(n.x) > abs(n.z);
  float u = alongZ ? wp.z : wp.x;
  float planeQ = floor((alongZ ? wp.x : wp.z) * 0.5 + 0.25);
  float cw = tower ? 1.8 : 3.1;
  float ch = tower ? 3.8 : 3.5;
  if (wp.y < 4.3 && !tower) return;
  vec2 cell = vec2(floor(u / cw), floor(wp.y / ch));
  vec2 f = vec2(fract(u / cw), fract(wp.y / ch));
  float mx = tower ? 0.06 : 0.17;
  float myLo = tower ? 0.08 : 0.28, myHi = tower ? 0.96 : 0.86;
  bool win = f.x > mx && f.x < 1.0 - mx && f.y > myLo && f.y < myHi;
  if (abs(n.y) > 0.5) win = false;
  if (!win) {
    if (!tower) albedo *= 0.9 + 0.1 * vnoise(wp.xz * 3.0 + wp.y);
    return;
  }
  float r = hash13(vec3(cell, planeQ));
  float r2 = hash13(vec3(cell.yx + 7.0, planeQ * 1.7));
  vec3 glassBase = tower ? albedo * 0.35 + vec3(0.02, 0.03, 0.05) : vec3(0.05, 0.07, 0.09);
  albedo = glassBase;
  spec = 0.9;
  gloss = 160.0;
  mirror = tower ? 0.75 : 0.55;
  float litChance = tower ? 0.34 : 0.46;
  if (r < litChance) {
    vec3 warm = vec3(1.0, 0.68, 0.36);
    vec3 cool = vec3(0.62, 0.8, 1.0);
    vec3 tint = r2 < 0.65 ? warm : (r2 < 0.85 ? cool : vec3(1.0, 0.45, 0.7));
    float inner = 0.55 + 0.45 * sstep(0.0, 0.6, f.y) * (0.7 + 0.3 * hash12(cell * 3.1));
    float blind = step(0.8, hash12(cell + planeQ)) * step(0.55, f.y);
    glow = tint * inner * (1.0 - 0.6 * blind) * (0.6 + 0.5 * r2) * uNight * 0.95;
    mirror *= 1.0 - 0.7 * uNight;
  }
}

void main() {
  vec3 n = safeNormalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 V = safeNormalize(uCamPos - vWorld);
  vec3 albedo = min(vColor, vec3(0.85));
  float spec = 0.12;
  float gloss = 24.0;
  float mirror = 0.0;
  vec3 glow = vec3(0.0);
  float emisScale = 0.0;
  float wetMask = 0.0;
  int m = vMat;
  vec2 xz = vWorld.xz;

  if (m == 1 || m == 16) {
    facade(vWorld, n, m == 16, albedo, spec, gloss, glow, mirror);
    if (m == 1 && vWorld.y < 4.3) albedo *= 0.85 + 0.15 * fbm(xz * 2.0 + vWorld.y);
  } else if (m == 2) {
    float g = fbm(xz * 0.28);
    float grain = hash12(floor(xz * 24.0));
    albedo *= 0.7 + 0.45 * g + 0.08 * grain;
    float crack = 1.0 - sstep(0.0, 0.012, abs(vnoise(xz * 1.3) - 0.5));
    albedo *= 1.0 - 0.22 * crack * sstep(0.55, 0.7, fbm(xz * 0.07));
    float oil = sstep(0.55, 0.75, fbm(xz * 0.5 + 9.0));
    albedo *= 1.0 - 0.18 * oil;
    spec = 0.1;
    gloss = 18.0;
    wetMask = 1.0;
  } else if (m == 3) {
    vec2 tile = fract(xz / 1.2);
    float joint = (1.0 - sstep(0.0, 0.035, min(tile.x, tile.y)));
    albedo *= (0.82 + 0.25 * fbm(xz * 0.9)) * (1.0 - 0.25 * joint);
    albedo *= 0.94 + 0.12 * hash12(floor(xz / 1.2));
    wetMask = 0.8;
  } else if (m == 4) {
    albedo = albedo * 0.25;
    spec = 1.4;
    gloss = 200.0;
    mirror = 0.7;
  } else if (m == 5) {
    float g = fbm(xz * 0.6);
    albedo *= 0.7 + 0.5 * g;
    albedo = mix(albedo, albedo * vec3(1.2, 1.1, 0.6), sstep(0.6, 0.8, fbm(xz * 0.15)));
    spec = 0.04;
  } else if (m == 6) {
    albedo *= 0.85 + 0.2 * fbm(xz * 1.3) + 0.05 * hash12(floor(xz * 30.0));
    spec = 0.05;
  } else if (m == 7) {
    if (uPaintOn > 0.5) albedo = min(uPaint, vec3(0.85));
    albedo = mix(albedo, vec3(0.04, 0.035, 0.03), uDamage * (0.4 + 0.6 * fbm(vWorld.xz * 3.0 + vWorld.y)));
    spec = 1.0 - 0.8 * uDamage;
    gloss = 90.0;
    mirror = 0.28 * (1.0 - uDamage);
  } else if (m == 8) {
    spec = 0.18;
    gloss = 20.0;
  } else if (m == 9) {
    albedo *= 0.92 + 0.08 * vnoise(vWorld.xz * 40.0 + vWorld.y * 40.0);
    spec = 0.05;
  } else if (m == 10) {
    emisScale = mix(1.0, 2.6, uNight);
  } else if (m == 11) {
    spec = 0.8;
    gloss = 60.0;
    mirror = 0.15;
  } else if (m == 12) {
    float row = fract(vWorld.y * 3.2 + vWorld.x * 0.0);
    albedo *= 0.8 + 0.25 * sstep(0.0, 0.25, row) * (0.9 + 0.2 * hash12(floor(xz * 3.0)));
  } else if (m == 13) {
    albedo *= 0.8 + 0.3 * vnoise(vec2(vWorld.x + vWorld.z, vWorld.y) * vec2(1.0, 18.0));
  } else if (m == 14) {
    emisScale = uNight * 3.2;
  } else if (m == 17) {
    emisScale = 0.2 + uCarLights.x * 2.4;
    spec = 1.0; gloss = 120.0;
  } else if (m == 18) {
    emisScale = 0.15 + uCarLights.x * 0.9 + uCarLights.y * 2.6;
  } else if (m == 19) {
    emisScale = 0.2 + uCarLights.z * 4.0;
  } else if (m == 20) {
    emisScale = 0.2 + uCarLights.w * 4.0;
  } else if (m == 21) {
    albedo *= 0.8 + 0.35 * vnoise(vWorld.xz * 2.0 + vWorld.y * 3.0);
    spec = 0.06;
  }

  if (m != 7 && vTint.w > -0.99) albedo *= mix(vec3(1.0), vTint.rgb, 1.0);
  emisScale *= 1.0 + vTint.w;

  // Wet surfaces: darker, glossier, puddles mirror the sky.
  float wet = uWet * wetMask * (n.y > 0.7 ? 1.0 : 0.0);
  float puddle = wet * sstep(0.56, 0.68, fbm(xz * 0.11 + 3.0));
  if (wet > 0.0) {
    albedo *= 1.0 - 0.42 * wet;
    spec = mix(spec, 1.1, wet);
    gloss = mix(gloss, 90.0, wet);
    mirror = max(mirror, wet * 0.28 + puddle * 0.6);
    n = safeNormalize(mix(n, vec3(0.0, 1.0, 0.0), puddle));
  }

  vec3 L = safeNormalize(uSunDir);
  float ndl = max(dot(n, L), 0.0);
  float sh = ndl > 0.0 ? shadowAt(vWorld, n) : 0.0;
  vec3 H = safeNormalize(L + V);
  float sunSpec = pow(max(dot(n, H), 0.0), gloss) * spec * (gloss + 8.0) / 40.0;
  vec3 hemi = mix(uHemiGround, uHemiSky, n.y * 0.5 + 0.5);
  float ao = 0.72 + 0.28 * sstep(0.0, 2.5, vWorld.y);
  vec3 col = albedo * hemi * ao + (albedo * ndl + vec3(min(sunSpec, 6.0))) * uSunColor * sh;

  // Point and spot lights (street lamps, headlights, sirens, neon, helicopter beam).
  for (int i = 0; i < MAXL; i++) {
    if (i >= uLCount) break;
    vec3 lp = uLPos[i].xyz;
    vec3 dl = lp - vWorld;
    float d = length(dl);
    float r = uLPos[i].w;
    if (d > r) continue;
    vec3 l = dl / max(d, 1e-4);
    float att = pow(clamp(1.0 - pow(d / r, 4.0), 0.0, 1.0), 2.0) / (d * d * 0.12 + 1.0);
    vec4 sd = uLDir[i];
    if (sd.w > -1.5) {
      float c = dot(-l, safeNormalize(sd.xyz));
      att *= sstep(sd.w, sd.w + 0.08, c);
    }
    float nl = max(dot(n, l), 0.0);
    vec3 h = safeNormalize(l + V);
    float sp = pow(max(dot(n, h), 0.0), gloss) * spec * (gloss + 8.0) / 30.0;
    col += min(uLCol[i].rgb * att * (albedo * (nl * 0.85 + 0.15) + vec3(sp)), vec3(1.2));
  }

  // Environment reflection (glass, paint, wet ground).
  if (mirror > 0.0) {
    vec3 R = reflect(-V, n);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 env = skyColor(vec3(R.x, abs(R.y) * (R.y < 0.0 ? 0.3 : 1.0), R.z));
    col = mix(col, env * (0.6 + 0.4 * sh), clamp(mirror * (0.25 + 0.75 * fres), 0.0, 0.92));
  }

  // Rim light keeps the hero readable at night.
  if (uRim.w > 0.0) {
    float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    col += uRim.rgb * rim * uRim.w;
  }

  col += glow;
  col += albedo * vEmis * emisScale * 1.6;

  col = applyFog(col, vWorld, uCamPos, -V);
  col = max(col, vec3(0.0));
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  fragColor = vec4(min(col, vec3(60.0)), 1.0);
}
`;

/** Depth-only pass for the shadow map: same vertex transform, empty fragment. */
export const DEPTH_FS = `${GLSL_HEADER}
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }
`;
