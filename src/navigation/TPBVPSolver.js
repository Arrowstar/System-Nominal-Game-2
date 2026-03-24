import { rk4, solveLinearSystem } from '../physics/MathUtils.js';
import { Vec2 } from '../core/Vec2.js';

const G = 6.674e-11;
const G0 = 9.80665;
const SOFTENING = 1e6; // Softening parameter to avoid singularities (m^2)

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
     * Solve for the optimal initial costates to reach the target.
     * 
     * @param {Ship} ship           The ship object (position, velocity, mass, thrust, isp).
     * @param {object} targetBody   The target celestial body.
     * @param {number} tStart       Current simulation time.
     * @param {number} tArrival     Desired arrival time.
     * @param {number[]} guess      (Optional) Initial guess for costates [lrx, lry, lvx, lvy].
     * @returns {object}            { costates: number[], error: number, converged: boolean, path: object[] }
     */
    solve(ship, targetBody, tStart, tArrival, guess = null) {
        const flightTime = tArrival - tStart;
        if (flightTime <= 0) return { costates: [0,0,0,0], error: 0, converged: false, path: [] };

        // Initial State: [x, y, vx, vy, m]
        const state0 = [
            ship.position.x, ship.position.y,
            ship.velocity.x, ship.velocity.y,
            ship.totalMass
        ];

        // Kinematic guess if no warm-start provided
        let currentCostates = guess || this.getKinematicGuess(state0, targetBody, tStart, tArrival);
        
        // Newton-Raphson Loop
        let errMag = Infinity;
        const tolerance = 10000; // 10 km tolerance (in meters) - scaled for space distances
        const maxIters = 15;     // Keep low for real-time performance
        const epsilon = 1e-4;   // Finite difference perturbation
        
        // Target State (position and velocity)
        // Note: For simple intercept, we match position. For orbit injection, we might match velocity too.
        // The current design target is "match position and velocity" (Rendezvous).
        // For "Orbit Injection", the autopilot manager handles the final approach, but the solver
        // should ideally get us to the target with 0 relative velocity (Rendezvous) 
        // OR we can target a specific offset.
        // For now, let's target Rendezvous (pos == target, vel == target).
        
        let path = [];

        for (let iter = 0; iter < maxIters; iter++) {
            // 1. Integrate nominal trajectory
            const { finalState, history } = this.integrate(state0, currentCostates, tStart, tArrival, ship);
            path = history;

            const targetPos = this.getBodyPos(targetBody, tArrival);
            const targetVel = this.getBodyVel(targetBody, tArrival);

            // Error Vector: [rx_err, ry_err, vx_err, vy_err]
            const errorVec = [
                finalState[0] - targetPos.x,
                finalState[1] - targetPos.y,
                finalState[2] - targetVel.x,
                finalState[3] - targetVel.y
            ];

            errMag = Math.sqrt(errorVec.reduce((s, e) => s + e*e, 0));
            if (errMag < tolerance) {
                return { costates: currentCostates, error: errMag, converged: true, path };
            }

            // 2. Build Jacobian using Finite Differences
            const J = []; // Columns of Jacobian
            for (let j = 0; j < 4; j++) {
                const pertCostates = [...currentCostates];
                pertCostates[j] += epsilon;
                
                const { finalState: pertState } = this.integrate(state0, pertCostates, tStart, tArrival, ship);
                
                const pertError = [
                    pertState[0] - targetPos.x,
                    pertState[1] - targetPos.y,
                    pertState[2] - targetVel.x,
                    pertState[3] - targetVel.y
                ];
                
                // Column j is (pertError - errorVec) / epsilon
                J.push(pertError.map((pe, k) => (pe - errorVec[k]) / epsilon));
            }

            // J is currently 4 columns (array of arrays). solveLinearSystem expects rows.
            // Transpose J to get J_matrix (rows)
            const J_T = [[],[],[],[]]; // 4 rows
            for(let r=0; r<4; r++) for(let c=0; c<4; c++) J_T[r][c] = J[c][r];

            // 3. Solve J * delta = errorVec
            try {
                const delta = solveLinearSystem(J_T, errorVec);
                
                // 4. Update costates (damped)
                const alpha = 0.8; 
                for (let j = 0; j < 4; j++) {
                    currentCostates[j] -= alpha * delta[j];
                }
            } catch (e) {
                // Matrix likely singular (e.g. if time is too short or guess is terrible)
                console.warn("TPBVP Jacobian singular", e);
                break;
            }
        }

        return { costates: currentCostates, error: errMag, converged: errMag < tolerance, path };
    }

    /**
     * Integrate trajectory forward.
     * @returns {object} { finalState: number[], history: object[] }
     */
    integrate(state0, costates0, tStart, tEnd, ship) {
        const flightTime = tEnd - tStart;
        const steps = 40; // Resolution for integration
        const dt = flightTime / steps;
        
        let currentState = [...state0, ...costates0]; // [x, y, vx, vy, m, lrx, lry, lvx, lvy]
        let t = tStart;
        const history = [];

        // Pre-calculate constants for derivative function to avoid closures
        const maxThrust = ship.thrust;
        const isp = ship.isp;
        
        // Define derivative function for RK4
        const derivFn = (time, s) => this.computeDerivatives(time, s, maxThrust, isp);

        for (let i = 0; i < steps; i++) {
            history.push({ 
                t: t, 
                pos: new Vec2(currentState[0], currentState[1]), 
                vel: new Vec2(currentState[2], currentState[3]),
                apState: 'OPTIMAL' // For renderer
            });
            currentState = rk4(t, currentState, dt, derivFn);
            t += dt;
        }

        return { finalState: currentState, history };
    }

    /**
     * Compute state derivatives [dx, dy, dvx, dvy, dm, dlrx, dlry, dlvx, dlvy]
     */
    computeDerivatives(t, state, maxThrust, isp) {
        const x = state[0], y = state[1];
        const vx = state[2], vy = state[3];
        const m = state[4];
        const lrx = state[5], lry = state[6];
        const lvx = state[7], lvy = state[8];

        // 1. Control Law (Primer Vector)
        // Optimal acceleration a_opt = -lambda_v
        // Clamped by physical limits: |a| <= F_max / m
        let ax = -lvx;
        let ay = -lvy;
        const cmdAccelMag = Math.sqrt(ax*ax + ay*ay);
        const maxAccel = (m > 0) ? maxThrust / m : 0;

        let appliedAccel = cmdAccelMag;
        if (cmdAccelMag > maxAccel) {
            const scale = maxAccel / cmdAccelMag;
            ax *= scale;
            ay *= scale;
            appliedAccel = maxAccel;
        }

        // Mass flow rate: m_dot = -|F| / (Isp * g0)
        // If we are coasting (cmdAccel very small), m_dot is small.
        // If we are clamped, |F| is maxThrust.
        // If we are unclamped, |F| = m * cmdAccelMag.
        let thrustForce = 0;
        if (cmdAccelMag > maxAccel) thrustForce = maxThrust;
        else thrustForce = m * cmdAccelMag;
        
        const dm = -thrustForce / (isp * G0);

        // 2. Gravity & Gradient
        let gx = 0, gy = 0;
        let jxx = 0, jxy = 0, jyy = 0; // Components of gravity gradient tensor

        // Iterate bodies
        // Note: system.gravBodies contains "Solara", "Vane", "Icarus" etc.
        for (const body of this.system.gravBodies) {
            // Get body position (assumed pre-calculated or cheap)
            // Ideally we'd optimize this to not re-calc every sub-step if orbit is slow
            let bx, by, bMass;
            
            if (body.orbit) {
                const pos = body.orbit.getPosition(t);
                bx = pos.x; by = pos.y;
                bMass = body.mass;
            } else {
                // Star or static body
                bx = body.position.x; by = body.position.y;
                bMass = body.mass;
            }

            const dx = x - bx;
            const dy = y - by;
            const r2 = dx*dx + dy*dy + SOFTENING;
            const r = Math.sqrt(r2);
            const r3 = r2 * r;     // r^3
            const r5 = r3 * r2;    // r^5
            const mu = G * bMass;

            // Gravity force
            const gravMag = -mu / r3;
            gx += gravMag * dx;
            gy += gravMag * dy;

            // Gravity Gradient Tensor (Partial derivatives of g with respect to r)
            // J = -mu/r^3 * (I - 3*r*r^T / r^2)
            // Jxx = -mu * (1/r^3 - 3*dx*dx/r^5)
            // Jxy = -mu * (0     - 3*dx*dy/r^5)
            
            jxx += -mu * (1.0/r3 - 3*dx*dx/r5);
            jyy += -mu * (1.0/r3 - 3*dy*dy/r5);
            jxy += -mu * (     0 - 3*dx*dy/r5);
        }

        // 3. Costate Derivatives
        // lambda_r_dot = -dH/dr = - (dg/dr)^T * lambda_v
        // lambda_v_dot = -dH/dv = - lambda_r
        
        const dlrx = -(jxx * lvx + jxy * lvy);
        const dlry = -(jxy * lvx + jyy * lvy); // jyx = jxy
        const dlvx = -lrx;
        const dlvy = -lry;

        return [
            vx, vy,         // dx, dy
            gx + ax, gy + ay, // dvx, dvy
            dm,             // dm
            dlrx, dlry,     // dlrx, dlry
            dlvx, dlvy      // dlvx, dlvy
        ];
    }

    /**
     * Analytical solution for constant jerk trajectory (ignoring gravity)
     * Used to initialize the costates.
     */
    getKinematicGuess(state0, targetBody, tStart, tArrival) {
        const T = tArrival - tStart;
        if (T <= 0) return [0,0,0,0];

        const targetPos = this.getBodyPos(targetBody, tArrival);
        const targetVel = this.getBodyVel(targetBody, tArrival);

        const r0 = [state0[0], state0[1]];
        const v0 = [state0[2], state0[3]];
        const rf = [targetPos.x, targetPos.y];
        const vf = [targetVel.x, targetVel.y];

        const dr = [rf[0] - r0[0], rf[1] - r0[1]];
        const dv = [vf[0] - v0[0], vf[1] - v0[1]];

        // Constant jerk coefficients (c0, c1)
        // a(t) = c0 + c1*t
        // See "Torch Drive System Architecture.txt" Section 5
        
        // c1 = 12/T^3 * (dv*T/2 - dr + v0*T)
        // c0 = dv/T - c1*T/2
        
        const c1x = (12 / Math.pow(T, 3)) * (dv[0]*T/2 - dr[0] + v0[0]*T);
        const c1y = (12 / Math.pow(T, 3)) * (dv[1]*T/2 - dr[1] + v0[1]*T);

        const c0x = dv[0]/T - c1x*T/2;
        const c0y = dv[1]/T - c1y*T/2;

        // Initial costates: 
        // lambda_v0 = -c0
        // lambda_r0 = c1
        
        return [c1x, c1y, -c0x, -c0y];
    }

    // Helpers
    getBodyPos(body, t) {
        if (body.orbit) return body.orbit.getPosition(t);
        return body.position;
    }
    getBodyVel(body, t) {
        if (body.orbit) return body.orbit.getVelocity(t);
        return body.velocity || new Vec2(0,0);
    }
}
