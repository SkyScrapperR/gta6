// Time of day and weather: turns a clock (hours) and a rain amount into every lighting uniform —
// sun/moon direction and colour, sky gradient, hemisphere ambient, fog and the colour grade.
// Keyframes cover dawn, day, golden hour, sunset, purple dusk and true night.

import { lerp, clamp, smoothstep, v3norm } from '../core/math.js';

const K = [
  // hour, zenith, horizon, glow, sun colour, hemi sky, hemi ground, fog, grade gain, grade lift, saturation
  [0.0, [0.003, 0.005, 0.016], [0.016, 0.02, 0.05], [0.015, 0.01, 0.03], [0.09, 0.12, 0.22], [0.022, 0.03, 0.06], [0.012, 0.011, 0.018], [0.014, 0.018, 0.04], [1.0, 1.0, 1.06], [0.0, 0.0, 0.02], 1.05],
  [4.6, [0.004, 0.006, 0.02], [0.02, 0.025, 0.06], [0.02, 0.012, 0.04], [0.09, 0.12, 0.22], [0.024, 0.032, 0.065], [0.012, 0.011, 0.018], [0.016, 0.02, 0.045], [1.0, 1.0, 1.06], [0.0, 0.0, 0.02], 1.05],
  [5.8, [0.09, 0.11, 0.28], [0.75, 0.42, 0.38], [0.9, 0.4, 0.22], [1.2, 0.6, 0.35], [0.22, 0.22, 0.34], [0.08, 0.06, 0.06], [0.45, 0.35, 0.38], [1.04, 0.98, 0.96], [0.02, 0.0, 0.03], 1.05],
  [7.5, [0.16, 0.36, 0.78], [0.6, 0.72, 0.88], [0.35, 0.28, 0.16], [2.4, 2.1, 1.7], [0.36, 0.45, 0.62], [0.16, 0.14, 0.11], [0.55, 0.66, 0.8], [1.0, 1.0, 1.0], [0.0, 0.0, 0.0], 1.1],
  [12.5, [0.14, 0.36, 0.82], [0.58, 0.74, 0.92], [0.25, 0.22, 0.14], [2.7, 2.55, 2.3], [0.38, 0.48, 0.66], [0.18, 0.16, 0.12], [0.58, 0.7, 0.85], [1.0, 1.0, 1.0], [0.0, 0.0, 0.0], 1.12],
  [16.6, [0.17, 0.33, 0.7], [0.95, 0.72, 0.5], [1.0, 0.55, 0.25], [2.8, 1.95, 1.05], [0.36, 0.38, 0.5], [0.2, 0.14, 0.09], [0.8, 0.62, 0.48], [1.05, 0.99, 0.92], [0.02, 0.01, 0.0], 1.18],
  [18.2, [0.16, 0.14, 0.4], [1.05, 0.45, 0.32], [1.5, 0.48, 0.24], [2.2, 0.95, 0.42], [0.3, 0.24, 0.38], [0.14, 0.08, 0.07], [0.66, 0.36, 0.38], [1.06, 0.95, 0.95], [0.03, 0.0, 0.04], 1.2],
  [19.1, [0.06, 0.045, 0.18], [0.5, 0.2, 0.38], [0.55, 0.16, 0.34], [0.5, 0.3, 0.45], [0.13, 0.1, 0.2], [0.05, 0.035, 0.05], [0.24, 0.12, 0.22], [1.04, 0.96, 1.04], [0.03, 0.0, 0.05], 1.18],
  [20.3, [0.012, 0.012, 0.045], [0.07, 0.05, 0.12], [0.06, 0.03, 0.08], [0.12, 0.14, 0.26], [0.04, 0.045, 0.085], [0.016, 0.014, 0.024], [0.04, 0.035, 0.08], [1.0, 0.98, 1.06], [0.0, 0.0, 0.03], 1.08],
  [24.0, [0.003, 0.005, 0.016], [0.016, 0.02, 0.05], [0.015, 0.01, 0.03], [0.09, 0.12, 0.22], [0.022, 0.03, 0.06], [0.012, 0.011, 0.018], [0.014, 0.018, 0.04], [1.0, 1.0, 1.06], [0.0, 0.0, 0.02], 1.05],
];

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export class Environment {
  constructor() {
    this.hour = 18.0;
    this.rain = 0;
    this.targetRain = 0;
    this.fogDensityCap = 0.0011;
    this.update(0);
  }

  /** Night factor: 1 when street lights should be fully on. */
  static nightOf(hour) {
    if (hour >= 6.5 && hour <= 17.8) return 0;
    if (hour > 17.8 && hour < 19.6) return smoothstep(17.8, 19.6, hour);
    if (hour >= 5.2 && hour < 6.5) return 1 - smoothstep(5.2, 6.5, hour);
    return 1;
  }

  update(dt) {
    this.rain = lerp(this.rain, this.targetRain, 1 - Math.exp(-dt * 0.4));
    const h = ((this.hour % 24) + 24) % 24;
    let i = 0;
    while (i < K.length - 2 && K[i + 1][0] <= h) i++;
    const a = K[i], b = K[i + 1];
    const t = smoothstep(0, 1, (h - a[0]) / (b[0] - a[0]));
    this.zenith = mix3(a[1], b[1], t);
    this.horizon = mix3(a[2], b[2], t);
    this.glow = mix3(a[3], b[3], t);
    this.sunColor = mix3(a[4], b[4], t);
    this.hemiSky = mix3(a[5], b[5], t);
    this.hemiGround = mix3(a[6], b[6], t);
    this.fogColor = mix3(a[7], b[7], t);
    this.gradeGain = mix3(a[8], b[8], t);
    this.gradeLift = mix3(a[9], b[9], t);
    this.saturation = lerp(a[10], b[10], t);
    this.night = Environment.nightOf(h);

    // Sun path: rises in the east (+X), sets in the west, tilted south (+Z) over the sea.
    const dayT = (h - 6.0) / 12.8;
    const ang = dayT * Math.PI;
    const sun = v3norm([Math.cos(ang), Math.sin(ang) * 0.92, 0.38]);
    const moonAng = ((h + 12 - 6.5) / 12.5) * Math.PI;
    const moon = v3norm([Math.cos(moonAng) * 0.8, Math.max(0.25, Math.sin(moonAng)) * 0.9, -0.42]);
    this.sunDirTrue = sun;
    this.moonDir = moon;
    const sunUp = sun[1] > 0.02;
    // The light that casts shadows: the sun when it is up, otherwise the moon.
    if (sunUp) {
      const low = Math.max(sun[1], 0.08);
      this.lightDir = v3norm([sun[0], low, sun[2]]);
    } else {
      this.lightDir = moon;
    }
    // Fade the key light around the horizon crossing to avoid a hard jump.
    const fade = sunUp ? smoothstep(0.02, 0.12, sun[1]) : 1;
    this.sunColor = this.sunColor.map((c) => c * (sunUp ? fade : 1));

    // Rain darkens and greys everything and thickens the fog a little.
    const r = this.rain;
    if (r > 0.001) {
      const grey = (c) => mix3(c, [0.5 * (c[0] + c[1] + c[2]) / 1.5, 0.5 * (c[0] + c[1] + c[2]) / 1.5, 0.55 * (c[0] + c[1] + c[2]) / 1.5], r * 0.6);
      this.zenith = grey(this.zenith).map((c) => c * (1 - 0.4 * r));
      this.horizon = grey(this.horizon).map((c) => c * (1 - 0.35 * r));
      this.sunColor = this.sunColor.map((c) => c * (1 - 0.65 * r));
      this.fogColor = grey(this.fogColor).map((c) => c * (1 - 0.3 * r));
      this.glow = this.glow.map((c) => c * (1 - 0.7 * r));
    }
    const baseDensity = 0.00045 + this.night * 0.0002;
    this.fogDensity = clamp(baseDensity * (1 + r * 1.2), 0, this.fogDensityCap);
    this.fogHeight = 60;
    this.wet = clamp(r * 1.4, 0, 1);
  }

  get clockText() {
    const h = ((this.hour % 24) + 24) % 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}
