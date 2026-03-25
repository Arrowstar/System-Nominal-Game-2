/**
 * AutopilotManager.js — Continuous-Thrust Optimal Control (TPBVP).
 *
 * Replaces the old heuristic autopilot with a physics-based solver.
 *
 * Architecture:
 *   1. STANDBY: Idle.
 *   2. OPTIMAL: Solves Two-Point Boundary Value Problem (TPBVP) to find optimal
 *      thrust vectoring. Updates guidance every ~0.5s sim-time.
 *   3. TERMINAL: Switches to PD Controller for final approach and orbit insertion.
 *   4. HOLD: Station-keeping at target.
 */

import { Vec2 } from '../core/Vec2.js';
import { TPBVPSolver } from './TPBVPSolver.js';
import { G_SI, SOFTENING_SI } from './CanonicalUnits.js';

export const AP_STATE = {
  OFF: 'OFF',
  STANDBY: 'STANDBY', // Calculated but waiting
  OPTIMAL: 'OPTIMAL', // TPBVP Guidance active
  TERMINAL: 'TERMINAL', // PD Controller active
  HOLD: 'HOLD'     // Arrived
};

const GUIDANCE_INTERVAL = 0.5; // Seconds (sim time) between solver updates
// TERMINAL_HANDOFF_TIME and TERMINAL_DIST_THRESHOLD removed in favor of dynamic metrics

export class AutopilotManager {
  constructor(solarSystem) {
    this.system = solarSystem;
    this.solver = new TPBVPSolver(solarSystem);

    this.state = AP_STATE.OFF;
    this.targetBody = null;
    this.efficiency = 0.0;
    this.estimatedFuelCost = 0;

    // Flight Parameters
    this.tArrival = 0; // Desired arrival time (sim time)
    this.flightTime = 0; // Total duration

    // Solver State
    this.costates = [0, 0, 0, 0]; // [lrx, lry, lvx, lvy]
    this.path = []; // Predicted trajectory for visualization
    this.lastSolveTime = 0;
    this.lastRealSolveTime = 0; // Real-time throttle
    this.engageTime = 0;

    // Public props for UI
    this.interceptPt = null;
    this.targetAimPt = null; // For debug drawing
    this.eta = 0;
    this.dvRemaining = 0;
    this.error = 0; // BVP error
    this.iterations = 0; // Solver iterations
    this.currentThrottle = 0;
    this.currentAccel = 0;   // Physical m/s² actually applied
    this.requestedAccel = 0; // Raw m/s² requested by the solver
    this.handoffProgress = 0; // 0-1 closeness to terminal guidance
    this.handoffTime = 0; // Duration of terminal phase
    this.timeToTerminal = 0; // Sim-seconds until handoff
    this.posError = 0; // Terminal pos error
    this.velError = 0; // Terminal vel error
  }

  get active() { return this.state !== AP_STATE.OFF; }
  get isExecuting() { return this.state === AP_STATE.OPTIMAL || this.state === AP_STATE.TERMINAL; }

  /**
   * Engage autopilot system for a target (STANDBY/PREVIEW).
   * @param {object} body         Target body
   * @param {number} flightTime   (Optional) Flight time in seconds.
   */
  engage(body, flightTime = null) {
    this.targetBody = body;
    this.state = AP_STATE.STANDBY;
    this._needsInit = true; // Trigger BVP solve for preview
    this.engageTime = (typeof window !== 'undefined' && window.solarSystem && window.solarSystem.gameLoop) ? window.solarSystem.gameLoop.simTime : 0;

    // Heuristic for flight time if not provided
    // Constant thrust transfers are faster than Hohmann.
    // Let's assume a "brisk" transit.
    if (!flightTime) {
      // Default to 60 days for inner system, scaled by distance
      const ship = (typeof window !== 'undefined') ? window.playerShip : null; // Access global player ship for position
      if (ship) {
        const dist = ship.position.dist(this.system.getPosition(body, 0)); // Approx dist (using time 0 is meh but ok)
        // 1 AU ~ 60 days?
        const AU = 1.496e11;
        const distAU = dist / AU;
        const baseHeuristic = Math.max(0.05, distAU * 12) * 86400; // 12 days per AU, min 1.2 hours
        flightTime = baseHeuristic * (1.0 + this.efficiency * 8.0);
      } else {
        flightTime = 90 * 86400;
      }
    }
    this.flightTime = flightTime;
  }

