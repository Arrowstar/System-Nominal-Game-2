/**
 * Loadout.js — Ship loadout manager.
 * 
 * Combines a base Hull with equipped Components and provides
 * aggregated stats for the physics engine and UI.
 */

import { HULLS }      from './Hull.js';
import { COMPONENTS } from './Component.js';

export class Loadout {
  /**
   * @param {string} hullId        ID from HULLS
   * @param {string[]} componentIds Array of IDs from COMPONENTS
   */
  constructor(hullId, componentIds = []) {
    this.hull = HULLS[hullId];
    if (!this.hull) throw new Error(`Unknown hull ID: ${hullId}`);

    this.components = componentIds.map(id => {
      const comp = COMPONENTS[id];
      if (!comp) throw new Error(`Unknown component ID: ${id}`);
      return comp;
    });
  }

  /** Total mass of hull + dry components (kg). */
  get emptyMass() {
    let m = this.hull.baseMass;
    for (const c of this.components) m += c.mass || 0;
    return m;
  }

  /** Maximum fuel capacity (kg) from all equipped tanks. */
  get maxFuel() {
    let f = 0;
    for (const c of this.components) f += c.fuelCap || 0;
    return f;
  }

  /** Total engine thrust (Newtons). */
  get totalThrust() {
    let t = 0;
    for (const c of this.components) t += c.thrust || 0;
    return t;
  }

  /** Thrust-weighted average Specific Impulse (seconds). */
  get netIsp() {
    let totalThrust = 0;
    let massFlow = 0;
    
    for (const c of this.components) {
      if (c.thrust && c.isp) {
        totalThrust += c.thrust;
        // dm/dt = F / (Isp * g0)
        massFlow += c.thrust / (c.isp * 9.80665);
      }
    }
    
    if (massFlow === 0) return 0;
    return totalThrust / (massFlow * 9.80665);
  }

  /** Total power generation (MW). */
  get powerGen() {
    let p = 0;
    for (const c of this.components) p += c.powerGen || 0;
    return p;
  }

  /** Total power consumption at rest (MW). */
  get powerDrawRest() {
    // Engines don't draw their full power at rest, but other things might
    return 1; // Base life support draw
  }

  /** Total power consumption when engines are firing (MW). */
  get powerDrawThrust() {
    let d = this.powerDrawRest;
    for (const c of this.components) d += c.powerDraw || 0;
    return d;
  }
}
