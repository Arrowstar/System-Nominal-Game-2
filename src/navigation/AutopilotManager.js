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

export const AP_STATE = {
  OFF:      'OFF',
  STANDBY:  'STANDBY', // Calculated but waiting
  OPTIMAL:  'OPTIMAL', // TPBVP Guidance active
  TERMINAL: 'TERMINAL', // PD Controller active
  HOLD:     'HOLD'     // Arrived
};

const GUIDANCE_INTERVAL = 0.5; // Seconds (sim time) between solver updates
const TERMINAL_HANDOFF_TIME = 86400 * 2.0; // 2 days out, switch to PD (unless close)
// Dynamic handoff: max(2 days, 100 * dt_phys)
const TERMINAL_DIST_THRESHOLD = 0.05 * 1.496e11; // 0.05 AU

export class AutopilotManager {
  constructor(solarSystem) {
    this.system = solarSystem;
    this.solver = new TPBVPSolver(solarSystem);
    
    this.state = AP_STATE.OFF;
    this.targetBody = null;
    
    // Flight Parameters
    this.tArrival = 0; // Desired arrival time (sim time)
    this.flightTime = 0; // Total duration
    
    // Solver State
    this.costates = [0, 0, 0, 0]; // [lrx, lry, lvx, lvy]
    this.path = []; // Predicted trajectory for visualization
    this.lastSolveTime = 0;
    
    // Public props for UI
    this.interceptPt = null;
    this.targetAimPt = null; // For debug drawing
    this.eta = 0;
    this.dvRemaining = 0;
    this.error = 0; // BVP error
  }

  get active() { return this.state !== AP_STATE.OFF && this.state !== AP_STATE.HOLD; }

