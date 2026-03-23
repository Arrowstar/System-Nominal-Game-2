/**
 * Trajectory.js — Ghost Path predictor.
 *
 * Runs the ShipSim integrator forward in time (on a COPY of the ship state)
 * to predict where the ship will travel given:
 *   - Current position & velocity
 *   - Any planned maneuver nodes (delta-v burns at future times)
 *
 * Because body positions are computed analytically (KeplerOrbit.getPosition(t)),
 * we get accurate gravity at every future time step without storing extra state.
 *
 * Performance: we use a larger dt (coarser steps) for prediction vs. the live
 * sim — good enough visually, cheap enough to compute each frame.
 */

import { Vec2 } from '../core/Vec2.js';
import { G }  from './KeplerOrbit.js';

/** Physics timestep for trajectory prediction (seconds). Larger = faster, less accurate. */
export const PREDICT_DT = 3600;  // 1-hour steps
export const PREDICT_STEPS = 8000; // 8000 hours = 333 days (~1 game year)

/**
 * A maneuver node: a planned delta-v burn at a specific simulation time.
 */
export class ManeuverNode {
  /**
   * @param {number} burnTime    Sim time when this burn fires (seconds)
   * @param {number} prograde    Δv in the prograde (along velocity) direction (m/s)
   * @param {number} retrograde  Δv in the retrograde direction (m/s)
   * @param {number} radialIn    Δv toward the primary gravity well (m/s)
   * @param {number} radialOut   Δv away from the primary gravity well (m/s)
   * @param {number} normal      Δv perpendicular up (m/s) — affects inclination
   * @param {number} antiNormal  Δv perpendicular down (m/s)
   */
  constructor({
    burnTime    = 0,
    prograde    = 0,
    retrograde  = 0,
    radialIn    = 0,
    radialOut   = 0,
    normal      = 0,
    antiNormal  = 0,
  } = {}) {
    this.burnTime   = burnTime;
    this.prograde   = prograde;
    this.retrograde = retrograde;
    this.radialIn   = radialIn;
    this.radialOut  = radialOut;
    this.normal     = normal;
    this.antiNormal = antiNormal;
    this._applied   = false;   // internal flag during prediction
  }

  /** Net Δv magnitude (m/s). */
  get deltaV() {
    return Math.abs(this.prograde - this.retrograde)
         + Math.abs(this.radialOut - this.radialIn)
         + Math.abs(this.normal - this.antiNormal);
  }

  /**
   * Compute the Δv vector to apply given the ship's current velocity direction.
   * In 2D we only have prograde/retrograde and radial in/out; normal is ignored
   * (no out-of-plane maneuvers in this flat sim).
   *
   * @param {Vec2} velocity  Current ship velocity
   * @param {Vec2} primaryPos Position of the primary gravity well (Solara)
   * @returns {Vec2}  Δv vector (m/s)
   */
  getDeltaVVector(velocity, primaryPos, shipPos) {
    const progDir = velocity.len() > 0 ? velocity.norm() : new Vec2(1, 0);
    const retroDir = progDir.neg();
    const radialOutDir = shipPos.sub(primaryPos).norm();
    const radialInDir  = radialOutDir.neg();

    return progDir.scale(this.prograde)
      .add(retroDir.scale(this.retrograde))
      .add(radialOutDir.scale(this.radialOut))
      .add(radialInDir.scale(this.radialIn));
  }
}

export class Trajectory {
  /**
   * @param {ShipSim} sim    The ship simulator (provides gravAccelAt)
   * @param {Vec2}    solaraPos  Position of the primary well (always Vec2.zero())
   */
  constructor(sim, solaraPos = Vec2.zero()) {
    this.sim        = sim;
    this.solaraPos  = solaraPos;
    this._points    = [];     // cached Vec2[] ghost path
    this._dirty     = true;   // needs recomputation
  }

  /** Mark trajectory as needing recomputation (e.g., after node change). */
  invalidate() { this._dirty = true; }

  /** The last computed ghost path points ({pos, vel, t}[]). */
  get points() { return this._points; }

  /**
   * Recompute the ghost path if dirty.
   * Call once per frame before rendering.
   *
   * @param {Ship}         ship      Current ship (read-only, state is cloned)
   * @param {number}       simTime   Current simulation time
   * @param {ManeuverNode[]} nodes   Planned maneuver nodes (sorted by burnTime)
   */
  update(ship, simTime, nodes = []) {
    if (!this._dirty) return;
    this._dirty  = false;
    this._points = this._predict(ship, simTime, nodes);
  }

