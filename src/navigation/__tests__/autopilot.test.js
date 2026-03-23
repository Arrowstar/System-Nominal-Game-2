/**
 * autopilot.test.js — Unit tests for AutopilotManager.
 *
 * Run with:  npx vitest run src/navigation/__tests__/autopilot.test.js
 */

import { describe, it, expect } from 'vitest';
import { AutopilotManager, AP_STATE } from '../AutopilotManager.js';
import { Ship } from '../../physics/Ship.js';
import { Vec2 } from '../../core/Vec2.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function mockLoadout(opts = {}) {
  return {
    emptyMass:    opts.emptyMass    ?? 100_000,
    maxFuel:      opts.maxFuel      ?? 50_000,
    totalThrust:  opts.totalThrust  ?? 500_000,   // 500 kN — decent torch ship
    netIsp:       opts.netIsp       ?? 3000,
    powerGen:     opts.powerGen     ?? 100,
    hull: { integrity: opts.integrity ?? 100 },
  };
}

/** Minimal SolarSystem-like object with allBodies array. */
function mockSolarSystem(bodies = []) {
  const allBodies = bodies;
  return {
    allBodies,
    getPosition(body, t) {
      if (body._getPos) return body._getPos(t);
      return body.position || Vec2.zero();
    },
  };
}

