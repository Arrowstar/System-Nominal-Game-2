import { describe, it, expect, vi } from 'vitest';
import { Vec2 } from '../../core/Vec2.js';
import { TargetingSystem } from '../../tactical/TargetingSystem.js';
import { WeaponSystem } from '../Weapons.js';
import { Projectile } from '../Projectile.js';
import { COMPONENTS } from '../../ship/Component.js';

// Helper: create a mock ship with a loadout containing specific weapon component IDs
function mockShipWithWeapons(weaponIds, opts = {}) {
  const weaponComponents = weaponIds.map(id => COMPONENTS[id]);
  return {
    position: opts.position || new Vec2(0, 0),
    velocity: opts.velocity || new Vec2(0, 0),
    heading: opts.heading || 0,
    heat: 0,
    power: opts.power || 200,
    loadout: {
      components: weaponComponents
    }
  };
}

describe('Combat Mechanics', () => {

  describe('TargetingSystem.getLeadIndicator', () => {
    it('should correctly calculate the first-order intercept point', () => {
      const targeting = new TargetingSystem({});
      
      targeting.lockedTarget = {
        position: new Vec2(1000, 0),
        velocity: new Vec2(0, 100)
      };

      targeting.getTargetPosition = () => targeting.lockedTarget.position;
      targeting.getTargetVelocity = () => targeting.lockedTarget.velocity;

      const shooterPos = new Vec2(0, 0);
      const shooterVel = new Vec2(0, 0);
      const projSpeed = 1000;
      
      const lead = targeting.getLeadIndicator(shooterPos, shooterVel, projSpeed, 0);

      expect(lead.x).toBeCloseTo(1000, 3);
      expect(lead.y).toBeCloseTo(100, 3);
    });
    
    it('should return null if there is no locked target', () => {
        const targeting = new TargetingSystem({});
        const lead = targeting.getLeadIndicator(new Vec2(0,0), new Vec2(0,0), 1000, 0);
        expect(lead).toBeNull();
    });
  });

  describe('Projectile', () => {
    it('should store proxRadius initialized from constructor', () => {
      const p = new Projectile(new Vec2(0, 0), new Vec2(10, 0), 10, 5, 400);
      expect(p.proxRadius).toBe(400);
    });
    it('should default proxRadius to 0', () => {
      const p = new Projectile(new Vec2(0, 0), new Vec2(10, 0), 10, 5);
      expect(p.proxRadius).toBe(0);
    });
  });

  describe('Component-Based Weapon System', () => {
    it('should read weapons from loadout', () => {
      const ship = mockShipWithWeapons(['WPN_S_AUTOCANNON', 'WPN_M_FLAK']);
      const ws = new WeaponSystem(ship);
      expect(ws.getWeapons().length).toBe(2);
      expect(ws.getWeapons()[0].id).toBe('WPN_S_AUTOCANNON');
      expect(ws.getWeapons()[1].id).toBe('WPN_M_FLAK');
    });

    it('should cycle through weapons', () => {
      const ship = mockShipWithWeapons(['WPN_S_AUTOCANNON', 'WPN_M_FLAK', 'WPN_S_PULSE_LASER']);
      const ws = new WeaponSystem(ship);
      expect(ws.getSelectedWeapon().id).toBe('WPN_S_AUTOCANNON');
      ws.cycleWeapon();
      expect(ws.getSelectedWeapon().id).toBe('WPN_M_FLAK');
      ws.cycleWeapon();
      expect(ws.getSelectedWeapon().id).toBe('WPN_S_PULSE_LASER');
      ws.cycleWeapon();
      expect(ws.getSelectedWeapon().id).toBe('WPN_S_AUTOCANNON'); // wraps
    });

    it('should fire kinetic weapon and create projectile', () => {
      const ship = mockShipWithWeapons(['WPN_S_AUTOCANNON']);
      const ws = new WeaponSystem(ship);
      const proj = ws.fireSelected(null, null);
      expect(proj).toBeDefined();
      expect(proj.damage).toBe(8);
      expect(ws.projectiles.length).toBe(1);
    });

    it('should respect gimbal angle', () => {
      const ship = mockShipWithWeapons(['WPN_S_AUTOCANNON']); // gimbalAngle: 15
      ship.heading = 0;
      const ws = new WeaponSystem(ship);

      // 10 degrees — within 15° gimbal
      const angle = 10 * Math.PI / 180;
      const leadPos = new Vec2(Math.cos(angle) * 1000, Math.sin(angle) * 1000);
      const proj = ws.fireSelected(leadPos, null);

      expect(proj).toBeDefined();
      const expectedSpeed = COMPONENTS.WPN_S_AUTOCANNON.speed;
      expect(proj.velocity.x).toBeCloseTo(Math.cos(angle) * expectedSpeed, 2);
      expect(proj.velocity.y).toBeCloseTo(Math.sin(angle) * expectedSpeed, 2);
    });

    it('should NOT gimbal beyond the gimbal angle', () => {
      const ship = mockShipWithWeapons(['WPN_S_AUTOCANNON']); // gimbalAngle: 15
      ship.heading = 0;
      const ws = new WeaponSystem(ship);

      // 20 degrees — outside 15° gimbal
      const angle = 20 * Math.PI / 180;
      const leadPos = new Vec2(Math.cos(angle) * 1000, Math.sin(angle) * 1000);
      const proj = ws.fireSelected(leadPos, null);

      // Should fire straight ahead
      const expectedSpeed = COMPONENTS.WPN_S_AUTOCANNON.speed;
      expect(proj.velocity.x).toBeCloseTo(expectedSpeed, 2);
      expect(proj.velocity.y).toBeCloseTo(0, 2);
    });

    it('should fire flak with proxRadius', () => {
      const ship = mockShipWithWeapons(['WPN_M_FLAK']);
      const ws = new WeaponSystem(ship);
      const proj = ws.fireSelected(null, null);
      expect(proj).toBeDefined();
      expect(proj.proxRadius).toBe(400);
      expect(proj.damage).toBe(20);
    });

    it('should enforce cooldowns', () => {
      const ship = mockShipWithWeapons(['WPN_S_AUTOCANNON']);
      const ws = new WeaponSystem(ship);
      const proj1 = ws.fireSelected(null, null);
      expect(proj1).toBeDefined();
      // Immediately fire again — should be on cooldown
      const proj2 = ws.fireSelected(null, null);
      expect(proj2).toBeNull();
    });

    it('should generate heat on fire', () => {
      const ship = mockShipWithWeapons(['WPN_S_AUTOCANNON']);
      const ws = new WeaponSystem(ship);
      expect(ship.heat).toBe(0);
      ws.fireSelected(null, null);
      expect(ship.heat).toBe(2); // WPN_S_AUTOCANNON heat = 2
    });

    it('should refuse to fire if power is insufficient for energy weapon', () => {
      const ship = mockShipWithWeapons(['WPN_S_PULSE_LASER']);
      ship.power = 5; // Pulse Laser requires 12
      const ws = new WeaponSystem(ship);
      const result = ws.fireSelected(null, null);
      expect(result).toBeNull();
    });

    it('should fire guided missile only when target is provided', () => {
      const ship = mockShipWithWeapons(['WPN_S_MICRO_MISSILE']);
      const ws = new WeaponSystem(ship);
      // No target — guided missiles require a target
      const result1 = ws.fireSelected(null, null);
      expect(result1).toBeNull();
      // With target — need orbit or position for torpedo tracking
      const mockTarget = { position: new Vec2(1000, 0), velocity: new Vec2(0, 0), orbit: null };
      const result2 = ws.fireSelected(null, mockTarget);
      expect(result2).toBeDefined();
      expect(ws.torpedoes.length).toBe(1);
    });

    it('turret weapon should fire at any angle', () => {
      const ship = mockShipWithWeapons(['WPN_S_PDC']); // turret: true, burstCount: 3
      ship.heading = 0; // facing right
      const ws = new WeaponSystem(ship);

      // Lead position is directly behind the ship (180 degrees)
      const leadPos = new Vec2(-1000, 0);
      const result = ws.fireSelected(leadPos, null);
      // PDC is burst fire, so result is { burst: true, count: 3 }
      expect(result).toBeDefined();
      // First shot should already be in projectiles
      expect(ws.projectiles.length).toBe(1);
      // That first projectile should be pointing left (negative x)
      expect(ws.projectiles[0].velocity.x).toBeLessThan(0);
    });
  });
});
