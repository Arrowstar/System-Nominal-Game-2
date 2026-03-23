import { Projectile, Torpedo } from './Projectile.js';
import { Vec2 } from '../core/Vec2.js';

/**
 * WeaponSystem.js — Component-driven weapon manager.
 *
 * Reads equipped Weapon components from ship.loadout and provides:
 *   - A list of available weapons with per-weapon cooldowns
 *   - A selected-weapon index (cycled with Q key)
 *   - fireSelected(leadPos, target) to fire the current weapon
 *   - Handles kinetic projectiles, energy hitscan, and guided missiles
 *   - Burst-fire and turret support
 */

export class WeaponSystem {
  constructor(ship) {
    this.ship = ship;
    this.projectiles = [];
    this.torpedoes = [];

    // Per-weapon cooldown map keyed by component id
    this.cooldowns = {};

    // Burst-fire queue: array of { weaponDef, leadPos, target, remaining, timer }
    this._burstQueue = [];

    // Selected weapon index (into getWeapons() array)
    this.selectedIndex = 0;

    // Visual feedback
    this.muzzleFlash = 0;       // timer (seconds remaining)
    this.laserFlash = null;     // { from, to, timer } for energy beam
  }

  /** Get array of equipped Weapon components from loadout. */
  getWeapons() {
    if (!this.ship.loadout) return [];
    return this.ship.loadout.components.filter(c => c.type === 'Weapon');
  }

  /** Currently selected weapon definition, or null. */
  getSelectedWeapon() {
    const weapons = this.getWeapons();
    if (weapons.length === 0) return null;
    // Clamp index
    if (this.selectedIndex >= weapons.length) this.selectedIndex = 0;
    return weapons[this.selectedIndex];
  }

