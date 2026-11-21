// Model library: the one place that turns procedural geometry into GPU meshes. Gameplay systems
// (player, pedestrians, vehicles, helicopter, weapons, pickups) ask it for meshes instead of importing
// the engine's mesh builder, which keeps gameplay code independent of the renderer.

import { buildCharacter } from './entities/character-model.js';
import { buildVehicle, buildHelicopter } from './entities/vehicle-model.js';
import { buildWeaponMeshes } from './combat/weapon-models.js';
import { buildPickupMeshes } from './combat/pickup-models.js';
import { Searchlight } from './fx/searchlight.js';

export class ModelLibrary {
  constructor(gl) {
    this.gl = gl;
    this.characters = new Map();
    this.vehicles = new Map();
    this.weapons = buildWeaponMeshes(gl);
    this.pickups = buildPickupMeshes(gl);
    this.heli = buildHelicopter(gl);
    this.searchlight = new Searchlight(gl);
  }

  /** A rigged character mesh for a look, cached by key. */
  character(key, look) {
    let m = this.characters.get(key);
    if (!m) this.characters.set(key, (m = buildCharacter(this.gl, look)));
    return m;
  }

  /** A rigged vehicle mesh for a type, cached. */
  vehicle(type) {
    let m = this.vehicles.get(type);
    if (!m) this.vehicles.set(type, (m = buildVehicle(this.gl, type)));
    return m;
  }
}
