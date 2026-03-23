/**
 * TacticalHUD.js — DOM-based cockpit HUD overlay for the Tactical Bridge.
 */

import { Vec2 } from '../core/Vec2.js';
import { AU } from '../world/SolarSystem.js';
import { HUDManager } from './HUDManager.js';

export class TacticalHUD {
  constructor(rootElement) {
    this.root = rootElement;

    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: absolute; inset: 0; pointer-events: none;
      font-family: 'Roboto Mono', monospace; color: #e6edf3;
      overflow: hidden;
    `;
    
    this.hudManager = new HUDManager(this.container, 'tac');

    this._buildVelocityPanel();
    this._buildThrustGauge();
    this._buildTriBar();
    this._buildHullIndicator();
    this._buildTargetDataBlock();
    this._buildAutopilotStatus();
    this._buildWeaponSelector();
    
    // Non-dockable global overlays
    this._buildEdgeRadar();
    this._buildTimeDisplay();
    this._buildToggleHint();
    this._buildDockingPrompt();

    this.hudManager.mountAll();
    this.root.appendChild(this.container);
  }

  destroy() {
    this.hudManager.destroy();
    this.root.removeChild(this.container);
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  update(ship, system, simTime, tacticalView, targeting, pursuitAssist, docking, autopilot) {
    this._updateVelocity(ship);
    this._updateThrust(ship);
    this._updateTriBar(ship);
    this._updateHull(ship);
    this._updateTime(simTime);
    this._updateEdgeRadar(ship, system, simTime, tacticalView);
    this._updateTargetDataBlock(ship, simTime, targeting);
    this._updateAssistState(pursuitAssist);
    this._updateDockingPrompt(docking);
    this._updateAutopilotStatus(autopilot);
    this._updateWeaponSelector(ship);
  }

  _updateAssistState(pursuitAssist) {
    if (!this.toggleHint) return;
    const el = this.toggleHint.querySelector('#tac-assist-state');
    if (!el) return;

    if (pursuitAssist && pursuitAssist.active) {
      el.textContent = 'ASSIST ACTIVE';
      el.style.color = '#39ff14';
      el.style.textShadow = '0 0 10px rgba(57,255,20,0.8)';
    } else {
      el.textContent = 'MANUAL FLIGHT';
      el.style.color = '#ffbf00';
      el.style.textShadow = 'none';
    }
  }

  // ─── Velocity Panel (top-left) ────────────────────────────────────────────

  _buildVelocityPanel() {
    this.velPanelContent = document.createElement('div');
    this.velPanelContent.innerHTML = `
      <div id="tac-vel" style="font-size:20px;font-weight:700;color:#fff">0 m/s</div>
      <div id="tac-heading" style="font-size:11px;color:#8b949e;margin-top:4px">HDG 000°</div>
    `;
    
    this.velPanel = this.hudManager.createPanel({
      id: 'tac-velocity',
      title: 'VELOCITY',
      defaultZone: 'top-left',
      contentEl: this.velPanelContent,
      minWidth: '180px',
      borderColor: 'rgba(57,255,20,0.25)'
    });
  }

  _updateVelocity(ship) {
    const speed = ship.velocity.len();
    const velStr = speed > 1000
      ? `${(speed / 1000).toFixed(2)} km/s`
      : `${speed.toFixed(1)} m/s`;
    this.velPanelContent.querySelector('#tac-vel').textContent = velStr;

    const hdg = ((ship.heading * 180 / Math.PI) % 360 + 360) % 360;
    this.velPanelContent.querySelector('#tac-heading').textContent = `HDG ${hdg.toFixed(0).padStart(3, '0')}°`;
  }

  // ─── Target Data Block (bottom-left) ──────────────────────────────────────

  _buildTargetDataBlock() {
    this.targetPanelContent = document.createElement('div');
    this.targetPanelContent.innerHTML = `
      <div id="tgt-name" style="font-size:16px;font-weight:700;color:#fff">UNKNOWN</div>
      <div id="tgt-dist" style="font-size:11px;color:#8b949e;margin-top:2px">DST: --</div>
      <div id="tgt-vel" style="font-size:11px;color:#8b949e;margin-top:2px">REL VEL: --</div>
    `;
    
    this.targetPanel = this.hudManager.createPanel({
      id: 'tac-target',
      title: 'TARGET LOCKED',
      defaultZone: 'bottom-left',
      contentEl: this.targetPanelContent,
      minWidth: '180px',
      borderColor: 'rgba(57,255,20,0.25)'
    });
    this.targetPanel.style.display = 'none';
  }

  _updateTargetDataBlock(ship, simTime, targeting) {
    if (!targeting || !targeting.hasTarget()) {
      this.targetPanel.style.display = 'none';
      return;
    }

    this.targetPanel.style.display = 'flex';
    const target = targeting.lockedTarget;
    const tPos = targeting.getTargetPosition(simTime);

    // Name
    this.targetPanelContent.querySelector('#tgt-name').textContent = target.name.toUpperCase();

    // Distance
    const dist = ship.position.dist(tPos);
    let distStr = '';
    if (dist > AU) distStr = `${(dist / AU).toFixed(2)} AU`;
    else if (dist > 1e6) distStr = `${(dist / 1e3).toFixed(0)} km`;
    else distStr = `${dist.toFixed(0)} m`;
    this.targetPanelContent.querySelector('#tgt-dist').textContent = `DST: ${distStr}`;

    // Relative Velocity
    const tVel = targeting.getTargetVelocity(simTime);
    const relVel = tVel.sub(ship.velocity).len();
    let relVelStr = '';
    if (relVel > 1000) relVelStr = `${(relVel / 1000).toFixed(2)} km/s`;
    else relVelStr = `${relVel.toFixed(1)} m/s`;
    this.targetPanelContent.querySelector('#tgt-vel').textContent = `REL VEL: ${relVelStr}`;
  }

  // ─── Thrust Gauge (top-right) ─────────────────────────────────────────────

  _buildThrustGauge() {
    this.thrustPanelContent = document.createElement('div');
    this.thrustPanelContent.style.textAlign = 'right';
    this.thrustPanelContent.innerHTML = `
      <div id="tac-thrust-kn" style="font-size:18px;font-weight:700;color:#fff">0 kN</div>
      <div id="tac-gforce" style="font-size:11px;color:#8b949e;margin-top:2px">0.00 G</div>
      <div style="margin-top:8px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
        <div id="tac-throttle-bar" style="height:100%;width:0%;background:#39ff14;transition:width 0.1s"></div>
      </div>
      <div id="tac-throttle-pct" style="font-size:9px;color:#484f58;margin-top:2px">THR 0%</div>
    `;
    
    this.thrustPanel = this.hudManager.createPanel({
      id: 'tac-thrust',
      title: 'THRUST',
      defaultZone: 'top-right',
      contentEl: this.thrustPanelContent,
      minWidth: '160px',
      borderColor: 'rgba(57,255,20,0.25)'
    });
  }

  _updateThrust(ship) {
    const thrustKN = (ship.thrust * ship.throttle) / 1000;
    this.thrustPanelContent.querySelector('#tac-thrust-kn').textContent = `${thrustKN.toFixed(0)} kN`;
    this.thrustPanelContent.querySelector('#tac-gforce').textContent = `${ship.gForce.toFixed(2)} G`;
    this.thrustPanelContent.querySelector('#tac-throttle-bar').style.width = `${ship.throttle * 100}%`;
    this.thrustPanelContent.querySelector('#tac-throttle-pct').textContent = `THR ${(ship.throttle * 100).toFixed(0)}%`;
  }

  // ─── Tri-Bar Resource Monitor (right side) ────────────────────────────────

  _buildTriBar() {
    this.triBarContent = document.createElement('div');
    this.triBarContent.style.cssText = `
      display: flex; flex-direction: column; gap: 12px;
    `;
    this.triBarContent.innerHTML = `
      ${this._barHTML('FUEL', 'tac-fuel', '#00d4ff')}
      ${this._barHTML('POWER', 'tac-power', '#ffbf00')}
      ${this._barHTML('HEAT', 'tac-heat', '#ff003f')}
    `;
    
    this.triBar = this.hudManager.createPanel({
      id: 'tac-resources',
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

    this.triBarContent.querySelector('#tac-fuel-bar').style.width = `${fuelPct}%`;
    this.triBarContent.querySelector('#tac-fuel-val').textContent = `${fuelPct.toFixed(0)}%`;

    this.triBarContent.querySelector('#tac-power-bar').style.width = `${powPct}%`;
    this.triBarContent.querySelector('#tac-power-val').textContent = `${powPct.toFixed(0)}%`;

    this.triBarContent.querySelector('#tac-heat-bar').style.width = `${heatPct}%`;
    this.triBarContent.querySelector('#tac-heat-val').textContent = `${heatPct.toFixed(0)}%`;

    const heatBar = this.triBarContent.querySelector('#tac-heat-bar');
    if (heatPct > 80) {
      heatBar.style.boxShadow = '0 0 8px rgba(255,0,63,0.6)';
    } else {
      heatBar.style.boxShadow = 'none';
    }
  }

  // ─── Hull Integrity (bottom-right) ────────────────────────────────────────

  _buildHullIndicator() {
    this.hullPanelContent = document.createElement('div');
    this.hullPanelContent.style.cssText = `
      text-align: center;
    `;
    this.hullPanelContent.innerHTML = `
      <canvas id="tac-hull-canvas" width="80" height="50" style="display:block;margin:0 auto"></canvas>
      <div id="tac-hull-pct" style="font-size:14px;font-weight:700;color:#39ff14;margin-top:6px">100%</div>
    `;
    
    this.hullPanel = this.hudManager.createPanel({
      id: 'tac-hull',
      title: 'HULL',
      defaultZone: 'bottom-right',
      contentEl: this.hullPanelContent,
      minWidth: '140px',
      borderColor: 'rgba(255,255,255,0.1)'
    });
  }

  _updateHull(ship) {
    const pct = ship.maxIntegrity > 0 ? ship.integrity / ship.maxIntegrity : 0;
    const pctStr = `${(pct * 100).toFixed(0)}%`;

    let color;
    if (pct > 0.6) color = '#39ff14';
    else if (pct > 0.3) color = '#ffbf00';
    else color = '#ff003f';

    this.hullPanelContent.querySelector('#tac-hull-pct').textContent = pctStr;
    this.hullPanelContent.querySelector('#tac-hull-pct').style.color = color;
    
    const headerTitle = this.hullPanel.querySelector('.hud-dock-header div');
    if (headerTitle) headerTitle.style.color = color;

    const cv = this.hullPanelContent.querySelector('#tac-hull-canvas');
    if (cv) {
        const c = cv.getContext('2d');
        c.clearRect(0, 0, 80, 50);

        c.strokeStyle = color;
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(40, 5);    // nose
        c.lineTo(55, 20);   // right wing
        c.lineTo(50, 45);   // right tail
        c.lineTo(40, 38);   // center tail
        c.lineTo(30, 45);   // left tail
        c.lineTo(25, 20);   // left wing
        c.closePath();
        c.stroke();

        c.fillStyle = color + '20';
        c.fill();
    }
  }

  // ─── Autopilot Status (top-left, below velocity) ──────────────────────────

  _buildAutopilotStatus() {
    this.apPanelContent = document.createElement('div');
    this.apPanelContent.style.cssText = `
      display: flex; flex-direction: column; gap: 4px;
      font-family: 'Roboto Mono', monospace;
    `;
    this.apPanelContent.innerHTML = `
      <div id="tac-ap-state" style="font-size:16px;font-weight:700;color:#fff;">OFF</div>
      <div id="tac-ap-target" style="font-size:10px;color:#484f58;letter-spacing:0.05em">NO TARGET</div>
    `;
    
    this.apPanel = this.hudManager.createPanel({
      id: 'tac-autopilot',
      title: 'AUTOPILOT',
      defaultZone: 'middle-left',
      contentEl: this.apPanelContent,
      minWidth: '140px',
      borderColor: 'rgba(57,255,20,0.25)'
    });
    this.apPanel.style.display = 'none';
  }

  _updateAutopilotStatus(ap) {
    if (!ap || !ap.active) {
      this.apPanel.style.display = 'none';
      return;
    }
    this.apPanel.style.display = 'flex';

    let stateColor = '#fff';
    switch (ap.state) {
      case 'ALIGN': stateColor = '#ffb000'; break;
      case 'ACCEL': stateColor = '#ff3333'; break;
      case 'BRAKE': stateColor = '#39ff14'; break;
      case 'HOLD':  stateColor = '#00ffff'; break;
    }

    this.apPanelContent.querySelector('#tac-ap-state').textContent = ap.state;
    this.apPanelContent.querySelector('#tac-ap-state').style.color = stateColor;
    this.apPanelContent.querySelector('#tac-ap-target').textContent = ap.targetBody ? ap.targetBody.name.toUpperCase() : '';
  }

  // ─── Weapon Selector (left side, below velocity) ──────────────────────────

  _buildWeaponSelector() {
    this.weaponPanelContent = document.createElement('div');
    this.weaponPanelContent.style.cssText = `
      font-family: 'Roboto Mono', monospace;
    `;
    this.weaponPanelContent.innerHTML = `
      <div id="tac-weapon-list"></div>
    `;
    
    this.weaponPanel = this.hudManager.createPanel({
      id: 'tac-weapons',
      title: 'WEAPONS [Q] CYCLE',
      defaultZone: 'middle-left',
      contentEl: this.weaponPanelContent,
      minWidth: '200px',
      borderColor: 'rgba(255,191,0,0.25)'
    });
  }

  _updateWeaponSelector(ship) {
    const listEl = this.weaponPanelContent.querySelector('#tac-weapon-list');
    if (!listEl) return;

    const weapons = ship.weapons ? ship.weapons.getWeapons() : [];
    if (weapons.length === 0) {
      listEl.innerHTML = `<div style="font-size:10px;color:#484f58;font-style:italic">NO WEAPONS EQUIPPED</div>`;
      return;
    }

    const selectedIdx = ship.weapons.selectedIndex;
    let html = '';
    weapons.forEach((w, i) => {
      const isSelected = i === selectedIdx;
      const cooldown = ship.weapons.cooldowns[w.id] || 0;
      const ready = cooldown <= 0;

      const catIcon = w.category === 'kinetic' ? '⦿' : (w.category === 'energy' ? '⚡' : '🚀');
      const borderColor = isSelected ? (ready ? 'rgba(57,255,20,0.6)' : 'rgba(255,191,0,0.4)') : 'rgba(255,255,255,0.06)';
      const bgColor = isSelected ? 'rgba(57,255,20,0.06)' : 'transparent';
      const nameColor = isSelected ? '#39ff14' : '#8b949e';

      const coolPct = ready ? 0 : Math.min(100, (cooldown / w.coolingTime) * 100);

      html += `
        <div style="border:1px solid ${borderColor};background:${bgColor};padding:4px 8px;margin-bottom:3px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;">${catIcon}</span>
          <div style="flex:1;">
            <div style="font-size:11px;color:${nameColor};font-weight:${isSelected ? 700 : 400}">${isSelected ? '▸ ' : ''}${w.name}</div>
            ${!ready ? `<div style="height:2px;background:rgba(255,255,255,0.08);margin-top:2px;border-radius:1px;overflow:hidden"><div style="height:100%;width:${100 - coolPct}%;background:#ffbf00;transition:width 0.1s"></div></div>` : ''}
          </div>
          <span style="font-size:9px;color:${ready ? '#39ff14' : '#ffbf00'}">${ready ? 'RDY' : cooldown.toFixed(1) + 's'}</span>
        </div>
      `;
    });
    listEl.innerHTML = html;
  }

  // ─── Edge Radar ───────────────────────────────────────────────────────────

  _buildEdgeRadar() {
    this.radarContainer = document.createElement('div');
    this.radarContainer.style.cssText = `
      position: absolute; inset: 0; pointer-events: none; overflow: hidden;
    `;
    this.container.appendChild(this.radarContainer);
    this._radarArrows = [];
  }

  _updateEdgeRadar(ship, system, simTime, tacticalView) {
    for (const el of this._radarArrows) el.remove();
    this._radarArrows = [];

    const W = window.innerWidth;
    const H = window.innerHeight;
    const margin = 40;
    const shipPos = ship.position;

    for (const body of system.allBodies) {
      const bPos = body.orbit ? body.orbit.getPosition(simTime) : new Vec2(0, 0);
      const sp = tacticalView.worldToScreen(bPos.x, bPos.y, shipPos);

      // Only show if off-screen
      if (sp.x >= margin && sp.x <= W - margin && sp.y >= margin && sp.y <= H - margin) continue;

      const dx = sp.x - W / 2;
      const dy = sp.y - H / 2;
      const angle = Math.atan2(dy, dx);
      const ex = Math.max(margin, Math.min(W - margin, W / 2 + Math.cos(angle) * (W / 2 - margin)));
      const ey = Math.max(margin, Math.min(H - margin, H / 2 + Math.sin(angle) * (H / 2 - margin)));

      const dx2 = shipPos.x - bPos.x;
      const dy2 = shipPos.y - bPos.y;
      const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      let distStr;
      if (dist > 0.1 * AU) distStr = `${(dist / AU).toFixed(2)} AU`;
      else if (dist > 1e6) distStr = `${(dist / 1e6).toFixed(1)}M km`;
      else distStr = `${(dist / 1000).toFixed(0)} km`;

      let color = '#8b949e';
      if (body.type === 'star') color = '#FFD700';
      else if (body.type === 'gas') color = '#00d4ff';
      else if (body.type === 'rocky') color = '#c9d1d9';
      else if (body.type === 'station') color = '#39ff14';

      const arrow = document.createElement('div');
      arrow.style.cssText = `
        position: absolute;
        left: ${ex}px; top: ${ey}px;
        transform: translate(-50%, -50%) rotate(${angle}rad);
        font-size: 9px; color: ${color};
        white-space: nowrap;
      `;
      arrow.innerHTML = `
        <span style="font-size:14px">▶</span>
        <span style="position:absolute;left:18px;top:-1px;transform:rotate(${-angle}rad);white-space:nowrap">${body.name} ${distStr}</span>
      `;
      this.radarContainer.appendChild(arrow);
      this._radarArrows.push(arrow);
    }
  }

  // ─── Time Display (top-center) ──────────────────────────────────────────

  _buildTimeDisplay() {
    this.timeDisplayContent = document.createElement('div');
    this.timeDisplayContent.style.cssText = `
      padding: 4px 8px;
      font-size: 14px; font-weight: 700; color: #39ff14;
      letter-spacing: 0.1em;
    `;
    this.timeDisplayContent.textContent = 'Y 1 / D 001 — 00:00:00';
    
    this.timeDisplay = this.hudManager.createPanel({
      id: 'tac-time',
      title: 'LOCAL TIME',
      defaultZone: 'top-center',
      contentEl: this.timeDisplayContent,
      minWidth: '220px',
      borderColor: 'rgba(57,255,20,0.2)'
    });
  }

  _updateTime(simTime) {
    const YEAR = 31557600;
    const DAY = 86400;
    const y = Math.floor(simTime / YEAR) + 1;
    const d = Math.floor((simTime % YEAR) / DAY) + 1;
    const hrs = Math.floor((simTime % DAY) / 3600);
    const mins = Math.floor((simTime % 3600) / 60);
    const secs = Math.floor(simTime % 60);

    const timeStr = `Y ${y} / D ${d.toString().padStart(3, '0')} — ${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    this.timeDisplayContent.textContent = timeStr;
  }

  // ─── Toggle Hint (bottom center) ──────────────────────────────────────────

  _buildToggleHint() {
    this.toggleHint = document.createElement('div');
    this.toggleHint.style.cssText = `
      position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
      font-size: 11px; color: #484f58; letter-spacing: 0.1em; text-transform: uppercase;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    `;
    this.toggleHint.innerHTML = `
      <div id="tac-assist-state" style="font-weight:700; color:#ffbf00; font-size:14px;">MANUAL FLIGHT</div>
      <div><kbd style="color:#39ff14;border:1px solid rgba(57,255,20,0.3);padding:2px 6px;border-radius:2px">TAB</kbd> NAV COMPUTER</div>
    `;
    this.container.appendChild(this.toggleHint);
  }

  // ─── Docking Prompt (top center, below time) ──────────────────────────────

  _buildDockingPrompt() {
    this.dockPrompt = document.createElement('div');
    this.dockPrompt.style.cssText = `
      position: absolute; top: 70px; left: 50%; transform: translateX(-50%);
      background: rgba(8,11,15,0.85); border: 1px solid rgba(57,255,20,0.3);
      padding: 8px 20px; border-radius: 4px; text-align: center;
      display: none;
    `;
    this.dockPrompt.innerHTML = `
      <div id="dock-prompt-text" style="font-size: 13px; font-weight: 700; color: #39ff14; letter-spacing: 0.1em;"></div>
      <div id="dock-prompt-speed" style="font-size: 10px; color: #8b949e; margin-top: 4px;"></div>
    `;
    this.container.appendChild(this.dockPrompt);
  }

  _updateDockingPrompt(docking) {
    if (!docking || !this.dockPrompt) return;

    if (docking.dockTarget) {
      this.dockPrompt.style.display = 'block';
      const label = docking.getTargetLabel();
      const textEl = this.dockPrompt.querySelector('#dock-prompt-text');
      const speedEl = this.dockPrompt.querySelector('#dock-prompt-speed');

      if (docking.canDock) {
        textEl.textContent = `PRESS [F] TO DOCK AT ${label.toUpperCase()}`;
        textEl.style.color = '#39ff14';
        this.dockPrompt.style.borderColor = 'rgba(57,255,20,0.4)';
        this.dockPrompt.style.boxShadow = '0 0 15px rgba(57,255,20,0.15)';
        speedEl.textContent = `APPROACH: ${(docking.approachSpeed).toFixed(0)} m/s`;
        speedEl.style.color = '#39ff14';
      } else {
        textEl.textContent = `TOO FAST TO DOCK AT ${label.toUpperCase()}`;
        textEl.style.color = '#ffbf00';
        this.dockPrompt.style.borderColor = 'rgba(255,191,0,0.3)';
        this.dockPrompt.style.boxShadow = '0 0 15px rgba(255,191,0,0.1)';
        speedEl.textContent = `APPROACH: ${(docking.approachSpeed / 1000).toFixed(2)} km/s · MAX: ${(docking.constructor.MAX_APPROACH_SPEED / 1000).toFixed(0)} km/s`;
        speedEl.style.color = '#ffbf00';
      }
    } else {
      this.dockPrompt.style.display = 'none';
    }
  }
}
