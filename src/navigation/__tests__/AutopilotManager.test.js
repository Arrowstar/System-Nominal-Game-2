
import { describe, it, expect, vi } from 'vitest';
import { AutopilotManager, AP_STATE } from '../AutopilotManager.js';
import { Vec2 } from '../../core/Vec2.js';

class MockSolarSystem {
    constructor() {
        this.solara = { mass: 2e30 };
        this.allBodies = [];
        this.gravBodies = [];
    }
    getPosition(body, t) { 
        return body.position || (body.orbit ? body.orbit.getPosition(t) : new Vec2(0,0)); 
    }
    getVelocity(body, t) {
        return body.velocity || (body.orbit ? body.orbit.getVelocity(t) : Vec2.zero());
    }
}

const mockOrbit = (a, parent = null) => ({
    a,
    parent,
    getPosition: () => new Vec2(a, 0),
    getVelocity: () => Vec2.zero()
});

describe('AutopilotManager Dynamic Handoff', () => {
    it('should calculate correct thresholds for a large planet', () => {
        const system = new MockSolarSystem();
        const planet = {
            name: 'Planet',
            mass: 6e24, // Earth-like
            radius: 6.4e6,
            orbit: mockOrbit(1.5e11, null) // Orbiting Sun
        };
        system.allBodies.push(planet);
        
        const ap = new AutopilotManager(system);
        ap.targetBody = planet;
        ap.flightTime = 100 * 86400; // 100 days
        
        const thresholds = ap._getDynamicHandoffThresholds(0);
        
        expect(thresholds.rHandoff).toBeGreaterThan(1e7);
        expect(thresholds.rHandoff).toBeLessThan(1e9);
        expect(thresholds.tHandoff).toBeGreaterThan(400000);
    });

    it('should calculate much smaller thresholds for a moon', () => {
        const system = new MockSolarSystem();
        const planet = { mass: 6e24, orbit: mockOrbit(1.5e11, null) };
        const moon = {
            name: 'Moon',
            mass: 7e22,
            radius: 1.7e6,
            orbit: mockOrbit(4e8, planet.orbit) // Orbiting Planet
        };
        system.allBodies.push(planet, moon);
        
        const ap = new AutopilotManager(system);
        ap.targetBody = moon;
        ap.flightTime = 2 * 86400; // 2 day transit to moon
        
        const thresholds = ap._getDynamicHandoffThresholds(0);
        
        expect(thresholds.rHandoff).toBeLessThan(1.28e8); 
        expect(thresholds.tHandoff).toBeLessThan(100000); 
    });

    it('should transition to TERMINAL when within dynamic thresholds', () => {
        const system = new MockSolarSystem();
        const planet = {
            name: 'Planet',
            mass: 6e24,
            radius: 6.4e6,
            orbit: mockOrbit(1.5e11, null)
        };
        system.allBodies.push(planet);
        
        const ap = new AutopilotManager(system);
        ap.targetBody = planet;
        ap.flightTime = 100 * 86400;
        ap.state = AP_STATE.STANDBY;
        ap.tArrival = ap.flightTime; // Initialize for test
        ap.costates = [0,0,0,0];
        
        const ship = { 
            position: new Vec2(1.5e11 + 5e8, 0), // Far away. Threshold is ~1.28e8.
            velocity: new Vec2(0,0),
            totalMass: 1000,
            thrust: 1000
        };
        
        // 1. Far away, plenty of time -> Should stay STANDBY (Preview)
        ap.update(ship, 1, 0); 
        expect(ap.state).toBe(AP_STATE.STANDBY);
        
        // Engage execution
        ap.execute();
        expect(ap.state).toBe(AP_STATE.OPTIMAL);
        
        // 2. Close enough (dist < rHandoff) but still high tGo (1 day)? 
        const simTimeFar = ap.flightTime - 86400; // 1 day out
        ship.position = new Vec2(1.5e11 + 1e8, 0); // Inside rHandoff
        ap.update(ship, 1, simTimeFar);
        expect(ap.state).toBe(AP_STATE.OPTIMAL); // Should stay OPTIMAL because 1 day > 1 hour
        
        // 3. Within BOTH (Now 1800s out)
        const simTimeNear = ap.flightTime - 1800; // 30 mins out
        ap.update(ship, 1, simTimeNear);
        expect(ap.state).toBe(AP_STATE.TERMINAL);
    });

    it('should trigger TERMINAL via safety net if tGo is extremely small', () => {
        const system = new MockSolarSystem();
        const planet = { 
            name: 'Planet', 
            mass: 6e24, 
            radius: 1e6, 
            orbit: mockOrbit(1e11, null) 
        };
        system.allBodies.push(planet);
        
        const ap = new AutopilotManager(system);
        ap.targetBody = planet;
        ap.flightTime = 1000;
        ap.state = AP_STATE.OPTIMAL; // Must be optimal for safety net to trigger handoff?
        // Actually, if it's OPTIMAL, it triggers TERMINAL.
        // If it's STANDBY, it doesn't trigger handoff (it's not burning anyway).
        ap.tArrival = 1000;
        ap.costates = [0,0,0,0];
        
        const ship = { 
            position: new Vec2(1e12, 0), 
            velocity: new Vec2(0,0), 
            totalMass: 1000, 
            thrust: 1000 
        };
        
        // tGo = 5s. dt = 1s. 10*dt = 10s.
        ap.update(ship, 1, 995); 
        expect(ap.state).toBe(AP_STATE.TERMINAL);
    });
});
