/**
 * AutopilotManager.js — Constant-thrust autopilot for intercepting celestial bodies.
 *
 * Implements a five-phase guidance law:
 *   Phase 1: ALIGN   — Rotate to face the computed intercept heading
 *   Phase 2: ACCEL   — Thrust toward predicted intercept point
 *   Phase 3: COAST   — Engines off, unpowered drift toward target (fuel-saving)
 *   Phase 4: BRAKE   — Full thrust retrograde to relative velocity, matching orbital speed
 *   Phase 5: HOLD    — Arrived in orbit — station-keeping
 *
 * Efficiency slider (0–1) controls the coast phase:
 *   - 0 = max speed: no coasting, full burn the whole way (classic behavior)
 *   - 1 = max economy: brief burn, long unpowered coast, save ~60-80% fuel
 *
 * Features:
 *   - Gravity-aware braking distance (accounts for target body's pull)
 *   - Orbital insertion targeting (aims for 2× body radius orbit)
 *   - Collision avoidance (steers around the sun and other massive bodies)
 *
 * The transition from ACCEL → COAST/BRAKE is based on stopping-distance estimation:
 *   v²_rel / (2 × effective_decel) ≥ distance_to_target
 *   where effective_decel = max_thrust_accel - gravitational_accel_along_LOS
 *
 * The intercept point is computed iteratively using Lambert-like prediction:
 *   1. Guess T_arrive = dist / speed
 *   2. Check where body will be at T_arrive
 *   3. Refine T_arrive based on the new distance
 *   4. Repeat 3-5 times to converge
 */

import { Vec2 } from '../core/Vec2.js';

/** Gravitational constant (SI). */
const G_CONST = 6.674e-11;

/** Autopilot states */
export const AP_STATE = {
  OFF:    'OFF',
  ALIGN:  'ALIGN',
  ACCEL:  'ACCEL',
  COAST:  'COAST',   // Unpowered drift — fuel-saving cruise
  BRAKE:  'BRAKE',
  HOLD:   'HOLD',    // Arrived — station-keeping
};

/** Max relative velocity at arrival (m/s) for "matched" */
const ARRIVAL_REL_VEL  = 50;
/** Angle tolerance (radians) before we start thrusting in ALIGN phase */
const ALIGN_TOLERANCE  = 0.02;        // ~1°
/** Safety factor to begin braking earlier (>1 = brake sooner) */
const BRAKE_SAFETY     = 1.20;
/** Heading rotation speed (rad/s) for autopilot control */
const AP_ROT_SPEED     = 3.0;
/** Number of iterations for intercept solver */
const INTERCEPT_ITERS  = 6;

/** Orbit radius = body.radius × this factor */
const ORBIT_RADIUS_FACTOR = 2.0;
/** Fallback arrival distance for bodies with negligible mass/radius (m) */
const FALLBACK_ARRIVAL_DIST = 50_000;  // 50 km

/** Minimum body mass to bother computing avoidance for (kg) */
const AVOIDANCE_MASS_THRESHOLD = 1e24;
/** How many body radii to avoid (multiplier on body.radius) */
const AVOIDANCE_RADIUS_FACTOR = 4.0;
/** Minimum avoidance radius (m) — for the sun, whose visual radius is huge */
const AVOIDANCE_MIN_RADIUS = 1e10;  // 10 million km
/** Maximum steering correction strength */
const AVOIDANCE_MAX_STRENGTH = 0.8;

export class AutopilotManager {
  constructor(solarSystem) {
    this.system = solarSystem;
    this.state  = AP_STATE.OFF;

    this.targetBody  = null;   // The body we're flying to
    this.interceptPt = null;   // Predicted intercept world position (Vec2)
    this.targetAimPt = null;   // Debug: Where the ship is actually trying to point
    this.eta         = 0;      // Estimated time of arrival (seconds from now)
    this.dvRemaining = 0;      // Estimated remaining Δv needed (m/s)
    this.closestApproach = Infinity;
    this._lastSolveTime = 0;

    // Efficiency slider: 0 = max speed (no coast), 1 = max economy (long coast)
    this.efficiency      = 0;
    this.estimatedFuelCost = 0;  // Rough fuel estimate (kg) for remaining ΔV
    this._shipRef = null;        // Cached ship reference for fuel estimation
  }