  /**
   * Transition from STANDBY to active EXECUTION.
   */
  execute() {
    if (this.state === AP_STATE.STANDBY && this.targetBody) {
      this.state = AP_STATE.OPTIMAL;
      if (typeof window !== 'undefined' && window.playerShip) {
        window.playerShip.usePrecisionIntegration = true;
      }
    }
  }

  disengage() {
    this.state = AP_STATE.OFF;
    this.targetBody = null;
    this.path = [];
    if (typeof window !== 'undefined' && window.playerShip) {
      window.playerShip.usePrecisionIntegration = false;
      window.playerShip.throttle = 0;
    }
  }

  setEfficiency(val) {
    this.efficiency = Math.min(1.0, Math.max(0.0, val));
    // If already active, we need to restart the trajectory with the new flight time
    if (this.state !== AP_STATE.OFF && this.targetBody) {
      this.engage(this.targetBody);
    }
  }

  _initializeTrajectory() {
    if (typeof window === 'undefined') return;
    const ship = window.playerShip;
    const loop = (window.solarSystem && window.solarSystem.gameLoop) ? window.solarSystem.gameLoop : { simTime: 0 }; // Hacky access to simTime if not passed
    // Better: We need simTime. engage() usually called from UI event.
    // We'll initialize in the first update() call if needed.
    this.state = AP_STATE.OPTIMAL;
    ship.usePrecisionIntegration = true;

    // Set tArrival based on CURRENT sim time
    // We need to capture the exact start time.
    // For now, mark a flag to init on next update
    this._needsInit = true;
  }

  update(ship, dt, simTime, timeWarp = null) {
    if (this.state === AP_STATE.OFF) return;

    if (this._needsInit) {
      this.tArrival = simTime + this.flightTime;
      // Run cold start for preview
      const res = this.solver.solve(ship, this.targetBody, simTime, this.tArrival, null, 50, 100);
      this.costates = res.costates;
      this.path = res.path;
      this.error = res.error;
      this.iterations = res.iterations || 0;
      this.estimatedFuelCost = res.fuelCost;
      this.lastSolveTime = simTime;
      this._needsInit = false;
    }

    const tGo = this.tArrival - simTime;

    if (this.state === AP_STATE.STANDBY) {
      this._updatePreview(ship, dt, simTime);
    } else if (this.state === AP_STATE.OPTIMAL) {
      this._updateOptimal(ship, dt, simTime, timeWarp, tGo);
    } else if (this.state === AP_STATE.TERMINAL) {
      this.path = []; // Clear old BVP path — allows UI fallback to live prediction
      this._updateTerminal(ship, dt, simTime, timeWarp);
    } else if (this.state === AP_STATE.HOLD) {
      ship.throttle = 0;
      ship.usePrecisionIntegration = false;
    }

    // Costate Propagation: Maintain guidance quality between full BVP solves
    if (this.active && !this._needsInit) {
      this._propagateCostates(ship, dt, simTime);
    }

    // Telemetry updates
    this.eta = Math.max(0, this.tArrival - simTime);
    this.interceptPt = this.system.getPosition(this.targetBody, this.tArrival);

    // Approx dv remaining: current acceleration * eta? 
    // Or just rel speed.
    const tVel = this.targetBody.orbit ? this.targetBody.orbit.getVelocity(simTime) : Vec2.zero();
    const relVel = ship.velocity.sub(tVel);
    this.dvRemaining = relVel.len(); // Rough proxy

    // ─── Shared Logic (Optimal & Standby) ───────────────────────────────────
    
    // 1. Handoff Progress Calculation
    const shipMaxAccel = ship.thrust / ship.totalMass;
    this.handoffTime = Math.max(1800, 2000 / Math.max(0.01, shipMaxAccel));
    this.handoffProgress = Math.max(0, Math.min(1, (2 * this.handoffTime - tGo) / this.handoffTime));
    this.timeToTerminal = Math.max(0, tGo - this.handoffTime);

    // 2. Time Warp Safety: Soft Drop
    if (timeWarp && timeWarp.factor > 1) {
      if (tGo < 30 * timeWarp.factor) {
        timeWarp.warpDown();
      }
    }
  }

