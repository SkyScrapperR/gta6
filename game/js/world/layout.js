// The map of Selara Bay as data: grid constants, districts per block, landmark placement, parks,
// shoreline. x grows east, z grows SOUTH (the top-down map draws x right and z down, matching the
// right-handed 3D world). Everything else (meshes, roads, minimap) reads from here.

export const PITCH = 100; // road centre to road centre
export const GRID = 10; // 10 x 10 blocks
export const ROAD_HALF = 6.5; // half carriageway width
export const LANE = 2.6; // lane centre offset from the road centre (traffic keeps left)
export const PARK_LANE = 5.3; // parked cars along the kerb
export const SIDEWALK = 4; // sidewalk width
export const CURB = 0.15; // sidewalk height
export const LOT_IN = ROAD_HALF + SIDEWALK; // lot inset from road centre
export const CITY = GRID * PITCH; // 1000 m
export const WORLD_MIN = -60;
export const WORLD_MAX = CITY + 60;
export const SEA_LEVEL = -0.9;
export const BEACH_END = CITY + 95; // sand runs south from the coast road down into the sea

export const DISTRICTS = {
  downtown: { name: 'Kota Lama', color: '#46c8ff' },
  midtown: { name: 'Kemuning', color: '#ffb347' },
  residential: { name: 'Bukit Asri', color: '#7be07b' },
  docks: { name: 'Pier 9 Docks', color: '#ffd23a' },
  beach: { name: 'Pantai Selara', color: '#ff7ab8' },
  park: { name: 'Taman Kota', color: '#5fd38a' },
  sea: { name: 'Selat Selara', color: '#4aa0ff' },
};

export const PARKS = new Set(['3,4', '6,1', '1,2']);

/** Landmarks by block: display name, minimap icon and colour. */
export const LANDMARKS = {
  safehouse: { block: [1, 6], name: 'Safehouse', icon: 'house', color: '#2ff3e0' },
  garage: { block: [3, 7], name: "Lin's Garage", icon: 'wrench', color: '#ffb347' },
  hospital: { block: [6, 7], name: 'Selara General Hospital', icon: 'cross', color: '#ff5a5a' },
  police: { block: [4, 6], name: 'Selara Police HQ', icon: 'badge', color: '#5aa0ff' },
  bank: { block: [5, 4], name: 'Bank Samudra', icon: 'bank', color: '#ffd23a' },
  tower: { block: [6, 3], name: 'Orchid Tower', icon: 'orchid', color: '#c070ff' },
  freight: { block: [8, 5], name: 'Orchid Freight', icon: 'crate', color: '#c070ff' },
  respray: { block: [7, 6], name: 'Kilat Respray', icon: 'spray', color: '#4dff9a' },
  guns: { block: [2, 3], name: 'Bang Bang Arms', icon: 'gun', color: '#ff7a3a' },
  dex: { block: [3, 2], name: "Dex's Apartment", icon: 'dex', color: '#7ad7ff' },
  cafe: { block: [5, 2], name: 'Kedai Orchid', icon: 'cup', color: '#ff7ab8' },
};

export function landmarkAtBlock(bx, bz) {
  for (const [key, l] of Object.entries(LANDMARKS)) if (l.block[0] === bx && l.block[1] === bz) return key;
  return null;
}

export function districtOfBlock(bx, bz) {
  if (bx < 0 || bz < 0 || bx >= GRID || bz >= GRID) return 'sea';
  if (PARKS.has(`${bx},${bz}`)) return 'park';
  if (bz === GRID - 1) return 'beach';
  if (bx >= 8 && bz >= 2) return 'docks';
  if (bx <= 2) return 'residential';
  if (bx >= 4 && bx <= 6 && bz >= 2 && bz <= 5) return 'downtown';
  return 'midtown';
}

/** District key at a world position (a road belongs to the block on its south-east side). */
export function districtAt(x, z) {
  if (z > CITY + 8 && x > -40 && x < CITY + 40) return 'beach';
  if (!onLand(x, z)) return 'sea';
  const bx = Math.max(0, Math.min(GRID - 1, Math.floor(x / PITCH)));
  const bz = Math.max(0, Math.min(GRID - 1, Math.floor(z / PITCH)));
  return districtOfBlock(bx, bz);
}

export const blockCenter = (bx, bz) => [bx * PITCH + PITCH / 2, bz * PITCH + PITCH / 2];

/** Whether (x,z) is on a carriageway (between kerbs). */
export function onRoad(x, z) {
  if (x < -ROAD_HALF || z < -ROAD_HALF || x > CITY + ROAD_HALF || z > CITY + ROAD_HALF) return false;
  const dx = Math.abs(x - Math.round(x / PITCH) * PITCH);
  const dz = Math.abs(z - Math.round(z / PITCH) * PITCH);
  return dx <= ROAD_HALF || dz <= ROAD_HALF;
}

/** Whether (x,z) is land the player can stand on (not open sea). */
export function onLand(x, z) {
  if (x >= -30 && x <= CITY + 30 && z >= -30 && z <= CITY + 62) return true;
  if (x >= 1030 && x <= 1150 && z >= 676 && z <= 704) return true; // east pier
  if (x >= 440 && x <= 460 && z >= 1060 && z <= 1150) return true; // ferry pier
  return false;
}

/** Fixed points the story and spawn logic use. */
export const POINTS = {
  ferryPier: [450, 1128],
  ferryArrive: [450, 1068],
  homecomingCar: [462, 1012],
  eastPierEnd: [1140, 690],
  escapeBoat: [1146, 712],
};
