/**
 * ShipSim.js — Symplectic Euler integrator for ships.
 *
 * Only ships (and projectiles) are dynamically integrated.
 * Celestial bodies are on-rails via KeplerOrbit.getPosition(t).
 *
 * Each physics step:
 *   1. Query all body positions at current sim time t
 *   2. Sum gravitational accelerations from each body onto the ship
 *   3. Add ship thrust acceleration (F / m in heading direction)
 *   4. Integrate velocity: v += a * dt  (symplectic Euler: velocity first)
 *   5. Integrate position: p += v * dt
 *   6. Consume fuel, update resources
 *
 * Symplectic Euler is energy-conserving for Hamiltonian systems (much better
 * than standard Euler for orbital mechanics — it won't spiral outward).
 */

import { Vec2 } from '../core/Vec2.js';
import { G0 }   from './Ship.js';
import { rk4 } from './MathUtils.js';

/** Universal gravitational constant (SI). */
const G = 6.674e-11;

/**
 * A gravitational body descriptor used by ShipSim.
 * Doesn't need to be a full KeplerOrbit — just needs getPosition(t) and mass.
 */

export class ShipSim {
  /**
   * @param {object[]} bodies  Array of gravitational bodies.
   *   Each body: { getPosition(t: number): Vec2, mass: number, name: string }
   *   The sun (Solara) is a special case: { getPosition: () => Vec2.zero(), mass: number }
   */
  constructor(bodies) {
    this.bodies = bodies;
  }

  /**
   * Advance a single ship by one physics timestep.
   * Mutates ship.position, ship.velocity, ship.fuel.
   *
   * @param {Ship}   ship      The ship to integrate
   * @param {number} dt        Delta-time (seconds, already warp-scaled)
   * @param {number} simTime   Current simulation time (for on-rails body positions)
   */
  step(ship, dt, simTime) {
    ship.savePrevState();

    if (ship.usePrecisionIntegration) {
        this.rk4Step(ship, dt, simTime);
    } else {
        this.symplecticStep(ship, dt, simTime);
    }
  }

  symplecticStep(ship, dt, simTime) {
    // ── 1. Gravitational acceleration ──────────────────────────────────────
    let ax = 0, ay = 0;
    for (const body of this.bodies) {
      const bPos = body.getPosition(simTime);
      const dx   = bPos.x - ship.position.x;
      const dy   = bPos.y - ship.position.y;
      const r2   = dx * dx + dy * dy;
      // Skip gravity when inside (or right at) the body surface.
      // Use the body's actual radius so ships can't get trapped inside planets.
      // Minimum skip distance is 1 km to guard against any zero-radius bodies.
      const skipR = Math.max(body.radius || 0, 1000);
      if (r2 < skipR * skipR) continue;
      const r    = Math.sqrt(r2);
      const acc  = (G * body.mass) / r2;
      ax += acc * (dx / r);
      ay += acc * (dy / r);
    }

    // ── 2. Thrust acceleration ─────────────────────────────────────────────
    if (ship.throttle > 0 && ship.fuel > 0) {
      const F    = ship.thrust * ship.throttle;
      const mass = ship.totalMass;
      const ta   = F / mass;
      ax += ta * Math.cos(ship.heading);
      ay += ta * Math.sin(ship.heading);

      // Consume fuel (Tsiolkovsky)
      ship.consumeFuel(dt);
    }

    // ── 3. Symplectic Euler integration ────────────────────────────────────
    // Velocity first (symplectic — crucial for stability):
    ship.velocity.x += ax * dt;
    ship.velocity.y += ay * dt;
    // Then position from updated velocity:
    ship.position.x += ship.velocity.x * dt;
    ship.position.y += ship.velocity.y * dt;

    // ── 4. Resource tick ──────────────────────────────────────────────────
    ship.updateResources(dt);

    // ── 5. Surface ejection ───────────────────────────────────────────────
    this._handleCollisions(ship, simTime, dt);

    // Store gravity acc for HUD display (G-force readout)
    ship._gravAcc = new Vec2(ax, ay);
  }

