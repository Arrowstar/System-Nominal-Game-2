/**
 * TimeWarp.js — Time acceleration controller.
 *
 * The player can speed up simulation time to coast through long interplanetary
 * transfers. At warp 1000×, 1 real second equals 1000 sim seconds.
 *
 * Auto-cancel rules (from UX doc):
 *   - Auto-revert to 1× when a ManeuverNode burn time is within 10 sim-seconds
 *   - Auto-revert to 1× on emergency events (missile lock, collision warning)
 *
 * The warp factor is applied in GameLoop._tick() by scaling the physics dt.
 */

/** Available warp levels (× real-time). */
export const WARP_LEVELS = [1, 100, 500, 1000, 5000, 86400]; // 1x, 1.6m/s, 8.3m/s, 16.7m/s, 1.3h/s, 24h/s

export class TimeWarp {
  /**
   * @param {GameLoop} loop  The game loop whose warpFactor we control
   */
  constructor(loop) {
    this._loop        = loop;
    this._levelIndex  = 0;    // index into WARP_LEVELS
    this._locked      = false; // if true, ignores warp-up requests (emergency)
  }

  get factor()     { return WARP_LEVELS[this._levelIndex]; }
  get levelIndex() { return this._levelIndex; }

  /** Increase warp to the next level. */
  warpUp() {
    if (this._locked) return;
    this._levelIndex = Math.min(this._levelIndex + 1, WARP_LEVELS.length - 1);
    this._apply();
  }

  /** Decrease warp by one level. */
  warpDown() {
    this._levelIndex = Math.max(this._levelIndex - 1, 0);
    this._apply();
  }

  /** Set exact warp level by factor value (matches to nearest). */
  setFactor(factor) {
    // Find the closest WARP_LEVELS entry
    let best = 0;
    let bestDist = Infinity;
    WARP_LEVELS.forEach((f, i) => {
      const d = Math.abs(f - factor);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    this._levelIndex = best;
    this._apply();
  }

  /** Immediately cancel to 1× (used on emergencies or approach maneuver nodes). */
  cancel() {
    this._levelIndex = 0;
    this._locked     = false;
    this._apply();
  }

  /** Lock warp at 1× (emergency — enemy lock, collision). Unlock with unlock(). */
  lock() {
    this._levelIndex = 0;
    this._locked     = true;
    this._apply();
  }

  unlock() {
    this._locked = false;
  }

  /**
   * Tick — call each physics frame to check auto-cancel conditions.
   * @param {number} simTime     Current simulation time
   * @param {ManeuverNode[]} nodes  Active maneuver nodes
   */
  tick(simTime, nodes = []) {
    if (this._levelIndex === 0) return;

    // Auto-cancel if approaching any node burn time
    for (const node of nodes) {
      const timeToNode = node.burnTime - simTime;
      if (timeToNode > 0 && timeToNode < 10 * this.factor) {
        // Cancel warp ~10 warp-seconds before the burn
        this.cancel();
        return;
      }
    }
  }

  _apply() {
    this._loop.warpFactor = this.factor;
  }
}