  /**
   * Background trajectory preview in STANDBY mode.
   */
  _updatePreview(ship, dt, simTime) {
    const nowReal = performance.now() * 0.001;
    const realElapsed = nowReal - this.lastRealSolveTime;

    // Update preview every 1s real-time to avoid freezing the main thread
    if (realElapsed > 1.0) {
      // Warm start solver for preview - always accept a converged result even if error is higher than last snapshot
      // Reduced iterations (8) and resolution (25 steps) for background performance
      const res = this.solver.solve(ship, this.targetBody, simTime, simTime + this.flightTime, this.costates, 8, 25);
      if (res.converged || res.error < this.error * 5.0) { // Increased tolerance for preview
        this.costates = res.costates;
        this.path = res.path;
        this.error = res.error;
        this.iterations = res.iterations || 0;
        this.estimatedFuelCost = res.fuelCost;
      }
      this.lastRealSolveTime = nowReal;
      this.lastSolveTime = simTime;
    }

    // Telemetry for HUD: What WOULD the acceleration be if we engaged?
    const lvx = this.costates[2];
    const lvy = this.costates[3];
    const cmdMag = Math.sqrt(lvx*lvx + lvy*lvy);
    this.requestedAccel = cmdMag;
    this.currentAccel = 0;
    this.currentThrottle = 0;

    // Ensure engines are OFF for real ship
    ship.throttle = 0;
    ship.usePrecisionIntegration = false;
  }

  _updateOptimal(ship, dt, simTime, timeWarp, tGo) {

    // 1. Guidance Update (MPC)
    // Throttle: Solve at most every GUIDANCE_INTERVAL sim-seconds, 
    // AND at most every 1.0 real-seconds if warping.
    const nowReal = performance.now() * 0.001;
    const realElapsed = nowReal - this.lastRealSolveTime;
    const simElapsed = simTime - this.lastSolveTime;

    let shouldSolve = simElapsed > GUIDANCE_INTERVAL;
    if (timeWarp && timeWarp.factor > 1) {
      // High warp: limit to ~1Hz real-time frequency
      shouldSolve = (simElapsed > GUIDANCE_INTERVAL) && (realElapsed > 1.0);
    }

    if (shouldSolve) {
      // Warm start solver
      // Warm start solver - prefer converged results, but accept a slightly worse one to keep the path fresh
      // Reduced iterations (15) and resolution (50 steps) for real-time guidance
      const res = this.solver.solve(ship, this.targetBody, simTime, this.tArrival, this.costates, 15, 50);
      if (res.converged || res.error < this.error * 3.0) { 
        this.costates = res.costates;
        this.path = res.path;
        this.error = res.error;
        this.iterations = res.iterations || 0;
        this.estimatedFuelCost = res.fuelCost;
      }
      this.lastSolveTime = simTime;
      this.lastRealSolveTime = nowReal;
    }

    // 2. Control Law
    // a_cmd = -lambda_v
    const lvx = this.costates[2];
    const lvy = this.costates[3];
    const cmdAccel = new Vec2(-lvx, -lvy);
    const cmdMag = cmdAccel.len();

    // Set Heading
    if (cmdMag > 1e-6) {
      ship.heading = cmdAccel.angle();
    }

    // Set Throttle (Continuous thrust)
    // Map cmdAccel magnitude to throttle [0,1]
    // maxAccel = thrust / mass
    const maxAccel = ship.thrust / ship.totalMass;
    let throttle = cmdMag / maxAccel;

    // Clamp
    throttle = Math.min(1.0, Math.max(0.0, throttle));
    ship.throttle = throttle;
    this.currentThrottle = throttle;
    this.currentAccel = throttle * maxAccel;
    this.requestedAccel = cmdMag;

    this.targetAimPt = ship.position.add(cmdAccel.scale(1e6)); // Visual debug

    // 3. Terminal Handoff Check
    // We already calculated this.handoffTime above in the shared update loop.
    if (this.isExecuting && tGo < this.handoffTime) {
      this.state = AP_STATE.TERMINAL;
      this.path = []; // Immediate clear
    }
  }

