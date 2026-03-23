import { Vec2 } from '../core/Vec2.js';

export class PursuitAssist {
  constructor(ship, targeting) {
    this.ship = ship;
    this.targeting = targeting;
    this.active = false;
  }

  toggle() {
    if (this.targeting.hasTarget()) {
      this.active = !this.active;
    } else {
      this.active = false;
    }
  }

  update(dt, simTime, input) {
    if (!this.active || !this.targeting.hasTarget()) {
      this.active = false;
      return;
    }

    const tVel = this.targeting.getTargetVelocity(simTime);
    
    // Attempt to get a lead indicator using the default AutoCannon speed (10000)
    let projectileSpeed = 10000;
    if (this.ship.weapons && this.ship.weapons.weapons.AutoCannon) {
        projectileSpeed = this.ship.weapons.weapons.AutoCannon.speed;
    }
    const leadPos = this.targeting.getLeadIndicator(this.ship.position, this.ship.velocity, projectileSpeed, simTime);
    const tPos = leadPos || this.targeting.getTargetPosition(simTime);

    // Calculate the vector pointing from ship to target
    const toTarget = tPos.sub(this.ship.position);
    let forward;
    if (toTarget.lenSq() > 0.001) {
        forward = toTarget.norm();
    } else {
        forward = Vec2.fromAngle(this.ship.heading, 1);
    }
    const right = new Vec2(-forward.y, forward.x); // perpendicular for strafing

    // Base target velocity is target's orbital velocity
    // WASD adds relative desired velocity
    let desiredRelVel = Vec2.zero();
    let speed = 200; // desired relative speed in m/s

    if (input.isDown('KeyW') || input.isDown('ArrowUp')) {
      desiredRelVel.addMut(forward.scale(speed));
    }
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) {
      desiredRelVel.addMut(forward.scale(-speed));
    }
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) {
      desiredRelVel.addMut(right.scale(-speed));
    }
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) {
      desiredRelVel.addMut(right.scale(speed));
    }

    // desired velocity in world space
    const desiredWorldVel = tVel.add(desiredRelVel);
    
    // required delta v
    const dv = desiredWorldVel.sub(this.ship.velocity);

    if (dv.lenSq() > 1.0) {
      // Point towards dv
      this.ship.heading = Math.atan2(dv.y, dv.x);
      
      const accel = this.ship.currentAcceleration || (this.ship.thrust / this.ship.totalMass);
      if (accel > 0) {
          const requiredThrottle = dv.len() / (accel * dt);
          this.ship.throttle = Math.min(1, Math.max(0, requiredThrottle));
      } else {
          this.ship.throttle = 0;
      }
    } else {
      this.ship.throttle = 0;
      this.ship.heading = Math.atan2(forward.y, forward.x);
    }
  }
}