  /** Is the autopilot active? */
  get active() { return this.state !== AP_STATE.OFF; }

  /**
   * Engage autopilot toward a target body.
   * @param {object} body  — a SolarSystem body with orbit
   */
  engage(body) {
    this.targetBody = body;
    this.state = AP_STATE.ALIGN;
    this.interceptPt = null;
    this.eta = 0;
    this.closestApproach = Infinity;
    this._lastSolveTime = 0;
    this.estimatedFuelCost = 0;
  }

  /** Disengage autopilot entirely. */
  disengage() {
    this.state = AP_STATE.OFF;
    this.targetBody = null;
    this.interceptPt = null;
    this.eta = 0;
    this.dvRemaining = 0;
    this.closestApproach = Infinity;
    this.estimatedFuelCost = 0;
    this._shipRef = null;
  }

  /**
   * Set autopilot efficiency.
   * @param {number} value  0 = max speed (no coast), 1 = max economy (long coast)
   */
  setEfficiency(value) {
    this.efficiency = Math.max(0, Math.min(1, value));
  }

  /**
   * Main update — sets ship.heading and ship.throttle.
   * Called every physics frame.
   *
   * @param {Ship}     ship
   * @param {number}   dt         Physics timestep (seconds)
   * @param {number}   simTime    Current simulation time
   * @param {TimeWarp} [timeWarp] Optional TimeWarp manager
   */
  update(ship, dt, simTime, timeWarp = null) {
    if (this.state === AP_STATE.OFF || !this.targetBody) return;

    // Cache ship reference for fuel estimation
    this._shipRef = ship;

    // Failsafe: if we run out of fuel during an autopilot burn, 
    // immediately drop warp and disengage to prevent overshooting into deep space.
    if (ship.fuel <= 0) {
      if (timeWarp && timeWarp.factor > 1) timeWarp.cancel();
      this.disengage();
      return;
    }

    // ── Get target state ─────────────────────────────────────────────────
    const body = this.targetBody;
    const tPos = this._getBodyPos(body, simTime);
    const tVel = this._getBodyVel(body, simTime);

    // Relative vectors
    const relPos = tPos.sub(ship.position);          // ship → target
    const dist   = relPos.len();
    const relVel = ship.velocity.sub(tVel);          // ship velocity relative to target
    const relSpeed = relVel.len();

    // Track closest approach
    this.closestApproach = Math.min(this.closestApproach, dist);

    // ── Orbital insertion parameters ─────────────────────────────────────
    const orbitRadius = Math.max((body.radius || 0) * ORBIT_RADIUS_FACTOR, 1000);
    const arrivalDist = Math.max(orbitRadius * 1.5, FALLBACK_ARRIVAL_DIST);
    const vOrbit = this._circularOrbitSpeed(body, orbitRadius);

    // ── Check arrival ────────────────────────────────────────────────────
    // "Arrived" = within arrival distance AND relative speed is near orbital speed
    const targetRelSpeed = vOrbit > 1 ? vOrbit : 0;  // for tiny bodies, just match velocity
    const speedError = Math.abs(relSpeed - targetRelSpeed);
    if (dist < arrivalDist && speedError < ARRIVAL_REL_VEL) {
      this.state = AP_STATE.HOLD;
      ship.throttle = 0;
      return;
    }
    if (this.state === AP_STATE.HOLD) {
      // Drifted away? Re-engage
      if (dist > arrivalDist * 2 || speedError > ARRIVAL_REL_VEL * 2) {
        this.state = AP_STATE.ALIGN;
      } else {
        ship.throttle = 0;
        return;
      }
    }

    // ── Compute intercept point (re-solve every ~0.5s sim-time) ──────────
    if (simTime - this._lastSolveTime > 0.5 || !this.interceptPt) {
      this._solveIntercept(ship, simTime);
      this._lastSolveTime = simTime;
    }

    // ── Max deceleration (at current mass) ───────────────────────────────
    const maxAccel = ship.totalMass > 0 ? ship.thrust / ship.totalMass : 0;
    if (maxAccel === 0) { this.disengage(); return; }

    // ── Gravity-aware stopping distance ──────────────────────────────────
    // Compute gravitational acceleration from target body along line-of-sight
    const gravAccelLOS = this._gravAccelAlongLOS(body, ship.position, tPos, dist);

    // When approaching, gravity pulls us *toward* the target, reducing our net braking decel.
    // effectiveDecel = maxAccel - gravAccel  (gravity fights braking)
    // Clamp to at least 10% of maxAccel to avoid division-by-zero / infinite stopping dist.
    const effectiveDecel = Math.max(maxAccel * 0.1, maxAccel - gravAccelLOS);

    const turnaroundTime = Math.PI / AP_ROT_SPEED;
    // During turnaround, both relative velocity and gravity continue to close the gap
    const turnaroundDist = (relSpeed + gravAccelLOS * turnaroundTime * 0.5) * turnaroundTime;
    const stoppingDist = ((relSpeed * relSpeed) / (2 * effectiveDecel) + turnaroundDist) * BRAKE_SAFETY;

    // ── Coast speed target ───────────────────────────────────────────────
    // efficiency=0 → coastFraction=1.0 → never coast (full burn)
    // efficiency=1 → coastFraction=0.08 → coast at 8% of max speed
    const coastFraction = Math.max(0.08, 1.0 - this.efficiency);
    // Max possible closing speed if we burned the whole way (rough estimate)
    const maxCoastSpeed = Math.sqrt(2 * maxAccel * Math.max(1, dist));
    const targetCoastSpeed = maxCoastSpeed * coastFraction;

    // ── Update fuel cost estimate ────────────────────────────────────────
    this._updateFuelEstimate(ship, relSpeed);

    // ── Auto Time-Warp Cancellation ──────────────────────────────────────
    if (timeWarp && timeWarp.factor > 1) {
      if (this.state === AP_STATE.ALIGN) {
        timeWarp.cancel(); // Must drop warp to turn precisely
      } else {
        const closingSpeed = Math.max(1, relVel.dot(relPos.norm().neg()));
        
        if (this.state === AP_STATE.ACCEL) {
          // Check if we're about to reach coast speed or braking point
          const useCoast = this.efficiency > 0.01;
          if (useCoast) {
            const speedToCoast = targetCoastSpeed - relSpeed;
            const timeToCoast = speedToCoast > 0 ? speedToCoast / maxAccel : 0;
            if (timeToCoast < 2 * timeWarp.factor) timeWarp.cancel();
          } else {
            const timeToBrake = (dist - stoppingDist) / closingSpeed;
            if (timeToBrake < 2 * timeWarp.factor) timeWarp.cancel();
          }
        } 
        else if (this.state === AP_STATE.COAST) {
          // Drop warp when approaching braking point
          const timeToBrake = (dist - stoppingDist) / closingSpeed;
          if (timeToBrake < 2 * timeWarp.factor) timeWarp.cancel();
        }
        else if (this.state === AP_STATE.BRAKE) {
          const timeToArrival = dist / closingSpeed;
          // If we will arrive within 2 real-time seconds, or if simply very close
          if (timeToArrival < 2 * timeWarp.factor || dist < arrivalDist * 5) timeWarp.cancel();
        }
      }
    }

    // ── State machine ────────────────────────────────────────────────────
    switch (this.state) {
      case AP_STATE.ALIGN:
      case AP_STATE.ACCEL: {
        // We must compensate for lateral (sideways) drift, otherwise we'll fly right past.
        // But we spread this correction over the entire acceleration phase!
        const aimPt = this.interceptPt || tPos;
        const los = aimPt.sub(ship.position);
        const losDir = los.norm();
        
        // Find our lateral velocity relative to the line of sight
        const forwardVel = relVel.dot(losDir);
        const lateralVel = relVel.sub(losDir.scale(forwardVel));
        
        // Dedicate a portion of our acceleration to killing lateral drift over the ETA
        const timeToKill = Math.max(10.0, (this.eta || 1) * 0.5);
        let desiredAccel = losDir.scale(maxAccel).sub(lateralVel.scale(1 / timeToKill));

        // ── Collision avoidance steering ─────────────────────────────────
        const avoidance = this._computeAvoidanceSteering(ship.position, aimPt, simTime);
        if (avoidance) {
          desiredAccel = desiredAccel.add(avoidance.scale(maxAccel));
        }

        this.targetAimPt = ship.position.add(desiredAccel.norm().scale(dist)); // Debug
        const desiredAngle = Math.atan2(desiredAccel.y, desiredAccel.x);

        // Should we start braking? (always check this first, regardless of coast)
        if (stoppingDist >= dist && relSpeed > 10) {
          this.state = AP_STATE.BRAKE;
          break;  // Fall through to brake on next tick
        }

        // Should we start coasting? (only if efficiency > 0)
        const closingRate = relVel.dot(losDir);
        if (this.efficiency > 0.01 && this.state === AP_STATE.ACCEL && closingRate >= targetCoastSpeed) {
          this.state = AP_STATE.COAST;
          ship.throttle = 0;
          break;
        }

        // Steer toward desired heading
        const angleDiff = this._normalizeAngle(desiredAngle - ship.heading);
        if (Math.abs(angleDiff) > ALIGN_TOLERANCE) {
          // Rotate toward target
          const rotDir = angleDiff > 0 ? 1 : -1;
          ship.heading += rotDir * Math.min(AP_ROT_SPEED * dt, Math.abs(angleDiff));
          ship.heading = this._normalizeAngle(ship.heading);

          if (this.state === AP_STATE.ALIGN) {
            ship.throttle = 0;
          } else {
            // In ACCEL — keep thrusting even while correcting heading (within ~15°)
            ship.throttle = Math.abs(angleDiff) < 0.26 ? 1 : 0;
          }
        } else {
          // Aligned — full thrust
          this.state = AP_STATE.ACCEL;
          ship.throttle = 1;
        }

        this.dvRemaining = relSpeed;
        break;
      }

      case AP_STATE.COAST: {
        // ── Unpowered cruise — engines off, maintain heading toward intercept ──
        ship.throttle = 0;

        const aimPt = this.interceptPt || tPos;
        const los = aimPt.sub(ship.position);
        const losDir = los.norm();
        const desiredAngle = Math.atan2(losDir.y, losDir.x);

        // Keep rotating toward intercept (prep for braking orientation)
        const angleDiff = this._normalizeAngle(desiredAngle - ship.heading);
        if (Math.abs(angleDiff) > ALIGN_TOLERANCE) {
          const rotDir = angleDiff > 0 ? 1 : -1;
          ship.heading += rotDir * Math.min(AP_ROT_SPEED * dt, Math.abs(angleDiff));
          ship.heading = this._normalizeAngle(ship.heading);
        }

        // Transition to BRAKE when stopping distance reaches remaining distance
        if (stoppingDist >= dist && relSpeed > 10) {
          this.state = AP_STATE.BRAKE;
          break;
        }

        // If we've somehow slowed down too much (e.g. gravity pulled us off course),
        // go back to ACCEL
        const closingRate = relVel.dot(losDir);
        if (closingRate < targetCoastSpeed * 0.5 && dist > arrivalDist * 3) {
          this.state = AP_STATE.ACCEL;
          break;
        }

        // ETA during coast = distance / closing speed
        const coastClosingSpeed = Math.max(1, closingRate);
        this.eta = dist / coastClosingSpeed;
        this.dvRemaining = relSpeed;
        break;
      }

      case AP_STATE.BRAKE: {
        // ── Orbital insertion: brake toward tangential orbital velocity ──
        // Instead of killing ALL relative velocity, we want to end up with
        // a tangential velocity of vOrbit relative to the body.
        let brakeTarget;  // the relative velocity we want to cancel out

        if (vOrbit > 1 && dist < arrivalDist * 3) {
          // Close enough to start shaping for orbit.
          // Desired velocity: tangential to the body at orbital speed.
          const radialDir = relPos.norm();  // ship→body direction
          // Tangential = 90° CCW from radial toward body
          const tangentDir = new Vec2(-radialDir.y, radialDir.x);
          const desiredRelVel = tangentDir.scale(vOrbit);
          brakeTarget = relVel.sub(desiredRelVel);  // error = actual - desired
        } else {
          brakeTarget = relVel;  // far away: just kill relative velocity
        }

        const brakeSpeed = brakeTarget.len();
        const brakeDir = brakeSpeed > 0.1 ? brakeTarget.norm().neg() : Vec2.fromAngle(ship.heading, 1);
        this.targetAimPt = ship.position.add(brakeDir.scale(dist)); // Debug
        const brakeAngle = Math.atan2(brakeDir.y, brakeDir.x);

        const angleDiff = this._normalizeAngle(brakeAngle - ship.heading);
        const rotDir = angleDiff > 0 ? 1 : -1;
        ship.heading += rotDir * Math.min(AP_ROT_SPEED * dt, Math.abs(angleDiff));
        ship.heading = this._normalizeAngle(ship.heading);

        // Smooth throttle as we approach 0 relative speed to prevent overshoot oscillation
        let desiredThrottle = 1;
        if (maxAccel > 0 && brakeSpeed < maxAccel * 1.5) {
           desiredThrottle = Math.max(0.05, brakeSpeed / (maxAccel * 1.5));
        }

        // Full thrust in brake direction (even while still rotating, within ~15°)
        ship.throttle = Math.abs(angleDiff) < 0.26 ? desiredThrottle : 0;

        // Exit brake if slow enough and close enough
        if (brakeSpeed < ARRIVAL_REL_VEL && dist < arrivalDist * 2) {
            this.state = AP_STATE.HOLD;
            ship.throttle = 0;
            break;
        }

        // Overshot/Stopped early? Back to accel if we're drifting helplessly
        if (stoppingDist < dist * 0.4 && brakeSpeed < 500 && dist > arrivalDist) {
          this.state = AP_STATE.ACCEL;
        }

        // Use kinematic ETA even while braking, but limit it for visual sanity
        this.eta = maxAccel > 0 ? brakeSpeed / maxAccel : 0;
        this.dvRemaining = brakeSpeed;
        break;
      }
    }
  }