  /**
   * Manually transition from BVP to Terminal Guidance.
   */
  forceTerminal() {
    if (this.state === AP_STATE.OPTIMAL) {
        this.state = AP_STATE.TERMINAL;
        this.path = [];
        return true;
    }
    return false;
  }

  _updateTerminal(ship, dt, simTime, timeWarp) {
    // 1. Target Parameters
    // Target 1.5x body radius (0.5 radii above surface)
    const targetRadius = (this.targetBody.radius || 1000) * 1.5;
    const mu = 6.674e-11 * this.targetBody.mass;
    const targetEnergy = -mu / (2 * targetRadius);

    const bPos = this.system.getPosition(this.targetBody, simTime);
    const bVel = this.targetBody.orbit ? this.targetBody.orbit.getVelocity(simTime) : Vec2.zero();
    
    const relPos = ship.position.sub(bPos);
    const r = relPos.len();
    const radialDir = relPos.norm();
    
    const relVel = ship.velocity.sub(bVel);
    const v2 = relVel.lenSq();
    const v = Math.sqrt(v2);
    const vRadial = relVel.dot(radialDir);
    
    // Determine orbital direction from momentum
    const h = relPos.cross(relVel);
    const orbDir = h >= 0 ? 1 : -1;
    const tangentVec = new Vec2(-radialDir.y * orbDir, radialDir.x * orbDir);
    const vTangent = relVel.dot(tangentVec);

    // 2. Control Law: Energy & Eccentricity
    // Specific Mechanical Energy: E = v^2/2 - mu/r
    const currentEnergy = v2/2 - mu/Math.max(1, r);
    const energyErr = targetEnergy - currentEnergy;

    // Gains
    const m = ship.totalMass;
    const k_E = 0.5; // Energy correction gain
    const k_r = 0.1; // Altitude lift gain (restores radius if too low)
    
    // Radial damping: 
    // Diode logic: Soft damping when high (allows steady 100-300m/s fall), 
    // Stiff damping when on-target (stablizes the orbit).
    const isHigh = r > targetRadius;
    const k_d = isHigh ? 0.01 : 1.0;

    // Tangential acceleration drives Energy to target (shape)
    const aTan = k_E * energyErr / Math.max(1, v);
    
    // Radial acceleration:
    // - Add "lift" if we are below targetRadius (prevents crashing)
    // - Damp radial velocity (weighted by proximity)
    const radialLift = Math.max(0, targetRadius - r) * k_r;
    const aRad = radialLift - k_d * vRadial;

    // 3. Total Command Force
    // Priority: Energy correction takes precedence if we are far away
    const fTan = aTan * m;
    const fRad = aRad * m;
    const F_cmd = radialDir.scale(fRad).add(tangentVec.scale(fTan));
    const F_mag = F_cmd.len();

    if (F_mag > 1e-3) {
      ship.heading = F_cmd.angle();
      ship.throttle = Math.min(1.0, F_mag / ship.thrust);
    } else {
      ship.throttle = 0;
    }

    this.currentThrottle = ship.throttle;
    const actualAccel = (m > 0) ? (ship.throttle * ship.thrust / m) : 0;
    this.currentAccel = actualAccel;
    this.requestedAccel = F_mag / m;
    
    // Update HUD telemetry errors
    // We'll show Semi-Major Axis error (derived from E) and Eccentricity magnitude
    const currentA = -mu / (2 * currentEnergy);
    // Eccentricity vector calculation
    const eVec = relPos.scale(v2/mu - 1/r).sub(relVel.scale(relPos.dot(relVel)/mu));
    const ecc = eVec.len();

    this.posError = Math.abs(energyErr);
    this.velError = ecc;

    // Check Arrival (Stabilized on orbit)
    // Tolerance: SMA within 2km, Eccentricity < 0.01
    if (this.posError < 2000 && this.velError < 0.01) {
      this.state = AP_STATE.HOLD;
    }

    // Safety: if we run out of fuel
    if (ship.fuel <= 0) {
      this.state = AP_STATE.OFF;
      ship.throttle = 0;
    }
  }