  rk4Step(ship, dt, simTime) {
      // State: [x, y, vx, vy, m]
      const state = [
          ship.position.x, ship.position.y,
          ship.velocity.x, ship.velocity.y,
          ship.totalMass
      ];

      const maxThrust = ship.thrust * ship.throttle; // Current throttle matters for RK4 too if not pure optimal
      // If autopilot is managing it, throttle might be 1.0, but let's respect the ship's setting.
      
      const derivFn = (t, s) => {
          const x = s[0], y = s[1];
          // s[2], s[3] are vx, vy
          const m = s[4];

          let ax = 0, ay = 0;
          
          // N-Body Gravity
          for (const body of this.bodies) {
              const bPos = body.getPosition(t);
              const dx = bPos.x - x;
              const dy = bPos.y - y;
              const r2 = dx*dx + dy*dy;
              const skipR = Math.max(body.radius || 0, 1000);
              if (r2 < skipR*skipR) continue; // Inside body
              const r = Math.sqrt(r2);
              const acc = (G * body.mass) / r2;
              ax += acc * (dx/r);
              ay += acc * (dy/r);
          }

          // Thrust
          let dm = 0;
          if (ship.throttle > 0 && m > 0) { // Check m > 0 (actually ship.fuel > 0 check is approximate here)
              // We assume if we started with fuel, we have fuel for the step. 
              // Precise fuel depletion cutout inside RK4 step is hard.
              const F = ship.thrust * ship.throttle; 
              const accel = F / m;
              const h = ship.heading; // Heading assumed constant over the step (0.02s)
              ax += accel * Math.cos(h);
              ay += accel * Math.sin(h);
              
              dm = -F / (ship.isp * G0);
          }

          return [s[2], s[3], ax, ay, dm];
      };

      const nextState = rk4(simTime, state, dt, derivFn);

      ship.position.x = nextState[0];
      ship.position.y = nextState[1];
      ship.velocity.x = nextState[2];
      ship.velocity.y = nextState[3];
      
      // Update fuel based on mass change
      const newMass = nextState[4];
      const massLost = ship.totalMass - newMass;
      if (massLost > 0) {
          ship.fuel = Math.max(0, ship.fuel - massLost);
      }
      
      ship.updateResources(dt);
      this._handleCollisions(ship, simTime, dt);

      // Recalculate accel for HUD (approximate based on last state derivative)
      // or just re-run the gravity sum. Let's lazily leave it or approx it.
      // For now, let's just calculate gravity at the new position for display.
      const finalGrav = this.gravAccelAt(ship.position, simTime + dt);
      ship._gravAcc = finalGrav;
  }

  _handleCollisions(ship, simTime, dt) {
    for (const body of this.bodies) {
      const skipR = Math.max(body.radius || 0, 1000);
      if (skipR <= 1000) continue;  
      const bPos = body.getPosition(simTime);
      const dx   = ship.position.x - bPos.x;
      const dy   = ship.position.y - bPos.y;
      const r2   = dx * dx + dy * dy;
      if (r2 < skipR * skipR) {
        const r    = Math.sqrt(r2) || 1;
        const nx   = dx / r; 
        const ny   = dy / r;
        ship.position.x = bPos.x + nx * skipR;
        ship.position.y = bPos.y + ny * skipR;
        
        const bVel = body.orbit ? body.orbit.getVelocity(simTime) : new Vec2(0, 0);
        const relVx = ship.velocity.x - bVel.x;
        const relVy = ship.velocity.y - bVel.y;
        
        const vDotN = relVx * nx + relVy * ny;
        if (vDotN < 0) { 
          ship.velocity.x -= vDotN * nx;
          ship.velocity.y -= vDotN * ny;
          
          const relVtan = -relVx * ny + relVy * nx;
          ship.velocity.x += relVtan * ny * 0.05 * dt; 
          ship.velocity.y -= relVtan * nx * 0.05 * dt;
        }
      }
    }
  }

  /**
   * Advance multiple ships in one call (e.g., ship + NPC fleet).
   * @param {Ship[]} ships
   * @param {number} dt
   * @param {number} simTime
   */
  stepAll(ships, dt, simTime) {
    for (const ship of ships) {
      if (!ship.destroyed) this.step(ship, dt, simTime);
    }
  }

  /**
   * Compute the net gravitational acceleration vector on a point in space
   * at a given sim time. Used by Trajectory for ghost path integration.
   *
   * @param {Vec2}   pos      World position
   * @param {number} simTime  Sim time for body positions
   * @returns {Vec2}          Acceleration (m/s²)
   */
  gravAccelAt(pos, simTime) {
    let ax = 0, ay = 0;
    for (const body of this.bodies) {
      const bPos = body.getPosition(simTime);
      const dx   = bPos.x - pos.x;
      const dy   = bPos.y - pos.y;
      const r2   = dx * dx + dy * dy;
      const skipR = Math.max(body.radius || 0, 1000);
      if (r2 < skipR * skipR) continue;
      const r    = Math.sqrt(r2);
      const acc  = (G * body.mass) / r2;
      ax += acc * (dx / r);
      ay += acc * (dy / r);
    }
    return new Vec2(ax, ay);
  }

  /**
   * Find the body exerting the strongest gravitational acceleration at a point.
   */
  getDominantBodyAt(pos, simTime) {
    let dominant = null;
    let maxAcc = -1;
    for (const body of this.bodies) {
      const bPos = body.getPosition(simTime);
      const dx = bPos.x - pos.x;
      const dy = bPos.y - pos.y;
      const r2 = dx * dx + dy * dy;
      const skipR = Math.max(body.radius || 0, 1000);
      if (r2 < skipR * skipR) continue;
      const acc = (G * body.mass) / r2;
      if (acc > maxAcc) {
        maxAcc = acc;
        dominant = body;
      }
    }
    // Default to the sun if something goes wrong, but should always find Solara at least
    return dominant;
  }
}
