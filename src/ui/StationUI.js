/**
 * StationUI.js — Full-screen station terminal overlay.
 *
 * Shown when the game enters STATES.DOCKED.
 * Provides three tabbed views:
 *   1. LOCAL MARKET  — Buy/sell commodities, refuel
 *   2. SHIPYARD      — View and swap ship components
 *   3. MISSION BOARD — (Placeholder for Phase 9)
 *
 * Styled as a retro-futuristic CRT terminal with green/amber accents.
 */

import { COMPONENTS } from '../ship/Component.js';
import { playerWallet } from '../core/Wallet.js';

import { COMMODITIES } from '../economy/Commodity.js';
import { HULLS } from '../ship/Hull.js';

// Helper for icons based on category
const CATEGORY_ICONS = {
  RAW: '⛏',
  INTERMEDIATE: '⚙',
  END_PRODUCT: '📦'
};

function getCategoryIcon(cat) {
    return CATEGORY_ICONS[cat] || '📦';
}




export class StationUI {
  /**
   * @param {HTMLElement} rootElement   The #hud-root element
   * @param {object}      dockedBody   The SolarSystem body we're docked at
   * @param {Ship}        ship         The player ship
   * @param {Function}    onUndock     Callback to exit docked state
   */
  constructor(rootElement, dockedBody, ship, onUndock, fameTracker) {
    this.root = rootElement;
    this.body = dockedBody;
    this.ship = ship;
    this.onUndock = onUndock;
    this.fameTracker = fameTracker;
    this.activeStationIndex = 0;

    // If the player has no ship, force the terminal to focus on the Shipyard station (if one is available)
    if (this.ship.loadout.hull.id === 'NO_SHIP') {
      const stations = this.body.stationInstances || this.body.stations;
      if (stations && stations.length > 0) {
        const syIdx = stations.findIndex(s => s.type === 'shipyard');
        if (syIdx !== -1) {
          this.activeStationIndex = syIdx;
        }
      }
    }

    // Player wallet
    // Wallet is managed via playerWallet

    this._activeTab = this.ship.loadout.hull.id === 'NO_SHIP' ? 'ships' : 'market';
    
    // Shipyard filters
    this._shipyardCategory = 'ALL';
    this._shipyardSubCategory = 'ALL';

    this._build();
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  // ─── Build the full terminal ──────────────────────────────────────────────

  _build() {
    this.container = document.createElement('div');
    this.container.id = 'station-terminal';
    this.container.style.cssText = `
      position: absolute; inset: 0; z-index: 100;
      background: radial-gradient(ellipse at center, #0d1117 0%, #060a0f 100%);
      font-family: 'Roboto Mono', monospace; color: #e6edf3;
      display: flex; flex-direction: column;
      pointer-events: all;
      animation: terminalBoot 0.4s ease-out;
    `;

    // ── Inject keyframe if not present ──
    if (!document.getElementById('station-ui-anims')) {
      const style = document.createElement('style');
      style.id = 'station-ui-anims';
      style.textContent = `
        @keyframes terminalBoot {
          0%   { opacity: 0; transform: scaleY(0.01); }
          50%  { opacity: 1; transform: scaleY(0.01); }
          100% { opacity: 1; transform: scaleY(1); }
        }
        @keyframes scanFlicker {
          0%, 100% { opacity: 0.03; }
          50%      { opacity: 0.06; }
        }
        .station-tab { cursor: pointer; transition: all 0.15s; }
        .station-tab:hover { color: #39ff14; text-shadow: 0 0 8px rgba(57,255,20,0.5); }
        .station-tab.active { color: #39ff14; border-bottom: 2px solid #39ff14; text-shadow: 0 0 12px rgba(57,255,20,0.6); }
        .station-btn {
          cursor: pointer; border: 1px solid rgba(57,255,20,0.3);
          background: rgba(57,255,20,0.08); color: #39ff14;
          font-family: 'Roboto Mono', monospace; font-size: 11px;
          padding: 6px 14px; text-transform: uppercase; letter-spacing: 0.08em;
          transition: all 0.15s;
        }
        .station-btn:hover {
          background: rgba(57,255,20,0.2); border-color: #39ff14;
          box-shadow: 0 0 12px rgba(57,255,20,0.3);
        }
        .station-btn.danger { border-color: rgba(255,0,63,0.4); color: #ff003f; background: rgba(255,0,63,0.08); }
        .station-btn.danger:hover { background: rgba(255,0,63,0.2); border-color: #ff003f; }
        .station-btn.amber { border-color: rgba(255,191,0,0.4); color: #ffbf00; background: rgba(255,191,0,0.08); }
        .station-btn.amber:hover { background: rgba(255,191,0,0.2); border-color: #ffbf00; }
        .commodity-row { display: flex; align-items: center; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.1s; }
        .commodity-row:hover { background: rgba(57,255,20,0.04); }
        .component-card {
          border: 1px solid rgba(255,255,255,0.08); padding: 12px;
          background: rgba(255,255,255,0.02); transition: all 0.15s; cursor: pointer;
        }
        .component-card:hover { border-color: rgba(57,255,20,0.3); background: rgba(57,255,20,0.04); }
        .component-card.equipped { border-color: rgba(57,255,20,0.5); }

        .shipyard-filter-bar { display: flex; gap: 8px; margin-bottom: 12px; }
        .shipyard-filter-tab {
          cursor: pointer; padding: 4px 12px; font-size: 10px; color: #8b949e;
          border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02);
          text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.15s;
        }
        .shipyard-filter-tab:hover { border-color: rgba(57,255,20,0.3); color: #39ff14; }
        .shipyard-filter-tab.active {
          background: rgba(57,255,20,0.1); border-color: #39ff14; color: #39ff14;
          box-shadow: 0 0 8px rgba(57,255,20,0.2);
        }

        .sub-filter-bar { display: flex; gap: 6px; margin-bottom: 16px; padding-left: 12px; border-left: 2px solid rgba(57,255,20,0.2); }
        .sub-filter-tab {
          cursor: pointer; padding: 2px 8px; font-size: 9px; color: #484f58;
          border: 1px solid transparent; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.15s;
        }
        .sub-filter-tab:hover { color: #8b949e; }
        .sub-filter-tab.active { color: #39ff14; font-weight: 700; }
      `;
      document.head.appendChild(style);
    }

    // ── Header ──
    this._buildHeader();

    // ── Content Area ──
    this.contentArea = document.createElement('div');
    this.contentArea.style.cssText = `flex: 1; overflow-y: auto; padding: 0 32px 32px;`;
    this.container.appendChild(this.contentArea);

    // ── Scanline overlay ──
    const scanlines = document.createElement('div');
    scanlines.style.cssText = `
      position: absolute; inset: 0; pointer-events: none;
      background: repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px);
      animation: scanFlicker 4s ease-in-out infinite;
    `;
    this.container.appendChild(scanlines);

    this.root.appendChild(this.container);
    this._renderTab();
  }

  // ─── Header Bar ───────────────────────────────────────────────────────────

  _buildHeader() {
    // ── Multiple Stations Selector ──
    if (this.body.stationInstances && this.body.stationInstances.length > 1) {
      const stationTabs = document.createElement('div');
      stationTabs.style.cssText = `display: flex; gap: 8px; padding: 12px 32px 0; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(57,255,20,0.15);`;
      this.body.stationInstances.forEach((st, idx) => {
        const btn = document.createElement('button');
        btn.className = idx === this.activeStationIndex ? 'station-btn amber' : 'station-btn';
        btn.textContent = st.name.toUpperCase();
        btn.onclick = () => {
          if (this.ship.loadout.hull.id === 'NO_SHIP') return;
          if (this.activeStationIndex !== idx) {
            this.activeStationIndex = idx;
            const isShipyard = this.body.stationInstances[idx].type === 'shipyard';
            if ((this._activeTab === 'shipyard' || this._activeTab === 'ships') && !isShipyard) {
               this._activeTab = 'market';
            }
            this.destroy();
            this._build();
          }
        };
        stationTabs.appendChild(btn);
      });
      this.container.appendChild(stationTabs);
    }

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 32px 16px;
      border-bottom: 1px solid rgba(57,255,20,0.15);
      background: rgba(0,0,0,0.3);
    `;

    // Station name + body info
    const currentStation = this.body.stationInstances ? this.body.stationInstances[this.activeStationIndex] : this.body.station;
    const stationName = currentStation ? currentStation.name : this.body.name;
    const left = document.createElement('div');
    left.innerHTML = `
      <div style="font-size: 11px; color: #484f58; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 4px;">STATION TERMINAL</div>
      <div style="font-size: 22px; font-weight: 700; color: #39ff14; text-shadow: 0 0 20px rgba(57,255,20,0.4); letter-spacing: 0.1em;">${stationName.toUpperCase()}</div>
      <div style="font-size: 10px; color: #8b949e; margin-top: 4px;">${this.body.name} · ${(this.body.economy || 'unknown').toUpperCase()} ECONOMY · SEC: ${(this.body.security || 'NONE').toUpperCase()}</div>
    `;
    header.appendChild(left);

    // Tabs
    const tabs = document.createElement('div');
    tabs.style.cssText = `display: flex; gap: 24px; align-items: center;`;
    
    const isShipyard = currentStation?.type === 'shipyard';
    const allTabs = ['market'];
    if (isShipyard) allTabs.push('shipyard', 'ships');
    allTabs.push('missions');

    allTabs.forEach(tab => {
      const t = document.createElement('div');
      
      let restricted = (tab === 'shipyard' || tab === 'ships') && !isShipyard;
      if (this.ship.loadout.hull.id === 'NO_SHIP') {
        restricted = tab !== 'ships'; // Force only "ships" to be available
      }
      
      t.className = `station-tab ${tab === this._activeTab ? 'active' : ''} ${restricted ? 'disabled' : ''}`;
      t.dataset.tab = tab;
      
      if (restricted) {
        t.style.cssText = `
          font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
          padding: 4px 0; color: #484f58; text-decoration: line-through; cursor: not-allowed;
        `;
      } else {
        t.style.cssText = `
          font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
          padding: 4px 0; color: #8b949e;
        `;
        t.addEventListener('click', () => {
          this._activeTab = tab;
          tabs.querySelectorAll('.station-tab').forEach(el => el.classList.remove('active'));
          t.classList.add('active');
          this._renderTab();
        });
      }
      
      let label = tab.toUpperCase();
      if (tab === 'missions') label = 'MISSION BOARD';
      if (tab === 'ships') label = 'SHIP DEALER';
      
      t.textContent = restricted ? label + ' (UNAVAILABLE)' : label;
      
      tabs.appendChild(t);
    });
    header.appendChild(tabs);


    // Right: credits + undock
    const right = document.createElement('div');
    right.style.cssText = `display: flex; align-items: center; gap: 24px;`;
    right.innerHTML = `
      <div style="text-align: right;">
        <div style="font-size: 9px; color: #484f58; letter-spacing: 0.1em;">CREDITS</div>
        <div id="station-credits" style="font-size: 18px; font-weight: 700; color: #ffbf00; text-shadow: 0 0 10px rgba(255,191,0,0.3);">${playerWallet.credits.toLocaleString()} CR</div>
      </div>
      <div id="undock-container" style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
        <!-- Undock button will be injected here -->
      </div>
    `;
    header.appendChild(right);
    this.container.appendChild(header);

    this._updateUndockButton();
  }

  _updateUndockButton() {
    const container = this.container.querySelector('#undock-container');
    if (!container) return;
    container.innerHTML = '';

    const noShip = this.ship.loadout.hull.id === 'NO_SHIP';
    const hasEngine = this.ship.loadout.totalThrust > 0;
    const hasFuelTank = this.ship.loadout.maxFuel > 0;
    const canUndock = !noShip && hasEngine && hasFuelTank;

    // Warning message if applicable
    if (!noShip) {
      if (!hasEngine || !hasFuelTank) {
        const warning = document.createElement('div');
        warning.style.cssText = `font-size: 9px; color: #ff003f; font-weight: 700; letter-spacing: 0.05em;`;
        warning.textContent = !hasEngine && !hasFuelTank ? 'NO ENGINE & FUEL TANK' : (!hasEngine ? 'NO ENGINE EQUIPPED' : 'NO FUEL TANK EQUIPPED');
        container.appendChild(warning);
      }
    }

