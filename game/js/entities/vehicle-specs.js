// Vehicle line-up as data: the seven original cars (Kancil compact, Merpati sedan, Selara Taxi, Vesper GT
// coupe, Bajak van, Bison box truck, Garuda Patrol police car) with sizes and handling, the rig's bone
// indices, and door hinge positions. Shared by physics, entry/exit and the mesh builder.

export const VB = { BODY: 0, FL: 1, FR: 2, RL: 3, RR: 4, DOOR_L: 5, DOOR_R: 6, ROTOR: 7, TAIL: 8 };

/**
 * Vehicle definitions. len/wid in metres; wheel z positions; cabin z range (front, back); mass in kg;
 * handling: accel, top speed (m/s), grip, steer.
 */
export const VEHICLES = {
  kancil: { name: 'Kancil', len: 3.7, wid: 1.66, h: 0.62, cabin: [0.55, -1.25], roof: 1.55, wheel: 0.3, axle: [1.2, -1.2], mass: 950, accel: 7.5, top: 36, grip: 7.5, steer: 0.62, colors: ['#e8d24a', '#e05a3a', '#4aa0e0', '#f2f2f2', '#9ae06a'] },
  merpati: { name: 'Merpati', len: 4.55, wid: 1.82, h: 0.64, cabin: [0.75, -1.15], roof: 1.52, wheel: 0.33, axle: [1.45, -1.45], mass: 1350, accel: 8.5, top: 45, grip: 8, steer: 0.56, colors: ['#3a5a8a', '#c03a3a', '#2a2a2e', '#d8d8d8', '#6a6a72', '#2a6a4a', '#8a6a3a'] },
  taxi: { name: 'Selara Taxi', len: 4.55, wid: 1.82, h: 0.64, cabin: [0.75, -1.15], roof: 1.52, wheel: 0.33, axle: [1.45, -1.45], mass: 1350, accel: 8.5, top: 44, grip: 8, steer: 0.56, colors: ['#18b8ae'], taxi: true },
  vesper: { name: 'Vesper GT', len: 4.6, wid: 1.98, h: 0.44, cabin: [0.3, -1.55], roof: 1.2, wheel: 0.34, axle: [1.45, -1.45], mass: 1250, accel: 13.5, top: 62, grip: 9.5, steer: 0.5, colors: ['#f2c41a', '#d02a2a', '#1a1a1e', '#e8e8e8'], sport: true },
  bajak: { name: 'Bajak', len: 4.9, wid: 1.96, h: 0.8, cabin: [1.35, -2.35], roof: 2.1, wheel: 0.36, axle: [1.65, -1.6], mass: 2100, accel: 6.5, top: 36, grip: 6.5, steer: 0.52, colors: ['#e8e8e8', '#3a6aa8', '#c0a060', '#5a8a5a'], van: true },
  bison: { name: 'Bison', len: 7.2, wid: 2.4, h: 1.0, cabin: [3.0, 1.6], roof: 2.85, wheel: 0.48, axle: [2.55, -2.3], mass: 6500, accel: 4.6, top: 30, grip: 6, steer: 0.46, colors: ['#c03a2a', '#3a3a6a', '#4a4a4a'], truck: true, size: 1.4 },
  patrol: { name: 'Garuda Patrol', len: 4.7, wid: 1.86, h: 0.64, cabin: [0.75, -1.15], roof: 1.53, wheel: 0.34, axle: [1.5, -1.5], mass: 1500, accel: 11, top: 54, grip: 9, steer: 0.55, colors: ['#f2f2f2'], police: true },
};


/** Door hinge positions in body space for a type (left, right). */
export function doorHinge(type) {
  const d = VEHICLES[type];
  const y0 = d.wheel * 0.9 + d.h / 2;
  return [[d.wid / 2 - 0.02, y0, d.cabin[0] - 0.05], [-d.wid / 2 + 0.02, y0, d.cabin[0] - 0.05]];
}
