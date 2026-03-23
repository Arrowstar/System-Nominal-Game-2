import { COMMODITIES } from './Commodity.js';

export const RECIPES = [
    {
        id: 'SMELTING',
        name: 'Ore Smelting',
        inputs: { [COMMODITIES.RAW_ORE.id]: 2 },
        outputs: { [COMMODITIES.REFINED_METALS.id]: 1 },
        timeSeconds: 60, // base time without station modifiers
    },
    {
        id: 'PLASTICS_SYNTHESIS',
        name: 'Plastics Synthesis',
        inputs: { [COMMODITIES.BIOMASS.id]: 2, [COMMODITIES.CHEMICALS.id]: 1 },
        outputs: { [COMMODITIES.PLASTICS.id]: 2 },
        timeSeconds: 120,
    },
    {
        id: 'CHEMICAL_REFINING',
        name: 'Chemical Refining',
        inputs: { [COMMODITIES.WATER_ICE.id]: 1, [COMMODITIES.HELIUM_3.id]: 1 },
        outputs: { [COMMODITIES.CHEMICALS.id]: 2 },
        timeSeconds: 90,
    },
    {
        id: 'MACHINING',
        name: 'Machining',
        inputs: { [COMMODITIES.REFINED_METALS.id]: 1, [COMMODITIES.PLASTICS.id]: 1 },
        outputs: { [COMMODITIES.MACHINERY_PARTS.id]: 2 },
        timeSeconds: 180,
    },
    {
        id: 'FOOD_PROCESSING',
        name: 'Food Processing',
        inputs: { [COMMODITIES.BIOMASS.id]: 2, [COMMODITIES.WATER_ICE.id]: 1 },
        outputs: { [COMMODITIES.FOOD_PAKS.id]: 3 },
        timeSeconds: 60,
    },
    {
        id: 'PHARMACEUTICALS',
        name: 'Pharmaceutical Synthesis',
        inputs: { [COMMODITIES.CHEMICALS.id]: 2, [COMMODITIES.BIOMASS.id]: 1 },
        outputs: { [COMMODITIES.MEDICINE.id]: 1 },
        timeSeconds: 300,
    },
    {
        id: 'ELECTRONICS_FABRICATION',
        name: 'Electronics Fabrication',
        inputs: { [COMMODITIES.REFINED_METALS.id]: 1, [COMMODITIES.CHEMICALS.id]: 1 },
        outputs: { [COMMODITIES.ADVANCED_ELECTRONICS.id]: 1 },
        timeSeconds: 240,
    },
    {
        id: 'LUXURY_ASSEMBLY',
        name: 'Luxury Goods Assembly',
        inputs: { [COMMODITIES.ADVANCED_ELECTRONICS.id]: 1, [COMMODITIES.PLASTICS.id]: 2 },
        outputs: { [COMMODITIES.LUXURIES.id]: 1 },
        timeSeconds: 400,
    },
    {
        id: 'SHIP_COMPONENT_MANUFACTURING',
        name: 'Shipyard Manufacturing',
        inputs: { [COMMODITIES.REFINED_METALS.id]: 3, [COMMODITIES.MACHINERY_PARTS.id]: 2, [COMMODITIES.ADVANCED_ELECTRONICS.id]: 1 },
        outputs: { [COMMODITIES.SHIP_COMPONENTS.id]: 1 },
        timeSeconds: 600,
    },
    {
        id: 'STIM_LAB',
        name: 'Underground Stim Lab',
        inputs: { [COMMODITIES.CHEMICALS.id]: 3, [COMMODITIES.MEDICINE.id]: 1 },
        outputs: { [COMMODITIES.ILLEGAL_STIMS.id]: 2 },
        timeSeconds: 500,
    }
];

export class StationProduction {
    constructor(station) {
        this.station = station;
        // active recipes running at this station
        this.activeRecipes = [];
        
        // natural sources (produces units per hour)
        this.sources = {};
        
        // natural sinks (consumes units per hour)
        this.sinks = {};
        
        this.timers = {}; // Keeps track of recipe progress
        this.sourceTimers = {};
        this.sinkTimers = {};
    }
    
    addRecipe(recipeId) {
        const recipe = RECIPES.find(r => r.id === recipeId);
        if (recipe) {
            this.activeRecipes.push(recipe);
            this.timers[recipeId] = 0;
        }
    }
    
    addSource(commodityId, unitsPerSecond) {
        this.sources[commodityId] = unitsPerSecond;
        this.sourceTimers[commodityId] = 0;
    }
    
    addSink(commodityId, unitsPerSecond) {
        this.sinks[commodityId] = unitsPerSecond;
        this.sinkTimers[commodityId] = 0;
    }

    /**
     * Returns a Set of commodity IDs that this station consumes for recipes or sinks.
     */
    getRequiredInputs() {
        const ids = new Set(Object.keys(this.sinks));
        for (const r of this.activeRecipes) {
            for (const id of Object.keys(r.inputs)) ids.add(id);
        }
        return ids;
    }

    /**
     * Returns a Set of commodity IDs that this station produces naturally or via recipes.
     */
    getProducedOutputs() {
        const ids = new Set(Object.keys(this.sources));
        for (const r of this.activeRecipes) {
            for (const id of Object.keys(r.outputs)) ids.add(id);
        }
        return ids;
    }
    
    // update is called every simulation tick
    update(dt) {
        const market = this.station.market;
        if (!market) return;
        
        // Process natural sources
        for (const [commId, rate] of Object.entries(this.sources)) {
            this.sourceTimers[commId] += dt;
            const threshold = 1.0 / rate;
            while (this.sourceTimers[commId] >= threshold) {
                if (market.canAddInventory(commId, 1)) {
                    market.addInventory(commId, 1);
                }
                this.sourceTimers[commId] -= threshold;
            }
        }
        
        // Process natural sinks
        for (const [commId, rate] of Object.entries(this.sinks)) {
            this.sinkTimers[commId] += dt;
            const threshold = 1.0 / rate;
            while (this.sinkTimers[commId] >= threshold) {
                if (market.getInventory(commId) > 0) {
                    market.removeInventory(commId, 1);
                }
                this.sinkTimers[commId] -= threshold;
            }
        }
        
        // Process recipes
        for (const recipe of this.activeRecipes) {
            this.timers[recipe.id] += dt;
            
            // Check if we have enough time passed
            if (this.timers[recipe.id] >= recipe.timeSeconds) {
                // Check if we have inputs and can store outputs
                let hasInputs = true;
                for (const [inputId, amount] of Object.entries(recipe.inputs)) {
                    if (market.getInventory(inputId) < amount) {
                        hasInputs = false;
                        break;
                    }
                }
                
                let canStoreOutputs = true;
                for (const [outputId, amount] of Object.entries(recipe.outputs)) {
                    if (!market.canAddInventory(outputId, amount)) {
                        canStoreOutputs = false;
                        break;
                    }
                }
                
                if (hasInputs && canStoreOutputs) {
                    // Consume inputs
                    for (const [inputId, amount] of Object.entries(recipe.inputs)) {
                        market.removeInventory(inputId, amount);
                    }
                    // Produce outputs
                    for (const [outputId, amount] of Object.entries(recipe.outputs)) {
                        market.addInventory(outputId, amount);
                    }
                    // Reset timer, saving any remainder just in case
                    this.timers[recipe.id] -= recipe.timeSeconds;
                } else {
                    // Stalled - cap timer at max
                    this.timers[recipe.id] = recipe.timeSeconds;
                }
            }
        }
    }
}