  /**
   * Propagate costates using the gravity gradient tensor.
   * Keeps guidance optimal between full BVP re-solve cycles.
   */
  _propagateCostates(ship, dt, simTime) {
    const x = ship.position.x, y = ship.position.y;
    let lrx = this.costates[0], lry = this.costates[1];
    let lvx = this.costates[2], lvy = this.costates[3];

    // Compute Gravity Gradient Tensor at ship position
    let jxx = 0, jxy = 0, jyy = 0;

    for (const body of this.system.gravBodies) {
      const bPos = this.system.getPosition(body, simTime);
      const dx = x - bPos.x;
      const dy = y - bPos.y;
      const r2 = dx * dx + dy * dy + SOFTENING_SI;
      const r = Math.sqrt(r2);
      const r3 = r2 * r;
      const r5 = r3 * r2;
      const mu = G_SI * body.mass;

      jxx += -mu * (1.0 / r3 - 3 * dx * dx / r5);
      jyy += -mu * (1.0 / r3 - 3 * dy * dy / r5);
      jxy += -mu * (0 - 3 * dx * dy / r5);
    }

    // Costate Derivatives
    // dlr = -(J * lv)
    // dlv = -lr
    const dlrx = -(jxx * lvx + jxy * lvy);
    const dlry = -(jxy * lvx + jyy * lvy);
    const dlvx = -lrx;
    const dlvy = -lry;

    // Euler step (sufficient for guidance between BVP solves)
    this.costates[0] += dlrx * dt;
    this.costates[1] += dlry * dt;
    this.costates[2] += dlvx * dt;
    this.costates[3] += dlvy * dt;
  }

  /**
   * Calculate dynamic handoff thresholds as per Design Guide.
   */
  _getDynamicHandoffThresholds(simTime) {
    const G = 6.674e-11;
    const target = this.targetBody;

    // 1. Parking Orbit Radius (R_orbit)
    const rOrbit = (target.radius || 1000) * 2.0;

    // 2. Sphere of Influence (R_SOI)
    let rSOI = Infinity;
    if (target.orbit) {
      let parentMass = this.system.solara.mass;
      if (target.orbit.parent) {
        // Find body owning the parent orbit
        const parentBody = this.system.allBodies.find(b => b.orbit === target.orbit.parent);
        if (parentBody) parentMass = parentBody.mass;
      }
      rSOI = target.orbit.a * Math.pow(target.mass / parentMass, 0.4);
    }

    // 3. Orbital Period (T_orbit)
    // T = 2π * sqrt(r^3 / μ)
    const mu = G * target.mass;
    const tOrbit = 2 * Math.PI * Math.sqrt(Math.pow(rOrbit, 3) / (mu || 1e-10));

    // Thresholds:
    // Distance Metric: min(0.25 * SOI, 10 * R_orbit)
    const rHandoff = Math.min(0.25 * rSOI, 10 * rOrbit);

    // Time Metric: max(0.5 * T_orbit, 0.05 * t_total)
    const tHandoff = Math.max(0.5 * tOrbit, 0.05 * this.flightTime);

    return { rHandoff, tHandoff };
  }
}