  /** Cycle to the next equipped weapon. */
  cycleWeapon() {
    const weapons = this.getWeapons();
    if (weapons.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % weapons.length;
  }

  /** Cycle to the previous equipped weapon. */
  cycleWeaponReverse() {
    const weapons = this.getWeapons();
    if (weapons.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + weapons.length) % weapons.length;
  }

  update(dt, simTime, system) {
    // Cooldown ticking
    for (const id in this.cooldowns) {
      if (this.cooldowns[id] > 0) this.cooldowns[id] -= dt;
    }

    // Projectile updates
    this.projectiles.forEach(p => p.update(dt));
    this.projectiles = this.projectiles.filter(p => p.active);

    this.torpedoes.forEach(t => t.update(dt, simTime, system));
    this.torpedoes = this.torpedoes.filter(t => t.active);

    // Burst queue processing
    for (let i = this._burstQueue.length - 1; i >= 0; i--) {
      const burst = this._burstQueue[i];
      burst.timer -= dt;
      if (burst.timer <= 0 && burst.remaining > 0) {
        this._fireSingle(burst.weaponDef, burst.leadPos, burst.target);
        burst.remaining--;
        burst.timer = burst.weaponDef.burstDelay || 0;
      }
      if (burst.remaining <= 0) {
        this._burstQueue.splice(i, 1);
      }
    }

    // Decay visual timers
    if (this.muzzleFlash > 0) this.muzzleFlash -= dt;
    if (this.laserFlash) {
      this.laserFlash.timer -= dt;
      if (this.laserFlash.timer <= 0) this.laserFlash = null;
    }
  }

  /**
   * Fire the currently selected weapon.
   * @param {Vec2|null} leadPos  Lead indicator position for aiming
   * @param {object|null} target Locked target (for guided weapons)
   * @returns {object|null}
   */
  fireSelected(leadPos, target) {
    const def = this.getSelectedWeapon();
    if (!def) return null;
    return this.fireWeapon(def, leadPos, target);
  }

  /**
   * Fire a specific weapon by definition.
   * @param {object} def       Weapon component definition
   * @param {Vec2|null} leadPos Lead indicator position
   * @param {object|null} target Locked target for guided
   * @returns {object|null}
   */
  fireWeapon(def, leadPos, target) {
    // Check cooldown
    if ((this.cooldowns[def.id] || 0) > 0) return null;

    // Check power
    if (def.powerDraw && this.ship.power < def.powerDraw) return null;

    // Guided weapons require a locked target
    if (def.guided && !target) return null;

    // Start cooldown
    this.cooldowns[def.id] = def.coolingTime;

    // Consume power
    if (def.powerDraw) this.ship.power -= def.powerDraw;

    // Generate heat
    this.ship.heat += def.heat || 0;

    // Handle burst fire
    if (def.burstCount > 1) {
      // Fire first shot immediately
      this._fireSingle(def, leadPos, target);
      // Queue remaining
      this._burstQueue.push({
        weaponDef: def,
        leadPos,
        target,
        remaining: def.burstCount - 1,
        timer: def.burstDelay || 0
      });
      return { burst: true, count: def.burstCount };
    }

    return this._fireSingle(def, leadPos, target);
  }

  /**
   * Fire a single shot/beam/missile for the given weapon definition.
   */
  _fireSingle(def, leadPos, target) {
    if (def.guided) {
      return this._fireMissile(def, target);
    } else if (def.speed === Infinity) {
      return this._fireHitscan(def, leadPos, target);
    } else {
      return this._fireKinetic(def, leadPos);
    }
  }

  /**
   * Fire a kinetic projectile (autocannon, flak, railgun, etc).
   */
  _fireKinetic(def, leadPos) {
    let fireAngle = this.ship.heading;

    if (def.turret && leadPos) {
      // Turret: fire directly at lead position, any angle
      const toLead = leadPos.sub(this.ship.position);
      fireAngle = Math.atan2(toLead.y, toLead.x);
    } else if (leadPos && def.gimbalAngle > 0) {
      // Gimballed: auto-aim within cone
      const toLead = leadPos.sub(this.ship.position);
      const leadAngle = Math.atan2(toLead.y, toLead.x);

      let angleDiff = leadAngle - fireAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const gimbalRad = def.gimbalAngle * Math.PI / 180;
      if (Math.abs(angleDiff) <= gimbalRad) {
        fireAngle = leadAngle;
      }
    }

    const dir = Vec2.fromAngle(fireAngle, 1);
    const vel = this.ship.velocity.add(dir.scale(def.speed));
    const lifeTime = def.range / def.speed;
    const p = new Projectile(this.ship.position, vel, def.damage, lifeTime, def.proxRadius);
    this.projectiles.push(p);
    this.muzzleFlash = 0.08;
    return p;
  }

  /**
   * Fire a hitscan energy weapon (laser, beam, lance).
   */
  _fireHitscan(def, leadPos, target) {
    let hitTarget = null;
    let fireAngle = this.ship.heading;

    // Determine aim direction
    if (def.turret && leadPos) {
      const toLead = leadPos.sub(this.ship.position);
      fireAngle = Math.atan2(toLead.y, toLead.x);
    } else if (leadPos && def.gimbalAngle > 0) {
      const toLead = leadPos.sub(this.ship.position);
      const leadAngle = Math.atan2(toLead.y, toLead.x);

      let angleDiff = leadAngle - fireAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const gimbalRad = def.gimbalAngle * Math.PI / 180;
      if (Math.abs(angleDiff) <= gimbalRad) {
        fireAngle = leadAngle;
      }
    }

    // Compute beam endpoint
    const dir = Vec2.fromAngle(fireAngle, 1);
    const beamEnd = this.ship.position.add(dir.scale(def.range));

    this.laserFlash = { from: this.ship.position.clone(), to: beamEnd, timer: 0.15 };

    // Check if target is in range and roughly in line
    if (target && target.position) {
      const dist = this.ship.position.dist(target.position);
      if (dist < def.range) {
        if (target.takeDamage) target.takeDamage(def.damage);
        hitTarget = target;
        this.laserFlash.to = target.position.clone();
      }
    }

    return { hit: !!hitTarget, target: hitTarget };
  }

  /**
   * Fire a guided missile/torpedo.
   */
  _fireMissile(def, target) {
    if (!target) return null;
    const dir = Vec2.fromAngle(this.ship.heading, 1);
    const vel = this.ship.velocity.add(dir.scale(def.speed));
    const lifeTime = def.range / def.speed;
    const t = new Torpedo(this.ship.position, vel, target, def.damage, lifeTime, def.proxRadius);
    this.torpedoes.push(t);
    this.muzzleFlash = 0.15;
    return t;
  }
}
