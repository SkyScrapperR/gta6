// View-frustum culling: six planes extracted from a view-projection matrix, sphere and AABB tests.

export class Frustum {
  constructor() {
    this.planes = Array.from({ length: 6 }, () => new Float32Array(4));
  }

  setFromMatrix(m) {
    const p = this.planes;
    const rows = [
      [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
      [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
      [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
      [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
      [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],
      [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],
    ];
    for (let i = 0; i < 6; i++) {
      const r = rows[i];
      const l = Math.hypot(r[0], r[1], r[2]) || 1;
      p[i][0] = r[0] / l; p[i][1] = r[1] / l; p[i][2] = r[2] / l; p[i][3] = r[3] / l;
    }
    return this;
  }

  sphereVisible(x, y, z, r) {
    for (const p of this.planes) if (p[0] * x + p[1] * y + p[2] * z + p[3] < -r) return false;
    return true;
  }

  boxVisible(min, max) {
    for (const p of this.planes) {
      const x = p[0] > 0 ? max[0] : min[0];
      const y = p[1] > 0 ? max[1] : min[1];
      const z = p[2] > 0 ? max[2] : min[2];
      if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
    }
    return true;
  }
}
