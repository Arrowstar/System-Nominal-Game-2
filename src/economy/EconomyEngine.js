import { Market } from './Market.js';
import { StationProduction } from './Production.js';
import { OrderBoard } from './OrderBoard.js';
import { COMMODITIES } from './Commodity.js';
import { Loadout } from '../ship/Loadout.js';
import { Ship } from '../physics/Ship.js';
import { HULLS } from '../ship/Hull.js';
import { EnemyAI } from '../combat/EnemyAI.js';
import { Vec2 } from '../core/Vec2.js';

const FREIGHTER_CONFIGS = [
    { hull: 'PONY',     components: ['ENG_S_TORCH', 'TANK_M_ARRAY'] },
    { hull: 'WAYFARER', components: ['ENG_M_TORCH', 'RX_S_FUSION', 'TANK_S_CELL', 'TANK_S_CELL'] },
    { hull: 'OX',       components: ['ENG_M_TORCH', 'RX_M_FUSION', 'TANK_S_CELL'] },
    { hull: 'CAMEL',    components: ['ENG_L_TORCH', 'RX_M_FUSION', 'TANK_M_ARRAY'] },
    { hull: 'MAMMOTH',  components: ['ENG_L_TORCH', 'TANK_L_BULK', 'RX_M_FUSION', 'TANK_S_CELL'] }
];

export class EconomyEngine {
    constructor(solarSystem) {
        this.solarSystem = solarSystem;
        this.solarSystem.economy = this; // Attach to global system for EnemyAI
        this.orderBoard = new OrderBoard();
        this.stations = [];
        this.nextSpawnTime = 0;
        this.nextOrderTime = 0;
        
        this.initEconomy();
    }
    
    initEconomy() {
        const stationMetas = this.solarSystem.getAllStations();
        
        for (const stationMeta of stationMetas) {
            const station = {
                name: stationMeta.name,
                type: stationMeta.type,
                body: stationMeta.body,
                outboundCount: 0
            };
            
            station.market = new Market(station);
            station.production = new StationProduction(station);
            
            if (stationMeta.body.produces) {
                for (const prodName of stationMeta.body.produces) {
                    const id = this.findCommodityId(prodName);
                    if (id) station.production.addSource(id, 0.05); 
                }
            }
            
            if (stationMeta.body.consumes) {
                for (const consName of stationMeta.body.consumes) {
                    const id = this.findCommodityId(consName);
                    if (id) station.production.addSink(id, 0.01); 
                }
            }
            
            switch (stationMeta.type) {
                case 'industrial':
                    station.production.addRecipe('SMELTING');
                    station.production.addRecipe('MACHINING');
                    break;
                case 'agricultural':
                    station.production.addRecipe('FOOD_PROCESSING');
                    station.production.addRecipe('PHARMACEUTICALS');
                    break;
                case 'refinery':
                    station.production.addRecipe('CHEMICAL_REFINING');
                    station.production.addRecipe('PLASTICS_SYNTHESIS');
                    break;
                case 'science':
                    station.production.addRecipe('PHARMACEUTICALS');
                    break;
                case 'military':
                    station.production.addRecipe('MACHINING');
                    break;
                case 'blackmarket':
                case 'contraband':
                    station.production.addRecipe('STIM_LAB');
                    break;
                case 'capital':
                    station.production.addRecipe('ELECTRONICS_FABRICATION');
                    station.production.addRecipe('LUXURY_ASSEMBLY');
                    break;
                case 'shipyard':
                    station.production.addRecipe('SHIP_COMPONENT_MANUFACTURING');
                    break;
            }
            
            // Now that rates are setup, add skewed inventories
            const p = station.production;
            const outputs = new Set();
            for (const r of p.activeRecipes) {
                for (const out of Object.keys(r.outputs)) outputs.add(out);
            }
            const sources = new Set(Object.keys(p.sources));

            for (const key of Object.keys(COMMODITIES)) {
                const commId = COMMODITIES[key].id;
                if (outputs.has(commId) || sources.has(commId)) {
                    station.market.addInventory(commId, 800); // Massive surplus
                }
            }
            
            if (!stationMeta.body.stationInstances) stationMeta.body.stationInstances = [];
            stationMeta.body.stationInstances.push(station);
            stationMeta.body.station = stationMeta.body.stationInstances[0]; // backward compatibility
            
            this.stations.push(station);
        }
        
        // Spawn orders IMMEDIATELY on boot
        this.postOrders(0);
    }
    
    findCommodityId(name) {
        for (const key of Object.keys(COMMODITIES)) {
            if (COMMODITIES[key].name === name) return COMMODITIES[key].id;
        }
        return null;
    }
    
    update(dt, simTime, npcShips) {
        for (const station of this.stations) {
            station.production.update(dt);
            station.market.update(dt);
        }

        // Cleanup destroyed NPCs and free station outbound slots
        for (let i = npcShips.length - 1; i >= 0; i--) {
            const ship = npcShips[i];
            // If ship is destroyed or AI is inactive (arrived), clean up
            if (ship.destroyed || (ship.ai && !ship.ai.active)) {
                if (ship.sourceStation) {
                    ship.sourceStation.outboundCount = Math.max(0, ship.sourceStation.outboundCount - 1);
                }
                npcShips.splice(i, 1);
            }
        }
        
        if (simTime > this.nextOrderTime) {
            this.nextOrderTime = simTime + 3600; // Hourly
            this.postOrders(simTime);
        }
        
        if (simTime > this.nextSpawnTime) {
            this.nextSpawnTime = simTime + 7200; // Every 2 hours
            this.processOrders(simTime, npcShips);
            this.orderBoard.cleanup();
        }
    }
    