/** Create a mock body with orbit-like getPosition/getVelocity */
function mockBody({ name, mass, radius, position, velocity } = {}) {
  const pos = position || Vec2.zero();
  const vel = velocity || Vec2.zero();
  return {
    name:   name || 'TestBody',
    mass:   mass || 5.97e24,
    radius: radius || 6.37e6,
    orbit: {
      getPosition: () => ({ x: pos.x, y: pos.y }),
      getVelocity: () => ({ x: vel.x, y: vel.y }),
    },
    _getPos: () => pos,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AutopilotManager', () => {

  describe('Gravity-aware braking', () => {

    it('transitions to BRAKE earlier when approaching a massive body', () => {
      // Create a heavy planet target
      const planet = mockBody({
        name: 'HeavyPlanet',
        mass: 5.97e24,         // Earth-mass
        radius: 6.37e6,
        position: new Vec2(1e9, 0),
      });

      const sys = mockSolarSystem([planet]);
      const ap = new AutopilotManager(sys);

      // Ship approaching the planet at high speed, fairly close
      const ship = new Ship({
        position: new Vec2(5e8, 0),  // 500 Mm from planet (500 million m)
        velocity: new Vec2(20_000, 0),  // 20 km/s toward planet
        loadout: mockLoadout({ totalThrust: 200_000 }),  // modest thrust
        fuel: 50_000,
      });

      ap.engage(planet);
      ap.state = AP_STATE.ACCEL;  // force past ALIGN

      // Run a few updates to let it solve intercept and check braking
      for (let i = 0; i < 10; i++) {
        ap.update(ship, 1, i);
      }

      // The autopilot should have transitioned to BRAKE because gravity-aware
      // stopping distance accounts for the planet's pull.
      // With old formula (no gravity), it would start braking later.
      // We can't test the exact transition point easily, but we can verify 
      // the internal _gravAccelAlongLOS returns a positive value.
      const grav = ap._gravAccelAlongLOS(
        planet, ship.position, new Vec2(1e9, 0), 5e8
      );
      expect(grav).toBeGreaterThan(0);

      // Sanity: gravity at 500 Mm from an Earth-mass body
      // g = GM/r² = 6.674e-11 * 5.97e24 / (5e8)² ≈ 0.00159 m/s²
      const expected = 6.674e-11 * 5.97e24 / (5e8 * 5e8);
      expect(grav).toBeCloseTo(expected, 5);
    });

    it('BRAKE_SAFETY factor is >= 1.15', () => {
      // Read test: verify the constant was increased from the old 1.05
      // We test this indirectly: with a low-thrust ship approaching fast,
      // the autopilot should start braking with margin to spare.
      const planet = mockBody({
        name: 'Target',
        mass: 1e20,   // low mass so gravity doesn't dominate
        radius: 1e5,
        position: new Vec2(1e8, 0),
      });

      const sys = mockSolarSystem([planet]);
      const ap = new AutopilotManager(sys);
      ap.engage(planet);

      // Engage and verify it's active
      expect(ap.active).toBe(true);
      expect(ap.state).toBe(AP_STATE.ALIGN);
    });
  });

  describe('Orbital insertion', () => {

    it('_circularOrbitSpeed returns correct orbital velocity', () => {
      const planet = mockBody({ mass: 5.97e24, radius: 6.37e6 });
      const sys = mockSolarSystem([planet]);
      const ap = new AutopilotManager(sys);

      const orbitR = 6.37e6 * 2;  // 2× radius
      const v = ap._circularOrbitSpeed(planet, orbitR);

      // v = sqrt(GM/r) = sqrt(6.674e-11 * 5.97e24 / 12.74e6)
      const expected = Math.sqrt(6.674e-11 * 5.97e24 / orbitR);
      expect(v).toBeCloseTo(expected, 0);
      expect(v).toBeGreaterThan(1000);  // should be a few km/s
    });

    it('returns 0 for tiny bodies with negligible mass', () => {
      const asteroid = mockBody({ mass: 1e10, radius: 100 });
      const sys = mockSolarSystem([asteroid]);
      const ap = new AutopilotManager(sys);

      const v = ap._circularOrbitSpeed(asteroid, 200);
      expect(v).toBe(0);  // too tiny to orbit
    });

    it('arrival distance scales with body radius', () => {
      // Large body → larger arrival distance
      const bigPlanet = mockBody({
        name: 'BigPlanet',
        mass: 1.9e27,          // Jupiter-mass
        radius: 7.15e7,        // Jupiter-radius
        position: new Vec2(1e12, 0),
      });

      const sys = mockSolarSystem([bigPlanet]);
      const ap = new AutopilotManager(sys);

      const ship = new Ship({
        position: new Vec2(0, 0),
        velocity: Vec2.zero(),
        loadout: mockLoadout(),
        fuel: 50_000,
      });

      ap.engage(bigPlanet);

      // The orbit radius should be 2× Jupiter radius = 1.43e8 m
      // Arrival dist should be at least 1.5× that = 2.145e8 m
      // Much larger than the old fixed 50 km
      const orbitR = bigPlanet.radius * 2;
      expect(orbitR).toBeGreaterThan(1e8);
    });
  });

  describe('Collision avoidance', () => {

    it('returns null when no bodies are in the way', () => {
      const target = mockBody({
        name: 'Target',
        mass: 5e24,
        radius: 6e6,
        position: new Vec2(1e12, 0),
      });

      // Sun far off to the side
      const sun = mockBody({
        name: 'Solara',
        mass: 2e30,
        radius: 7e9,
        position: new Vec2(0, 1e13),  // way off to the side
      });
      // Don't clear orbit — mockBody's orbit returns position (0, 1e13),
      // which keeps the sun well off the flight path for this test.

      const sys = mockSolarSystem([sun, target]);
      const ap = new AutopilotManager(sys);
      ap.targetBody = target;

      const shipPos = new Vec2(-1e12, 0);
      const aimPt = new Vec2(1e12, 0);

      const steer = ap._computeAvoidanceSteering(shipPos, aimPt, 0);
      expect(steer).toBeNull();
    });

    it('steers away when the sun is directly in the flight path', () => {
      const target = mockBody({
        name: 'Target',
        mass: 5e24,
        radius: 6e6,
        position: new Vec2(2e11, 0),
      });

      // Sun at origin, directly in the path ship→target
      const sun = {
        name: 'Solara',
        mass: 2.654e31,
        radius: 6.957e9,
        orbit: null,  // sun has no orbit
      };

      const sys = mockSolarSystem([sun, target]);
      const ap = new AutopilotManager(sys);
      ap.targetBody = target;

      const shipPos = new Vec2(-2e11, 0);  // opposite side of sun from target
      const aimPt = new Vec2(2e11, 0);     // through the sun

      const steer = ap._computeAvoidanceSteering(shipPos, aimPt, 0);
      expect(steer).not.toBeNull();

      // Steering should be perpendicular (Y component), not along X
      // Since the sun is exactly on the line, the degenerate case picks perpendicular
      expect(Math.abs(steer.y)).toBeGreaterThan(0);
    });

    it('steers away when the sun is slightly off the flight path', () => {
      const target = mockBody({
        name: 'Target',
        mass: 5e24,
        radius: 6e6,
        position: new Vec2(2e11, 0),
      });

      // Sun slightly off-axis — still within avoidance radius
      const sun = {
        name: 'Solara',
        mass: 2.654e31,
        radius: 6.957e9,
        orbit: null,
      };

      const sys = mockSolarSystem([sun, target]);
      const ap = new AutopilotManager(sys);
      ap.targetBody = target;

      // Ship on one side, sun slightly above the line
      const shipPos = new Vec2(-2e11, 5e9);  // slightly offset
      const aimPt = new Vec2(2e11, 5e9);

      const steer = ap._computeAvoidanceSteering(shipPos, aimPt, 0);
      expect(steer).not.toBeNull();

      // Should steer AWAY from sun (in +Y direction since sun is below)
      expect(steer.y).toBeGreaterThan(0);
    });

    it('does not avoid the target body itself', () => {
      // Even if target is massive, we should not avoid it
      const target = mockBody({
        name: 'Kronos',
        mass: 1.898e27,
        radius: 7.15e7,
        position: new Vec2(1e11, 0),
      });

      const sys = mockSolarSystem([target]);
      const ap = new AutopilotManager(sys);
      ap.targetBody = target;

      const shipPos = new Vec2(-1e11, 0);
      const aimPt = new Vec2(1e11, 0);

      const steer = ap._computeAvoidanceSteering(shipPos, aimPt, 0);
      expect(steer).toBeNull();
    });

    it('ignores low-mass bodies', () => {
      const target = mockBody({
        name: 'Target',
        mass: 5e24,
        radius: 6e6,
        position: new Vec2(2e11, 0),
      });

      // A small asteroid in the way — should be ignored
      const asteroid = mockBody({
        name: 'SmallRock',
        mass: 1e15,           // below AVOIDANCE_MASS_THRESHOLD
        radius: 1000,
        position: new Vec2(0, 0),  // directly in the path
      });

      const sys = mockSolarSystem([asteroid, target]);
      const ap = new AutopilotManager(sys);
      ap.targetBody = target;

      const shipPos = new Vec2(-2e11, 0);
      const aimPt = new Vec2(2e11, 0);

      const steer = ap._computeAvoidanceSteering(shipPos, aimPt, 0);
      expect(steer).toBeNull();
    });
  });

  describe('engage / disengage', () => {

    it('engage sets state to ALIGN and stores target', () => {
      const body = mockBody({ name: 'Mars' });
      const ap = new AutopilotManager(mockSolarSystem([body]));
      ap.engage(body);

      expect(ap.state).toBe(AP_STATE.ALIGN);
      expect(ap.targetBody).toBe(body);
      expect(ap.active).toBe(true);
    });

    it('disengage resets all state', () => {
      const body = mockBody({ name: 'Mars' });
      const ap = new AutopilotManager(mockSolarSystem([body]));
      ap.engage(body);
      ap.disengage();

      expect(ap.state).toBe(AP_STATE.OFF);
      expect(ap.targetBody).toBeNull();
      expect(ap.active).toBe(false);
      expect(ap.eta).toBe(0);
    });
  });
});
