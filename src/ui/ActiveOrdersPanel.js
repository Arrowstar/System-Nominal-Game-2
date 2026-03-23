/**
 * ActiveOrdersPanel.js
 */
export class ActiveOrdersPanel {
    constructor(hudManager, economy) {
        this.hudManager = hudManager;
        this.economy = economy;

        this.content = document.createElement('div');
        this.content.style.cssText = `
            display: flex; flex-direction: column; gap: 8px; font-size: 12px;
        `;

        this.panel = this.hudManager.createPanel({
            id: 'nav-active-orders',
            title: 'ACTIVE ORDERS',
            defaultZone: 'bottom-left',
            contentEl: this.content,
            minWidth: '240px',
            borderColor: 'rgba(57, 255, 20, 0.4)'
        });
        
        this.update();
    }

    update() {
        const activeOrders = this.economy.orderBoard.orders.filter(
            o => o.producer === 'YOU' && o.status === 'ACCEPTED'
        );

        if (activeOrders.length === 0) {
            this.content.innerHTML = '<div style="color:#8b949e; font-style:italic;">No active contracts.</div>';
            return;
        }

        this.content.innerHTML = '';
        activeOrders.forEach(order => {
            const row = document.createElement('div');
            row.style.cssText = `
                padding: 4px; border-bottom: 1px solid rgba(255,255,255,0.05);
            `;
            
            // Assuming commodity mapping exists or using ID
            const commodityName = order.commodityId.toUpperCase().replace('_', ' ');
            const consumerName = order.consumer ? order.consumer.name : 'UNKNOWN';
            
            row.innerHTML = `
                <div style="color:#fff; font-weight:bold;">${commodityName}</div>
                <div style="display:flex; justify-content:space-between; font-size: 11px;">
                    <span style="color:#8b949e">TO: ${consumerName}</span>
                    <span style="color:#39ff14">${order.amount} UNITS</span>
                </div>
            `;
            this.content.appendChild(row);
        });
    }
    
    destroy() {
        this.panel.remove();
    }
}
