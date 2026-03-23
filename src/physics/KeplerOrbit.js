/**
 * KeplerOrbit.js — On-rails analytical Keplerian orbit solver.
 *
 * Planets and moons have their positions computed analytically from orbital
 * elements at any time t. No numerical integration is needed, so advancing
 * time is O(1) regardless of how large t is — making time-warp essentially free.
 *
 * Coordinate system: 2D (x, y) in the orbital plane. All bodies orbit in the
 * same ecliptic plane (the design doc doesn't call for inclination).
 *
 * Orbital elements:
 *   a  — semi-major axis (simulation units, AU-scale)
 *   e  — eccentricity [0, 1)
 *   w  — argument of periapsis (radians), rotates the orbit in the plane
 *   M0 — mean anomaly at t=0 (radians), sets the body's position at epoch
 *   n  — mean motion (rad/s) = 2π / period
 *
 * Algorithm:
 *   1. M(t) = M0 + n*t          (mean anomaly at time t)
 *   2. Solve Kepler's equation   M = E - e*sin(E)  for E via Newton-Raphson
 *   3. True anomaly:             ν = 2*atan2(√(1+e)*sin(E/2), √(1-e)*cos(E/2))
 *   4. Radius:                   r = a*(1 - e*cos(E))
 *   5. Position (perifocal):     p = r*(cos(ν+w), sin(ν+w))
 */

import { Vec2 } from '../core/Vec2.js';

/** G in simulation units. We define GM directly per body for simplicity. */
export const G = 6.674e-11;  // m³ kg⁻¹ s⁻² (real SI, scaled with sim units)

/**
 * Maximum Newton-Raphson iterations for Kepler's equation.
 * Typically converges in 3-5 steps for e < 0.9.
 */
const MAX_KEPLER_ITER  = 50;
const KEPLER_TOL       = 1e-10;

/**
 * Solve Kepler's equation M = E - e*sin(E) for eccentric anomaly E.
 * @param {number} M  Mean anomaly (radians, any range)
 * @param {number} e  Eccentricity [0, 1)
 * @returns {number}  Eccentric anomaly E (radians)
 */
export function solveKepler(M, e) {
  // Normalise M to [-π, π] for better starting guess
  M = M % (2 * Math.PI);
  if (M > Math.PI)  M -= 2 * Math.PI;
  if (M < -Math.PI) M += 2 * Math.PI;

  // Initial guess: Danby (1988) — good for all eccentricities < 1
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));

  for (let i = 0; i < MAX_KEPLER_ITER; i++) {
    const f  =  E - e * Math.sin(E) - M;
    const fp =  1 - e * Math.cos(E);   // first derivative
    const dE = -f / fp;
    E += dE;
    if (Math.abs(dE) < KEPLER_TOL) break;
  }
  return E;
}

export class KeplerOrbit {
  /**
   * @param {object} opts
   * @param {number} opts.a   Semi-major axis (sim units)
   * @param {number} opts.e   Eccentricity (0 = circular)
   * @param {number} opts.w   Argument of periapsis (radians)
   * @param {number} opts.M0  Mean anomaly at t=0 (radians)
   * @param {number} opts.period  Orbital period (seconds)
   * @param {KeplerOrbit|null} opts.parent  Parent orbit (for moons)
   */
  constructor({ a, e = 0, w = 0, M0 = 0, period, parent = null }) {
    this.a      = a;
    this.e      = e;
    this.w      = w;
    this.M0     = M0;
    this.n      = (2 * Math.PI) / period;   // mean motion (rad/s)
    this.period = period;
    this.parent = parent;   // if non-null, positions are relative to parent
  }

  /**
   * Get the world-space position of this body at simulation time t (seconds).
   * If a parent orbit is set, the result is parent.getPosition(t) + localPos.
   * @param {number} t  Simulation time in seconds
   * @returns {Vec2}    World-space position
   */
  getPosition(t) {
    const M = this.M0 + this.n * t;
    const E = solveKepler(M, this.e);
    const nu = 2 * Math.atan2(
      Math.sqrt(1 + this.e) * Math.sin(E / 2),
      Math.sqrt(1 - this.e) * Math.cos(E / 2)
    );
    const r = this.a * (1 - this.e * Math.cos(E));
    const angle = nu + this.w;
    const local = new Vec2(r * Math.cos(angle), r * Math.sin(angle));

    return this.parent ? this.parent.getPosition(t).add(local) : local;
  }

