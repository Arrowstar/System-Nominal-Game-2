import { rk4, solveLinearSystem } from '../physics/MathUtils.js';
import { Vec2 } from '../core/Vec2.js';
import { CanonicalUnits } from './CanonicalUnits.js';

const G_SI = 6.674e-11;
const G0 = 9.80665;
const SOFTENING_SI = 1e6; // Softening parameter (m^2)
const STEPS = 40; // Resolution for integration

/**
 * Two-Point Boundary Value Problem Solver for continuous thrust trajectories.
 * Uses Indirect Method (Shooting Method) with Newton-Raphson iteration.
 */
export class TPBVPSolver {
    /**
     * @param {SolarSystem} system  Reference to the solar system for N-body gravity.
     */
    constructor(system) {
        this.system = system;
    }

    /**
     * Precompute positions of all gravity bodies for the duration of the flight.
     * RK4 requires positions at t, t + 0.5dt, and t + dt.
     */
    precomputeTrajectories(tStart, tEnd, units) {
        const flightTime = tEnd - tStart;
        const dt = flightTime / STEPS;
        const halfDt = dt / 2;
        
        const cache = [];
        const numPoints = STEPS * 2 + 1;
        
        for (let i = 0; i < numPoints; i++) {
            const t_canonical = tStart + i * halfDt;
            const t_physical = units.fromTime(t_canonical);
            const stepBodies = [];
            for (const body of this.system.gravBodies) {
                const pos = body.getPosition(t_physical);
                stepBodies.push({
                    x: units.toPos(pos.x),
                    y: units.toPos(pos.y),
                    mu: units.toMu(G_SI * body.mass)
                });
            }
            cache.push(stepBodies);
        }
        return cache;
    }

