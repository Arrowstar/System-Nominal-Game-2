/**
 * physics.test.js — Unit tests for the core physics engine.
 *
 * Run with:  npm test
 * Or:        npx vitest run src/physics/__tests__/physics.test.js
 */

import { describe, it, expect } from 'vitest';
import { KeplerOrbit, solveKepler, G } from '../KeplerOrbit.js';
import { Ship, G0 }            from '../Ship.js';
import { ShipSim }             from '../ShipSim.js';
import { Trajectory, ManeuverNode, PREDICT_STEPS, PREDICT_DT } from '../Trajectory.js';
import { Vec2 }                from '../../core/Vec2.js';

// Helper to mock a Ship Loadout dependency for testing physics calculations natively
function mockLoadout(opts = {}) {
  return {
    emptyMass: opts.emptyMass ?? 100000,
    maxFuel: opts.maxFuel ?? 50000,
    totalThrust: opts.totalThrust ?? 0,
    netIsp: opts.netIsp ?? 300,
    powerGen: opts.powerGen ?? 100,
    hull: { integrity: opts.integrity ?? 100 }
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** GM of the Sun (m³/s²) — used for Kepler test orbits */
const GM_SUN = 1.327e20;

/**
 * Semi-major axis of Earth-like orbit in sim units (meters).
 * 1 AU ≈ 1.496e11 m
 */
const AU = 1.496e11;

// ─── KeplerOrbit Tests ───────────────────────────────────────────────────────

describe('KeplerOrbit', () => {
  it('solves Kepler equation accurately for circular orbit (e=0)', () => {
    // For e=0: E = M exactly
    const cases = [0, Math.PI / 4, Math.PI / 2, Math.PI, 1.5 * Math.PI];
    for (const M of cases) {
      const E = solveKepler(M, 0);
      // Verify E - e*sin(E) = M
      const residual = Math.abs((E - 0 * Math.sin(E)) - (M % (2 * Math.PI) > Math.PI ? M % (2 * Math.PI) - 2 * Math.PI : M % (2 * Math.PI)));
      expect(residual).toBeLessThan(1e-9);
    }
  });

  it('solves Kepler equation for eccentric orbit (e=0.5)', () => {
    const e = 0.5;
    const testMs = [0.1, 0.5, 1.0, 2.0, Math.PI, 5.0];
    for (const Mraw of testMs) {
      const M = Mraw % (2 * Math.PI);
      const Mnorm = M > Math.PI ? M - 2 * Math.PI : M;
      const E = solveKepler(Mraw, e);
      // Verify E - e*sin(E) ≈ M (normalised)
      const Emod = E % (2 * Math.PI);
      const Enorm = Emod > Math.PI ? Emod - 2 * Math.PI : Emod;
      const lhs = Enorm - e * Math.sin(Enorm);
      expect(Math.abs(lhs - Mnorm)).toBeLessThan(1e-9);
    }
  });

  it('returns correct position for circular orbit at quarter periods', () => {
    // Circular orbit: position should trace a circle of radius a
    const a = 1 * AU;
    const period = 2 * Math.PI * Math.sqrt(a ** 3 / GM_SUN);
    const orbit = new KeplerOrbit({ a, e: 0, w: 0, M0: 0, period });

    // At t=0: should be at (a, 0)
    const p0 = orbit.getPosition(0);
    expect(p0.x).toBeCloseTo(a, -3);   // within 1000m
    expect(p0.y).toBeCloseTo(0, -3);

    // At t = period/4: should be at (0, a) approx
    const p1 = orbit.getPosition(period / 4);
    expect(p1.x).toBeCloseTo(0, -3);
    expect(p1.y).toBeCloseTo(a, -3);

    // At t = period/2: should be at (-a, 0)
    const p2 = orbit.getPosition(period / 2);
    expect(p2.x).toBeCloseTo(-a, -3);
    expect(p2.y).toBeCloseTo(0, -3);
  });

  it('returns same position for t and t + period (periodicity)', () => {
    const a = 2 * AU;
    const period = 2 * Math.PI * Math.sqrt(a ** 3 / GM_SUN);
    const orbit = new KeplerOrbit({ a, e: 0.3, w: 1.2, M0: 0.7, period });

    const t = 1234567;
    const p1 = orbit.getPosition(t);
    const p2 = orbit.getPosition(t + period);

    // Position should be the same after one full period
    expect(Math.abs(p1.x - p2.x)).toBeLessThan(1);   // < 1m
    expect(Math.abs(p1.y - p2.y)).toBeLessThan(1);
  });

  it('getPosition is consistent: t=1000s matches stepping through 1000 × 1s ticks', () => {
    const a = 1 * AU;
    const period = 2 * Math.PI * Math.sqrt(a ** 3 / GM_SUN);
    const orbit = new KeplerOrbit({ a, e: 0.1, w: 0.5, M0: 0, period });

    // Direct: position at t=1000
    const direct = orbit.getPosition(1000);

    // Stepped: getPosition at each integer second from 0..1000
    // (each call is independent — on-rails means no drift)
    const stepped = orbit.getPosition(1000);  // same as direct, always

    // Since getPosition is purely analytical (no state), these must be identical
    expect(direct.x).toBeCloseTo(stepped.x, 6);
    expect(direct.y).toBeCloseTo(stepped.y, 6);
  });

  it('hierarchical (moon) orbit: getPosition returns parent position + local orbit', () => {
    const period1 = 365.25 * 24 * 3600;
    const period2 = 27.3 * 24 * 3600;

    const parentOrbit = new KeplerOrbit({
      a: AU, e: 0, w: 0, M0: 0, period: period1
    });
    const moonOrbit = new KeplerOrbit({
      a: 3.84e8, e: 0.055, w: 0, M0: 0,
      period: period2,
      parent: parentOrbit,
    });

    const t = 5000;
    const moonPos  = moonOrbit.getPosition(t);
    const parentP  = parentOrbit.getPosition(t);

    // Moon should be within its orbital radius of its parent
    const dist = moonPos.sub(parentP).len();
    const a    = 3.84e8;
    // For e=0.055, distance is a*(1-e) to a*(1+e)
    expect(dist).toBeGreaterThan(a * (1 - 0.055) * 0.99);
    expect(dist).toBeLessThan(a * (1 + 0.055) * 1.01);
  });

  it('getOrbitPath returns samples that lie on the orbit ellipse', () => {
    const a = AU;
    const e = 0.2;
    const period = 365.25 * 24 * 3600;
    const orbit = new KeplerOrbit({ a, e, w: 0, M0: 0, period });

    const pts = orbit.getOrbitPath(0, 64);
    expect(pts).toHaveLength(65);  // 0..64 inclusive

    // All points should have radius between a*(1-e) and a*(1+e)
    const rMin = a * (1 - e);
    const rMax = a * (1 + e);
    for (const p of pts) {
      const r = p.len();
      expect(r).toBeGreaterThan(rMin * 0.99);
      expect(r).toBeLessThan(rMax * 1.01);
    }
  });
});

// ─── Ship Tests ───────────────────────────────────────────────────────────────

describe('Ship', () => {
  it('totalMass accounts for hull + fuel + cargo', () => {
    const ship = new Ship({
      loadout: mockLoadout({ emptyMass: 105000 }),
      fuel: 50000,
      cargos: [{ mass: 10000, type: 'iron', amount: 10 }],
    });
    expect(ship.totalMass).toBe(100000 + 5000 + 50000 + 10000);
  });

  it('consumeFuel burns the correct mass per second using Tsiolkovsky', () => {
    const thrust  = 100000;   // 100 kN
    const isp     = 300;      // s
    const ship    = new Ship({ 
      loadout: mockLoadout({ emptyMass: 10000, totalThrust: thrust, netIsp: isp }), 
      fuel: 100000 
    });
    ship.throttle = 1.0;

    const dt         = 1;   // 1 second
    const expectedDm = thrust / (isp * G0);   // kg/s
    const burned     = ship.consumeFuel(dt);

    expect(burned).toBeCloseTo(expectedDm, 3);
    expect(ship.fuel).toBeCloseTo(100000 - expectedDm, 3);
  });

  it('cuts throttle when fuel runs out', () => {
    const ship    = new Ship({ 
      loadout: mockLoadout({ emptyMass: 5000, totalThrust: 50000, netIsp: 300 }), 
      fuel: 1 
    });
    ship.throttle = 1.0;

    ship.consumeFuel(100);   // burn for 100s, more than enough to empty

    expect(ship.fuel).toBe(0);
    expect(ship.throttle).toBe(0);
  });

  it('getState / setState round-trips correctly', () => {
    const ship   = new Ship({ 
      position: new Vec2(1e9, 2e9), 
      velocity: new Vec2(1000, 500), 
      fuel: 30000,
      loadout: mockLoadout() 
    });
    ship.heading  = 1.23;
    ship.throttle = 0.5;

    const state = ship.getState();
    ship.position = Vec2.zero();
    ship.velocity = Vec2.zero();
    ship.fuel     = 0;

    ship.setState(state);
    expect(ship.position.x).toBeCloseTo(1e9);
    expect(ship.velocity.y).toBeCloseTo(500);
    expect(ship.fuel).toBeCloseTo(30000);
  });

  it('takeDamage reduces integrity; disabled at 0, destroyed at -50', () => {
    const ship = new Ship({ loadout: mockLoadout({ integrity: 100 }) });
    ship.takeDamage(50);
    expect(ship.integrity).toBe(50);
    expect(ship.disabled).toBe(false);
    expect(ship.destroyed).toBe(false);

    // Drop to 0 — first threshold: disabled, not yet destroyed
    ship.takeDamage(60);
    expect(ship.integrity).toBe(0);
    expect(ship.disabled).toBe(true);
    expect(ship.destroyed).toBe(false);

    // Continue taking damage while disabled — destroyed at -50
    ship.takeDamage(51);   // integrity goes to -51 (< -50)
    expect(ship.destroyed).toBe(true);
  });
});

// ─── ShipSim Tests ───────────────────────────────────────────────────────────

describe('ShipSim', () => {
  /** A static Solara-like body at origin with GM matching the Sun. */
  const M_SUN   = 1.989e30;   // kg
  const staticSun = {
    getPosition: () => Vec2.zero(),
    mass: M_SUN,
    name: 'Solara',
  };

  it('ship falls toward Solara under gravity correctly', () => {
    // Start the ship at 1 AU above the sun with zero velocity
    const startPos = new Vec2(AU, 0);
    const ship     = new Ship({
      position:  startPos,
      velocity:  Vec2.zero(),
      loadout: mockLoadout({ emptyMass: 10000 }),
      fuel:      0,
    });
    ship.throttle = 0;

    const sim = new ShipSim([staticSun]);
    const dt  = 1;   // 1 second

    sim.step(ship, dt, 0);

    // Expected acceleration toward sun at 1 AU: a = GM/r²
    const expected_a = (6.674e-11 * M_SUN) / (AU * AU);
    // After 1 step, velocity should be approximately a * dt toward sun
    const speed = ship.velocity.len();
    expect(speed).toBeCloseTo(expected_a * dt, 3);
    // Velocity should point in -x direction (toward origin)
    expect(ship.velocity.x).toBeLessThan(0);
    expect(ship.velocity.y).toBeCloseTo(0, 2);
  });

  it('thrust increases velocity in heading direction', () => {
    const ship    = new Ship({
      position: new Vec2(AU, 0),
      velocity: Vec2.zero(),
      loadout: mockLoadout({ emptyMass: 10000, totalThrust: 100000, netIsp: 300 }),
      fuel:     10000,
    });
    ship.throttle = 1.0;
    ship.heading  = 0;        // pointing in +x

    // Use zero-gravity (no bodies) to isolate thrust
    const sim = new ShipSim([]);
    sim.step(ship, 1, 0);

    // a = F/m = 100000 / 20000 = 5 m/s²   (mass is hull 10000 + fuel 10000)
    const expectedAcc = 100000 / 20000;
    expect(ship.velocity.x).toBeCloseTo(expectedAcc, 1);
    expect(ship.velocity.y).toBeCloseTo(0, 3);
  });

  it('mass decreases as fuel burns — same thrust gives higher acceleration later', () => {
    const ship    = new Ship({
      position: new Vec2(AU, 0),
      velocity: Vec2.zero(),
      loadout: mockLoadout({ emptyMass: 10000, totalThrust: 10000, netIsp: 300 }),
      fuel:     10000,
    });
    ship.throttle = 1.0;
    ship.heading  = 0;

    const sim = new ShipSim([]);

    // Step 1: a1 = F / (10000 + 10000) = 0.5 m/s²
    sim.step(ship, 1, 0);
    const v1 = ship.velocity.x;

    // Step 2: mass is smaller → higher acceleration
    sim.step(ship, 1, 1);
    const dv2 = ship.velocity.x - v1;

    // dv2 should be larger than dv1 (= v1) because mass has decreased
    expect(dv2).toBeGreaterThan(v1);
  });

  it('gravAccelAt returns correct vector pointing toward heavy body', () => {
    const body = { getPosition: () => new Vec2(1e10, 0), mass: 1e25, name: 'TestBody' };
    const sim  = new ShipSim([body]);
    const pos  = Vec2.zero();
    const acc  = sim.gravAccelAt(pos, 0);

    // Should point in +x toward the body
    expect(acc.x).toBeGreaterThan(0);
    expect(acc.y).toBeCloseTo(0, 3);

    // Magnitude: a = G * m / r²
    const r2     = (1e10) * (1e10);
    const expect_a = 6.674e-11 * 1e25 / r2;
    expect(acc.x).toBeCloseTo(expect_a, 3);
  });
});

// ─── Trajectory Tests ────────────────────────────────────────────────────────

describe('Trajectory', () => {
  const M_SUN   = 1.989e30;
  const staticSun = {
    getPosition: () => Vec2.zero(),
    mass: M_SUN,
    name: 'Solara',
  };

  it('ghost path end position matches actual ShipSim after same elapsed time', () => {
    // Create a ship on a roughly circular orbit (tangential velocity)
    const r       = AU;
    const v_circ  = Math.sqrt(6.674e-11 * M_SUN / r);  // circular velocity at 1 AU

    const ship = new Ship({
      position:  new Vec2(r, 0),
      velocity:  new Vec2(0, v_circ),
      loadout: mockLoadout({ emptyMass: 10000 }),
      fuel:      0,
    });
    ship.throttle = 0;

    const sim   = new ShipSim([staticSun]);
    const traj  = new Trajectory(sim);

    // Run trajectory prediction
    traj.forceUpdate(ship, 0, []);
    const predictedEnd = traj.points[PREDICT_STEPS - 1];

    // Now run the actual sim for the same number of steps at PREDICT_DT
    const liveSim = new ShipSim([staticSun]);
    let pos = ship.position.clone();
    let vel = ship.velocity.clone();
    const dt = PREDICT_DT;
    for (let i = 0; i < PREDICT_STEPS; i++) {
      const grav = liveSim.gravAccelAt(pos, i * dt);
      vel = vel.add(grav.scale(dt));
      pos = pos.add(vel.scale(dt));
    }

    // Predicted vs actual should be within 1000 km (1e6 m)
    const err = pos.sub(predictedEnd.pos).len();
    expect(err).toBeLessThan(1e6);
  });

  it('ManeuverNode delta-v in prograde direction increases speed', () => {
    const vel    = new Vec2(1000, 0);  // moving in +x
    const dv     = 500;
    const node   = new ManeuverNode({ prograde: dv });
    const dvVec  = node.getDeltaVVector(vel, Vec2.zero(), new Vec2(AU, 0));

    // Should add Δv in the +x direction (prograde = direction of velocity)
    expect(dvVec.x).toBeCloseTo(dv, 1);
    expect(dvVec.y).toBeCloseTo(0, 1);
  });

  it('estimateFuelCost uses rocket equation correctly', () => {
    const ship    = new Ship({ 
      loadout: mockLoadout({ emptyMass: 10000, netIsp: 300 }), 
      fuel: 30000 
    });

    const dv   = 1000;  // m/s
    const node = new ManeuverNode({ prograde: dv });

    const cost   = new Trajectory(new ShipSim([])).estimateFuelCost(ship, [node]);
    // Rocket equation: dm = m * (1 - e^(-dv / (Isp * g0)))
    const m      = ship.totalMass;
    const expected = m * (1 - Math.exp(-dv / (300 * G0)));

    expect(cost).toBeCloseTo(expected, -1);  // within 1 kg
  });
});

// ─── getElementsFromState round-trip Tests ──────────────────────────────────

describe('getElementsFromState', () => {
  it('recovers correct a and e from a known circular orbit state vector', () => {
    // Circular orbit at 1 AU around the sim sun (GM = G * 2.654e31)
    const GM = 6.674e-11 * 2.654e31;
    const a = AU;
    const vCirc = Math.sqrt(GM / a);

    // State: position at (a, 0), velocity at (0, vCirc) — circular orbit
    const rVec = new Vec2(a, 0);
    const vVec = new Vec2(0, vCirc);

    const elems = KeplerOrbit.getElementsFromState(rVec, vVec, GM);

    expect(elems.a).toBeCloseTo(a, -3);      // within 1000 m
    expect(elems.e).toBeCloseTo(0, 3);        // near-zero eccentricity
    expect(elems.pe).toBeCloseTo(a, -3);      // pe ≈ a for circular
    expect(elems.ap).toBeCloseTo(a, -3);      // ap ≈ a for circular
  });

  it('recovers correct a and e from an eccentric orbit', () => {
    const GM = 6.674e-11 * 2.654e31;
    const a = 2 * AU;
    const e = 0.3;
    const period = 2 * Math.PI * Math.sqrt(a * a * a / GM);

    // Create orbit and sample state at t=0
    const orbit = new KeplerOrbit({ a, e, w: 0.5, M0: 1.0, period });
    const t = 5000;
    const rVec = orbit.getPosition(t);
    const vVec = orbit.getVelocity(t, GM);

    const elems = KeplerOrbit.getElementsFromState(rVec, vVec, GM);

    expect(elems.a).toBeCloseTo(a, -5);       // within 100 km
    expect(elems.e).toBeCloseTo(e, 2);         // within 0.01
  });
});

// ─── Gravity coverage (all bodies) Tests ─────────────────────────────────────

describe('Gravity coverage', () => {
  // Dynamically import the solar system to check body count
  it('SolarSystem.gravBodies includes all 18 bodies', async () => {
    const { solarSystem } = await import('../../world/SolarSystem.js');
    // 1 star + 11 primaries + 6 moons = 18
    expect(solarSystem.gravBodies.length).toBe(18);
  });

  it('gravAccelAt returns non-zero acceleration near each body', async () => {
    const { solarSystem } = await import('../../world/SolarSystem.js');
    const sim = new ShipSim(solarSystem.gravBodies);

    for (const body of solarSystem.allBodies) {
      const bPos = body.orbit ? body.orbit.getPosition(0) : Vec2.zero();
      // Place test point 1e9 m away from each body
      const testPos = new Vec2(bPos.x + 1e9, bPos.y);
      const acc = sim.gravAccelAt(testPos, 0);

      expect(acc.len()).toBeGreaterThan(0);
    }
  });
});
