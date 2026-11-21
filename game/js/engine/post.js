// Post chain: HDR scene target -> bright pass -> downsample/upsample bloom pyramid -> composite with
// auto exposure, ACES tone mapping, vignette and grade. Auto exposure reads back a tiny log-luma
// target every few frames and adapts smoothly; it can be frozen for screenshots.

import { createProgram, createTarget, deleteTarget, createFullscreen } from './gl.js';
import { FULLSCREEN_VS } from './shaders/sky.js';
import { BRIGHT_FS, DOWN_FS, UP_FS, LUMA_FS, COMPOSITE_FS } from './shaders/post.js';
import { clamp, lerp } from '../core/math.js';

const BLOOM_LEVELS = 5;

export class PostFX {
  constructor(gl, floatRT) {
    this.gl = gl;
    this.floatRT = floatRT;
    this.fs = createFullscreen(gl);
    this.pBright = createProgram(gl, FULLSCREEN_VS, BRIGHT_FS, 'bright');
    this.pDown = createProgram(gl, FULLSCREEN_VS, DOWN_FS, 'down');
    this.pUp = createProgram(gl, FULLSCREEN_VS, UP_FS, 'up');
    this.pLuma = createProgram(gl, FULLSCREEN_VS, LUMA_FS, 'luma');
    this.pComp = createProgram(gl, FULLSCREEN_VS, COMPOSITE_FS, 'composite');
    this.scene = null;
    this.mips = [];
    this.ups = [];
    this.luma = createTarget(gl, 16, 9, { hdr: false });
    this.lumaPixels = new Uint8Array(16 * 9 * 4);
    this.exposure = 1;
    this.autoExposure = true;
    this.fixedExposure = 1;
    this.frame = 0;
    this.bloomMode = 'full';
    this.bloomThreshold = 1.6;
    this.bloomStrength = 0.55;
    this.desat = 0;
    this.dim = 0;
    this.w = 0;
    this.h = 0;
  }

  resize(w, h, bloomMode) {
    if (w === this.w && h === this.h && bloomMode === this.bloomMode && this.scene) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    this.bloomMode = bloomMode;
    deleteTarget(gl, this.scene);
    for (const t of this.mips) deleteTarget(gl, t);
    for (const t of this.ups) deleteTarget(gl, t);
    this.scene = createTarget(gl, w, h, { hdr: true, depth: true, floatRT: this.floatRT });
    this.mips = [];
    this.ups = [];
    if (bloomMode !== 'off') {
      let bw = Math.max(2, w >> (bloomMode === 'half' ? 2 : 1));
      let bh = Math.max(2, h >> (bloomMode === 'half' ? 2 : 1));
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        this.mips.push(createTarget(gl, bw, bh, { hdr: true, floatRT: this.floatRT }));
        if (i < BLOOM_LEVELS - 1) this.ups.push(createTarget(gl, bw, bh, { hdr: true, floatRT: this.floatRT }));
        bw = Math.max(2, bw >> 1);
        bh = Math.max(2, bh >> 1);
      }
    }
  }

  pass(prog, target, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : gl.drawingBufferWidth, target ? target.h : gl.drawingBufferHeight);
    gl.useProgram(prog.program);
    setup(prog);
    this.fs.draw();
  }

  bindTex(prog, name, tex, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(prog.u(name), unit);
  }

  /** Run bloom + exposure + composite to the default framebuffer. */
  finish(env, dt, nightBias = 0) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    this.frame++;

    // Auto exposure from a tiny luma image (read back every 8 frames, smoothed).
    if (this.autoExposure) {
      this.pass(this.pLuma, this.luma, (p) => this.bindTex(p, 'uSrc', this.scene.color, 0));
      if (this.frame % 8 === 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.luma.fb);
        gl.readPixels(0, 0, 16, 9, gl.RGBA, gl.UNSIGNED_BYTE, this.lumaPixels);
        let s = 0;
        for (let i = 0; i < 16 * 9; i++) s += (this.lumaPixels[i * 4] / 255 - 0.5) * 10;
        const avg = Math.exp(s / (16 * 9));
        const key = lerp(0.135, 0.07, nightBias);
        this.targetExposure = clamp(key / Math.max(avg, 1e-4), 0.4, lerp(1.35, 1.6, nightBias));
      }
      if (this.targetExposure) this.exposure = lerp(this.exposure, this.targetExposure, 1 - Math.exp(-dt * 1.6));
    } else {
      this.exposure = this.fixedExposure;
    }

    let bloomTex = null;
    if (this.mips.length) {
      const m0 = this.mips[0];
      this.pass(this.pBright, m0, (p) => {
        this.bindTex(p, 'uSrc', this.scene.color, 0);
        gl.uniform2f(p.u('uTexel'), 1 / this.scene.w, 1 / this.scene.h);
        gl.uniform1f(p.u('uThreshold'), this.bloomThreshold);
        gl.uniform1f(p.u('uExposure'), this.exposure);
      });
      for (let i = 1; i < this.mips.length; i++) {
        const src = this.mips[i - 1];
        this.pass(this.pDown, this.mips[i], (p) => {
          this.bindTex(p, 'uSrc', src.color, 0);
          gl.uniform2f(p.u('uTexel'), 1 / src.w, 1 / src.h);
        });
      }
      let src = this.mips[this.mips.length - 1];
      for (let i = this.mips.length - 2; i >= 0; i--) {
        const dst = this.ups[i];
        const base = this.mips[i];
        const s = src;
        this.pass(this.pUp, dst, (p) => {
          this.bindTex(p, 'uSrc', s.color, 0);
          this.bindTex(p, 'uBase', base.color, 1);
          gl.uniform2f(p.u('uTexel'), 1 / s.w, 1 / s.h);
          gl.uniform1f(p.u('uMix'), 1.0);
        });
        src = dst;
      }
      bloomTex = src.color;
    }

    this.pass(this.pComp, null, (p) => {
      this.bindTex(p, 'uScene', this.scene.color, 0);
      this.bindTex(p, 'uBloom', bloomTex ?? this.scene.color, 1);
      gl.uniform1f(p.u('uBloomOn'), bloomTex ? 1 : 0);
      gl.uniform1f(p.u('uBloomStrength'), this.bloomStrength / BLOOM_LEVELS);
      gl.uniform1f(p.u('uExposure'), this.exposure);
      gl.uniform3fv(p.u('uGradeLift'), env.gradeLift);
      gl.uniform3fv(p.u('uGradeGain'), env.gradeGain);
      gl.uniform1f(p.u('uSaturation'), env.saturation);
      gl.uniform1f(p.u('uVignette'), 0.55);
      gl.uniform1f(p.u('uDesat'), this.desat);
      gl.uniform1f(p.u('uDim'), this.dim);
      gl.uniform2f(p.u('uTexel'), 1 / this.scene.w, 1 / this.scene.h);
    });
  }
}