    postOrders(simTime) {
        for (const station of this.stations) {
            const p = station.production;
            const inputs = p.getRequiredInputs();
            const outputs = p.getProducedOutputs();
            
            for (const id of inputs) {
                // Do not buy what we produce or source
                if (outputs.has(id)) continue;
                
                let inv = station.market.getInventory(id);
                // Factor in incoming goods from OPEN and ACCEPTED orders
                const pendingOrders = this.orderBoard.orders.filter(o => o.consumer === station && o.commodityId === id && o.status !== 'FULFILLED');
                for (const o of pendingOrders) {
                    inv += o.amount;
                }
                
                const cap = station.market.capacities[id];
                
                if (inv < cap * 0.3) {
                    const amountNeeded = Math.floor(cap * 0.5 - inv);
                    if (amountNeeded > 10) {
                        const price = station.market.getPrice(id);
                        this.orderBoard.createOrder(station, id, amountNeeded, price, simTime);
                    }
                }
            }
        }
    }
    
    processOrders(simTime, npcShips) {
        const openOrders = this.orderBoard.getOpenOrders();
        if (openOrders.length === 0) return;
        
        openOrders.sort((a, b) => b.priceOffered - a.priceOffered);
        
        for (const order of openOrders) {
            
            let bestProducer = null;
            let bestProfit = 0;
            
            // Randomly select a freighter configuration for variety
            const config = FREIGHTER_CONFIGS[Math.floor(Math.random() * FREIGHTER_CONFIGS.length)];
            const hull = HULLS[config.hull];
            if (!hull) continue;
            
            const shipCapacity = hull.cargoCap;

            for (const station of this.stations) {
                if (station === order.consumer) continue;
                
                const inv = station.market.getInventory(order.commodityId);
                const localPrice = station.market.getPrice(order.commodityId);
                
                if (inv >= 10 && localPrice < order.priceOffered) {
                    const profitPerUnit = order.priceOffered - localPrice;
                    if (profitPerUnit > bestProfit) {
                        bestProfit = profitPerUnit;
                        bestProducer = station;
                    }
                }
            }
            
            // Accept the order and spawn ship
            if (bestProducer) {
                // Traffic Control: Max outbound freighters per station
                if (bestProducer.outboundCount >= 5) continue;

                const localPrice = bestProducer.market.getPrice(order.commodityId);
                const profitPerUnit = order.priceOffered - localPrice;
                
                // Profit Probability: 5% base + 1% per 2 credits of profit (1.0 chance at 190 profit)
                const spawnChance = 0.05 + (profitPerUnit / 200.0);
                if (Math.random() > spawnChance) continue;

                const inv = bestProducer.market.getInventory(order.commodityId);
                // Ship as much as we can: limited by order amount, producer inventory, or ship hull
                const amountToShip = Math.floor(Math.min(inv, order.amount, shipCapacity));
                
                if (amountToShip <= 0) continue;

                if (amountToShip < order.amount) {
                    // Partial fill: split the order
                    // Original order keeps the remainder and stays OPEN
                    // New child order takes the 'amountToShip' and gets ACCEPTED
                    const subOrder = this.orderBoard.splitOrder(order.id, amountToShip);
                    if (subOrder && this.orderBoard.acceptOrder(subOrder.id, bestProducer)) {
                        this.spawnMerchant(subOrder, bestProducer, simTime, npcShips, config);
                    }
                } else {
                    // Full fill (or close enough that we take the whole order slot)
                    if (this.orderBoard.acceptOrder(order.id, bestProducer)) {
                        order.amount = amountToShip;
                        this.spawnMerchant(order, bestProducer, simTime, npcShips, config);
                    }
                }
            }
        }
    }
    
    spawnMerchant(order, producer, simTime, npcShips, config) {
        const merchantLoadout = new Loadout(config.hull, config.components);

        const sourcePos = producer.body.orbit ? producer.body.orbit.getPosition(simTime) : Vec2.zero();
        const sourceVel = producer.body.orbit ? producer.body.orbit.getVelocity(simTime) : Vec2.zero();
        const offset = new Vec2((Math.random()-0.5)*2000, (Math.random()-0.5)*2000); 
        
        const merchant = new Ship({
          position: sourcePos.clone().addMut(offset),
          velocity: sourceVel.clone(),
          loadout: merchantLoadout,
          name: 'Hauler-' + Math.floor(Math.random()*1000)
        });
        
        merchant.ai = new EnemyAI(merchant, 'MERCHANT');
        merchant.sourceStation = producer; 
        producer.outboundCount++;
        
        // Remove from producer market
        producer.market.removeInventory(order.commodityId, order.amount);
        
        merchant.ai.setTradeRoute({
            destBody: order.consumer.body,
            destMarket: order.consumer.market,
            commodityId: order.commodityId,
            amount: order.amount,
            orderId: order.id
        });
        
        npcShips.push(merchant);
    }
}
