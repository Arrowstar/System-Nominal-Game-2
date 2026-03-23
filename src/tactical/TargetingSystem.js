/**
 * TargetingSystem.js — Manages the player's locked target.
 *
 * Allows cycling through valid targets (celestial bodies, stations, ships).
 * Provides methods to get the target's current state (position, velocity).
 */

import { Vec2 } from '../core/Vec2.js';

export class TargetingSystem {
  /**
   * @param {SolarSystem} system 
   */
  constructor(system) {
    this.system = system;
    this.lockedTarget = null;
  }

  /**
   * Clears the current target lock.
   */
  clear() {
    this.lockedTarget = null;
  }

  /**
   * Cycles to the next available target based on distance from the player.
   * Currently targets all celestial bodies in the solar system.
   * 
   * @param {Vec2} playerPos 
   * @param {number} simTime 
   */
  cycleNext(playerPos, simTime, npcShips = []) {
    // 1. Gather all potential targets
    // Include celestial bodies, stations, and NPC ships (ignoring destroyed hulks)
    const aliveShips = npcShips.filter(npc => !npc.destroyed);
    const potentialTargets = [...this.system.allBodies, ...aliveShips];

    if (potentialTargets.length === 0) return;

    // 2. Sort targets by distance to player
    const targetsWithDist = potentialTargets.map(t => {
      const pos = this.getTargetPosition(simTime, t);
      return { target: t, distSq: pos ? pos.distSq(playerPos) : Infinity };
    }).sort((a, b) => a.distSq - b.distSq);

    // 3. Find current target index
    const currentIndex = targetsWithDist.findIndex(t => t.target === this.lockedTarget);

    // 4. Select next target, or first if none currently locked
    const nextIndex = (currentIndex + 1) % targetsWithDist.length;
    this.lockedTarget = targetsWithDist[nextIndex].target;
  }

  /**
   * Returns true if a target is locked.
   */
  hasTarget() {
    return this.lockedTarget !== null;
  }

  /**
   * Get the current world position of the target (or a specific target).
   * @param {number} simTime 
   * @param {object} [target=this.lockedTarget]
   * @returns {Vec2|null}
   */
  getTargetPosition(simTime, target = this.lockedTarget) {
    if (!target) return null;
    if (target.position) return target.position; // For dynamic entities like ships
    return this.system.getPosition(target, simTime);
  }

  /**
   * Get the current velocity of the locked target.
   * @param {number} simTime 
   * @returns {Vec2|null}
   */
  getTargetVelocity(simTime) {
    if (!this.lockedTarget) return null;

    if (this.lockedTarget.velocity) return this.lockedTarget.velocity; // For dynamic entities

    // If it's a celestial body on rails
    if (this.lockedTarget.orbit) {
      const parentMass = this.lockedTarget.orbit.parent ? this.lockedTarget.orbit.parent.mass : this.system.solara.mass;
      // Effective G matching SolarSystem.js compressed orbits
      const G = 6.674e-11;
      return this.lockedTarget.orbit.getVelocity(simTime, G * parentMass);
    }

    // Default: stationary (e.g., Solara)
    return Vec2.zero();
  }

  /**
   * Calculates the predicted intercept point for a projectile fired at the locked target.
   * @param {Vec2} shooterPos
   * @param {Vec2} shooterVel
   * @param {number} projSpeed
   * @param {number} simTime
   * @returns {Vec2|null} The world position of the predicted intercept, or null if no target.
   */
  getLeadIndicator(shooterPos, shooterVel, projSpeed, simTime) {
    if (!this.lockedTarget) return null;
    const tPos = this.getTargetPosition(simTime);
    const tVel = this.getTargetVelocity(simTime);
    if (!tPos || !tVel) return null;

    const dist = tPos.dist(shooterPos);
    // First-order intercept: time = dist / bulletSpeed
    const timeOfFlight = dist / projSpeed;

    // Relative velocity of target vs shooter
    const relVel = tVel.sub(shooterVel);

    // Predicted intercept position
    return tPos.add(relVel.scale(timeOfFlight));
  }
}