    /**
     * Solve for the optimal initial costates to reach the target.
     * 
     * @param {Ship} ship           The ship object (position, velocity, mass, thrust, isp).
     * @param {object} targetBody   The target celestial body.
     * @param {number} tStart       Current simulation time (seconds).
     * @param {number} tArrival     Desired arrival time (seconds).
     * @param {number[]} guess      (Optional) Initial guess for costates [lrx, lry, lvx, lvy] (SI units).
     * @returns {object}            { costates: number[], error: number, converged: boolean, path: object[] } (SI units)
     */
    solve(ship, targetBody, tStart, tArrival, guess = null) {
        const flightTime_SI = tArrival - tStart;
        if (flightTime_SI <= 0) return { costates: [0,0,0,0], error: 0, converged: false, path: [] };

        // 1. Initialize Canonical Units
        // Use 1 AU or current distance as DU.
        const AU = 1.496e11;
        const targetPosStart = this.getBodyPos(targetBody, tStart);
        const startDist = ship.position.dist(targetPosStart);
        const DU = Math.max(AU * 0.1, startDist); // Avoid tiny DU if docked
        
        // Primary mu (Sun)
        const mu_primary = G_SI * (this.system.solara ? this.system.solara.mass : 1.989e30);
        const units = new CanonicalUnits(DU, mu_primary);

        // 2. Normalize Inputs
        const tStart_c = units.toTime(tStart);
        const tArrival_c = units.toTime(tArrival);
        const flightTime_c = tArrival_c - tStart_c;

        const state0_c = [
            units.toPos(ship.position.x), units.toPos(ship.position.y),
            units.toVel(ship.velocity.x), units.toVel(ship.velocity.y),
            ship.totalMass // Mass stays physical (kg)
        ];

        const targetPos_arrival_SI = this.getBodyPos(targetBody, tArrival);
        const targetVel_arrival_SI = this.getBodyVel(targetBody, tArrival);
        const targetState_c = [
            units.toPos(targetPos_arrival_SI.x), units.toPos(targetPos_arrival_SI.y),
            units.toVel(targetVel_arrival_SI.x), units.toVel(targetVel_arrival_SI.y)
        ];

        // Kinematic guess in canonical units
        let currentCostates_c = guess ? units.toCostates(guess) : this.getKinematicGuess(state0_c, targetState_c, flightTime_c);
        
        // Precompute gravity field in canonical units
        const bodyCache = this.precomputeTrajectories(tStart_c, tArrival_c, units);

        // Newton-Raphson Loop
        let errMag_c = Infinity;
        const tolerance_c = units.toPos(10000); // 10 km expressed in DU
        const maxIters = guess ? 5 : 15;
        const epsilon_c = 1e-4;   // Dim-less perturbation
        
        let path_c = [];
        let finalState_c = state0_c;

        const maxThrust_SI = ship.thrust;
        const acc_c = units.toAcc(maxThrust_SI / ship.totalMass);
        const isp_SI = ship.isp;

        for (let iter = 0; iter < maxIters; iter++) {
            // 1. Integrate nominal trajectory
            const res = this.integrate(state0_c, currentCostates_c, tStart_c, tArrival_c, maxThrust_SI, isp_SI, units, bodyCache);
            finalState_c = res.finalState;
            path_c = res.history;

            // Error Vector: [rx_err, ry_err, vx_err, vy_err] (canonical)
            const errorVec_c = [
                finalState_c[0] - targetState_c[0],
                finalState_c[1] - targetState_c[1],
                finalState_c[2] - targetState_c[2],
                finalState_c[3] - targetState_c[3]
            ];

            errMag_c = Math.sqrt(errorVec_c.reduce((s, e) => s + e*e, 0));
            if (errMag_c < tolerance_c) break;

            // 2. Build Jacobian using Finite Differences
            const J = [];
            for (let j = 0; j < 4; j++) {
                const pertCostates_c = [...currentCostates_c];
                pertCostates_c[j] += epsilon_c;
                
                const { finalState: pertState_c } = this.integrate(state0_c, pertCostates_c, tStart_c, tArrival_c, maxThrust_SI, isp_SI, units, bodyCache);
                
                const pertError_c = [
                    pertState_c[0] - targetState_c[0],
                    pertState_c[1] - targetState_c[1],
                    pertState_c[2] - targetState_c[2],
                    pertState_c[3] - targetState_c[3]
                ];
                
                J.push(pertError_c.map((pe, k) => (pe - errorVec_c[k]) / epsilon_c));
            }

            const J_T = [[],[],[],[]]; 
            for(let r=0; r<4; r++) for(let c=0; c<4; c++) J_T[r][c] = J[c][r];

            try {
                const delta = solveLinearSystem(J_T, errorVec_c);
                if (delta.some(d => isNaN(d))) break;

                const alpha = 0.8; 
                for (let j = 0; j < 4; j++) {
                    currentCostates_c[j] -= alpha * delta[j];
                }
            } catch (e) {
                break;
            }
        }

        // 3. Convert results back to SI
        return { 
            costates: units.fromCostates(currentCostates_c), 
            error: units.fromPos(errMag_c), 
            converged: errMag_c < tolerance_c, 
            path: path_c.map(p => ({
                t: units.fromTime(p.t),
                pos: new Vec2(units.fromPos(p.pos.x), units.fromPos(p.pos.y)),
                vel: new Vec2(units.fromVel(p.vel.x), units.fromVel(p.vel.y)),
                apState: 'OPTIMAL'
            })),
            fuelCost: state0_c[4] - finalState_c[4]
        };
    }

    integrate(state0_c, costates0_c, tStart_c, tEnd_c, maxThrust_SI, isp_SI, units, bodyCache) {
        const flightTime_c = tEnd_c - tStart_c;
        const dt_c = flightTime_c / STEPS;
        
        let currentState_c = [...state0_c, ...costates0_c]; 
        let t_c = tStart_c;
        const history = [];

        // Pre-calculate constants for derivative function
        const softening_c = units.toPos(units.toPos(SOFTENING_SI)); // softening is r^2 => DU^2
        
        const derivFn = (time_c, s_c) => this.computeDerivatives(time_c, s_c, maxThrust_SI, isp_SI, units, softening_c, bodyCache, tStart_c, dt_c);

        for (let i = 0; i < STEPS; i++) {
            history.push({ 
                t: t_c, 
                pos: new Vec2(currentState_c[0], currentState_c[1]), 
                vel: new Vec2(currentState_c[2], currentState_c[3])
            });
            currentState_c = rk4(t_c, currentState_c, dt_c, derivFn);
            t_c += dt_c;
        }

        return { finalState: currentState_c, history };
    }