  /**
   * Engage autopilot toward a target.
   * @param {object} body         Target body
   * @param {number} flightTime   (Optional) Flight time in seconds. If null, heuristic used.
   */
  engage(body, flightTime = null) {
    this.targetBody = body;
    this.state = AP_STATE.STANDBY;
    
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
            flightTime = Math.max(30, distAU * 40) * 86400; // 40 days per AU, min 30 days
        } else {
            flightTime = 90 * 86400;
        }
    }
    this.flightTime = flightTime;
    
    // Calculate initial guess immediately
    this._initializeTrajectory();
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

  _initializeTrajectory() {
    if (typeof window === 'undefined') return;
    const ship = window.playerShip;
    const loop = window.solarSystem ? window.solarSystem.gameLoop : { simTime: 0 }; // Hacky access to simTime if not passed
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
        // Run cold start
        const res = this.solver.solve(ship, this.targetBody, simTime, this.tArrival);
        this.costates = res.costates;
        this.path = res.path;
        this.error = res.error;
        this.lastSolveTime = simTime;
        this._needsInit = false;
    }

    if (this.state === AP_STATE.OPTIMAL) {
        this._updateOptimal(ship, dt, simTime, timeWarp);
    } else if (this.state === AP_STATE.TERMINAL) {
        this._updateTerminal(ship, dt, simTime, timeWarp);
    } else if (this.state === AP_STATE.HOLD) {
        ship.throttle = 0;
        ship.usePrecisionIntegration = false;
    }

    // Telemetry updates
    this.eta = Math.max(0, this.tArrival - simTime);
    this.interceptPt = this.system.getPosition(this.targetBody, this.tArrival);
    
    // Approx dv remaining: current acceleration * eta? 
    // Or just rel speed.
    const tVel = this.targetBody.orbit ? this.targetBody.orbit.getVelocity(simTime) : Vec2.zero();
    const relVel = ship.velocity.sub(tVel);
    this.dvRemaining = relVel.len(); // Rough proxy
  }

  _updateOptimal(ship, dt, simTime, timeWarp) {
    const tGo = this.tArrival - simTime;
    
    // 1. Guidance Update (MPC)
    if (simTime - this.lastSolveTime > GUIDANCE_INTERVAL) {
        // Warm start solver
        const res = this.solver.solve(ship, this.targetBody, simTime, this.tArrival, this.costates);
        if (res.converged || res.error < this.error * 1.5) { // Accept if converged or not wildly worse
            this.costates = res.costates;
            this.path = res.path;
            this.error = res.error;
        }
        this.lastSolveTime = simTime;
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
    
    this.targetAimPt = ship.position.add(cmdAccel.scale(1e6)); // Visual debug

    // 3. Terminal Handoff Check
    const dist = ship.position.dist(this.system.getPosition(this.targetBody, simTime));
    
    // Switch conditions:
    // - Time to go is small
    // - OR Distance is very close (captured in gravity well)
    // - AND velocity is somewhat matched? (Implicit in BVP)
    
    if (tGo < TERMINAL_HANDOFF_TIME || dist < TERMINAL_DIST_THRESHOLD) {
        // Switch to PD
        this.state = AP_STATE.TERMINAL;
        // Drop high-precision integration to save CPU? 
        // No, terminal phase needs it even more for stability!
        // Actually, PD controller works fine with Symplectic Euler usually,
        // but let's keep precision if we are handling tight orbits.
    }
    
    // Time Warp Safety
    if (timeWarp && timeWarp.factor > 1) {
        // If error is high or transition imminent, drop warp
        if (tGo < 20 * timeWarp.factor) timeWarp.cancel(); // 20s warning
    }
  }

  _updateTerminal(ship, dt, simTime, timeWarp) {
    // Critically Damped PD Controller
    // F = -Kp * err - Kd * v_err
    
    const Kp = 5.0; // Lower gains for game scale? 
    // Design doc suggested 10000. That's for AU scale units?
    // Ship mass is kg. Pos is meters.
    // Force is Newtons.
    // err is meters.
    // If err = 1000m. F = 5000N.
    // Ship mass ~ 100,000kg. Accel = 0.05 m/s^2. Too weak.
    
    // Tuning:
    // Natural frequency w_n.
    // Kp = m * w_n^2
    // Kd = m * 2 * zeta * w_n  (zeta = 1 for critical damping)
    
    // Let's pick w_n = 0.5 rad/s (2 second response time)
    const w_n = 0.5;
    const m = ship.totalMass;
    const kp_val = m * w_n * w_n;
    const kd_val = m * 2 * 1.0 * w_n;
    
    // Target state: Position of body (plus offset for parking orbit?)
    // Let's aim for a parking orbit radius.
    // Vector from body to ship
    const bPos = this.system.getPosition(this.targetBody, simTime);
    const bVel = this.targetBody.orbit ? this.targetBody.orbit.getVelocity(simTime) : Vec2.zero();
    
    const relPos = ship.position.sub(bPos);
    const dist = relPos.len();
    
    // Desired position: If we are far, aim for body center.
    // If we are close, aim for orbital insertion.
    // "Game Implementation Guide": "Disable Optimal BVP... Engage Critically Damped Terminal PD"
    // Does it aim for center? Or parking orbit?
    // "Snap the spacecraft into the final parking orbit"
    // Simple approach: Aim for a point at parking radius on the line connecting ship and body.
    // Actually, to orbit, we need tangential velocity.
    // PD controller just targets a STATE (pos, vel).
    // What state?
    // For now, let's target specific relative state: r = parking_radius, v = orbital_velocity.
    // Which parking orbit?
    // Let's project current position to nearest point on parking orbit.
    
    const parkingRadius = (this.targetBody.radius || 1000) * 2.0;
    const targetDir = relPos.norm(); // Unit vector from body to ship
    
    // Target Pos = BodyPos + targetDir * parkingRadius
    const cmdPos = bPos.add(targetDir.scale(parkingRadius));
    
    // Target Vel = BodyVel + Tangential Velocity
    // We want a circular orbit.
    // Tangent direction?
    // Current velocity projection?
    // Let's define tangent as: rotate targetDir by 90 degrees.
    // Which way? Prograde relative to current velocity.
    
    // Ship rel vel
    const shipRelVel = ship.velocity.sub(bVel);
    const h = relPos.cross(shipRelVel); // Angular momentum
    const rotDir = h >= 0 ? 1 : -1; // Counter-clockwise if h>0
    
    const tanDir = new Vec2(-targetDir.y * rotDir, targetDir.x * rotDir);
    const orbSpeed = Math.sqrt(6.674e-11 * this.targetBody.mass / parkingRadius);
    const cmdVel = bVel.add(tanDir.scale(orbSpeed));
    
    // Error terms
    const errPos = ship.position.sub(cmdPos);
    const errVel = ship.velocity.sub(cmdVel);
    
    // Control Force
    // F_cmd = -Kp * errPos - Kd * errVel
    const Fx = -kp_val * errPos.x - kd_val * errVel.x;
    const Fy = -kp_val * errPos.y - kd_val * errVel.y;
    
    const F_cmd = new Vec2(Fx, Fy);
    const F_mag = F_cmd.len();
    
    // Application
    if (F_mag > 1e-6) {
        ship.heading = F_cmd.angle();
        ship.throttle = Math.min(1.0, F_mag / ship.thrust);
    } else {
        ship.throttle = 0;
    }
    
    // Check Arrival
    if (errPos.len() < 1000 && errVel.len() < 10) {
        this.state = AP_STATE.HOLD;
    }
    
    // Safety: if we run out of fuel or deviate too much
    if (ship.fuel <= 0) {
        this.state = AP_STATE.OFF;
        ship.throttle = 0;
    }
  }
}
