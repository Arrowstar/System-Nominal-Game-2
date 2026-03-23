/**
 * WinLoss.js — Victory and defeat condition checker.
 *
 * Checks three conditions every tick:
 *   1. Victory: fame >= 20
 *   2. Hull Breach: ship.destroyed === true
 *   3. Dead Orbit: fuel = 0 and no station within reachable coasting distance
 *
 * Dead Orbit uses a simple heuristic (no full trajectory projection):
 *   fuelEmpty && no station within DEAD_ORBIT_RADIUS.
 *
 * Negative fame (< 0) is a permanent game over — Mayday is not offered.
 */

import { Vec2 } from '../core/Vec2.js';
import { AU }   from '../world/SolarSystem.js';

/** Distance threshold within which a station is "reachable" for Dead Orbit check. */
const DEAD_ORBIT_RADIUS = 5 * AU;

/** How often (sim seconds) to re-run the Dead Orbit check. */
const DEAD_ORBIT_CHECK_INTERVAL = 60;

export class WinLoss {
  constructor() {
    this._triggered   = false;   // Prevent double-firing
    this._deadOrbitTimer = 0;
    this._listeners  = [];
  }

  /**
   * Subscribe to game-end events.
   * Callback: (cause, data) where cause is 'victory' | 'hull_breach' | 'dead_orbit'
   * data = { fameTracker, playerShip }
   * @returns {function} Unsubscribe
   */
  onGameEnd(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  _fire(cause, data) {
    if (this._triggered) return;
    this._triggered = true;
    for (const fn of this._listeners) fn(cause, data);
  }

  /** Reset so a new game can start. */
  reset() {
    this._triggered      = false;
    this._deadOrbitTimer = 0;
  }

  // ─── Main Check ───────────────────────────────────────────────────────────

  /**
   * Run every game tick.
   * @param {number}      dt           Delta time (seconds)
   * @param {number}      simTime      Simulation time (seconds)
   * @param {Ship}        playerShip
   * @param {FameTracker} fameTracker
   * @param {SolarSystem} solarSystem
   */
  update(dt, simTime, playerShip, fameTracker, solarSystem) {
    if (this._triggered) return;

    const payload = { fameTracker, playerShip };

    // 1. Victory
    if (fameTracker.hasWon) {
      this._fire('victory', payload);
      return;
    }

    // 2. Hull Breach
    if (playerShip.destroyed) {
      this._fire('hull_breach', payload);
      return;
    }

    // 3. Dead Orbit — check periodically
    this._deadOrbitTimer += dt;
    if (this._deadOrbitTimer >= DEAD_ORBIT_CHECK_INTERVAL) {
      this._deadOrbitTimer = 0;
      if (playerShip.fuel <= 0 && playerShip.throttle === 0) {
        if (!this._hasReachableStation(playerShip.position, simTime, solarSystem)) {
          this._fire('dead_orbit', payload);
        }
      }
    }
  }

  // ─── Dead Orbit Heuristic ─────────────────────────────────────────────────

  /**
   * True if at least one dockable station body is within DEAD_ORBIT_RADIUS.
   * @param {Vec2}        shipPos
   * @param {number}      simTime
   * @param {SolarSystem} solarSystem
   */
  _hasReachableStation(shipPos, simTime, solarSystem) {
    for (const body of solarSystem.allBodies) {
      if (!body.stations || body.stations.length === 0) continue;
      const bPos = solarSystem.getPosition(body, simTime);
      const dx   = (shipPos.x ?? 0) - bPos.x;
      const dy   = (shipPos.y ?? 0) - bPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < DEAD_ORBIT_RADIUS) return true;
    }
    return false;
  }

  // ─── Mayday Rescue ────────────────────────────────────────────────────────

  /**
   * Execute Mayday rescue:
   *   - Deducts 75% of credits
   *   - Applies −2 Fame penalty
   *   - NOT available if fame is already negative
   *
   * @param {FameTracker} fameTracker
   * @returns {boolean}  True if rescue was applied; false if not eligible
   */
  static canMayday(fameTracker) {
    // Not allowed if fame is already negative — must start over
    return fameTracker.fame >= 0;
  }

  /**
   * Apply the Mayday penalty. Caller is responsible for resetting ship state
   * and transitioning back to the flight state.
   *
   * @param {FameTracker} fameTracker
   * @param {object}      globals     { _credits: number } (window globals)
   * @returns {{ creditsLost: number }} Summary of what was deducted
   */
  static executeMayday(fameTracker, globals) {
    const creditsLost = Math.floor((globals._credits ?? 0) * 0.75);
    globals._credits  = (globals._credits ?? 0) - creditsLost;
    fameTracker.applyPenalty(2);
    return { creditsLost };
  }
}
