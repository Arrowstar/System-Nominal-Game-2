import { COMMODITIES } from '../economy/Commodity.js';

export class DebugEconomyUI {
    constructor(container, solarSystem) {
        this.container = container;
        this.solarSystem = solarSystem;
        this.el = document.createElement('div');
        this.el.className = 'debug-economy-overlay';
        this.visible = false;
        
        this.el.style.cssText = `
            position: absolute;
            top: 5%; left: 5%; right: 5%; bottom: 5%;
            background: rgba(10, 0, 20, 0.95);
            border: 1px solid #ff00ff;
            color: #e6edf3;
            font-family: 'Fira Code', 'Roboto Mono', monospace;
            display: none; // toggled
            flex-direction: column;
            z-index: 2000;
            padding: 24px;
            box-sizing: border-box;
            box-shadow: 0 0 30px rgba(255, 0, 255, 0.2);
        `;
        
        this.el.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; border-bottom: 1px solid #ff00ff; padding-bottom: 12px;">
                <h2 style="margin:0; font-size: 20px; color: #ff00ff;">ECONOMY DEBUG CONSOLE</h2>
                <div style="font-size: 14px; color: #8b949e;">[U] TO CLOSE</div>
            </div>
            <div id="debug-list" style="flex:1; overflow-y:auto; width: 100%;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;">
                    <thead style="position: sticky; top: 0; background: rgba(10, 0, 20, 0.95);">
                        <tr style="background: rgba(255,0,255,0.1); font-weight: bold; color: #ff00ff;">
                            <th style="padding: 10px; border-bottom: 1px solid #ff00ff; width: 25%;">STATION</th>
                            <th style="padding: 10px; border-bottom: 1px solid #ff00ff; width: 37.5%;">PRODUCING (OUTPUTS / SOURCES) [STOCK]</th>
                            <th style="padding: 10px; border-bottom: 1px solid #ff00ff; width: 37.5%;">CONSUMING (INPUTS / SINKS) [STOCK]</th>
                        </tr>
                    </thead>
                    <tbody id="debug-list-body">
                    </tbody>
                </table>
            </div>
        `;
        
        this.listEl = this.el.querySelector('#debug-list-body');
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
        const now = performance.now();
        if (now - this.lastUpdate > 1000) { // Update once per second
            this.render();
            this.lastUpdate = now;
        }
    }

    getCommName(id) {
        for (const key of Object.keys(COMMODITIES)) {
            if (COMMODITIES[key].id === id) return COMMODITIES[key].name;
        }
        return id;
    }

    render() {
        if (!this.solarSystem.economy) return;
        
        const stations = this.solarSystem.economy.stations;
        
        this.listEl.innerHTML = stations.map((station, index) => {
            const p = station.production;
            const m = station.market;
            
            const outputs = new Set(Object.keys(p.sources));
            const inputs = new Set(Object.keys(p.sinks));
            
            for (const r of p.activeRecipes) {
                for (const out of Object.keys(r.outputs)) outputs.add(out);
                for (const inp of Object.keys(r.inputs)) inputs.add(inp);
            }
            
            let outputsHtml = Array.from(outputs).map(id => {
                const amount = Math.floor(m.getInventory(id));
                const color = amount > 100 ? '#39ff14' : '#e6edf3';
                return `<div style="color:${color}">${this.getCommName(id)}: ${amount}</div>`;
            }).join('');
            if (!outputsHtml) outputsHtml = '<i style="color:#8b949e">None</i>';
            
            let inputsHtml = Array.from(inputs).map(id => {
                const amount = Math.floor(m.getInventory(id));
                const color = amount < 50 ? '#ff003f' : '#e6edf3';
                return `<div style="color:${color}">${this.getCommName(id)}: ${amount}</div>`;
            }).join('');
            if (!inputsHtml) inputsHtml = '<i style="color:#8b949e">None</i>';

            const bgStr = (index % 2 === 0) ? 'background: rgba(255,255,255,0.02);' : '';
            
            return `
                <tr style="border-bottom: 1px solid rgba(255,0,255,0.2); ${bgStr}">
                    <td style="padding: 12px 10px; color:#e6edf3; font-weight:bold; vertical-align: top;">
                        ${station.name}<br>
                        <span style="font-size:10px; color:#8b949e">${station.type.toUpperCase()}</span>
                    </td>
                    <td style="padding: 12px 10px; vertical-align: top;">${outputsHtml}</td>
                    <td style="padding: 12px 10px; vertical-align: top;">${inputsHtml}</td>
                </tr>
            `;
        }).join('');
    }
    
    destroy() {
        this.el.remove();
    }
}
