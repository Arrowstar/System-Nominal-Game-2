
import { describe, it, expect } from 'vitest';
import { TPBVPSolver } from '../TPBVPSolver.js';
import { Vec2 } from '../../core/Vec2.js';

// Mock Classes
class MockBody {
    constructor(pos, vel, mass, name) {
        this.position = pos;
        this.velocity = vel;
        this.mass = mass;
        this.name = name;
        this.radius = 1000;
        // Add minimal orbit interface if needed
        this.orbit = null; 
    }
}

class MockSolarSystem {
    constructor() {
        this.gravBodies = [];
    }
    getPosition(body, t) { return body.position; }
    getVelocity(body, t) { return body.velocity; }
}

class MockShip {
    constructor(pos, vel, mass, thrust, isp) {
        this.position = pos;
        this.velocity = vel;
        this.totalMass = mass;
        this.thrust = thrust;
        this.isp = isp;
        this.throttle = 0;
        this.heading = 0;
    }
}

describe('TPBVP Solver', () => {
    it('should converge on a simple field-free transfer', () => {
        const system = new MockSolarSystem();
        const sun = new MockBody(new Vec2(0,0), new Vec2(0,0), 1.989e30, "Sun");
        // Don't add sun to gravBodies to simulate field-free for this test
        // system.gravBodies.push(sun); 
        
        const solver = new TPBVPSolver(system);
        
        // Start at x=0, Target at x=10000 m
        // V=0 to V=0 (Rendezvous)
        // Time = 100s
        // Dist = 10,000 m. Avg Speed = 100 m/s.
        // Accel required? 
        // 0 to 50s: Accel +a. 50 to 100s: Accel -a.
        // Dist = 2 * (0.5 * a * t^2) = a * 50^2 = 2500a
        // 10000 = 2500a => a = 4 m/s^2.
        // Ship Max Accel = 1000 N / 1000 kg = 1 m/s^2.
        // Wait, 4 m/s^2 > 1 m/s^2.
        // This transfer is impossible in 100s with 1 m/s^2.
        // Max dist in 100s with 1 m/s^2 (Bang-Bang):
        // 0-50s: x = 0.5 * 1 * 2500 = 1250.
        // 50-100s: x = 1250 + 50*50 - 0.5*1*2500 = 1250 + 2500 - 1250 = 2500m.
        // So 10,000m is unreachable.
        // Solver should struggle or fail to converge error, OR clamp.
        // With clamping, it will just max out thrust and miss.
        
        // Let's set a reachable target. 2000m.
        // a = 2000 / 2500 = 0.8 m/s^2. < 1.0. Reachable.
        
        const ship = new MockShip(new Vec2(0,0), new Vec2(0,0), 1000, 1000, 2000); // 1 m/s^2 max
        const target = new MockBody(new Vec2(2000, 0), new Vec2(0,0), 1, "Target");
        
        const res = solver.solve(ship, target, 0, 100);
        
        expect(res.converged).toBe(true);
        expect(res.error).toBeLessThan(100.0);
        
        // Check midpoint velocity (should be around 50 * 0.8 = 40 m/s)
        const mid = res.path[Math.floor(res.path.length/2)];
        expect(mid.vel.x).toBeGreaterThan(20);
        expect(mid.vel.x).toBeLessThan(50);
    });

    it('should converge on a gravity-well transfer', () => {
        const system = new MockSolarSystem();
        const sun = new MockBody(new Vec2(0,0), new Vec2(0,0), 1e16, "Sun"); // Weak sun
        system.gravBodies.push(sun);
        
        const solver = new TPBVPSolver(system);
        
        // Short hop near sun
        const ship = new MockShip(new Vec2(10000,0), new Vec2(0,10), 1000, 1000, 2000);
        const target = new MockBody(new Vec2(12000, 2000), new Vec2(0,10), 1, "Target");
        
        const res = solver.solve(ship, target, 0, 100);
        expect(res.converged).toBe(true);
    });
});
