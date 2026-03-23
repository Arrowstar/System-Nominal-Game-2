/**
 * NavHUD.js — DOM-based UI for the Nav-Computer state.
 */

import { WARP_LEVELS } from '../navigation/TimeWarp.js';
import { AU } from '../world/SolarSystem.js';
import { KeplerOrbit, G } from '../physics/KeplerOrbit.js';
import { Vec2 } from '../core/Vec2.js';
import { HUDManager } from './HUDManager.js';

export class NavHUD {
  constructor(rootElement, timeWarp, onExecuteNode, solarSystem = null, onFocusBody = null) {
    this.root = rootElement;
    this.timeWarp = timeWarp;
    this.onExecuteNode = onExecuteNode;
    this.solarSystem = solarSystem;
    this.onFocusBody = onFocusBody;

    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: absolute; inset: 0; pointer-events: none;
      font-family: 'Roboto Mono', monospace; color: #e6edf3;
      overflow: hidden;
    `;

    this.hudManager = new HUDManager(this.container, 'nav');

    this._buildWarpUI();
    this._buildSearchPanel();
    this._buildOrbitPanel();
    this._buildNodeUI();
    this._buildAutopilotPanel();
    this._buildTriBar();
    this._buildBodyInfoPanel();

    this.hudManager.mountAll();
    this.root.appendChild(this.container);

    this.activeNode = null;
    this.ship       = null;
    this.simTime    = 0;
  }

  destroy() {
    this.hudManager.destroy();
    this.root.removeChild(this.container);
  }

  // ─── Update Loop ─────────────────────────────────────────────────────────────

  update(simTime, ship, activeNode, predictedElements = null, selectedBody = null, autopilot = null, playerOrbitElements = null) {
    this.simTime = simTime;
    this.ship = ship;
    this.activeNode = activeNode;
    this.predictedElements = predictedElements;
    this.selectedBody = selectedBody;
    this.autopilot = autopilot;
    this.playerOrbitElements = playerOrbitElements;

    this._updateWarpUI();
    this._updateNodeUI();
    this._updateBodyInfoPanel();
    this._updateAutopilotPanel();
    this._updateOrbitPanel();
    this._updateTriBar(ship);
  }

  // ─── TimeWarp UI ─────────────────────────────────────────────────────────────

  _buildWarpUI() {
    this.warpPanelContent = document.createElement('div');
    this.warpPanelContent.style.cssText = `
      display: flex; gap: 8px; align-items: center;
    `;

    this.warpBtns = WARP_LEVELS.map((level, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = '▶'.repeat(index + 1);
      btn.style.cssText = `
        background: transparent; border: 1px solid transparent; color: #8b949e;
        padding: 4px 12px; cursor: pointer; font-size: 14px;
        transition: all 0.2s;
      `;
      btn.onmouseover = () => { if (this.timeWarp.factor !== level) btn.style.color = '#fff'; };
      btn.onmouseout  = () => { if (this.timeWarp.factor !== level) btn.style.color = '#8b949e'; };
      btn.onclick = () => this.timeWarp.setFactor(level);
      this.warpPanelContent.appendChild(btn);
      return { level, btn };
    });

    this.dateDisplay = document.createElement('div');
    this.dateDisplay.style.cssText = `
      margin-left: 16px; padding-left: 16px; border-left: 1px solid rgba(255,255,255,0.1);
      display: flex; align-items: center; font-size: 13px; color: #39ff14; min-width: 120px;
    `;
    this.warpPanelContent.appendChild(this.dateDisplay);

    this.warpPanel = this.hudManager.createPanel({
      id: 'nav-warp',
      title: 'TIME CONTROL',
      defaultZone: 'top-center', // Moved from top-left to top-center
      contentEl: this.warpPanelContent,
      minWidth: '380px',
      borderColor: 'rgba(57, 255, 20, 0.3)'
    });
  }

  _updateWarpUI() {
    const currentWarp = this.timeWarp.factor;

    this.warpBtns.forEach(({ level, btn }) => {
      if (level === currentWarp) {
        btn.style.color = '#39ff14';
        btn.style.textShadow = '0 0 8px rgba(57,255,20,0.5)';
      } else {
        btn.style.color = '#8b949e';
        btn.style.textShadow = 'none';
      }
    });

    const YEAR = 31557600;
    const DAY  = 86400;
    const y = Math.floor(this.simTime / YEAR) + 1;
    const d = Math.floor((this.simTime % YEAR) / DAY) + 1;
    const hrs = Math.floor((this.simTime % DAY) / 3600);
    const mins = Math.floor((this.simTime % 3600) / 60);
    const secs = Math.floor(this.simTime % 60);

    this.dateDisplay.textContent = `Y ${y} / D ${d.toString().padStart(3, '0')} — ${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  }

  // ─── Search UI ───────────────────────────────────────────────────────────────

  _buildSearchPanel() {
    this.searchPanelContent = document.createElement('div');
    this.searchPanelContent.style.cssText = `
      display: flex; flex-direction: column; gap: 4px; z-index: 100;
    `;

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = 'SEARCH SYSTEM...';
    this.searchInput.style.cssText = `
      width: 100%; padding: 8px 12px; background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(0, 220, 255, 0.4); border-left: 3px solid #00dcff;
      color: #fff; font-family: 'Roboto Mono', monospace; font-size: 14px;
      outline: none; box-sizing: border-box; transition: border-color 0.2s;
    `;
    this.searchInput.addEventListener('focus', () => {
      this.searchInput.style.borderColor = '#00dcff';
      this._updateSearchResults();
    });
    this.searchInput.addEventListener('blur', () => {
      this.searchInput.style.borderColor = 'rgba(0, 220, 255, 0.4)';
      setTimeout(() => { this.searchResults.style.display = 'none'; }, 200);
    });

    this.searchInput.addEventListener('keydown', (e) => e.stopPropagation());
    this.searchInput.addEventListener('keyup', (e) => e.stopPropagation());
    
    this.searchInput.addEventListener('input', () => this._updateSearchResults());

    this.searchResults = document.createElement('div');
    this.searchResults.style.cssText = `
      width: 100%; max-height: 200px; overflow-y: auto; background: rgba(8, 11, 15, 0.95);
      border: 1px solid rgba(0, 220, 255, 0.3); border-top: none; display: none;
      flex-direction: column; box-sizing: border-box;
      scrollbar-width: thin; scrollbar-color: #00dcff rgba(0,0,0,0.2);
    `;

    this.searchPanelContent.appendChild(this.searchInput);
    this.searchPanelContent.appendChild(this.searchResults);
    
    this.searchPanel = this.hudManager.createPanel({
      id: 'nav-search',
      title: 'DATABASE LOG',
      defaultZone: 'top-left',
      contentEl: this.searchPanelContent,
      minWidth: '280px',
      borderColor: 'rgba(0, 220, 255, 0.4)'
    });
  }

  _updateSearchResults() {
    if (!this.solarSystem) return;

    const query = this.searchInput.value.trim().toLowerCase();
    this.searchResults.innerHTML = '';
    
    if (query === '') {
      this.searchResults.style.display = 'none';
      return;
    }

    const allBodies = this.solarSystem.allBodies || [];
    const allStations = this.solarSystem.getAllStations() || [];

    const matches = [];

    for (const body of allBodies) {
      if (body.name.toLowerCase().includes(query)) {
        matches.push({ type: 'BODY', name: body.name, bodyObj: body, color: body.color || '#fff' });
      }
    }

    for (const station of allStations) {
      if (station.name.toLowerCase().includes(query)) {
        matches.push({ type: 'STATION', name: station.name, bodyObj: station.body, color: '#39ff14' });
      }
    }

    if (matches.length === 0) {
      this.searchResults.style.display = 'none';
      return;
    }

    this.searchResults.style.display = 'flex';

    matches.forEach(match => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 8px 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05);
        display: flex; justify-content: space-between; align-items: center; transition: background 0.1s;
      `;
      item.innerHTML = `
        <span style="color: #fff; font-size: 13px;">${match.name}</span>
        <span style="color: ${match.color}; font-size: 10px; opacity: 0.8;">${match.type}</span>
      `;
      item.addEventListener('mouseover', () => { item.style.background = 'rgba(255,255,255,0.1)'; });
      item.addEventListener('mouseout', () => { item.style.background = 'transparent'; });
      
      item.addEventListener('click', () => {
        this.searchInput.value = match.name;
        this.searchResults.style.display = 'none';
        if (this.onFocusBody) {
          this.onFocusBody(match.bodyObj);
        }
      });

      this.searchResults.appendChild(item);
    });
  }

  // ─── Maneuver Node UI ────────────────────────────────────────────────────────

  _buildNodeUI() {
    this.nodePanelContent = document.createElement('div');
    this.nodePanelContent.style.cssText = `
      display: flex; flex-direction: column; gap: 12px;
    `;

    this.nodePanelContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 14px;">
        <span style="color:#8b949e">ΔV</span>
        <span id="mn-dv" style="color:#fff; font-weight:700">0.0 m/s</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 14px;">
        <span style="color:#8b949e">T- (BURN)</span>
        <span id="mn-t" style="color:#fff; font-weight:700">00:00:00</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 14px;">
        <span style="color:#8b949e">EST. BURN</span>
        <span id="mn-dur" style="color:#fff; font-weight:700">0.0 s</span>
      </div>
      <div id="mn-orbit-stats" style="margin-top: 4px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 4px;">
        <div style="font-size: 9px; color:#8b949e; letter-spacing:0.1em; text-transform:uppercase" id="mn-orb-label">NEW ORBIT</div>
        <div style="display: flex; justify-content: space-between; font-size: 12px;">
          <span style="color:#8b949e">NEW PE</span>
          <span id="mn-pe" style="color:#39ff14; font-weight:700">---</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px;">
          <span style="color:#8b949e">NEW AP</span>
          <span id="mn-ap" style="color:#39ff14; font-weight:700">---</span>
        </div>
      </div>
      <button id="mn-exec" class="btn interactive" style="
        margin-top: 8px; width: 100%; padding: 10px; background: rgba(57,255,20,0.1);
        border: 1px solid #39ff14; color: #39ff14; font-weight: 700; cursor: pointer;
      ">AUTO-EXECUTE</button>
      <button id="mn-del" class="btn" style="
        width: 100%; padding: 6px; background: transparent;
        border: 1px solid rgba(255,0,63,0.3); color: #ff003f; cursor: pointer;
        font-size: 11px;
      ">DELETE NODE</button>
    `;

    this.nodePanelContent.querySelector('#mn-exec').onclick = () => {
      if (this.onExecuteNode && this.activeNode) {
        this.onExecuteNode(this.activeNode);
      }
    };

    this.onDeleteNode = null;
    this.nodePanelContent.querySelector('#mn-del').onclick = () => {
      if (this.onDeleteNode) this.onDeleteNode();
    };

    this.nodePanel = this.hudManager.createPanel({
      id: 'nav-node',
      title: 'MANEUVER NODE',
      defaultZone: 'bottom-left',
      contentEl: this.nodePanelContent,
      minWidth: '280px',
      borderColor: '#ffbf00'
    });
    this.nodePanel.style.display = 'none';
  }

  // ─── Body Info Panel ─────────────────────────────────────────────────────────

  _buildBodyInfoPanel() {
    this.bodyPanelContent = document.createElement('div');
    this.bodyPanelContent.style.cssText = `
      display: flex; flex-direction: column; gap: 10px;
    `;
    this.bodyPanelContent.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
        <div id="bp-color-dot" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;"></div>
        <div id="bp-name" style="font-size:15px;font-weight:700;color:#fff;letter-spacing:0.08em;">—</div>
      </div>
      <div id="bp-type-row" style="font-size:10px;color:#484f58;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:2px;">—</div>
      <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span style="color:#8b949e;">DISTANCE</span>
          <span id="bp-dist" style="color:#fff;font-weight:600;">—</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span style="color:#8b949e;">REL VELOCITY</span>
          <span id="bp-relvel" style="color:#fff;font-weight:600;">—</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span style="color:#8b949e;">ORBITAL SPEED</span>
          <span id="bp-orbvel" style="color:#fff;font-weight:600;">—</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span style="color:#8b949e;">PERIOD</span>
          <span id="bp-period" style="color:#fff;font-weight:600;">—</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span style="color:#8b949e;">SEMI-MAJOR AXIS</span>
          <span id="bp-sma" style="color:#fff;font-weight:600;">—</span>
        </div>
      </div>
      <div id="bp-economy-row" style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;display:flex;flex-direction:column;gap:4px;"></div>
    `;
    
    this.bodyPanel = this.hudManager.createPanel({
      id: 'nav-body',
      title: 'SCAN DATA',
      defaultZone: 'bottom-right',
      contentEl: this.bodyPanelContent,
      minWidth: '260px',
      borderColor: 'rgba(57, 255, 20, 0.25)'
    });
    this.bodyPanel.style.display = 'none';
  }

  _updateBodyInfoPanel() {
    const body = this.selectedBody;
    if (!body) {
      this.bodyPanel.style.display = 'none';
      return;
    }
    this.bodyPanel.style.display = 'flex';

    const q = id => this.bodyPanelContent.querySelector(id);

    const isShip = !!body.velocity && !body.type;

    if (isShip) {
      q('#bp-name').textContent = (body.name || 'UNKNOWN SHIP').toUpperCase();
      
      const isMerchant = body.ai && body.ai.state === 'MERCHANT';
      const shipColor = isMerchant ? '#ffbf00' : '#ff003f';
      q('#bp-color-dot').style.background = shipColor;

      const role = isMerchant ? 'MERCHANT' : 'HOSTILE';
      q('#bp-type-row').textContent = `NPC SHIP · ${role}`;

      const dx = this.ship.position.x - body.position.x;
      const dy = this.ship.position.y - body.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      q('#bp-dist').textContent = this._formatDist(dist);

      const rvx = this.ship.velocity.x - body.velocity.x;
      const rvy = this.ship.velocity.y - body.velocity.y;
      const relVel = Math.sqrt(rvx * rvx + rvy * rvy);
      q('#bp-relvel').textContent = this._formatSpeed(relVel);
      
      const speed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y);
      q('#bp-orbvel').textContent = this._formatSpeed(speed);
      q('#bp-orbvel').previousElementSibling.textContent = 'SPEED';

      q('#bp-period').parentElement.style.display = 'none';
      q('#bp-sma').parentElement.style.display = 'none';
      q('#bp-economy-row').innerHTML = `<div style="font-size:10px;color:#888;margin-top:2px;">STATUS: ${body.disabled ? 'DISABLED' : (body.ai ? body.ai.state : 'UNKNOWN')}</div>
                                        <div style="font-size:10px;color:#888;margin-top:2px;">HULL: ${(body.integrity / body.maxIntegrity * 100).toFixed(0)}%</div>`;

    } else {
      q('#bp-name').textContent = body.name.toUpperCase();
      q('#bp-color-dot').style.background = body.color;

      const secLabel = { high: '🟢 HIGH SEC', medium: '🟡 MED SEC', low: '🟠 LOW SEC', none: '🔴 NO SEC' };
      q('#bp-type-row').textContent = `${(body.type || '').toUpperCase()} · ${secLabel[body.security] || 'UNKNOWN'}`;

      const bPos = body.orbit ? body.orbit.getPosition(this.simTime) : { x: 0, y: 0 };
      const bVel = body.orbit ? body.orbit.getVelocity(this.simTime) : { x: 0, y: 0 };

      const dx = this.ship.position.x - bPos.x;
      const dy = this.ship.position.y - bPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      q('#bp-dist').textContent = this._formatDist(dist);

      const rvx = this.ship.velocity.x - bVel.x;
      const rvy = this.ship.velocity.y - bVel.y;
      const relVel = Math.sqrt(rvx * rvx + rvy * rvy);
      q('#bp-relvel').textContent = this._formatSpeed(relVel);

      const orbSpeed = Math.sqrt(bVel.x * bVel.x + bVel.y * bVel.y);
      q('#bp-orbvel').textContent = this._formatSpeed(orbSpeed);
      q('#bp-orbvel').previousElementSibling.textContent = 'ORBITAL SPEED';
      
      q('#bp-period').parentElement.style.display = 'flex';
      q('#bp-sma').parentElement.style.display = 'flex';

      if (body.orbit) {
        const T = body.orbit.period;
        q('#bp-period').textContent = this._formatDuration(T);
        const a = body.orbit.a;
        q('#bp-sma').textContent = this._formatDist(a);
      } else {
        q('#bp-period').textContent = '—  (FIXED)';
        q('#bp-sma').textContent = '—';
      }

      const econEl = q('#bp-economy-row');
      econEl.innerHTML = '';
      if (body.economy) {
        econEl.innerHTML += `<div style="font-size:10px;color:#ffbf00;letter-spacing:0.08em;">${body.economy.toUpperCase()} ECONOMY</div>`;
      }
      if (body.stations && body.stations.length > 0) {
        body.stations.forEach(s => {
          econEl.innerHTML += `<div style="font-size:10px;color:#39ff14;">◆ ${s.name}</div>`;
        });
      }
      if (body.produces && body.produces.length > 0) {
        econEl.innerHTML += `<div style="font-size:10px;color:#8b949e;margin-top:2px;">PRODUCES: ${body.produces.join(', ')}</div>`;
      }
    }
  }

  _formatDist(m) {
    if (m > AU) return `${(m / AU).toFixed(3)} AU`;
    if (m > 1e6) return `${(m / 1e3).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
    return `${Math.round(m).toLocaleString()} m`;
  }

  _formatSpeed(ms) {
    if (ms > 1000) return `${(ms / 1000).toFixed(2)} km/s`;
    return `${ms.toFixed(1)} m/s`;
  }

  _formatDuration(s) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    if (d > 0) return `${d}d ${h.toString().padStart(2, '0')}h`;
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m.toString().padStart(2,'0')}m`;
  }

  _updateNodeUI() {
    if (!this.activeNode) {
      this.nodePanel.style.display = 'none';
      return;
    }
    this.nodePanel.style.display = 'flex';

    const dv = this.activeNode.deltaV;
    const tMinus = this.activeNode.burnTime - this.simTime;
    
    let t = Math.abs(tMinus);
    const sign = tMinus < 0 ? '+' : '-';
    const d = Math.floor(t / 86400); t %= 86400;
    const h = Math.floor(t / 3600);  t %= 3600;
    const m = Math.floor(t / 60);    t %= 60;
    const s = Math.floor(t);
    const tStr = (d > 0 ? `${d}D ` : '') + `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;

    const thrust = this.ship.thrust;
    const isp    = this.ship.isp;
    const g0     = 9.80665;
    
    const dm = this.ship.totalMass * (1 - Math.exp(-dv / (isp * g0)));
    const mDot = thrust / (isp * g0);
    const estBurnSecs = thrust > 0 ? dm / mDot : 0;

    this.nodePanelContent.querySelector('#mn-dv').textContent  = `${dv.toFixed(1)} m/s`;
    this.nodePanelContent.querySelector('#mn-t').textContent   = `T${sign} ${tStr}`;
    this.nodePanelContent.querySelector('#mn-dur').textContent = `${estBurnSecs.toFixed(1)} s`;

    this._updateOrbitStats();

    const execBtn = this.nodePanelContent.querySelector('#mn-exec');
    if (tMinus < 0) {
      execBtn.style.opacity = '0.3';
      execBtn.style.pointerEvents = 'none';
      execBtn.textContent = 'MISSED BURN';
    } else {
      execBtn.style.opacity = '1';
      execBtn.style.pointerEvents = 'all';
      execBtn.textContent = 'AUTO-EXECUTE';
    }
  }