  /**
   * Force a recompute regardless of dirty flag. Used when the caller knows
   * something changed (e.g., node Δv edited via scroll wheel).
   */
  forceUpdate(ship, simTime, nodes = []) {
    this._dirty  = true;
    this.update(ship, simTime, nodes);
  }

  /**
   * Run the prediction simulation and return sampled positions.
   * @private
   */
  _predict(ship, simTime, nodes) {
    this._updateBodyPaths(simTime);

    // Reuse points array
    while (this._points.length < PREDICT_STEPS) {
      this._points.push({ pos: new Vec2(), vel: new Vec2(), t: 0 });
    }

    let px = ship.position.x;
    let py = ship.position.y;
    let vx = ship.velocity.x;
    let vy = ship.velocity.y;
    let mass = ship.totalMass;
    let t = simTime;

    // Sort nodes by burn time to apply them in order
    const pendingNodes = [...nodes].sort((a, b) => a.burnTime - b.burnTime);
    let nodeIdx = 0;
    const G = 6.674e-11;
    const simBodies = this.sim.bodies;

    for (let step = 0; step < PREDICT_STEPS; step++) {
      // Apply any maneuver nodes whose burn time has passed
      while (nodeIdx < pendingNodes.length && pendingNodes[nodeIdx].burnTime <= t) {
        const node = pendingNodes[nodeIdx++];
        const posVec = new Vec2(px, py);
        const velVec = new Vec2(vx, vy);
        const primary = this.sim.getDominantBodyAt(posVec, t);
        const primaryPos = primary ? primary.getPosition(t) : Vec2.zero();
        
        const dv = node.getDeltaVVector(velVec, primaryPos, posVec);
        vx += dv.x;
        vy += dv.y;
      }

      // Gravity acceleration from cached on-rails bodies
      let ax = 0, ay = 0;
      const bodyPosArray = this._bodyPaths[step];
      for (let i = 0; i < simBodies.length; i++) {
        const bPos = bodyPosArray[i];
        const dx = bPos.x - px;
        const dy = bPos.y - py;
        const r2 = dx * dx + dy * dy;
        if (r2 < 1e6) continue;
        const r = Math.sqrt(r2);
        const acc = (G * simBodies[i].mass) / r2;
        ax += acc * (dx / r);
        ay += acc * (dy / r);
      }

      // Symplectic Euler (velocity first)
      vx += ax * PREDICT_DT;
      vy += ay * PREDICT_DT;
      px += vx * PREDICT_DT;
      py += vy * PREDICT_DT;
      t  += PREDICT_DT;

      const pt = this._points[step];
      pt.pos.x = px;
      pt.pos.y = py;
      pt.vel.x = vx;
      pt.vel.y = vy;
      pt.t     = t;
    }

    // If PREDICT_STEPS were ever reduced, we would slice it here.
    return this._points;
  }

  _updateBodyPaths(simTime) {
    // Reuse cached paths if simTime hasn't shifted significantly (e.g. while paused and dragging)
    if (this._bodyPaths && Math.abs(this._lastSimTime - simTime) < 10) return;
    
    this._lastSimTime = simTime;
    if (!this._bodyPaths) this._bodyPaths = [];
    
    let t = simTime;
    const bodies = this.sim.bodies;
    
    for (let step = 0; step < PREDICT_STEPS; step++) {
      if (step >= this._bodyPaths.length) {
        this._bodyPaths.push(new Array(bodies.length));
      }
      const pArray = this._bodyPaths[step];
      for (let i = 0; i < bodies.length; i++) {
        pArray[i] = bodies[i].getPosition(t);
      }
      t += PREDICT_DT;
    }
  }

  /**
   * Estimated fuel cost to execute all maneuver nodes.
   * Uses the rocket equation: Δm = m * (1 - e^(-Δv / (Isp * g₀)))
   *
   * @param {Ship}         ship
   * @param {ManeuverNode[]} nodes
   * @returns {number}  Total fuel mass required (kg)
   */
  estimateFuelCost(ship, nodes) {
    const { isp, totalMass } = ship;
    let mass = totalMass;
    let totalBurned = 0;

    for (const node of nodes) {
      const dv   = node.deltaV;
      const dm   = mass * (1 - Math.exp(-dv / (isp * 9.80665)));
      totalBurned += dm;
      mass        -= dm;
    }
    return totalBurned;
  }
}