    computeDerivatives(t_c, state_c, maxThrust_SI, isp_SI, units, softening_c, bodyCache, tStart_c, dt_c) {
        const x = state_c[0], y = state_c[1];
        const vx = state_c[2], vy = state_c[3];
        const m = state_c[4];
        const lrx = state_c[5], lry = state_c[6];
        const lvx = state_c[7], lvy = state_c[8];

        // 1. Control Law (Primer Vector) - Already in AccU
        let ax = -lvx;
        let ay = -lvy;
        const cmdAccelMag_c = Math.sqrt(ax*ax + ay*ay);
        
        const maxAccel_SI = (m > 0) ? maxThrust_SI / m : 0;
        const maxAccel_c = units.toAcc(maxAccel_SI);

        let appliedAccel_c = cmdAccelMag_c;
        if (cmdAccelMag_c > maxAccel_c) {
            const scale = maxAccel_c / cmdAccelMag_c;
            ax *= scale;
            ay *= scale;
            appliedAccel_c = maxAccel_c;
        }

        let thrustForce_SI = 0;
        if (cmdAccelMag_c > maxAccel_c) thrustForce_SI = maxThrust_SI;
        else thrustForce_SI = m * units.fromAcc(cmdAccelMag_c);
        
        const dm = -thrustForce_SI / (isp_SI * G0); // Fuel mass rate remains physical

        // 2. Gravity & Gradient
        let gx = 0, gy = 0;
        let jxx = 0, jxy = 0, jyy = 0; 

        let idx = Math.round((t_c - tStart_c) / (dt_c * 0.5));
        if (idx < 0) idx = 0;
        if (idx >= bodyCache.length) idx = bodyCache.length - 1;

        const bodies = bodyCache[idx];

        for (const body of bodies) {
            const bx = body.x;
            const by = body.y;
            const mu_c = body.mu; // G*M in canonical units

            const dx = x - bx;
            const dy = y - by;
            const r2 = dx*dx + dy*dy + softening_c;
            const r = Math.sqrt(r2);
            const r3 = r2 * r;    
            const r5 = r3 * r2;   

            // Gravity force
            const gravMag = -mu_c / r3;
            gx += gravMag * dx;
            gy += gravMag * dy;

            // Gravity Gradient Tensor
            jxx += -mu_c * (1.0/r3 - 3*dx*dx/r5);
            jyy += -mu_c * (1.0/r3 - 3*dy*dy/r5);
            jxy += -mu_c * (     0 - 3*dx*dy/r5);
        }

        // 3. Costate Derivatives
        const dlrx = -(jxx * lvx + jxy * lvy);
        const dlry = -(jxy * lvx + jyy * lvy); 
        const dlvx = -lrx;
        const dlvy = -lry;

        return [
            vx, vy,         
            gx + ax, gy + ay, 
            dm,             
            dlrx, dlry,     
            dlvx, dlvy      
        ];
    }

    getKinematicGuess(state0_c, targetState_c, T_c) {
        if (T_c <= 0) return [0,0,0,0];

        const r0 = [state0_c[0], state0_c[1]];
        const v0 = [state0_c[2], state0_c[3]];
        const rf = [targetState_c[0], targetState_c[1]];
        const vf = [targetState_c[2], targetState_c[3]];

        const dr = [rf[0] - r0[0], rf[1] - r0[1]];
        const dv = [vf[0] - v0[0], vf[1] - v0[1]];

        const c1x = (12 / Math.pow(T_c, 3)) * (dv[0]*T_c/2 - dr[0] + v0[0]*T_c);
        const c1y = (12 / Math.pow(T_c, 3)) * (dv[1]*T_c/2 - dr[1] + v0[1]*T_c);

        const c0x = dv[0]/T_c - c1x*T_c/2;
        const c0y = dv[1]/T_c - c1y*T_c/2;
        
        return [c1x, c1y, -c0x, -c0y];
    }

    // Helpers
    getBodyPos(body, t) {
        if (this.system.getPosition) return this.system.getPosition(body, t);
        if (body.getPosition) return body.getPosition(t);
        if (body.orbit) return body.orbit.getPosition(t);
        return body.position || new Vec2(0,0);
    }
    getBodyVel(body, t) {
        if (this.system.getVelocity) return this.system.getVelocity(body, t);
        if (body.getVelocity) return body.getVelocity(t);
        if (body.orbit) return body.orbit.getVelocity(t);
        return body.velocity || new Vec2(0,0);
    }
}
