import { COMMODITIES } from './Commodity.js';

export class TradeRouteFinder {
    constructor(solarSystem) {
        this.solarSystem = solarSystem;
    }
    
    // Find the most profitable routes across the system
    findArbitrage() {
        // Collect all markets
        const markets = [];
        this.solarSystem.bodies.forEach(body => {
            if (body.station && body.station.market) {
                markets.push({
                    station: body.station,
                    market: body.station.market,
                    body: body
                });
            }
        });
        
        const routes = [];
        
        // Compare every pair of stations to find price diffs
        for (let i = 0; i < markets.length; i++) {
            for (let j = 0; j < markets.length; j++) {
                if (i === j) continue;
                
                const source = markets[i];
                const dest = markets[j];
                
                for (const key of Object.keys(COMMODITIES)) {
                    const id = COMMODITIES[key].id;
                    const buyPrice = source.market.getPrice(id);
                    const sellPrice = dest.market.getPrice(id);
                    
                    // Is it profitable and does the source actually have supply?
                    const profitPerUnit = sellPrice - buyPrice;
                    if (profitPerUnit > 0 && source.market.getInventory(id) > 10) {
                        // Check if destination has capacity
                        const destCap = dest.market.capacities[id];
                        const destInv = dest.market.getInventory(id);
                        if (destInv < destCap * 0.8) { // room to sell
                            // We can buy up to what source has, or what dest can hold, or arbitrary cargo limit (e.g. 100)
                            const maxTradeQty = Math.min(100, source.market.getInventory(id));
                            routes.push({
                                source: source.station,
                                dest: dest.station,
                                commodityId: id,
                                profitPerUnit: profitPerUnit,
                                totalProfit: profitPerUnit * maxTradeQty
                            });
                        }
                    }
                }
            }
        }
        
        // Sort by most profitable
        routes.sort((a, b) => b.totalProfit - a.totalProfit);
        return routes;
    }
}
