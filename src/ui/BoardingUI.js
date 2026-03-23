import { COMMODITIES } from '../economy/Commodity.js';

// Helper for icons based on category
const CATEGORY_ICONS = {
  RAW: '⛏',
  INTERMEDIATE: '⚙',
  END_PRODUCT: '📦'
};

function getCategoryIcon(cat) {
    return CATEGORY_ICONS[cat] || '📦';
}

export class BoardingUI {
  /**
   * @param {HTMLElement} rootElement   The #hud-root element
   * @param {Ship}        targetShip    The disabled ship being boarded
   * @param {Ship}        playerShip    The player ship
   * @param {Function}    onDepart      Callback to exit boarding state
   */
  constructor(rootElement, targetShip, playerShip, onDepart) {
    this.root = rootElement;
    this.target = targetShip;
    this.player = playerShip;
    this.onDepart = onDepart;

    this._build();
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  _build() {
    this.container = document.createElement('div');
    this.container.id = 'boarding-terminal';
    this.container.style.cssText = `
      position: absolute; inset: 0; z-index: 100;
      background: radial-gradient(ellipse at center, rgba(13,17,23,0.95) 0%, rgba(6,10,15,0.95) 100%);
      font-family: 'Roboto Mono', monospace; color: #e6edf3;
      display: flex; flex-direction: column;
      pointer-events: all;
      animation: terminalBoot 0.3s ease-out;
    `;

    // ── Inject keyframe if not present ──
    if (!document.getElementById('boarding-ui-anims')) {
      const style = document.createElement('style');
      style.id = 'boarding-ui-anims';
      style.textContent = `
        @keyframes terminalBoot {
          0%   { opacity: 0; transform: scaleY(0.01); }
          50%  { opacity: 1; transform: scaleY(0.01); }
          100% { opacity: 1; transform: scaleY(1); }
        }
        .boarding-btn {
          cursor: pointer; border: 1px solid rgba(0,212,255,0.3);
          background: rgba(0,212,255,0.08); color: #00d4ff;
          font-family: 'Roboto Mono', monospace; font-size: 11px;
          padding: 6px 14px; text-transform: uppercase; letter-spacing: 0.08em;
          transition: all 0.15s;
        }
        .boarding-btn:hover {
          background: rgba(0,212,255,0.2); border-color: #00d4ff;
          box-shadow: 0 0 12px rgba(0,212,255,0.3);
        }
        .boarding-btn.danger { border-color: rgba(255,0,63,0.4); color: #ff003f; background: rgba(255,0,63,0.08); }
        .boarding-btn.danger:hover { background: rgba(255,0,63,0.2); border-color: #ff003f; }
        .commodity-row { display: flex; align-items: center; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.1s; }
        .commodity-row:hover { background: rgba(0,212,255,0.04); }
      `;
      document.head.appendChild(style);
    }

    // ── Header ──
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 32px 16px;
      border-bottom: 1px solid rgba(0,212,255,0.15);
      background: rgba(0,0,0,0.3);
    `;

    const left = document.createElement('div');
    left.innerHTML = `
      <div style="font-size: 11px; color: #ff003f; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 4px; animation: blink 1s infinite alternate;">BOARDING ACTION IN PROGRESS</div>
      <div style="font-size: 22px; font-weight: 700; color: #00d4ff; text-shadow: 0 0 20px rgba(0,212,255,0.4); letter-spacing: 0.1em;">${this.target.name.toUpperCase()}</div>
      <div style="font-size: 10px; color: #8b949e; margin-top: 4px;">CLASS: ${this.target.loadout.hull.name} · STATUS: DISABLED</div>
    `;
    header.appendChild(left);

    const right = document.createElement('div');
    const departBtn = document.createElement('button');
    departBtn.className = 'boarding-btn danger';
    departBtn.textContent = 'DEPART';
    departBtn.style.cssText += 'padding: 10px 20px; font-size: 13px; font-weight: 700;';
    departBtn.addEventListener('click', () => { if (this.onDepart) this.onDepart(); });
    right.appendChild(departBtn);
    header.appendChild(right);

    this.container.appendChild(header);

    // ── Content Area ──
    this.contentArea = document.createElement('div');
    this.contentArea.style.cssText = `flex: 1; overflow-y: auto; padding: 32px;`;
    this.container.appendChild(this.contentArea);

    this.root.appendChild(this.container);
    this._renderInventory();
  }

  _renderInventory() {
    this.contentArea.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display: flex; gap: 32px;`;

    // ── Target Ship Inventory (Left) ──
    const leftPanel = this._buildInventoryPanel(
        this.target,
        'TARGET MANIFEST',
        '#ffbf00',
        (commodityId) => {
            this._transferCargo(this.target, this.player, commodityId);
        },
        'TAKE'
    );
    wrapper.appendChild(leftPanel);

    // ── Player Ship Inventory (Right) ──
    const rightPanel = this._buildInventoryPanel(
        this.player,
        'YOUR CARGO BAY',
        '#39ff14',
        (commodityId) => {
            this._transferCargo(this.player, this.target, commodityId);
        },
        'GIVE'
    );
    wrapper.appendChild(rightPanel);

    this.contentArea.appendChild(wrapper);
  }

  _buildInventoryPanel(ship, title, color, actionCallback, actionText) {
      const panel = document.createElement('div');
      panel.style.cssText = `flex: 1; border: 1px solid rgba(255,255,255,0.06);`;

      const header = document.createElement('div');
      header.style.cssText = `padding: 12px 16px; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.06);`;
      header.innerHTML = `<div style="font-size: 12px; color: ${color}; letter-spacing: 0.12em; text-transform: uppercase;">${title}</div>`;
      panel.appendChild(header);

      const list = document.createElement('div');
      
      // We might be boarding a merchant that uses 'cargo' (map) or 'cargos' (array).
      // Let's normalize it for display:
      let items = [];
      if (ship.cargos && Array.isArray(ship.cargos)) {
          // Standard ship format
          items = ship.cargos;
      } else if (ship.cargo) {
          // Enemy merchant format
          for (const [id, amt] of Object.entries(ship.cargo)) {
              if (amt > 0) items.push({ type: id, amount: amt });
          }
      }

      if (items.length === 0) {
          list.innerHTML = `<div style="padding: 24px; text-align: center; color: #484f58; font-size: 11px; font-style: italic;">NO CARGO DETECTED</div>`;
      } else {
          for (const item of items) {
              const commodity = COMMODITIES[item.type];
              if (!commodity) continue;

              const row = document.createElement('div');
              row.className = 'commodity-row';
              row.innerHTML = `
                <span style="width: 40px; font-size: 18px; text-align: center;">${getCategoryIcon(commodity.category)}</span>
                <span style="flex: 2;">
                  <span style="color: #e6edf3; font-size: 13px;">${commodity.name}</span>
                </span>
                <span style="flex: 1; text-align: right; color: ${color}; font-size: 12px;">${item.amount} UNITS</span>
                <span style="width: 100px; display: flex; justify-content: flex-end; padding-right: 8px;"></span>
              `;

              const actionContainer = row.querySelector('span:last-child');
              const btn = document.createElement('button');
              btn.className = 'boarding-btn';
              btn.textContent = actionText;
              btn.style.cssText += 'padding: 4px 12px; font-size: 10px;';
              btn.onclick = () => actionCallback(item.type);
              
              actionContainer.appendChild(btn);
              list.appendChild(row);
          }
      }

      panel.appendChild(list);
      return panel;
  }

  _transferCargo(fromShip, toShip, commodityId) {
      // Find item in source
      let fromItem, fromIsArray = false;
      if (fromShip.cargos && Array.isArray(fromShip.cargos)) {
          fromItem = fromShip.cargos.find(c => c.type === commodityId);
          fromIsArray = true;
      } else if (fromShip.cargo) {
          const amt = fromShip.cargo[commodityId];
          if (amt > 0) fromItem = { type: commodityId, amount: amt };
      }

      if (!fromItem || fromItem.amount <= 0) return;

      // Remove 1 unit from source
      fromItem.amount -= 1;
      if (fromIsArray) {
          if (fromItem.amount <= 0) {
              fromShip.cargos.splice(fromShip.cargos.indexOf(fromItem), 1);
          }
      } else {
          fromShip.cargo[commodityId] = fromItem.amount;
      }

      // Add 1 unit to dest
      let toItem, toIsArray = false;
      if (toShip.cargos && Array.isArray(toShip.cargos)) {
          toItem = toShip.cargos.find(c => c.type === commodityId);
          toIsArray = true;
      } else if (toShip.cargo) {
          toShip.cargo[commodityId] = toShip.cargo[commodityId] || 0;
          toItem = { type: commodityId, amount: toShip.cargo[commodityId] };
      } else {
          toShip.cargo = {};
          toItem = { type: commodityId, amount: 0 };
      }

      if (toIsArray) {
          if (toItem) {
              toItem.amount += 1;
              toItem.mass += COMMODITIES[commodityId].massPerUnit;
          } else {
              toShip.cargos.push({
                  type: commodityId, 
                  name: COMMODITIES[commodityId].name, 
                  amount: 1, 
                  mass: COMMODITIES[commodityId].massPerUnit 
              });
          }
      } else {
          toShip.cargo[commodityId] += 1;
      }

      // Re-render
      this._renderInventory();
  }
}