  // ─── Intercept Solver ──────────────────────────────────────────────────────

  /**
   * Iteratively solve for the intercept point ahead of the target body.
   * Uses realistic kinematic estimation for continuous-thrust torch trajectories.
   */
  _solveIntercept(ship, simTime) {
    const body = this.targetBody;
    const maxAccel = ship.totalMass > 0 ? ship.thrust / ship.totalMass : 1;

    // During coast phase, use reduced effective accel for ETA calculation
    // to account for the unpowered drift segment
    const isCoasting = this.state === AP_STATE.COAST;
    const effectiveAccel = isCoasting ? maxAccel * 0.5 : maxAccel;

    let tGuess = this.eta || 1; // start with existing ETA if available

    // Iterate: refine time estimate by checking intercept distance
    for (let i = 0; i < INTERCEPT_ITERS; i++) {
      const futurePos = this._getBodyPos(body, simTime + tGuess);
      const futureDist = ship.position.dist(futurePos);

      // Exact kinematic flip-and-burn ETA calculation
      const relVel = ship.velocity.sub(this._getBodyVel(body, simTime));
      const closingRate = relVel.dot(futurePos.sub(ship.position).norm());
      
      let newT;
      if (isCoasting && closingRate > 0) {
        // Coast ETA: time = distance / closing speed + braking time
        const brakingTime = closingRate / maxAccel;
        const brakingDist = 0.5 * closingRate * closingRate / maxAccel;
        const coastDist = Math.max(0, futureDist - brakingDist);
        newT = (coastDist / closingRate) + brakingTime;
      } else if (closingRate > 0) {
        const brakingDist = 0.5 * closingRate * closingRate / effectiveAccel;
        if (brakingDist > futureDist) {
          const disc = closingRate * closingRate - 2 * effectiveAccel * futureDist;
          if (disc >= 0) {
            newT = (closingRate - Math.sqrt(disc)) / effectiveAccel;
          } else {
            newT = futureDist / closingRate;
          }
        } else {
          newT = Math.sqrt(2 * closingRate * closingRate / (effectiveAccel * effectiveAccel) + 4 * futureDist / effectiveAccel) - closingRate / effectiveAccel;
        }
      } else {
        const v0 = Math.abs(closingRate);
        const stopTime = v0 / effectiveAccel;
        const extraDist = 0.5 * v0 * v0 / effectiveAccel;
        newT = stopTime + 2 * Math.sqrt((futureDist + extraDist) / effectiveAccel);
      }

      // Blend heavily to ensure convergence and prevent wild oscillation
      tGuess = tGuess * 0.5 + newT * 0.5;
      tGuess = Math.max(1, Math.min(tGuess, 30 * 86400));
    }

    this.interceptPt = this._getBodyPos(body, simTime + tGuess);
    this.eta = tGuess;
  }

