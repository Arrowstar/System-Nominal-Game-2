import { COMMODITIES } from './Commodity.js';

export class Market {
    constructor(station) {
        this.station = station;
        
        // Current inventory
        this.inventory = {};
        
        // Max capacity for each good to prevent infinite buffering
        this.capacities = {};
        
        // Base demand modifier (some planets just naturally demand more)
        this.demandModifiers = {};

        // Track price history for sparklines
        this.history = {};
        
        // Initialize all commodities
        for (const key of Object.keys(COMMODITIES)) {
            const id = COMMODITIES[key].id;
            this.inventory[id] = 0;
            this.capacities[id] = 1000; // default cap
            this.demandModifiers[id] = 1.0;
            this.history[id] = [];
        }
        
        this.historyTimer = 0;
    }

    setCapacity(commodityId, cap) {
        this.capacities[commodityId] = cap;
    }

    setDemandModifier(commodityId, mod) {
        this.demandModifiers[commodityId] = mod;
    }

    getInventory(commodityId) {
        return this.inventory[commodityId] || 0;
    }
    
    canAddInventory(commodityId, amount) {
        return (this.inventory[commodityId] + amount) <= this.capacities[commodityId];
    }

    addInventory(commodityId, amount) {
        if (this.canAddInventory(commodityId, amount)) {
            this.inventory[commodityId] += amount;
            return true;
        }
        return false;
    }

    removeInventory(commodityId, amount) {
        if (this.inventory[commodityId] >= amount) {
            this.inventory[commodityId] -= amount;
            return true;
        }
        return false;
    }

    // Dynamic pricing based on inventory ratio
    getPrice(commodityId) {
        const basePrice = COMMODITIES[commodityId].basePrice;
        const inventory = this.inventory[commodityId];
        const capacity = this.capacities[commodityId];
        
        // ratio: 0.0 (empty) to 1.0 (full)
        const ratio = inventory / capacity;
        
        // Price modifier formula
        let priceMod = 1.0;
        
        if (ratio < 0.1) {
            priceMod = 2.0; // severe shortage
        } else if (ratio < 0.3) {
            priceMod = 1.5;
        } else if (ratio > 0.9) {
            priceMod = 0.5; // severe glut
        } else if (ratio > 0.7) {
            priceMod = 0.8;
        }
        
        // Apply station's innate demand for this item
        priceMod *= this.demandModifiers[commodityId];
        
        return Math.max(1, Math.round(basePrice * priceMod));
    }
    
    update(dt) {
        this.historyTimer += dt;
        // Save price history every in-game hour (3600 seconds)
        if (this.historyTimer >= 3600) {
            this.historyTimer -= 3600;
            for (const key of Object.keys(COMMODITIES)) {
                const id = COMMODITIES[key].id;
                this.history[id].push(this.getPrice(id));
                // Keep last 24 entries
                if (this.history[id].length > 24) {
                    this.history[id].shift();
                }
            }
        }
    }
}
