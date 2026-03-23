/**
 * DockingManager.js — Proximity detection & docking state controller.
 *
 * Each tick, checks the player ship's distance to every body in SolarSystem.
 * When the ship is within docking range AND closing speed is below the threshold,
 * the manager exposes the valid dock target to the HUD/input layer.
 *
 * Docking radii scale with body radius:
 *   - Planets / moons: 3× body radius  (low orbit)
 *   - Stations:        5× body radius  (close approach)
 *   - Minimum:         50 km
 *
 * The ship must also be moving slower than MAX_APPROACH_SPEED relative
 * to the body to dock (prevents fly-through docking).
 */

export class DockingManager {
  /** Maximum relative speed to allow docking (m/s). */
  static MAX_APPROACH_SPEED = 20000;  // 20 km/s — extremely forgiving

  /** Minimum docking radius regardless of body size (meters). */
  static MIN_DOCK_RADIUS = 50_000;    // 50 km

  /**
   * @param {SolarSystem} system
   */
  constructor(system) {
    this.system = system;

    /** @type {object|null} Currently dockable body (closest in range). */
    this.dockTarget = null;

    /** Distance to the current dockTarget in meters. */
    this.dockDistance = Infinity;

    /** Relative speed to the dock target in m/s. */
    this.approachSpeed = Infinity;

    /** Is the ship slow enough and close enough to actually dock? */
    this.canDock = false;
  }

  /**
   * Called every physics tick.
   * @param {Ship}   ship
   * @param {number} simTime  Current simulation time (s)
   */
  update(ship, simTime) {
    let best = null;
    let bestDist = Infinity;
    let bestSpeed = Infinity;

    for (const body of this.system.allBodies) {
      // Skip bodies with no stations and no economy (nothing to dock with)
      if ((!body.stations || body.stations.length === 0) && !body.economy) continue;

      const bPos = this.system.getPosition(body, simTime);
      const dx = ship.position.x - bPos.x;
      const dy = ship.position.y - bPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const dockRadius = Math.max(
        (body.radius || 0) * (body.type === 'station' ? 5 : 3),
        DockingManager.MIN_DOCK_RADIUS
      );

      if (dist < dockRadius && dist < bestDist) {
        // Compute relative velocity
        const bVel = body.orbit ? body.orbit.getVelocity(simTime) : { x: 0, y: 0 };
        const rvx = ship.velocity.x - bVel.x;
        const rvy = ship.velocity.y - bVel.y;
        const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy);

        best = body;
        bestDist = dist;
        bestSpeed = relSpeed;
      }
    }

    this.dockTarget = best;
    this.dockDistance = bestDist;
    this.approachSpeed = bestSpeed;
    this.canDock = best !== null && bestSpeed < DockingManager.MAX_APPROACH_SPEED;
  }

  /**
   * Return a human-friendly label for the docking prompt.
   * Prefers the first station name if one exists, else body name.
   */
  getTargetLabel() {
    if (!this.dockTarget) return '';
    const stations = this.dockTarget.stations;
    if (stations && stations.length > 0) return stations[0].name;
    return this.dockTarget.name;
  }
}