  // ─── Fuel Estimation ──────────────────────────────────────────────────────

  /**
   * Estimate fuel cost for remaining ΔV using Tsiolkovsky rocket equation.
   * Δm = m₀ × (1 − e^(−Δv / (Isp × g₀)))
   */
  _updateFuelEstimate(ship, dvRemaining) {
    const g0 = 9.80665;
    const isp = ship.isp;
    if (isp <= 0 || dvRemaining <= 0) {
      this.estimatedFuelCost = 0;
      return;
    }
    // For coast trajectories, ΔV is roughly: accel burn + braking burn
    // With coast, the ΔV is approximately 2 × coast_speed (burn up, then burn down)
    const totalDv = dvRemaining * 2;  // Rough: need to brake the speed we've built up
    const massRatio = 1 - Math.exp(-totalDv / (isp * g0));
    this.estimatedFuelCost = Math.max(0, ship.totalMass * massRatio);
  }

  // ─── Gravity-Aware Braking ────────────────────────────────────────────────

  /**
   * Compute the gravitational acceleration from the target body along the
   * line-of-sight (ship→target). Positive means gravity pulls us toward the body.
   * @returns {number} Gravitational acceleration along LOS (m/s²)
   */
  _gravAccelAlongLOS(body, shipPos, bodyPos, dist) {
    if (dist < 1) return 0;
    const gMag = (G_CONST * body.mass) / (dist * dist);
    return gMag;  // Always positive — it's the magnitude along the approach axis
  }

