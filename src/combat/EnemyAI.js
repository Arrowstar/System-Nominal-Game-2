import { Vec2 } from '../core/Vec2.js';
import { WeaponSystem } from './Weapons.js';
import { AutopilotManager } from '../navigation/AutopilotManager.js';

export class EnemyAI {
  constructor(ship, behavior = 'PATROL') {
    this.ship = ship;
    this.state = behavior; // PATROL, ATTACK, FLEE, MERCHANT
    this.behavior = behavior;
    this.target = null;
    this.patrolPoint = ship.position.clone();
    this.weapons = new WeaponSystem(this.ship);
    this.active = true;
    
    // Merchant specific
    this.tradeRoute = null; // { sourceBody, destBody, destMarket, commodityId, amount }
  }

  setTradeRoute(route) {
      this.tradeRoute = route;
      this.behavior = 'MERCHANT';
      this.state = 'MERCHANT';
      // Assume merchant spawns with cargo
      this.ship.cargo = this.ship.cargo || {};
      this.ship.cargo[route.commodityId] = route.amount;
  }

  update(dt, simTime, playerShip, system) {
    this.weapons.update(dt, simTime, system);
    
    if (this.ship.destroyed) {
        this.active = false;
        return;
    }
    
    if (this.ship.disabled) {
        this.ship.throttle = 0; // ensure engines remain off
        return;
    }

    switch (this.state) {
      case 'PATROL':
        // If player is close, attack
        if (this.ship.position.distSq(playerShip.position) < 400000000 && !playerShip.destroyed) { // 20km
          this.target = playerShip;
          this.state = 'ATTACK';
        } else {
          this.ship.throttle = 0.1;
          if (this.ship.position.distSq(this.patrolPoint) > 2500000000) { // 50km
            const toPatrol = this.patrolPoint.sub(this.ship.position);
            this.ship.heading = Math.atan2(toPatrol.y, toPatrol.x);
          }
        }
        break;

      case 'ATTACK':
        if (!this.target || this.target.destroyed || this.ship.integrity < this.ship.maxIntegrity * 0.2) {
          this.state = 'FLEE';
          this.target = null;
          break;
        }

        const toTarget = this.target.position.sub(this.ship.position);
        const distSq = toTarget.lenSq();
        this.ship.heading = Math.atan2(toTarget.y, toTarget.x);
        
        if (distSq > 25000000) { // 5km
          this.ship.throttle = 1;
        } else {
          this.ship.throttle = 0.5;
          // Fire equipped weapon at player
          const selectedDef = this.weapons.getSelectedWeapon();
          if (selectedDef) {
            this.weapons.fireSelected(null, this.target);
          }
        }
        break;

      case 'FLEE':
        this.ship.throttle = 1;
        if (playerShip) {
            const away = this.ship.position.sub(playerShip.position);
            this.ship.heading = Math.atan2(away.y, away.x);
        } else if (this.behavior === 'MERCHANT') {
            this.state = 'MERCHANT'; // resume course
        }
        break;
        
      case 'MERCHANT':
        // Initialize autopilot if it doesn't exist yet
        if (!this.autopilot) {
            this.autopilot = new AutopilotManager(system);
        }

        if (this.tradeRoute) {
            const destBody = this.tradeRoute.destBody;
            const destPos = destBody.orbit ? destBody.orbit.getPosition(simTime) : new Vec2(0, 0);
            const distSqDest = this.ship.position.distSq(destPos);
            
            // Dock if autopilot has reached HOLD state (inserted into orbit) or if extremely close
            const isDocked = (this.autopilot.state === 'HOLD' && this.autopilot.targetBody === destBody) || distSqDest < 100000000;
            
            if (isDocked) {
                this.ship.throttle = 0;
                if (this.autopilot.active) this.autopilot.disengage();
                
                // Exchange goods
                const amount = this.ship.cargo[this.tradeRoute.commodityId] || 0;
                if (amount > 0 && this.tradeRoute.destMarket) {
                    this.tradeRoute.destMarket.addInventory(this.tradeRoute.commodityId, amount);
                    this.ship.cargo[this.tradeRoute.commodityId] = 0;
                    
                    // Fulfill order
                    if (this.tradeRoute.orderId && system.economy) {
                        system.economy.orderBoard.fulfillOrder(this.tradeRoute.orderId);
                    }
                }
                
                // Despawn ship once delivery is complete
                this.active = false; 
                this.ship.destroyed = true; 
                
            } else {
                // Use autopilot to navigate to destination
                if (!this.autopilot.active || this.autopilot.targetBody !== destBody) {
                    this.autopilot.engage(destBody);
                }
                // Autopilot takes over heading and throttle
                this.autopilot.update(this.ship, dt, simTime, null); // no timeWarp for NPCs
            }
        } else {
            this.state = 'PATROL'; // fallback
        }
        break;
    }
  }
}
