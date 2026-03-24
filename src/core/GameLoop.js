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

    // Adaptive Sub-Stepping
    // We consume the accumulator in steps.
    // User Requirement: Max time step of 1.0s.
    // If accumulator is small (1x warp), we take one small step.
    // If accumulator is large (1000x warp), we take multiple 1.0s steps.
    
    const MAX_PHYS_DT = 1.0; 
    const MAX_STEPS = 200; // Safety cap to prevent freeze
    let steps = 0;

    while (this._accumulator > 0 && steps < MAX_STEPS) {
        let currentDt = this._accumulator;
        if (currentDt > MAX_PHYS_DT) currentDt = MAX_PHYS_DT;

        this._update(currentDt, this._simTime);
        this._simTime += currentDt;
        this._accumulator -= currentDt;
        steps++;
        
        // Tiny epsilon check to prevent infinite loops on float errors
        if (this._accumulator < 1e-6) this._accumulator = 0;
    }

    if (this._accumulator > 0) {
        // We hit the step limit. Discard the rest to prevent spiral of death.
        // This means the simulation runs slower than requested warp, but keeps the UI responsive.
        this._accumulator = 0;
    }

    // Render with interpolation factor
    // Since we drain the accumulator (mostly), alpha is close to 0 or 1.
    // For adaptive variable steps, interpolation is tricky. 
    // We'll just render the current state (alpha = 1).
    this._render(1.0);
  }
}
