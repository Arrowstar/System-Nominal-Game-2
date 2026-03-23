import { COMMODITIES } from '../economy/Commodity.js';

export class OrderBoardUI {
    constructor(container, solarSystem) {
        this.container = container;
        this.solarSystem = solarSystem;
        this.el = document.createElement('div');
        this.el.className = 'order-board-overlay';
        this.visible = false;
        
        // CSS specific to the board
        this.el.style.cssText = `
            position: absolute;
            top: 10%; left: 10%; right: 10%; bottom: 10%;
            background: rgba(8, 11, 15, 0.95);
            border: 1px solid #39ff14;
            color: #39ff14;
            font-family: 'Roboto Mono', monospace;
            display: none; // toggled
            flex-direction: column;
            z-index: 1000;
            padding: 24px;
            box-sizing: border-box;
            box-shadow: 0 0 30px rgba(57, 255, 20, 0.15);
        `;
        
        this.el.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px; border-bottom: 1px solid rgba(57,255,20,0.5); padding-bottom: 12px;">
                <h2 style="margin:0; font-size: 24px; letter-spacing: 4px; text-shadow: 0 0 10px rgba(57,255,20,0.5);">GLOBAL ORDER BOARD</h2>
                <div style="font-size: 14px; color: #8b949e; letter-spacing: 2px;">[O] TO CLOSE</div>
            </div>
            <div id="order-list" style="flex:1; overflow-y:auto; width: 100%;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
                    <thead style="position: sticky; top: 0; background: rgba(8, 11, 15, 0.95);">
                        <tr style="background: rgba(57,255,20,0.1); font-weight: bold; letter-spacing: 1px; color: #39ff14;">
                            <th style="padding: 12px 10px; border-bottom: 1px solid #39ff14; width: 20%;">CONSUMER</th>
                            <th style="padding: 12px 10px; border-bottom: 1px solid #39ff14; width: 25%;">COMMODITY</th>
                            <th style="padding: 12px 10px; border-bottom: 1px solid #39ff14; width: 10%;">AMOUNT</th>
                            <th style="padding: 12px 10px; border-bottom: 1px solid #39ff14; width: 15%;">REWARD</th>
                            <th style="padding: 12px 10px; border-bottom: 1px solid #39ff14; width: 30%;">STATUS</th>
                        </tr>
                    </thead>
                    <tbody id="order-list-body">
                    </tbody>
                </table>
            </div>
        `;
        
        this.listEl = this.el.querySelector('#order-list-body');
        this.container.appendChild(this.el);
        this.lastUpdate = 0;
    }

    toggle() {
        this.visible = !this.visible;
        this.el.style.display = this.visible ? 'flex' : 'none';
        if (this.visible) this.render();
    }

    update() {
        if (!this.visible) return;
        
        // Update UI every 500ms real-time so it's smooth but not heavy
        const now = performance.now();
        if (now - this.lastUpdate > 500) {
            this.render();
            this.lastUpdate = now;
        }
    }

    getCommodityName(id) {
        for (const key of Object.keys(COMMODITIES)) {
            if (COMMODITIES[key].id === id) return COMMODITIES[key].name;
        }
        return id;
    }

    render() {
        if (!this.solarSystem.economy) return;
        
        const board = this.solarSystem.economy.orderBoard;
        // Show OPEN and ACCEPTED orders
        const orders = board.orders.filter(o => o.status !== 'FULFILLED');
        
        if (orders.length === 0) {
            this.listEl.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 40px; color: #8b949e; font-style: italic; letter-spacing: 1px;">NO ACTIVE ORDERS IN SYSTEM</td></tr>`;
            return;
        }

        // Sort by OPEN first, then by highest price
        orders.sort((a, b) => {
            if (a.status !== b.status) return a.status === 'OPEN' ? -1 : 1;
            return b.priceOffered - a.priceOffered;
        });

