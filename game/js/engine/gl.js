// Thin WebGL2 layer: context, shader programs with cached uniforms, static meshes (VAOs),
// dynamic instance buffers and render targets. Everything above this file speaks in these objects.

/** Interleaved vertex layout shared by every lit mesh: pos3 nrm3 col3 emissive1 material1. */
export const VERTEX_FLOATS = 11;
export const VERTEX_BYTES = VERTEX_FLOATS * 4;
/** Instance layout: model matrix (16) + tint rgb + emissive boost (4). */
export const INSTANCE_FLOATS = 20;

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  const floatRT = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  return { gl, floatRT };
}

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    console.error(`[${label}] shader compile failed\n${log}\n${numbered}`);
    throw new Error(`${label}: ${log}`);
  }
  return sh;
}

/** A linked program; `u(name)` returns a cached uniform location. */
export function createProgram(gl, vsSrc, fsSrc, label = 'program') {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc, `${label}.vs`));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc, `${label}.fs`));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.bindAttribLocation(p, 1, 'aNrm');
  gl.bindAttribLocation(p, 2, 'aCol');
  gl.bindAttribLocation(p, 3, 'aExt');
  gl.bindAttribLocation(p, 4, 'iM0');
  gl.bindAttribLocation(p, 5, 'iM1');
  gl.bindAttribLocation(p, 6, 'iM2');
  gl.bindAttribLocation(p, 7, 'iM3');
  gl.bindAttribLocation(p, 8, 'iTint');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${label} link: ${gl.getProgramInfoLog(p)}`);
  const cache = new Map();
  return {
    program: p,
    label,
    u(name) {
      let loc = cache.get(name);
      if (loc === undefined) {
        loc = gl.getUniformLocation(p, name);
        cache.set(name, loc);
      }
      return loc;
    },
  };
}
function bindVertexLayout(gl) {
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VERTEX_BYTES, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, VERTEX_BYTES, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, VERTEX_BYTES, 24);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 2, gl.FLOAT, false, VERTEX_BYTES, 36);
}

/** Upload a static mesh ({vertices: Float32Array, indices: Uint32Array}) with optional instancing. */
export function createMesh(gl, data, { instanced = false, maxInstances = 0 } = {}) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
  bindVertexLayout(gl);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
  const mesh = { vao, vbo, ibo, count: data.indices.length, bounds: data.bounds ?? null, instanced, ibuf: null, idata: null, icount: 0, maxInstances };
  if (instanced) {
    const ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, maxInstances * INSTANCE_FLOATS * 4, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 5; i++) {
      gl.enableVertexAttribArray(4 + i);
      gl.vertexAttribPointer(4 + i, 4, gl.FLOAT, false, INSTANCE_FLOATS * 4, i * 16);
      gl.vertexAttribDivisor(4 + i, 1);
    }
    mesh.ibuf = ibuf;
    mesh.idata = new Float32Array(maxInstances * INSTANCE_FLOATS);
  } else {
    // Non-instanced draws read a constant identity instance from the default attribute values.
    gl.disableVertexAttribArray(4);
  }
  gl.bindVertexArray(null);
  return mesh;
}

/** Push the first `count` instances of mesh.idata to the GPU. */
export function uploadInstances(gl, mesh, count) {
  mesh.icount = Math.min(count, mesh.maxInstances);
  if (mesh.icount === 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.ibuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.idata, 0, mesh.icount * INSTANCE_FLOATS);
}

export function deleteMesh(gl, mesh) {
  gl.deleteVertexArray(mesh.vao);
  gl.deleteBuffer(mesh.vbo);
  gl.deleteBuffer(mesh.ibo);
  if (mesh.ibuf) gl.deleteBuffer(mesh.ibuf);
}

/** Identity instance attributes for non-instanced draws through the instanced-capable shader. */
export function setIdentityInstance(gl, tint = [1, 1, 1, 0]) {
  gl.vertexAttrib4f(4, 1, 0, 0, 0);
  gl.vertexAttrib4f(5, 0, 1, 0, 0);
  gl.vertexAttrib4f(6, 0, 0, 1, 0);
  gl.vertexAttrib4f(7, 0, 0, 0, 1);
  gl.vertexAttrib4f(8, tint[0], tint[1], tint[2], tint[3]);
}

// ---------------------------------------------------------------- textures and render targets

export function createTexture(gl, w, h, { internal, format, type, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, data = null }) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}

/** Color (+ optional depth) framebuffer. HDR targets use RGBA16F when the extension allows it. */
export function createTarget(gl, w, h, { hdr = true, depth = false, floatRT = true } = {}) {
  const useF = hdr && floatRT;
  const color = createTexture(gl, w, h, useF
    ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }
    : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
  let depthTex = null;
  if (depth) {
    depthTex = createTexture(gl, w, h, { internal: gl.DEPTH_COMPONENT24, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT, filter: gl.NEAREST });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, color, depth: depthTex, w, h };
}

/** Depth-only framebuffer with hardware comparison, for the shadow map. */
export function createShadowTarget(gl, size) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, size };
}

export function deleteTarget(gl, t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fb);
  if (t.color) gl.deleteTexture(t.color);
  if (t.depth) gl.deleteTexture(t.depth);
  if (t.tex) gl.deleteTexture(t.tex);
}

/** A full-screen triangle VAO for post passes (no attributes: gl_VertexID drives it). */
export function createFullscreen(gl) {
  const vao = gl.createVertexArray();
  return {
    draw() {
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
