import { Vec2 } from '../core/Vec2.js';

export class Projectile {
  constructor(position, velocity, damage, lifeTime, proxRadius = 0) {
    this.position = position.clone();
    this._prevPosition = position.clone();
    this.velocity = velocity.clone();
    this.damage = damage;
    this.lifeTime = lifeTime; // in seconds
    this.proxRadius = proxRadius;
    this.age = 0;
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    this._prevPosition = this.position.clone();
    this.position.addMut(this.velocity.scale(dt));
    this.age += dt;
    if (this.age > this.lifeTime) {
      this.active = false;
    }
  }

  getRenderPosition(alpha) {
    return this._prevPosition.lerp(this.position, alpha);
  }
}

export class Torpedo {
  constructor(position, velocity, target, damage, lifeTime, proxRadius = 0) {
    this.position = position.clone();
    this._prevPosition = position.clone();
    this.velocity = velocity.clone();
    this.target = target;
    this.damage = damage;
    this.lifeTime = lifeTime;
    this.proxRadius = proxRadius;
    this.age = 0;
    this.active = true;
    this.thrust = 5000000;
    this.heading = Math.atan2(velocity.y, velocity.x);
  }

  update(dt, simTime, system) {
    if (!this.active) return;
    this._prevPosition = this.position.clone();

    // F=ma intercept logic
    let targetPos = this.target.position;
    if (!targetPos && this.target.orbit) {
      targetPos = this.target.orbit.getPosition(simTime);
    }
    if (targetPos) {
      const toTarget = targetPos.sub(this.position);
      this.heading = Math.atan2(toTarget.y, toTarget.x);
      const thrustAccel = Vec2.fromAngle(this.heading, this.thrust);
      this.velocity.addMut(thrustAccel.scale(dt));
    }

    this.position.addMut(this.velocity.scale(dt));
    this.age += dt;
    if (this.age > this.lifeTime) {
      this.active = false;
    }
  }

  getRenderPosition(alpha) {
    return this._prevPosition.lerp(this.position, alpha);
  }
}