  // ─── Orbital Insertion ────────────────────────────────────────────────────

  /**
   * Compute the circular orbit speed at a given radius around a body.
   * Returns 0 for bodies with negligible mass (effectively no orbit).
   * @param {object} body
   * @param {number} radius  Orbital radius (m)
   * @returns {number} Orbital speed (m/s)
   */
  _circularOrbitSpeed(body, radius) {
    if (!body.mass || body.mass < 1e16 || radius <= 0) return 0;
    const v = Math.sqrt(G_CONST * body.mass / radius);
    // Cap at a reasonable value — for tiny bodies this might be negligible
    return v < 1 ? 0 : v;
  }

  // ─── Collision Avoidance ──────────────────────────────────────────────────

  /**
   * Compute a lateral steering correction to avoid flying into massive bodies
   * (primarily the sun). Returns a unit-ish Vec2 to add to the desired accel,
   * or null if no avoidance is needed.
   *
   * Uses closest-point-on-segment geometry: project each body's position onto
   * the ship→aimPt line. If closest approach < avoidanceRadius, steer away.
   *
   * @param {Vec2}   shipPos  Current ship position
   * @param {Vec2}   aimPt    Where the ship is heading
   * @param {number} simTime  Current sim time
   * @returns {Vec2|null}     Steering correction vector (scaled 0–AVOIDANCE_MAX_STRENGTH), or null
   */
  _computeAvoidanceSteering(shipPos, aimPt, simTime) {
    let totalSteer = null;

    for (const body of this.system.allBodies) {
      // Skip low-mass bodies and our own target
      if (body.mass < AVOIDANCE_MASS_THRESHOLD) continue;
      if (body === this.targetBody) continue;

      const bodyPos = this._getBodyPos(body, simTime);
      const avoidRadius = Math.max(
        (body.radius || 0) * AVOIDANCE_RADIUS_FACTOR,
        AVOIDANCE_MIN_RADIUS
      );

      // Project body position onto the ship→aimPt line segment
      const seg = aimPt.sub(shipPos);
      const segLen = seg.len();
      if (segLen < 1) continue;
      const segDir = seg.scale(1 / segLen);

      const toBody = bodyPos.sub(shipPos);
      const proj = toBody.dot(segDir);

      // Only care if the body is ahead of us (not behind)
      if (proj < 0 || proj > segLen) continue;

      // Closest point on the line to the body center
      const closestPt = shipPos.add(segDir.scale(proj));
      const offset = bodyPos.sub(closestPt);
      const closestDist = offset.len();

      if (closestDist >= avoidRadius) continue;

      // Compute steering strength: stronger the closer we are to the danger zone
      // Goes from 0 at avoidRadius to AVOIDANCE_MAX_STRENGTH at 0
      const penetration = 1.0 - (closestDist / avoidRadius);
      const strength = penetration * AVOIDANCE_MAX_STRENGTH;

      // Steer perpendicular to the segment, AWAY from the body
      // offset = body - closestPt → we want to steer opposite to offset
      let steerDir;
      if (closestDist > 1) {
        steerDir = offset.norm().neg();  // away from body
      } else {
        // Degenerate: directly on line. Pick an arbitrary perpendicular.
        steerDir = new Vec2(-segDir.y, segDir.x);
      }

      const correction = steerDir.scale(strength);
      if (totalSteer) {
        totalSteer = totalSteer.add(correction);
      } else {
        totalSteer = correction;
      }
    }

    return totalSteer;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Get body world position at time t. */
  _getBodyPos(body, t) {
    if (body.position) return body.position.clone();
    if (body.orbit) {
      const p = body.orbit.getPosition(t);
      return new Vec2(p.x, p.y);
    }
    return Vec2.zero();  // star (fixed)
  }

  /** Get body velocity at time t. */
  _getBodyVel(body, t) {
    if (body.velocity) return body.velocity.clone();
    if (body.orbit) {
      const v = body.orbit.getVelocity(t);
      return new Vec2(v.x, v.y);
    }
    return Vec2.zero();
  }

  /** Normalize angle to [-π, π]. */
  _normalizeAngle(a) {
    while (a >  Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }
}
