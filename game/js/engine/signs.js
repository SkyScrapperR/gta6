// Text signs: shop names, billboards and neon lettering rendered once into a canvas atlas, then
// drawn as textured quads that glow at night. One draw call for every sign in the city.

import { createProgram } from './gl.js';
import { GLSL_HEADER, GLSL_NOISE, GLSL_SKY, GLSL_FOG } from './shaders/common.js';

const VS = `${GLSL_HEADER}
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec2 aGlow;
uniform mat4 uViewProj;
out vec2 vUv;
out vec2 vGlow;
out vec3 vWorld;
void main() {
  vUv = aUv;
  vGlow = aGlow;
  vWorld = aPos;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const FS = `${GLSL_HEADER}
${GLSL_NOISE}
${GLSL_SKY}
${GLSL_FOG}
in vec2 vUv;
in vec2 vGlow;
in vec3 vWorld;
uniform sampler2D uAtlas;
uniform vec3 uCamPos;
uniform vec3 uHemiSky;
uniform float uTime;
out vec4 fragColor;
void main() {
  vec4 t = texture(uAtlas, vUv);
  if (t.a < 0.04) discard;
  // Day: lit like paint by the ambient light. Night: emissive, with a slow neon flicker.
  float flick = vGlow.y > 0.5 ? (0.92 + 0.08 * step(0.08, fract(sin(floor(uTime * 9.0) + vWorld.x) * 43758.5))) : 1.0;
  vec3 day = t.rgb * (uHemiSky * 1.4 + 0.25);
  vec3 night = t.rgb * vGlow.x * flick;
  vec3 col = mix(day + t.rgb * vGlow.x * 0.25, night, uNight);
  col = applyFog(col, vWorld, uCamPos, normalize(vWorld - uCamPos));
  fragColor = vec4(col, t.a);
}
`;

export class SignAtlas {
  constructor(size = 2048) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.size = size;
    this.x = 0;
    this.y = 0;
    this.rowH = 0;
    this.cache = new Map();
  }

  /** Reserve a w x h rectangle; returns uv rect [u0,v0,u1,v1]. */
  alloc(w, h) {
    if (this.x + w > this.size) {
      this.x = 0;
      this.y += this.rowH + 2;
      this.rowH = 0;
    }
    const r = [this.x, this.y, w, h];
    this.x += w + 2;
    this.rowH = Math.max(this.rowH, h);
    return r;
  }

  uv(r) {
    const s = this.size;
    return [r[0] / s, r[1] / s, (r[0] + r[2]) / s, (r[1] + r[3]) / s];
  }

  /** A text sign: background panel (or transparent for neon), coloured lettering. Cached by key. */
  text(label, { fg = '#fff', bg = null, border = null, font = '900 56px "Arial Black", Impact, sans-serif', w = 512, h = 96, glow = true, sub = null } = {}) {
    const key = `${label}|${fg}|${bg}|${w}|${h}|${sub}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const r = this.alloc(w, h);
    const c = this.ctx;
    c.save();
    c.translate(r[0], r[1]);
    c.clearRect(0, 0, w, h);
    if (bg) {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
    }
    if (border) {
      c.strokeStyle = border;
      c.lineWidth = 6;
      c.strokeRect(3, 3, w - 6, h - 6);
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font;
    let size = parseInt(/(\d+)px/.exec(font)[1], 10);
    while (c.measureText(label).width > w * 0.9 && size > 10) {
      size -= 2;
      c.font = font.replace(/\d+px/, `${size}px`);
    }
    if (glow) {
      c.shadowColor = fg;
      c.shadowBlur = 14;
    }
    c.fillStyle = fg;
    c.fillText(label, w / 2, sub ? h * 0.4 : h / 2);
    if (sub) {
      c.shadowBlur = 0;
      c.font = `700 ${Math.round(h * 0.2)}px system-ui, sans-serif`;
      c.fillText(sub, w / 2, h * 0.8);
    }
    c.restore();
    const uv = this.uv(r);
    this.cache.set(key, { uv, aspect: w / h });
    return this.cache.get(key);
  }

  /** A custom drawing (logos, emblems). draw(ctx, w, h) */
  custom(key, w, h, draw) {
    if (this.cache.has(key)) return this.cache.get(key);
    const r = this.alloc(w, h);
    this.ctx.save();
    this.ctx.translate(r[0], r[1]);
    draw(this.ctx, w, h);
    this.ctx.restore();
    const v = { uv: this.uv(r), aspect: w / h };
    this.cache.set(key, v);
    return v;
  }
}

/** Accumulates sign quads: pos3 uv2 glow2 (glow strength, flicker flag). */
export class SignBuilder {
  constructor() {
    this.v = [];
    this.i = [];
  }

  /**
   * Quad centred at (x,y,z), facing direction yaw (0 = +Z), width w, height h, atlas entry `s`.
   * glow: emissive strength at night; flicker: neon flicker.
   */
  quad(x, y, z, yaw, w, h, s, glow = 2, flicker = 0) {
    const cx = Math.cos(yaw), sx = Math.sin(yaw);
    // Right vector as seen by a viewer standing in front of the sign.
    const rx = -cx, rz = sx;
    const base = this.v.length / 7;
    const [u0, v0, u1, v1] = s.uv;
    const pts = [
      [x - rx * w / 2, y - h / 2, z - rz * w / 2, u0, v1],
      [x + rx * w / 2, y - h / 2, z + rz * w / 2, u1, v1],
      [x + rx * w / 2, y + h / 2, z + rz * w / 2, u1, v0],
      [x - rx * w / 2, y + h / 2, z - rz * w / 2, u0, v0],
    ];
    for (const p of pts) this.v.push(p[0] + sx * 0.02, p[1], p[2] + cx * 0.02, p[3], p[4], glow, flicker);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

export class SignRenderer {
  constructor(gl) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS, 'signs');
    this.tex = gl.createTexture();
    this.count = 0;
    this.vao = null;
  }

  upload(atlas, builder) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(builder.i), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.vao = vao;
    this.count = builder.i.length;
  }

  /** Drawn in the transparent phase (alpha-blended edges, no depth write). */
  draw(renderer) {
    if (!this.count) return;
    const gl = this.gl, p = this.prog;
    gl.useProgram(p.program);
    renderer.setEnvUniforms(p);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, renderer.camera.viewProj);
    gl.uniform3fv(p.u('uHemiSky'), renderer.env.hemiSky);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(p.u('uAtlas'), 0);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
  }
}
