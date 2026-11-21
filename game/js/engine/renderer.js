// Frame graph. Each frame the game queues meshes (static chunks, instanced batches, rigged
// cars/characters) and lights; render() then runs: shadow pass -> sky -> opaque -> transparent
// callbacks (water, particles, beams) -> post (bloom, exposure, tone map). Quality presets scale it.

import { createContext, createProgram, setIdentityInstance } from './gl.js';
import { LIT_VS, LIT_FS, DEPTH_FS, MAX_LIGHTS } from './shaders/lit.js';
import { FULLSCREEN_VS, SKY_FS } from './shaders/sky.js';
import { ShadowMap } from './shadows.js';
import { PostFX } from './post.js';
import { m4 } from '../core/math.js';

export const PRESETS = {
  low: { name: 'Low', shadow: 0, bloom: 'off', scale: 0.6, lights: 12, draw: 420 },
  medium: { name: 'Medium', shadow: 1024, bloom: 'half', scale: 0.85, lights: 24, draw: 700 },
  high: { name: 'High', shadow: 2048, bloom: 'full', scale: 1.0, lights: 48, draw: 1100 },
};

const IDENTITY = m4();
const IDENTITY_BONES = new Float32Array(16 * 16);
for (let i = 0; i < 16; i++) IDENTITY_BONES.set(IDENTITY, i * 16);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const { gl, floatRT } = createContext(canvas);
    this.gl = gl;
    this.floatRT = floatRT;
    this.lit = createProgram(gl, LIT_VS, LIT_FS, 'lit');
    this.depth = createProgram(gl, LIT_VS, DEPTH_FS, 'depth');
    this.sky = createProgram(gl, FULLSCREEN_VS, SKY_FS, 'sky');
    this.post = new PostFX(gl, floatRT);
    this.shadow = new ShadowMap(gl, 0);
    this.preset = PRESETS.high;
    this.renderScale = 1;
    this.adaptiveScale = 1;
    this.queueList = [];
    this.lights = [];
    this.transparent = [];
    this.lightPos = new Float32Array(MAX_LIGHTS * 4);
    this.lightCol = new Float32Array(MAX_LIGHTS * 4);
    this.lightDir = new Float32Array(MAX_LIGHTS * 4);
    this.stats = { draws: 0, tris: 0, culled: 0 };
    this.time = 0;
    this.setPreset('high');
  }

  setPreset(key) {
    this.presetKey = key;
    this.preset = PRESETS[key] ?? PRESETS.high;
    this.shadow.resize(this.preset.shadow);
    this.resize(true);
  }

  resize(force = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.floor(this.canvas.clientWidth * dpr) || 1280;
    const ch = Math.floor(this.canvas.clientHeight * dpr) || 720;
    if (force || this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const s = this.preset.scale * this.adaptiveScale * this.renderScale;
    const w = Math.max(64, Math.floor(cw * s));
    const h = Math.max(64, Math.floor(ch * s));
    this.post.resize(w, h, this.preset.bloom);
  }

  // ------------------------------------------------------------ per-frame queueing
  begin(camera, env, time) {
    this.camera = camera;
    this.env = env;
    this.time = time;
    this.queueList.length = 0;
    this.lights.length = 0;
    this.transparent.length = 0;
  }

  /**
   * Queue a mesh. opts: model (mat4), bones (Float32Array of n mat4), paint [r,g,b], carLights [4],
   * rim [r,g,b,s], damage, shadow (cast, default true), cull (default true), radius override.
   */
  draw(mesh, opts = {}) {
    if (!mesh || mesh.count === 0) return;
    if (mesh.instanced && mesh.icount === 0) return;
    this.queueList.push({ mesh, ...opts });
  }

  /** pos [x,y,z], radius, color [r,g,b] (HDR), optional spot dir [x,y,z] + cosCone. */
  light(pos, radius, color, dir = null, cosCone = -2) {
    this.lights.push({ pos, radius, color, dir, cosCone });
  }

  /** A callback drawn after opaque geometry, with depth test on and depth writes off. */
  addTransparent(fn) {
    this.transparent.push(fn);
  }

  // ------------------------------------------------------------ render
  visible(item, frustum, maxDist) {
    if (item.cull === false) return true;
    const b = item.mesh.bounds;
    if (!b) return true;
    let cx = b.center[0], cy = b.center[1], cz = b.center[2];
    if (item.model) {
      const m = item.model;
      cx = m[0] * b.center[0] + m[4] * b.center[1] + m[8] * b.center[2] + m[12];
      cy = m[1] * b.center[0] + m[5] * b.center[1] + m[9] * b.center[2] + m[13];
      cz = m[2] * b.center[0] + m[6] * b.center[1] + m[10] * b.center[2] + m[14];
    }
    const r = item.radius ?? b.radius;
    const cp = this.camera.pos;
    if (Math.hypot(cx - cp[0], cz - cp[2]) - r > maxDist) return false;
    return frustum.sphereVisible(cx, cy, cz, r);
  }

  applyItemUniforms(p, item) {
    const gl = this.gl;
    gl.uniformMatrix4fv(p.u('uModel'), false, item.model ?? IDENTITY);
    gl.uniformMatrix4fv(p.u('uBones'), false, item.bones ?? IDENTITY_BONES);
    if (p === this.lit) {
      gl.uniform3fv(p.u('uPaint'), item.paint ?? [1, 1, 1]);
      gl.uniform1f(p.u('uPaintOn'), item.paint ? 1 : 0);
      gl.uniform4fv(p.u('uCarLights'), item.carLights ?? [0, 0, 0, 0]);
      gl.uniform4fv(p.u('uRim'), item.rim ?? [0, 0, 0, 0]);
      gl.uniform1f(p.u('uDamage'), item.damage ?? 0);
    }
  }

  drawItem(p, item) {
    const gl = this.gl;
    const mesh = item.mesh;
    this.applyItemUniforms(p, item);
    gl.bindVertexArray(mesh.vao);
    if (!mesh.instanced) setIdentityInstance(gl, item.tint ?? [1, 1, 1, 0]);
    if (mesh.instanced) gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0, mesh.icount);
    else gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    this.stats.draws++;
    this.stats.tris += (mesh.count / 3) * (mesh.instanced ? mesh.icount : 1);
  }

  setEnvUniforms(p) {
    const gl = this.gl, env = this.env, cam = this.camera;
    gl.uniform3fv(p.u('uSunDir'), env.lightDir);
    gl.uniform3fv(p.u('uSunColor'), env.sunColor);
    gl.uniform3fv(p.u('uSkyZenith'), env.zenith);
    gl.uniform3fv(p.u('uSkyHorizon'), env.horizon);
    gl.uniform3fv(p.u('uSkyGlow'), env.glow);
    gl.uniform1f(p.u('uNight'), env.night);
    gl.uniform1f(p.u('uRain'), env.rain);
    gl.uniform3fv(p.u('uFogColor'), env.fogColor);
    gl.uniform1f(p.u('uFogDensity'), env.fogDensity);
    gl.uniform1f(p.u('uFogHeight'), env.fogHeight);
    gl.uniform3fv(p.u('uCamPos'), cam.eye ?? cam.pos);
    gl.uniform1f(p.u('uTime'), this.time);
  }

  uploadLights(p) {
    const gl = this.gl;
    const cp = this.camera.pos;
    const fr = this.camera.frustum;
    const max = Math.min(this.preset.lights, MAX_LIGHTS);
    const cand = [];
    for (const l of this.lights) {
      const d = Math.hypot(l.pos[0] - cp[0], l.pos[1] - cp[1], l.pos[2] - cp[2]);
      if (d - l.radius > 260) continue;
      if (!fr.sphereVisible(l.pos[0], l.pos[1], l.pos[2], l.radius)) continue;
      cand.push([d - l.radius * 0.3, l]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const n = Math.min(max, cand.length);
    for (let i = 0; i < n; i++) {
      const l = cand[i][1];
      // Fade lights out as they approach the cut-off rank so swaps are not visible pops.
      const fade = i > n - 4 && cand.length > max ? 0.5 : 1;
      this.lightPos.set([l.pos[0], l.pos[1], l.pos[2], l.radius], i * 4);
      this.lightCol.set([l.color[0] * fade, l.color[1] * fade, l.color[2] * fade, 0], i * 4);
      if (l.dir) this.lightDir.set([l.dir[0], l.dir[1], l.dir[2], l.cosCone], i * 4);
      else this.lightDir.set([0, -1, 0, -2], i * 4);
    }
    gl.uniform4fv(p.u('uLPos'), this.lightPos);
    gl.uniform4fv(p.u('uLCol'), this.lightCol);
    gl.uniform4fv(p.u('uLDir'), this.lightDir);
    gl.uniform1i(p.u('uLCount'), n);
    this.stats.lights = n;
  }

  render(dt) {
    const gl = this.gl;
    const cam = this.camera;
    const env = this.env;
    this.stats.draws = 0;
    this.stats.tris = 0;
    this.resize();
    cam.aspect = this.canvas.width / this.canvas.height;
    cam.far = this.preset.draw + 200;
    cam.update(dt);
    const maxDist = this.preset.draw;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);

    // 1. Shadow pass.
    const useShadow = this.shadow.enabled && env.sunColor[0] + env.sunColor[1] > 0.05;
    if (useShadow) {
      this.shadow.fit(cam, env.lightDir);
      const sm = this.shadow;
      gl.bindFramebuffer(gl.FRAMEBUFFER, sm.target.fb);
      gl.viewport(0, 0, sm.size, sm.size);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2.0, 4.0);
      gl.cullFace(gl.FRONT);
      const p = this.depth;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u('uViewProj'), false, sm.viewProj);
      gl.uniform1f(p.u('uTime'), this.time);
      const c = sm.center;
      const R = sm.radius * 1.5;
      for (const item of this.queueList) {
        if (item.shadow === false) continue;
        const b = item.mesh.bounds;
        if (b && item.cull !== false) {
          const m = item.model;
          const x = m ? m[12] + b.center[0] : b.center[0];
          const z = m ? m[14] + b.center[2] : b.center[2];
          if (Math.hypot(x - c[0], z - c[2]) - (item.radius ?? b.radius) > R) continue;
        }
        this.drawItem(p, item);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.cullFace(gl.BACK);
    }

    // 2. Scene target.
    const target = this.post.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 3. Sky (no depth write; everything draws over it).
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.sky.program);
    this.setEnvUniforms(this.sky);
    gl.uniformMatrix4fv(this.sky.u('uInvViewProj'), false, cam.invViewProj);
    gl.uniform3fv(this.sky.u('uMoonDir'), env.moonDir);
    gl.uniform1f(this.sky.u('uCloudCover'), 0.35 + env.rain * 0.6);
    this.post.fs.draw();
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);

    // 4. Opaque.
    const p = this.lit;
    gl.useProgram(p.program);
    this.setEnvUniforms(p);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, cam.viewProj);
    gl.uniform3fv(p.u('uHemiSky'), env.hemiSky);
    gl.uniform3fv(p.u('uHemiGround'), env.hemiGround);
    gl.uniform1f(p.u('uWet'), env.wet);
    gl.uniform1f(p.u('uShadowOn'), useShadow ? 1 : 0);
    gl.uniformMatrix4fv(p.u('uShadowMat'), false, this.shadow.viewProj);
    gl.uniform1f(p.u('uShadowTexel'), 1 / Math.max(this.shadow.size, 1));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadow.target.tex);
    gl.uniform1i(p.u('uShadowMap'), 0);
    this.uploadLights(p);
    let culled = 0;
    for (const item of this.queueList) {
      if (!this.visible(item, cam.frustum, maxDist)) {
        culled++;
        continue;
      }
      this.drawItem(p, item);
    }
    this.stats.culled = culled;

    // 5. Transparent passes.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const fn of this.transparent) fn(gl, this);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);

    // 6. Post.
    this.post.finish(env, dt, env.night);
  }
}
