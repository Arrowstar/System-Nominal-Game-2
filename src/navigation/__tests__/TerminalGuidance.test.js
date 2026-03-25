
import { describe, it, expect } from 'vitest';
import { AutopilotManager, AP_STATE } from '../AutopilotManager.js';
import { Vec2 } from '../../core/Vec2.js';

class MockSolarSystem {
    constructor() {
        this.solara = { mass: 2e30 };
        this.allBodies = [];
        this.gravBodies = [];
    }
    getPosition(body, t) { return body.position || new Vec2(0,0); }
    getVelocity(body, t) { return body.velocity || Vec2.zero(); }
}

describe('Terminal Guidance (Energy/Eccentricity Control)', () => {
    it('should converge to a circular orbit from high altitude without plunging', () => {
        const system = new MockSolarSystem();
        const planet = {
            name: 'Planet',
            mass: 6e24,
            radius: 6.4e6,
            position: new Vec2(0, 0),
            velocity: new Vec2(0, 0)
        };
        system.allBodies.push(planet);
        system.gravBodies.push(planet);
        
        const ap = new AutopilotManager(system);
        ap.targetBody = planet;
        ap.state = AP_STATE.TERMINAL;
        
        const targetRadius = planet.radius * 1.5;
        const mu = 6.674e-11 * planet.mass;
        const targetEnergy = -mu / (2 * targetRadius);

        // Start ship at 3x planet radius (high altitude)
        // Give it some initial tangential velocity so it's not a pure fall
        const ship = {
            position: new Vec2(planet.radius * 3, 0),
            velocity: new Vec2(0, 3000), // Some tangential speed
            totalMass: 1000,
            thrust: 5000, // 5 m/s^2 max accel
            fuel: 100000
        };

        let maxInwardVel = 0;
        
        // Sim for 48 hours (172800s)
        const dt = 5.0;
        for (let i = 0; i < 172800; i += dt) {
            ap.update(ship, dt, i);
            
            // Basic physics integration (Euler for test)
            const r = ship.position.len();
            const gravity = ship.position.norm().scale(-mu / (r * r));
            const thrust = new Vec2(0, 0);
            if (ship.throttle > 0) {
               const accel = ship.thrust * ship.throttle / ship.totalMass;
               thrust.setXY(Math.cos(ship.heading) * accel, Math.sin(ship.heading) * accel);
            }
            
            const aTotal = gravity.add(thrust);
            ship.velocity.addMut(aTotal.scale(dt));
            ship.position.addMut(ship.velocity.scale(dt));

            const radialVel = ship.velocity.dot(ship.position.norm());
            if (radialVel < maxInwardVel) maxInwardVel = radialVel;
        }

        const finalRadius = ship.position.len();
        const finalRelVel = ship.velocity.len();
        const finalEnergy = (finalRelVel * finalRelVel) / 2 - mu / finalRadius;
        const radialVel = ship.velocity.dot(ship.position.norm());

        // Verify:
        // 1. No "plunge" (inward velocity should remain reasonable, not hundreds of m/s)
        // With damping k_d=2.0 and energy control, it should capture smoothly.
        expect(maxInwardVel).toBeGreaterThan(-500); // Should not accelerate wildly toward core
        
        // 2. Convergence to 1.5R (approx 9.6e6 m)
        expect(finalRadius).toBeGreaterThan(targetRadius * 0.95);
        expect(finalRadius).toBeLessThan(targetRadius * 1.05);

        // 3. Energy convergence (within 5000 J/kg - tiny relative to 2e7)
        expect(finalEnergy).toBeCloseTo(targetEnergy, -4);

        // 4. Low radial velocity (circular orbit, within 100 m/s)
        expect(Math.abs(radialVel)).toBeLessThan(100);
    });

    it('should stabilize correctly from a low altitude (ascending)', () => {
        const system = new MockSolarSystem();
        const planet = {
            name: 'Planet',
            mass: 6e24,
            radius: 6.4e6,
            position: new Vec2(0, 0),
            velocity: new Vec2(0, 0)
        };
        system.allBodies.push(planet);
        system.gravBodies.push(planet);
        
        const ap = new AutopilotManager(system);
        ap.targetBody = planet;
        ap.state = AP_STATE.TERMINAL;
        
        const targetRadius = planet.radius * 1.5;
        const mu = 6.674e-11 * planet.mass;

        // Start ship at 1.1x planet radius (low altitude)
        const ship = {
            position: new Vec2(planet.radius * 1.1, 0),
            velocity: new Vec2(0, 8000), // High speed
            totalMass: 1000,
            thrust: 5000,
            fuel: 100000
        };

        const dt = 5.0;
        for (let i = 0; i < 172800; i += dt) {
            ap.update(ship, dt, i);
            const r = ship.position.len();
            const gravity = ship.position.norm().scale(-mu / (r * r));
            const thrust = new Vec2(Math.cos(ship.heading), Math.sin(ship.heading)).scale(ship.thrust * ship.throttle / ship.totalMass);
            ship.velocity.addMut(gravity.add(thrust).scale(dt));
            ship.position.addMut(ship.velocity.scale(dt));
        }

        const finalRadius = ship.position.len();
        expect(finalRadius).toBeGreaterThan(targetRadius * 0.98);
        expect(finalRadius).toBeLessThan(targetRadius * 1.02);
    });
});
