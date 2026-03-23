/**
 * GameLoop — Fixed-timestep update with interpolated rendering.
 *
 * Runs physics at a constant PHYSICS_HZ regardless of frame rate.
 * Passes an alpha [0,1] to render for interpolation between physics steps.
 *
 * Usage:
 *   const loop = new GameLoop(update, render);
 *   loop.start();
 */

const PHYSICS_HZ = 60;          // physics ticks per real second
const PHYSICS_DT = 1 / PHYSICS_HZ;
const MAX_FRAME_TIME = 0.25;    // clamp to avoid spiral of death

export class GameLoop {
  /**
   * @param {(dt: number, simTime: number) => void} update  — physics update, dt in sim-seconds
   * @param {(alpha: number) => void}                render  — render with interpolation factor
   */
  constructor(update, render) {
    this._update = update;
    this._render = render;
    this._running = false;
    this._rafId  = null;
    this._lastTime = null;
    this._accumulator = 0;
    this._simTime  = 0;      // total simulated time in seconds (affected by time-warp)
    this._warpFactor = 1;    // set by TimeWarp module
  }

  get simTime()    { return this._simTime; }
  get warpFactor() { return this._warpFactor; }
  set warpFactor(v){ this._warpFactor = v; }

  start() {
    if (this._running) return;
    this._running  = true;
    this._lastTime = performance.now();
    this._rafId    = requestAnimationFrame(this._tick.bind(this));
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  _tick(nowMs) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._tick.bind(this));

    const nowSec    = nowMs * 0.001;
    const lastSec   = this._lastTime * 0.001;
    this._lastTime  = nowMs;

    // Real elapsed time this frame, clamped to prevent spiral
    const realDelta = Math.min(nowSec - lastSec, MAX_FRAME_TIME);
    // Sim delta is scaled by warp
    const simDelta  = realDelta * this._warpFactor;
    this._accumulator += simDelta;

    // Fixed-step physics updates
    // Cap maximum iterations per frame to prevent browser freeze at high warp.
    // If we need more than 120 steps, we scale up the step size instead.
    let steps = Math.floor(this._accumulator / PHYSICS_DT);
    let current_dt = PHYSICS_DT;

    if (steps > 120) {
      current_dt = this._accumulator / 120;
      steps = 120;
    }

    for (let i = 0; i < steps; i++) {
      this._update(current_dt, this._simTime);
      this._simTime     += current_dt;
      this._accumulator -= current_dt;
    }

    // Render with interpolation factor
    const alpha = this._accumulator / PHYSICS_DT;
    this._render(alpha);
  }
}