  _updateOrbitStats() {
    const stats = this.nodePanelContent.querySelector('#mn-orbit-stats');
    if (!this.predictedElements) {
      stats.style.display = 'none';
      return;
    }
    stats.style.display = 'flex';

    const { pe, ap, primaryName } = this.predictedElements;

    const formatDist = (d) => {
      if (d === Infinity) return 'ESCAPE';
      if (d > 0.05 * AU) return `${(d / AU).toFixed(3)} AU`;
      if (d > 1000000) return `${(d / 1000).toLocaleString()} km`;
      return `${Math.floor(d).toLocaleString()} m`;
    };

    this.nodePanelContent.querySelector('#mn-pe').textContent = formatDist(pe);
    this.nodePanelContent.querySelector('#mn-ap').textContent = formatDist(ap);
    this.nodePanelContent.querySelector('#mn-orb-label').textContent = `NEW ORBIT @ ${primaryName.toUpperCase()}`;
  }

  // ─── Player Orbit Panel ──────────────────────────────────────────────────────

  _buildOrbitPanel() {
    this.orbitPanelContent = document.createElement('div');
    this.orbitPanelContent.style.cssText = `
      display: flex; flex-direction: column; gap: 6px;
    `;
    this.orbitPanelContent.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
        <div style="flex:1;height:1px;background:rgba(0,220,255,0.2);"></div>
        <div id="orbit-ref" style="font-size:10px;color:#8b949e;letter-spacing:0.06em;">—</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:#8b949e;">PERIAPSIS</span>
        <span id="orbit-pe" style="color:#fff;font-weight:600;">—</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:#8b949e;">APOAPSIS</span>
        <span id="orbit-ap" style="color:#fff;font-weight:600;">—</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:#8b949e;">ECC</span>
        <span id="orbit-ecc" style="color:#fff;font-weight:600;">—</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:#8b949e;">PERIOD</span>
        <span id="orbit-period" style="color:#fff;font-weight:600;">—</span>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;margin-top:2px;display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:#8b949e;">ALTITUDE</span>
        <span id="orbit-alt" style="color:#00dcff;font-weight:700;">—</span>
      </div>
    `;
    
    this.orbitPanel = this.hudManager.createPanel({
      id: 'nav-orbit',
      title: 'LOCAL ORBIT',
      defaultZone: 'middle-left',
      contentEl: this.orbitPanelContent,
      minWidth: '240px',
      borderColor: 'rgba(0, 220, 255, 0.4)'
    });
    this.orbitPanel.style.display = 'none';
  }

  _updateOrbitPanel() {
    const elems = this.playerOrbitElements;
    if (!elems) {
      this.orbitPanel.style.display = 'none';
      return;
    }
    this.orbitPanel.style.display = 'flex';

    const q = id => this.orbitPanelContent.querySelector(id);

    q('#orbit-ref').textContent = `@ ${(elems.refBodyName || 'UNKNOWN').toUpperCase()}`;
    q('#orbit-ref').style.color = elems.refBodyColor || '#8b949e';

    q('#orbit-pe').textContent = this._formatDist(elems.pe);

    if (elems.e >= 1 || !isFinite(elems.ap)) {
      q('#orbit-ap').textContent = 'ESCAPE';
      q('#orbit-ap').style.color = '#ff003f';
    } else {
      q('#orbit-ap').textContent = this._formatDist(elems.ap);
      q('#orbit-ap').style.color = '#fff';
    }

    q('#orbit-ecc').textContent = elems.e.toFixed(4);

    if (elems.e >= 1 || !isFinite(elems.period)) {
      q('#orbit-period').textContent = '∞ (ESCAPE)';
    } else {
      q('#orbit-period').textContent = this._formatDuration(elems.period);
    }

    q('#orbit-alt').textContent = this._formatDist(Math.max(0, elems.altitude));
  }

  // ─── Autopilot Panel ─────────────────────────────────────────────────────────

  _buildAutopilotPanel() {
    this.apPanelContent = document.createElement('div');
    this.apPanelContent.style.cssText = `
      display: flex; flex-direction: column; gap: 8px;
    `;
    this.apPanelContent.innerHTML = `
      <div style="font-size:14px;font-weight:700;letter-spacing:0.1em;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;margin-bottom:2px;color:#39ff14;">
        STATE: <span id="ap-state" style="color:#fff;">OFF</span>
      </div>
      <div style="font-size:11px;color:#8b949e;margin-bottom:2px;">TARGET: <span id="ap-target" style="color:#fff;">—</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:#8b949e;">ETA</span>
        <span id="ap-eta" style="font-weight:600;">—</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:#8b949e;">ΔV REQ</span>
        <span id="ap-dv" style="font-weight:600;">—</span>
      </div>
    `;
    
    this.apPanel = this.hudManager.createPanel({
      id: 'nav-autopilot',
      title: 'AUTOPILOT',
      defaultZone: 'top-right',
      contentEl: this.apPanelContent,
      minWidth: '220px',
      borderColor: 'rgba(57, 255, 20, 0.25)'
    });
    this.apPanel.style.display = 'none';
  }

  _updateAutopilotPanel() {
    const ap = this.autopilot;
    if (!ap || !ap.active) {
      this.apPanel.style.display = 'none';
      return;
    }
    this.apPanel.style.display = 'flex';

    const formatTime = t => {
      if (!t || !isFinite(t)) return '—';
      if (t < 0) return '0s';
      const d = Math.floor(t / 86400);
      const h = Math.floor((t % 86400) / 3600);
      const m = Math.floor((t % 3600) / 60);
      const s = Math.floor(t % 60);
      return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    const targetName = ap.targetBody ? ap.targetBody.name.toUpperCase() : 'UNKNOWN';
    let stateColor = '#fff';
    switch (ap.state) {
      case 'ALIGN': stateColor = '#ffb000'; break;
      case 'ACCEL': stateColor = '#ff3333'; break;
      case 'BRAKE': stateColor = '#39ff14'; break;
      case 'HOLD':  stateColor = '#00ffff'; break;
    }

    this.apPanelContent.querySelector('#ap-state').textContent = ap.state;
    this.apPanelContent.querySelector('#ap-state').style.color = stateColor;
    this.apPanelContent.querySelector('#ap-target').textContent = targetName;
    this.apPanelContent.querySelector('#ap-eta').textContent = formatTime(ap.eta);
    this.apPanelContent.querySelector('#ap-dv').textContent = (ap.dvRemaining).toFixed(1) + ' m/s';
  }

  // ─── Tri-Bar Resource Monitor (right side) ────────────────────────────────

  _buildTriBar() {
    this.triBarContent = document.createElement('div');
    this.triBarContent.style.cssText = `
      display: flex; flex-direction: column; gap: 12px;
    `;
    this.triBarContent.innerHTML = `
      ${this._barHTML('FUEL', 'nav-fuel', '#00d4ff')}
      ${this._barHTML('POWER', 'nav-power', '#ffbf00')}
      ${this._barHTML('HEAT', 'nav-heat', '#ff003f')}
    `;
    
    this.triBar = this.hudManager.createPanel({
      id: 'nav-resources',
      title: 'SYSTEMS',
      defaultZone: 'middle-right',
      contentEl: this.triBarContent,
      minWidth: '140px',
      borderColor: 'rgba(255,255,255,0.1)'
    });
  }

  _barHTML(label, id, color) {
    return `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:3px">
          <span style="color:${color};letter-spacing:0.08em">${label}</span>
          <span id="${id}-val" style="color:#8b949e">100%</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
          <div id="${id}-bar" style="height:100%;width:100%;background:${color};transition:width 0.15s;border-radius:3px"></div>
        </div>
      </div>
    `;
  }

  _updateTriBar(ship) {
    const fuelPct = ship.maxFuel > 0 ? (ship.fuel / ship.maxFuel) * 100 : 0;
    const powPct = ship.maxPower > 0 ? (ship.power / ship.maxPower) * 100 : 0;
    const heatPct = ship.maxHeat > 0 ? (ship.heat / ship.maxHeat) * 100 : 0;

    this.triBarContent.querySelector('#nav-fuel-bar').style.width = `${fuelPct}%`;
    this.triBarContent.querySelector('#nav-fuel-val').textContent = `${fuelPct.toFixed(0)}%`;

    this.triBarContent.querySelector('#nav-power-bar').style.width = `${powPct}%`;
    this.triBarContent.querySelector('#nav-power-val').textContent = `${powPct.toFixed(0)}%`;

    this.triBarContent.querySelector('#nav-heat-bar').style.width = `${heatPct}%`;
    this.triBarContent.querySelector('#nav-heat-val').textContent = `${heatPct.toFixed(0)}%`;

    const heatBar = this.triBarContent.querySelector('#nav-heat-bar');
    if (heatPct > 80) {
      heatBar.style.boxShadow = '0 0 8px rgba(255,0,63,0.6)';
    } else {
      heatBar.style.boxShadow = 'none';
    }
  }
}