    const undockBtn = document.createElement('button');
    undockBtn.className = canUndock ? 'station-btn danger' : 'station-btn disabled';
    undockBtn.textContent = 'UNDOCK';
    undockBtn.style.cssText += 'padding: 10px 20px; font-size: 13px; font-weight: 700;';
    
    if (!canUndock) {
      undockBtn.style.cssText += 'opacity: 0.5; cursor: not-allowed; border-color: rgba(255,0,0,0.3); color: #ff003f;';
    }

    undockBtn.addEventListener('click', () => { 
      if (canUndock && this.onUndock) {
        this.onUndock(); 
      }
    });

    container.appendChild(undockBtn);
  }

  // ─── Tab Routing ──────────────────────────────────────────────────────────

  _renderTab() {
    this.contentArea.innerHTML = '';
    this._updateUndockButton(); // Ensure undock state matches current loadout
    switch (this._activeTab) {
      case 'market':   this._renderMarket();   break;
      case 'shipyard': this._renderShipyard(); break;
      case 'ships':    this._renderShips();    break;
      case 'missions': this._renderMissions(); break;
    }
  }

  _updateCreditsDisplay() {
    const el = this.container.querySelector('#station-credits');
    if (el) el.textContent = `${playerWallet.credits.toLocaleString()} CR`;
  }

  _getUsedVolume() {
    return this.ship.cargos.reduce((sum, c) => {
      const def = COMMODITIES[c.type];
      const vol = def ? (def.volumePerUnit || 0) : 0;
      return sum + (c.amount * vol);
    }, 0);
  }

  // ─── LOCAL MARKET ─────────────────────────────────────────────────────────

  _renderMarket() {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `margin-top: 20px;`;

    // ── Quick Actions Bar ──
    const quickBar = document.createElement('div');
    quickBar.style.cssText = `
      display: flex; gap: 12px; margin-bottom: 20px; padding: 12px;
      background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
    `;

    // Refuel UI Container
    const missing = Math.max(0, this.ship.maxFuel - this.ship.fuel);
    const costPerKg = 0.5; // cheap refuel

    const refuelContainer = document.createElement('div');
    refuelContainer.style.cssText = `
      display: flex; flex-direction: column; gap: 4px; padding: 4px 8px;
      border: 1px solid rgba(0, 212, 255, 0.2); background: rgba(0, 212, 255, 0.03);
      min-width: 240px;
    `;

    const refuelHeader = document.createElement('div');
    refuelHeader.style.cssText = `display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #00d4ff; letter-spacing: 0.05em;`;
    refuelHeader.innerHTML = `<span>⛽ REFUEL SYSTEM</span> <span id="refuel-cost-display">0 CR</span>`;
    refuelContainer.appendChild(refuelHeader);

    const sliderRow = document.createElement('div');
    sliderRow.style.cssText = `display: flex; gap: 10px; align-items: center;`;

    const fuelSlider = document.createElement('input');
    fuelSlider.type = 'range';
    fuelSlider.min = '0';
    fuelSlider.max = Math.floor(missing).toString();
    fuelSlider.value = '0';
    fuelSlider.style.cssText = `flex: 1; cursor: pointer; accent-color: #00d4ff;`;

    const fuelAmtDisplay = document.createElement('div');
    fuelAmtDisplay.style.cssText = `width: 60px; font-size: 11px; color: #fff; text-align: right;`;
    fuelAmtDisplay.textContent = '0.0 t';

    sliderRow.appendChild(fuelSlider);
    sliderRow.appendChild(fuelAmtDisplay);
    refuelContainer.appendChild(sliderRow);

    const buyRefuelBtn = document.createElement('button');
    buyRefuelBtn.className = 'station-btn';
    buyRefuelBtn.style.cssText = `width: 100%; margin-top: 4px; padding: 4px; font-size: 10px;`;
    buyRefuelBtn.textContent = 'CONFIRM PURCHASE';
    buyRefuelBtn.disabled = true;
    buyRefuelBtn.style.opacity = '0.5';

    const updateRefuelUI = () => {
      const amount = parseFloat(fuelSlider.value);
      const cost = Math.round(amount * costPerKg);
      fuelAmtDisplay.textContent = `${(amount / 1000).toFixed(1)} t`;
      const costDisplay = refuelContainer.querySelector('#refuel-cost-display');
      costDisplay.textContent = `${cost.toLocaleString()} CR`;
      
      if (amount > 0 && playerWallet.credits >= cost) {
        buyRefuelBtn.disabled = false;
        buyRefuelBtn.style.opacity = '1';
        costDisplay.style.color = '#39ff14';
      } else {
        buyRefuelBtn.disabled = true;
        buyRefuelBtn.style.opacity = '0.5';
        costDisplay.style.color = amount > 0 ? '#ff003f' : '#00d4ff';
      }
    };

    fuelSlider.addEventListener('input', updateRefuelUI);

    buyRefuelBtn.addEventListener('click', () => {
      const amount = parseFloat(fuelSlider.value);
      const cost = Math.round(amount * costPerKg);
      if (amount > 0 && playerWallet.credits >= cost) {
        playerWallet.credits -= cost;
        this.ship.fuel += amount;
        this._updateCreditsDisplay();
        this._renderTab();
      }
    });

    refuelContainer.appendChild(buyRefuelBtn);
    quickBar.appendChild(refuelContainer);

    // Ship stats summary
    const usedVol = this._getUsedVolume();
    const maxVol = this.ship.loadout.hull.cargoCap || 0;
    
    const stats = document.createElement('div');
    stats.style.cssText = `margin-left: auto; font-size: 10px; color: #8b949e; display: flex; gap: 24px; align-items: center;`;
    stats.innerHTML = `
      <span>FUEL: <span style="color:#00d4ff">${(this.ship.fuel / 1000).toFixed(1)}t / ${(this.ship.maxFuel / 1000).toFixed(1)}t</span></span>
      <span>VOLUME: <span style="color:#ffbf00">${usedVol.toFixed(1)} / ${maxVol} m³</span></span>
      <span>HULL: <span style="color:#39ff14">${this.ship.integrity}/${this.ship.maxIntegrity}</span></span>
    `;
    quickBar.appendChild(stats);
    wrapper.appendChild(quickBar);

    // ── Commodity Table ──
    const table = document.createElement('div');
    table.style.cssText = `border: 1px solid rgba(255,255,255,0.06);`;

    // Header row
    const headerRow = document.createElement('div');
    headerRow.className = 'commodity-row';
    headerRow.style.cssText += `background: rgba(0,0,0,0.3); font-size: 10px; color: #484f58; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700;`;
    headerRow.innerHTML = `
      <span style="width: 40px;"></span>
      <span style="flex: 2;">COMMODITY</span>
      <span style="flex: 1; text-align: right;">PRICE</span>
      <span style="flex: 1; text-align: right;">SUPPLY</span>
      <span style="flex: 1; text-align: center;">VOL/UNIT</span>
      <span style="flex: 1; text-align: center;">HOLD</span>
      <span style="width: 200px; text-align: center;">ACTIONS</span>
    `;
    table.appendChild(headerRow);

    // Commodity rows
    const currentStation = this.body.stationInstances ? this.body.stationInstances[this.activeStationIndex] : this.body.station;
    const market = currentStation.market;
    const requiredInputs = currentStation.production.getRequiredInputs();
    const producedOutputs = currentStation.production.getProducedOutputs();

    for (const key of Object.keys(COMMODITIES)) {
    const commodity = COMMODITIES[key];
    const price = market.getPrice(commodity.id);

    const stationInv = market.getInventory(commodity.id);
    const produced = producedOutputs.has(commodity.id);
    const supplyLabel = `${stationInv} units`;
    const supplyColor = stationInv > 500 ? '#39ff14' : (stationInv > 100 ? '#8b949e' : '#ffbf00');

    // Check legality
    const isContraband = commodity.isIllegal && this.body.security !== 'none';

    // How many of this does the player have?
    const held = this.ship.cargos.filter(c => c.type === commodity.id).reduce((sum, c) => sum + c.amount, 0);

    // Hide goods that aren't available and that the player doesn't have to sell
    if (stationInv <= 0 && held <= 0) continue;

    // Station logic: only buys what it requires and doesn't produce
    const stationBuys = requiredInputs.has(commodity.id) && !producedOutputs.has(commodity.id);

    const row = document.createElement('div');
    row.className = 'commodity-row';
    row.innerHTML = `
      <span style="width: 40px; font-size: 18px; text-align: center;">${getCategoryIcon(commodity.category)}</span>
      <span style="flex: 2;">
        <span style="color: #e6edf3; font-size: 13px;">${commodity.name}</span>
        ${isContraband ? '<span style="color: #ff003f; font-size: 9px; margin-left: 8px; border: 1px solid rgba(255,0,63,0.4); padding: 1px 5px;">CONTRABAND</span>' : ''}
        ${!stationBuys && held > 0 ? '<span style="color: #484f58; font-size: 9px; margin-left: 8px; border: 1px solid rgba(255,255,255,0.1); padding: 1px 5px; text-transform:uppercase;">Not Required</span>' : ''}
      </span>
      <span style="flex: 1; text-align: right; font-weight: 700; color: #ffbf00; font-size: 14px;">${price} CR</span>
      <span style="flex: 1; text-align: right; color: ${supplyColor}; font-size: 11px;">${supplyLabel}</span>
      <span style="flex: 1; text-align: center; font-size: 11px; color: #8b949e;">${commodity.volumePerUnit || 0} m³</span>
      <span style="flex: 1; text-align: center; font-size: 12px; color: ${held > 0 ? '#ffbf00' : '#484f58'};">${held > 0 ? held : '—'}</span>
      <span style="width: 200px; display: flex; gap: 8px; justify-content: center;"></span>
    `;

    // Action buttons container (last span)
    const actionsContainer = row.querySelector('span:last-child');

    const canFit = (usedVol + (commodity.volumePerUnit || 0)) <= maxVol;
    const canAfford = playerWallet.credits >= price;
    const hasStock = market.getInventory(commodity.id) > 0;

    const buyBtn = document.createElement('button');
    buyBtn.className = 'station-btn';
    if (!canFit || !canAfford || !hasStock) {
      buyBtn.classList.add('disabled');
      buyBtn.style.cssText += 'opacity: 0.5; cursor: not-allowed;';
    }
    buyBtn.textContent = 'BUY';
    buyBtn.style.cssText += 'font-size: 10px; padding: 4px 12px;';
    buyBtn.addEventListener('click', () => {
      // Re-check conditions
      const currentUsed = this._getUsedVolume();
      const currentMax = this.ship.loadout.hull.cargoCap || 0;

      if (playerWallet.credits >= price && market.getInventory(commodity.id) > 0 && (currentUsed + (commodity.volumePerUnit||0)) <= currentMax) {
        playerWallet.credits -= price;
        // Add to cargo
        const existing = this.ship.cargos.find(c => c.type === commodity.id);
        if (existing) {
          existing.amount += 1;
          existing.mass += commodity.massPerUnit;
        } else {
          this.ship.cargos.push({ type: commodity.id, name: commodity.name, amount: 1, mass: commodity.massPerUnit });
        }
        market.removeInventory(commodity.id, 1);

        this._updateCreditsDisplay();
        this._renderTab();
      }
    });
    actionsContainer.appendChild(buyBtn);

    if (held > 0 && stationBuys) {
      const sellBtn = document.createElement('button');
      sellBtn.className = 'station-btn amber';
      sellBtn.textContent = 'SELL';
      sellBtn.style.cssText += 'font-size: 10px; padding: 4px 12px;';
      sellBtn.addEventListener('click', () => {
        playerWallet.credits += price;
        const existing = this.ship.cargos.find(c => c.type === commodity.id);
        if (existing) {
          existing.amount -= 1;
          existing.mass -= commodity.massPerUnit;
          market.addInventory(commodity.id, 1);
          if (existing.amount <= 0) {
            this.ship.cargos.splice(this.ship.cargos.indexOf(existing), 1);
          }
        }
        this._updateCreditsDisplay();
        this._renderTab();
      });
      actionsContainer.appendChild(sellBtn);
    }

    table.appendChild(row);
    }
    wrapper.appendChild(table);
    this.contentArea.appendChild(wrapper);
  }

  // ─── SHIPYARD ─────────────────────────────────────────────────────────────

  _renderShipyard() {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `margin-top: 20px; display: flex; gap: 24px;`;

    // ── Left: current loadout ──
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = `flex: 1; border: 1px solid rgba(255,255,255,0.06); padding: 20px;`;
    leftPanel.innerHTML = `
      <div style="font-size: 12px; color: #39ff14; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 16px;">CURRENT LOADOUT</div>
      <div style="font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 4px;">${this.ship.loadout.hull.name.toUpperCase()}</div>
      <div style="font-size: 10px; color: #8b949e; margin-bottom: 20px;">
        TIER ${this.ship.loadout.hull.tier} · INTEGRITY ${this.ship.loadout.hull.integrity} · BASE MASS ${(this.ship.loadout.hull.baseMass / 1000).toFixed(0)}t
      </div>
    `;

    // Slot layout
    const slotSection = document.createElement('div');
    slotSection.style.cssText = `margin-bottom: 20px;`;
    const hull = this.ship.loadout.hull;
    const equipped = this.ship.loadout.components;

    // Show slot groups
    const slotOrder = ['S', 'M', 'L'];
    const slotLabels = { S: 'SMALL', M: 'MEDIUM', L: 'LARGE' };
    for (const size of slotOrder) {
      const count = hull.slots[size] || 0;
      if (count === 0) continue;

      const slotGroup = document.createElement('div');
      slotGroup.style.cssText = `margin-bottom: 12px;`;
      slotGroup.innerHTML = `<div style="font-size: 9px; color: #484f58; letter-spacing: 0.1em; margin-bottom: 6px;">${slotLabels[size]} SLOTS (${count})</div>`;

      const slotsOfSize = equipped.filter(c => c.size === size);
      for (let i = 0; i < count; i++) {
        const comp = slotsOfSize[i];
        const slotEl = document.createElement('div');
        slotEl.className = `component-card ${comp ? 'equipped' : ''}`;
        slotEl.style.cssText += `margin-bottom: 4px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;`;
        if (comp) {
          const sellAmount = Math.floor((comp.cost || 0) * 0.5);
          slotEl.innerHTML = `
            <div style="flex: 1;">
              <div>
                <span style="color: #e6edf3; font-size: 12px;">${comp.name}</span>
                <span style="color: #484f58; font-size: 10px; margin-left: 8px;">${comp.type}</span>
              </div>
              <div style="font-size: 10px; color: #8b949e;">
                ${comp.thrust ? `${(comp.thrust / 1000).toFixed(0)} kN` : ''}
                ${comp.fuelCap ? `${(comp.fuelCap / 1000).toFixed(0)}t cap` : ''}
                ${comp.powerGen ? `${comp.powerGen} MW` : ''}
                ${comp.type === 'Weapon' ? `DMG:${comp.damage} · ${(1/comp.coolingTime).toFixed(1)}/s` : ''}
              </div>
            </div>
            <div>
              <button class="station-btn amber sell-btn" style="font-size: 9px; padding: 4px 8px;">
                ${sellAmount > 0 ? `SELL (${sellAmount.toLocaleString()} CR)` : 'UNEQUIP'}
              </button>
            </div>
          `;
          slotEl.querySelector('.sell-btn').onclick = () => {
             const idx = equipped.indexOf(comp);
             if (idx !== -1) {
               equipped.splice(idx, 1);
               playerWallet.credits += sellAmount;
               this._updateCreditsDisplay();
             }
             this._renderTab();
          };
        } else {
          slotEl.innerHTML = `<span style="color: #484f58; font-size: 11px; font-style: italic;">— EMPTY SLOT —</span>`;
        }
        slotGroup.appendChild(slotEl);
      }
      slotSection.appendChild(slotGroup);
    }
    leftPanel.appendChild(slotSection);

    // Ship stats summary
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = `border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px; font-size: 11px; color: #8b949e; line-height: 1.8;`;
    const lo = this.ship.loadout;
    statsDiv.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px;">
        <span>TOTAL THRUST</span><span style="color: #39ff14; text-align: right;">${(lo.totalThrust / 1000).toFixed(0)} kN</span>
        <span>NET ISP</span><span style="color: #39ff14; text-align: right;">${lo.netIsp.toFixed(0)} s</span>
        <span>EMPTY MASS</span><span style="color: #ffbf00; text-align: right;">${(lo.emptyMass / 1000).toFixed(1)} t</span>
        <span>FUEL CAPACITY</span><span style="color: #00d4ff; text-align: right;">${(lo.maxFuel / 1000).toFixed(1)} t</span>
        <span>POWER GEN</span><span style="color: #ffbf00; text-align: right;">${lo.powerGen} MW</span>
      </div>
    `;
    leftPanel.appendChild(statsDiv);
    wrapper.appendChild(leftPanel);

    // ── Right: available components ──
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = `flex: 1; border: 1px solid rgba(255,255,255,0.06); padding: 20px; display: flex; flex-direction: column;`;
    rightPanel.innerHTML = `
      <div style="font-size: 12px; color: #ffbf00; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 16px;">AVAILABLE COMPONENTS</div>
    `;

    const HIERARCHY = {
      ALL: { label: 'ALL', subs: [] },
      ENGINE: { label: 'ENGINES', subs: [] },
      REACTOR: { label: 'REACTORS', subs: [] },
      TANK: { label: 'TANKS', subs: [] },
      WEAPON: { label: 'WEAPONS', subs: ['KINETIC', 'ENERGY', 'MISSILE'] }
    };

    // Main Filter Bar
    const mainBar = document.createElement('div');
    mainBar.className = 'shipyard-filter-bar';
    Object.keys(HIERARCHY).forEach(catKey => {
      const tab = document.createElement('div');
      tab.className = `shipyard-filter-tab ${this._shipyardCategory === catKey ? 'active' : ''}`;
      tab.textContent = HIERARCHY[catKey].label;
      tab.onclick = () => {
        this._shipyardCategory = catKey;
        this._shipyardSubCategory = 'ALL';
        this._renderTab();
      };
      mainBar.appendChild(tab);
    });
    rightPanel.appendChild(mainBar);

    // Sub Filter Bar (if applicable)
    const currentCat = HIERARCHY[this._shipyardCategory];
    if (currentCat && currentCat.subs.length > 0) {
      const subBar = document.createElement('div');
      subBar.className = 'sub-filter-bar';
      
      const allSub = document.createElement('div');
      allSub.className = `sub-filter-tab ${this._shipyardSubCategory === 'ALL' ? 'active' : ''}`;
      allSub.textContent = 'ALL TYPES';
      allSub.onclick = () => {
        this._shipyardSubCategory = 'ALL';
        this._renderTab();
      };
      subBar.appendChild(allSub);

      currentCat.subs.forEach(sKey => {
        const subTab = document.createElement('div');
        subTab.className = `sub-filter-tab ${this._shipyardSubCategory === sKey ? 'active' : ''}`;
        subTab.textContent = sKey;
        subTab.onclick = () => {
          this._shipyardSubCategory = sKey;
          this._renderTab();
        };
        subBar.appendChild(subTab);
      });
      rightPanel.appendChild(subBar);
    }

    // List all components in catalog
    const compList = document.createElement('div');
    compList.style.cssText = `display: flex; flex-direction: column; gap: 6px; max-height: 500px; overflow-y: auto; flex: 1;`;
    
    for (const [id, comp] of Object.entries(COMPONENTS)) {
      // ── Apply Filters ──
      const typeMatch = this._shipyardCategory === 'ALL' || comp.type.toUpperCase() === this._shipyardCategory;
      const subMatch = this._shipyardSubCategory === 'ALL' || (comp.category && comp.category.toUpperCase() === this._shipyardSubCategory);
      
      if (!typeMatch || !subMatch) continue;

      const card = document.createElement('div');
      const costAmount = comp.cost || 0;
      card.className = 'component-card';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="color: #e6edf3; font-size: 12px; font-weight: 600;">${comp.name}</span>
            <span style="color: #484f58; font-size: 10px; margin-left: 6px;">[${comp.size}] ${comp.type}</span>
          </div>
        </div>
        <div style="font-size: 10px; color: #8b949e; margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap;">
          <span>MASS: ${(comp.mass / 1000).toFixed(1)}t</span>
          ${comp.thrust ? `<span>THRUST: ${(comp.thrust / 1000).toFixed(0)} kN</span>` : ''}
          ${comp.isp ? `<span>ISP: ${comp.isp}s</span>` : ''}
          ${comp.fuelCap ? `<span>FUEL: ${(comp.fuelCap / 1000).toFixed(0)}t cap` : ''}
          ${comp.powerGen ? `<span>POWER: ${comp.powerGen} MW</span>` : ''}
          ${comp.type === 'Weapon' ? `
            <span style="color:#ff6b6b">${(comp.category || 'kinetic').toUpperCase()}</span>
            <span style="color:#ff6767">DMG: ${comp.damage}</span>
            <span>ROF: ${(1 / comp.coolingTime).toFixed(1)}/s</span>
            <span>RNG: ${comp.range >= 1e6 ? (comp.range / 1e6).toFixed(0) + 'Mm' : (comp.range / 1e3).toFixed(0) + 'km'}</span>
            ${comp.proxRadius > 0 ? `<span>PROX: ${comp.proxRadius}m</span>` : ''}
            ${comp.guided ? '<span style="color:#00d4ff">GUIDED</span>' : ''}
            ${comp.turret ? '<span style="color:#00d4ff">TURRET</span>' : ''}
          ` : ''}
          <span style="color: #ffbf00; margin-left: auto;">${costAmount > 0 ? costAmount.toLocaleString() + ' CR' : 'FREE'}</span>
        </div>
      `;

      const canAfford = playerWallet.credits >= costAmount;
      const btn = document.createElement('button');
      btn.className = canAfford ? 'station-btn' : 'station-btn disabled';
      if (!canAfford) {
        btn.style.cssText += 'opacity: 0.5; cursor: not-allowed; border-color: rgba(255,0,0,0.3); color: #ff003f;';
      }
      btn.textContent = costAmount > 0 ? `PURCHASE (${costAmount.toLocaleString()} CR)` : 'EQUIP (FREE)';
      btn.style.cssText += 'margin-top: 8px; font-size: 9px; padding: 4px 10px;';
      btn.onclick = () => {
        if (!canAfford) return;
        const sizeSlots = hull.slots[comp.size] || 0;
        if (sizeSlots === 0) return; // Ship cannot mount this size

        const existingOfSize = equipped.filter(c => c.size === comp.size);
        // If all slots are full, remove the first one to make room
        if (existingOfSize.length >= sizeSlots) {
          const toRemove = existingOfSize[0];
          equipped.splice(equipped.indexOf(toRemove), 1);
          if (toRemove.cost) {
             playerWallet.credits += Math.floor(toRemove.cost * 0.5);
          }
        }
        // Add the new component
        playerWallet.credits -= costAmount;
        equipped.push(comp);
        this._updateCreditsDisplay();
        this._renderTab();
      };
      card.appendChild(btn);

      compList.appendChild(card);
    }
    rightPanel.appendChild(compList);
    wrapper.appendChild(rightPanel);

    this.contentArea.appendChild(wrapper);
  }

  // ─── SHIP DEALER ──────────────────────────────────────────────────────────

  _renderShips() {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `margin-top: 20px; display: flex; gap: 24px;`;

    // ── Left: current vessel ──
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = `flex: 1; border: 1px solid rgba(255,255,255,0.06); padding: 20px;`;
    
    const currentHull = this.ship.loadout.hull;
    const tradeInValue = Math.floor((currentHull.cost || 0) * 0.5);

    leftPanel.innerHTML = `
      <div style="font-size: 12px; color: #39ff14; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 16px;">CURRENT VESSEL</div>
      <div style="font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 4px;">${currentHull.name.toUpperCase()}</div>
      <div style="font-size: 10px; color: #8b949e; margin-bottom: 20px;">
        TRADE-IN VALUE: <span style="color:#ffbf00">${tradeInValue.toLocaleString()} CR</span>
      </div>
    `;

    // Show slot layout to help user compare
    const slotSection = document.createElement('div');
    slotSection.style.cssText = `margin-bottom: 20px;`;
    const slotOrder = ['S', 'M', 'L'];
    const slotLabels = { S: 'SMALL', M: 'MEDIUM', L: 'LARGE' };
    for (const size of slotOrder) {
      const count = currentHull.slots[size] || 0;
      if (count === 0) continue;
      const slotGroup = document.createElement('div');
      slotGroup.style.cssText = `margin-bottom: 4px;`;
      slotGroup.innerHTML = `<span style="font-size: 10px; color: #484f58;">${slotLabels[size]} SLOTS:</span> <span style="color:#e6edf3; font-size: 12px;">${count}</span>`;
      slotSection.appendChild(slotGroup);
    }
    leftPanel.appendChild(slotSection);

    // Ship stats summary
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = `border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px; font-size: 11px; color: #8b949e; line-height: 1.8;`;
    statsDiv.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px;">
        <span>BASE MASS</span><span style="color: #ffbf00; text-align: right;">${(currentHull.baseMass / 1000).toFixed(1)} t</span>
        <span>INTEGRITY</span><span style="color: #39ff14; text-align: right;">${currentHull.integrity} HP</span>
        <span>CARGO CAP</span><span style="color: #00d4ff; text-align: right;">${currentHull.cargoCap || 0} m³</span>
      </div>
    `;
    leftPanel.appendChild(statsDiv);
    wrapper.appendChild(leftPanel);

    // ── Right: available hulls ──
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = `flex: 1.5; border: 1px solid rgba(255,255,255,0.06); padding: 20px;`;
    rightPanel.innerHTML = `
      <div style="font-size: 12px; color: #00d4ff; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 16px;">AVAILABLE HULLS</div>
    `;

    const list = document.createElement('div');
    list.style.cssText = `display: flex; flex-direction: column; gap: 6px; max-height: 500px; overflow-y: auto;`;
    
    for (const [id, hull] of Object.entries(HULLS)) {
      if (id === currentHull.id) continue;
      
      const card = document.createElement('div');
      card.className = 'component-card';
      
      const s = hull.slots.S || 0;
      const m = hull.slots.M || 0;
      const l = hull.slots.L || 0;
      
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="color: #e6edf3; font-size: 14px; font-weight: 600; margin-bottom: 4px;">${hull.name.toUpperCase()}</div>
            <div style="color: #484f58; font-size: 10px;">MASS: ${(hull.baseMass/1000).toFixed(0)}t · INT: ${hull.integrity}HP · CARGO: ${hull.cargoCap || 0}m³</div>
            <div style="color: #8b949e; font-size: 10px; margin-top: 4px;">
              SLOTS: <span style="color:#00d4ff">${s}S</span> / <span style="color:#00d4ff">${m}M</span> / <span style="color:#00d4ff">${l}L</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="color: #ffbf00; font-size: 14px; font-weight:bold;">${hull.cost.toLocaleString()} CR</div>
          </div>
        </div>
      `;
      
      const netCost = hull.cost - tradeInValue;
      const canAfford = playerWallet.credits >= netCost;
      
      const btn = document.createElement('button');
      btn.className = canAfford ? 'station-btn' : 'station-btn disabled';
      if (!canAfford) {
          btn.style.cssText += 'opacity: 0.5; cursor: not-allowed; border-color: rgba(255,0,0,0.3); color: #ff003f;';
      }
      btn.textContent = netCost > 0 ? `PURCHASE (NET: ${netCost.toLocaleString()} CR)` : `EXCHANGE (GAIN: ${Math.abs(netCost).toLocaleString()} CR)`;
      btn.style.cssText += 'margin-top: 12px; font-size: 10px; padding: 6px 12px; width: 100%;';
      
      btn.onclick = () => {
        if (!canAfford) return;
        
        playerWallet.credits -= netCost;
        
        const wasNoShip = this.ship.loadout.hull.id === 'NO_SHIP';
        
        // Transfer fitting components
        const oldEquipped = [...this.ship.loadout.components];
        const newSlots = { ...hull.slots };
        const newEquipped = [];
        
        for (const comp of oldEquipped) {
            if (newSlots[comp.size] > 0) {
                newEquipped.push(comp);
                newSlots[comp.size]--;
            } else {
                if (comp.cost) {
                    playerWallet.credits += Math.floor(comp.cost * 0.5);
                }
            }
        }
        
        this.ship.loadout.hull = hull;
        this.ship.loadout.components = newEquipped;
        this.ship.integrity = this.ship.maxIntegrity;
        
        // The mass/thrust will be recalculated automatically by the Ship getters!
        
        this._updateCreditsDisplay();
        
        if (wasNoShip) {
          this.root.innerHTML = '';
          this._activeTab = 'shipyard';
          this.ship.fuel = this.ship.maxFuel; // Start with full tank
          this._build();
        } else {
          this._renderTab();
        }
      };
      card.appendChild(btn);
      list.appendChild(card);
    }
    
    rightPanel.appendChild(list);
    wrapper.appendChild(rightPanel);
    this.contentArea.appendChild(wrapper);
  }

  // ─── MISSION BOARD ────────────────────────────────────────────────────────

  _renderMissions() {
    const board = window.solarSystem.economy.orderBoard;
    const myOrders = board.orders.filter(o => o.producer === 'YOU' && o.status === 'ACCEPTED');

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `margin-top: 20px;`;
    
    if (myOrders.length === 0) {
        wrapper.style.cssText += `text-align: center; padding: 80px 0;`;
        wrapper.innerHTML = `
          <div style="font-size: 60px; margin-bottom: 16px; opacity: 0.3;">📡</div>
          <div style="font-size: 16px; color: #8b949e; letter-spacing: 0.1em; text-transform: uppercase;">MISSION UPLINK</div>
          <div style="font-size: 12px; color: #484f58; margin-top: 12px; max-width: 400px; margin-left: auto; margin-right: auto; line-height: 1.6;">
            Your active haulage contracts will appear here. Claim contracts from the Order Board [O] to see them.
          </div>
          <div style="
            margin-top: 32px; padding: 12px 24px; display: inline-block;
            border: 1px solid rgba(57,255,20,0.15); font-size: 10px;
            color: #39ff14; letter-spacing: 0.15em;
          ">NO CONTRACTS CLAIMED</div>
        `;
    } else {
        wrapper.innerHTML = `
            <div style="font-size: 12px; color: #39ff14; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 16px;">ACTIVE HAULAGE CONTRACTS</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: #484f58; font-size: 10px;">
                    <th style="text-align: left; padding: 8px;">DESTINATION</th>
                    <th style="text-align: left; padding: 8px;">COMMODITY</th>
                    <th style="text-align: right; padding: 8px;">REMAINING</th>
                    <th style="text-align: right; padding: 8px;">PAYOUT</th>
                    <th style="text-align: center; padding: 8px;">ACTION</th>
                </tr>
                ${myOrders.map(o => {
                    const cargo = this.ship.cargos.find(c => c.type === o.commodityId);
                    const amountHeld = cargo ? cargo.amount : 0;
                    const currentStation = this.body.stationInstances ? this.body.stationInstances[this.activeStationIndex] : this.body.station;
                    const canFulfill = amountHeld >= o.amount && o.consumer === currentStation;
                    const commName = COMMODITIES[o.commodityId]?.name || o.commodityId;
                    
                    return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <td style="padding: 12px 8px;">${o.consumer.name}</td>
                        <td style="padding: 12px 8px; font-weight:bold;">${commName}</td>
                        <td style="padding: 12px 8px; text-align: right;">${o.amount} units</td>
                        <td style="padding: 12px 8px; text-align: right; color: #ffbf00;">${(o.priceOffered * o.amount).toLocaleString()} CR</td>
                        <td style="padding: 12px 8px; text-align: center;">
                            ${canFulfill ? `
                                <button class="station-btn" onclick="window.orderBoardFulfillJob('${o.id}')">COMPLETE</button>
                            ` : `<span style="color:#484f58; font-size: 10px;">${o.consumer === currentStation ? `NEED ${o.amount - amountHeld} MORE` : 'NOT HERE'}</span>`}
                        </td>
                    </tr>
                    `;
                }).join('')}
            </table>
        `;
    }
    this.contentArea.appendChild(wrapper);
  }
}