        this.listEl.innerHTML = orders.map((o, index) => {
            const commName = this.getCommodityName(o.commodityId);
            const priceStr = o.priceOffered.toLocaleString() + ' c/u';
            const statusColor = o.status === 'OPEN' ? '#FFBF00' : '#39ff14'; // Amber for OPEN, Green for ACCEPTED
            const bgStr = (index % 2 === 0) ? 'background: rgba(255,255,255,0.02);' : '';
            
            const isExpanded = this.expandedOrderId === o.id;
            let expandedHtml = '';
            
            if (isExpanded) {
                // Find all stations that sell this commodity
                const sellers = [];
                for (const station of this.solarSystem.economy.stations) {
                    if (station === o.consumer) continue; // Don't buy from the starving consumer
                    
                    const p = station.production;
                    let isProducer = Object.keys(p.sources).includes(o.commodityId);
                    if (!isProducer) {
                        for (const r of p.activeRecipes) {
                            if (Object.keys(r.outputs).includes(o.commodityId)) {
                                isProducer = true;
                                break;
                            }
                        }
                    }
                    const inv = station.market.getInventory(o.commodityId);
                    
                    if (isProducer) {
                        sellers.push({
                            station: station,
                            price: station.market.getPrice(o.commodityId),
                            inv: inv
                        });
                    }
                }
                
                sellers.sort((a,b) => a.price - b.price); // Lowest price first
                
                let sellerRows = sellers.map(s => {
                    const stockColor = s.inv > 0 ? '#fff' : '#ff003f';
                    return `<div style="display:flex; justify-content:space-between; padding: 4px 10px; border-bottom: 1px dotted rgba(57,255,20,0.2); color:#8b949e;">
                        <span>${s.station.name}</span>
                        <span>Stock: <span style="color:${stockColor}">${s.inv}</span></span>
                        <span>Price: <span style="color:#39ff14">${s.price.toLocaleString()} c/u</span></span>
                    </div>`;
                }).join('');
                
                if (sellers.length === 0) {
                    sellerRows = `<div style="padding: 10px; color:#8b949e; font-style:italic;">No known suppliers currently producing this.</div>`;
                }
                
                expandedHtml = `
                <tr>
                    <td colspan="5" style="padding: 0; background: rgba(0,0,0,0.5);">
                        <div style="padding: 10px 20px; border-left: 2px solid #ffbf00; display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="flex: 1;">
                                <div style="font-size: 11px; color:#ffbf00; letter-spacing: 1px; margin-bottom: 6px;">KNOWN SUPPLIERS (LOWEST PRICE FIRST)</div>
                                ${sellerRows}
                            </div>
                            ${o.status === 'OPEN' ? `
                            <div style="margin-left: 20px; padding: 10px; border-left: 1px solid rgba(57,255,20,0.2);">
                                <button 
                                    onclick="event.stopPropagation(); window.orderBoardAcceptJob('${o.id}')"
                                    style="background: #39ff14; color: #080b0f; border: none; padding: 10px 20px; cursor: pointer; font-family: 'Roboto Mono', monospace; font-weight: bold; border-radius: 2px; box-shadow: 0 0 10px rgba(57,255,20,0.4);"
                                    onmouseover="this.style.boxShadow='0 0 20px rgba(57,255,20,0.7)'"
                                    onmouseout="this.style.boxShadow='0 0 10px rgba(57,255,20,0.4)'"
                                >
                                    CLAIM CONTRACT
                                </button>
                            </div>
                            ` : ''}
                        </div>
                    </td>
                </tr>
                `;
            }

            return `
                <tr style="border-bottom: 1px solid rgba(57,255,20,0.1); cursor: pointer; ${isExpanded ? 'background: rgba(255,191,0,0.05);' : bgStr}" onclick="window.orderBoardToggleExpand('${o.id}')">
                    <td style="padding: 12px 10px; color:#e6edf3">${o.consumer.name}</td>
                    <td style="padding: 12px 10px; color:#e6edf3; font-weight:bold;">${commName}</td>
                    <td style="padding: 12px 10px; color:#fff">${o.amount}</td>
                    <td style="padding: 12px 10px; color:#FFBF00">${priceStr}</td>
                    <td style="padding: 12px 10px;">
                        <div style="color:${statusColor}; display:flex; gap: 8px; align-items:center;">
                            <span style="border: 1px solid ${statusColor}; padding: 2px 6px; border-radius: 2px; font-size: 11px;">${o.status}</span> 
                            ${o.producerName ? '<span style="color:#8b949e; font-size:12px">by ' + o.producerName + '</span>' : ''}
                        </div>
                    </td>
                </tr>
                ${expandedHtml}
            `;
        }).join('');
    }
    
    destroy() {
        this.el.remove();
    }
}