  /**
   * Get the velocity of this body at simulation time t using the vis-viva
   * equation and the finite-difference approximation.
   *
   * Note: velocity is only needed for the Ghost Path integrator (to compute
   * how gravity pulls the ship). For display purposes getPosition is enough.
   *
   * @param {number} t   Simulation time in seconds
   * @param {number} GM  Gravitational parameter of the central body (m³/s²)
   * @returns {Vec2}     Velocity in sim units/s
   */
  getVelocity(t, GM) {
    // Numerical derivative — acceptable since this is called rarely (once
    // per body per trajectory step, not per render frame).
    const dt  = 0.1;  // 0.1s offset for finite difference
    const p1  = this.getPosition(t - dt);
    const p2  = this.getPosition(t + dt);
    return p2.sub(p1).scale(1 / (2 * dt));
  }

  /**
   * Returns a sampled array of [Vec2] positions for drawing the orbit ellipse.
   * Useful for rendering the orbit path on the Nav-Computer.
   * @param {number} t       Current simulation time (for parent position)
   * @param {number} samples Number of points (default 128)
   * @returns {Vec2[]}
   */
  getOrbitPath(t, samples = 128) {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const tOffset = (i / samples) * this.period;
      pts.push(this.getPosition(t + tOffset - (t % this.period)));
    }
    return pts;
  }
  /**
   * Calculate orbital elements from a state vector (pos, vel) relative to a primary.
   * @param {Vec2} rVec  Relative position (m)
   * @param {Vec2} vVec  Relative velocity (m/s)
   * @param {number} GM  Gravitational parameter (m³/s²)
   * @returns {{ a, e, pe, ap, period }}
   */
  static getElementsFromState(rVec, vVec, GM) {
    const r = rVec.len();
    const v2 = vVec.lenSq();
    
    // Specific energy
    const eps = v2 / 2 - GM / r;
    
    // Semi-major axis
    const a = -GM / (2 * eps);
    
    // Specific angular momentum (2D cross product, signed)
    const hSigned = rVec.x * vVec.y - rVec.y * vVec.x;
    const h = Math.abs(hSigned);
    
    // Eccentricity
    const eSq = 1 + (2 * eps * h * h) / (GM * GM);
    const e = Math.sqrt(Math.max(0, eSq));
    
    const pe = a * (1 - e);
    const ap = e < 1 ? a * (1 + e) : Infinity;
    const period = e < 1 ? 2 * Math.PI * Math.sqrt((a * a * a) / GM) : Infinity;
    const n = period < Infinity ? (2 * Math.PI) / period : 0;

    // ── Argument of periapsis (w) and mean anomaly (M0) ──────────────
    // Eccentricity vector: e_vec = (v × h) / GM - r_hat
    // In 2D with h scalar (hSigned): v × h = (vy*h, -vx*h) ... but we use
    // the standard formula: e_vec = ((v²-GM/r)*r - (r·v)*v) / GM
    const rdotv = rVec.x * vVec.x + rVec.y * vVec.y;
    const factor1 = (v2 - GM / r) / GM;
    const factor2 = rdotv / GM;
    const ex = factor1 * rVec.x - factor2 * vVec.x;
    const ey = factor1 * rVec.y - factor2 * vVec.y;

    // w = angle of eccentricity vector (points toward periapsis)
    let w = Math.atan2(ey, ex);

    // True anomaly: angle from periapsis to current position
    let nu = Math.atan2(rVec.y, rVec.x) - w;
    // Normalise to [-π, π]
    nu = ((nu + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

    // Eccentric anomaly from true anomaly
    let E = 2 * Math.atan2(
      Math.sqrt(1 - e) * Math.sin(nu / 2),
      Math.sqrt(1 + e) * Math.cos(nu / 2)
    );

    // Mean anomaly at the current instant
    let M0 = E - e * Math.sin(E);

    return { a, e, pe, ap, period, n, w, M0 };
  }
}
