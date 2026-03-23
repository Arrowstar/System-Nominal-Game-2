/**
 * FameUI.js — Fame-related UI components.
 *
 * Provides three components:
 *   1. FameBadge     — small persistent HUD element showing FAME X/20
 *   2. GalacticLedger — full-screen overlay listing all milestones
 *   3. LegacyScreen  — Victory end-screen (career summary)
 *   4. GameOverScreen — Defeat screen with optional Mayday button
 */

import { MILESTONES } from '../progression/FameTracker.js';
import { WinLoss }    from '../progression/WinLoss.js';

// ─── Fame Badge ───────────────────────────────────────────────────────────────

/**
 * A small DOM panel showing current Fame. Attach to any HUD root.
 * Call update(fameTracker) each frame.
 */
export class FameBadge {
  constructor(hudManager, idSuffix, defaultZone = 'top-right') {
    const content = document.createElement('div');
    content.style.cssText = `
      display: flex; flex-direction: column; gap: 4px;
      font-family: 'Roboto Mono', monospace;
    `;
    content.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:4px">
        <span id="fame-badge-val" style="font-size:22px;font-weight:700;color:#39ff14;text-shadow:0 0 10px rgba(57,255,20,0.5)">0</span>
        <span style="font-size:12px;color:#484f58">/20</span>
      </div>
      <div style="margin-top:6px;height:3px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden">
        <div id="fame-badge-bar" style="height:100%;width:0%;background:#39ff14;border-radius:2px;transition:width 0.5s"></div>
      </div>
    `;
    this.el = content;

    this.panel = hudManager.createPanel({
      id: `fame-badge-${idSuffix}`,
      title: 'FAME',
      defaultZone: defaultZone,
      contentEl: content,
      minWidth: '130px',
      borderColor: 'rgba(57,255,20,0.25)'
    });
  }

  update(fameTracker) {
    const fame = fameTracker.fame;
    const pct  = Math.max(0, Math.min(100, (fame / 20) * 100));
    this.el.querySelector('#fame-badge-val').textContent = fame;
    this.el.querySelector('#fame-badge-bar').style.width = `${pct}%`;

    // Color shifts as player approaches win
    const color = fame >= 18 ? '#ffbf00' : '#39ff14';
    this.el.querySelector('#fame-badge-val').style.color = color;
    this.el.querySelector('#fame-badge-bar').style.background = color;

    // If fame is negative — show red warning
    if (fame < 0) {
      this.el.querySelector('#fame-badge-val').style.color = '#ff003f';
      this.el.querySelector('#fame-badge-val').style.textShadow = '0 0 10px rgba(255,0,63,0.6)';
      this.el.querySelector('#fame-badge-bar').style.background = '#ff003f';
    }
  }

  /** Flash glow effect on milestone unlock. */
  flash() {
    this.el.style.boxShadow = '0 0 20px rgba(57,255,20,0.5)';
    setTimeout(() => { this.el.style.boxShadow = 'none'; }, 1000);
  }

  destroy() { this.el.remove(); }
}

// ─── Milestone Toast ──────────────────────────────────────────────────────────

/**
 * Toast notification that slides in/out when a milestone is earned.
 * One per HUD root — call tick(fameTracker) each frame to auto-dequeue.
 */
export class MilestoneToast {
  constructor(rootElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position: absolute; top: 80px; left: 50%; transform: translateX(-50%);
      background: rgba(8,11,15,0.92);
      border: 1px solid rgba(57,255,20,0.5);
      box-shadow: 0 0 20px rgba(57,255,20,0.2);
      padding: 10px 24px; text-align: center;
      font-family: 'Roboto Mono', monospace;
      pointer-events: none;
      opacity: 0; transition: opacity 0.4s;
      min-width: 300px;
    `;
    this.el.innerHTML = `
      <div style="font-size:9px;color:#39ff14;letter-spacing:0.15em;margin-bottom:4px">ACHIEVEMENT UNLOCKED</div>
      <div id="toast-title" style="font-size:16px;font-weight:700;color:#fff"></div>
      <div id="toast-fame" style="font-size:11px;color:#39ff14;margin-top:2px"></div>
    `;
    rootElement.appendChild(this.el);
    this._timer = 0;
    this._visible = false;
  }

  tick(dt, fameTracker) {
    // Dequeue next notification when nothing is showing
    if (!this._visible && fameTracker.pendingNotifications.length > 0) {
      const notif = fameTracker.popNotification();
      this.show(notif.milestone, notif.delta);
    }
    if (this._visible) {
      this._timer -= dt;
      if (this._timer <= 0) {
        this.hide();
      }
    }
  }

  show(milestone, delta) {
    this.el.querySelector('#toast-title').textContent = milestone.title.toUpperCase();
    this.el.querySelector('#toast-fame').textContent  = `+${delta} FAME  ·  ${milestone.category.toUpperCase()}`;
    this.el.style.opacity = '1';
    this._timer   = 3.5;   // show for 3.5 seconds
    this._visible = true;
  }

  hide() {
    this.el.style.opacity = '0';
    this._visible = false;
  }

  destroy() { this.el.remove(); }
}

// ─── Galactic Ledger Overlay ──────────────────────────────────────────────────

/**
 * Full-screen overlay showing all fame milestones.
 * Toggle visibility with show() / hide() / toggle().
 */
export class GalacticLedger {
  constructor(rootElement) {
    this.root = rootElement;
    this._overlay = null;
    this._visible = false;
  }

  toggle(fameTracker) {
    if (this._visible) this.hide();
    else this.show(fameTracker);
  }

  show(fameTracker) {
    this.hide(); // Remove existing if any
    this._overlay = document.createElement('div');
    this._overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(6,10,15,0.96);
      display: flex; flex-direction: column;
      align-items: center;
      font-family: 'Roboto Mono', monospace;
      overflow-y: auto; padding: 40px 20px;
      pointer-events: all;
    `;

    const fame  = fameTracker.fame;
    const pct   = Math.max(0, Math.min(100, (fame / 20) * 100));

    this._overlay.innerHTML = `
      <div style="font-size:11px;letter-spacing:0.25em;color:#39ff14;text-transform:uppercase;margin-bottom:6px">Galactic Ledger</div>
      <div style="font-size:40px;font-weight:700;color:#fff;margin-bottom:4px">${fame} <span style="font-size:20px;color:#484f58">/ 20 FAME</span></div>

      <div style="width:min(500px,90vw);height:4px;background:rgba(255,255,255,0.06);border-radius:2px;margin-bottom:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:#39ff14;border-radius:2px"></div>
      </div>
      <div style="font-size:10px;color:#484f58;margin-bottom:32px;letter-spacing:0.1em">
        ${20 - fame > 0 ? `${20 - fame} FAME UNTIL LEGEND` : '✦ LEGEND STATUS ACHIEVED ✦'}
      </div>

      <div id="ledger-milestones" style="display:grid;gap:10px;width:min(600px,90vw)"></div>

      <button id="ledger-close" class="btn btn-primary" style="margin-top:40px;padding:10px 40px">CLOSE [L]</button>
    `;

    // Build milestone rows
    const grid = this._overlay.querySelector('#ledger-milestones');
    for (const m of MILESTONES) {
      const done   = fameTracker.completed.has(m.id);
      const color  = done ? '#39ff14' : '#484f58';
      const badge  = done ? '✦' : '○';
      const row    = document.createElement('div');
      row.style.cssText = `
        display: flex; align-items: center; gap: 14px;
        padding: 12px 16px;
        background: ${done ? 'rgba(57,255,20,0.04)' : 'rgba(255,255,255,0.02)'};
        border: 1px solid ${done ? 'rgba(57,255,20,0.2)' : 'rgba(255,255,255,0.05)'};
        border-left: 3px solid ${done ? '#39ff14' : '#2d3139'};
      `;
      row.innerHTML = `
        <div style="font-size:18px;color:${color};flex-shrink:0;width:20px;text-align:center">${badge}</div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:${done ? '#e6edf3' : '#6e7681'}">${m.title.toUpperCase()}</div>
          <div style="font-size:10px;color:${done ? '#8b949e' : '#3d444d'};margin-top:2px">${m.description}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:16px;font-weight:700;color:${color}">+${m.fame}</div>
          <div style="font-size:9px;color:#484f58;letter-spacing:0.1em">${m.category.toUpperCase()}</div>
        </div>
      `;
      grid.appendChild(row);
    }

    this._overlay.querySelector('#ledger-close').addEventListener('click', () => this.hide());
    document.addEventListener('keydown', this._keyHandler = (e) => {
      if (e.key === 'l' || e.key === 'L' || e.key === 'Escape') this.hide();
    });

    this.root.appendChild(this._overlay);
    this._visible = true;
  }

  hide() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    this._visible = false;
  }

  get isVisible() { return this._visible; }
}

// ─── Legacy Screen (Victory) ──────────────────────────────────────────────────

/**
 * Full-screen victory summary. Replaces hud-root content.
 * @param {HTMLElement} rootElement
 * @param {FameTracker} fameTracker
 * @param {object}      careerStats  { killCount, creditsEarned, stationsDocked, simTime }
 * @param {function}    onNewMission Callback for "NEW MISSION" button
 */
export function buildLegacyScreen(rootElement, fameTracker, careerStats, onNewMission) {
  rootElement.innerHTML = '';
  
  const completedMilestones = MILESTONES.filter(m => fameTracker.completed.has(m.id));
  const timeStr = _formatTime(careerStats.simTime ?? 0);

  const el = document.createElement('div');
  el.style.cssText = `
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: #060a0f;
    font-family: 'Roboto Mono', monospace; color: #e6edf3;
    overflow-y: auto; padding: 40px 20px;
    pointer-events: all;
  `;

  el.innerHTML = `
    <!-- Stars shimmer effect via CSS animation -->
    <style>
      @keyframes starPulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
      .legacy-star { animation: starPulse 2s ease-in-out infinite; }
    </style>

    <div style="font-size:11px;letter-spacing:0.3em;color:#39ff14;text-transform:uppercase;margin-bottom:8px">Mission Complete</div>
    <div style="font-size:52px;font-weight:700;letter-spacing:0.1em;color:#fff;text-shadow:0 0 40px rgba(57,255,20,0.4);margin-bottom:4px">LEGEND</div>
    <div style="font-size:13px;color:#39ff14;letter-spacing:0.2em;margin-bottom:40px">✦ ${fameTracker.fame} FAME EARNED ✦</div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;width:min(600px,90vw);margin-bottom:40px">
      ${_statCard('SHIPS DESTROYED', careerStats.killCount ?? 0)}
      ${_statCard('CREDITS EARNED', _formatCredits(careerStats.creditsEarned ?? 0))}
      ${_statCard('STATIONS VISITED', careerStats.stationsDocked ?? 0)}
      ${_statCard('CAREER TIME', timeStr)}
    </div>

    <div style="text-align:left;width:min(500px,90vw);margin-bottom:40px">
      <div style="font-size:10px;letter-spacing:0.15em;color:#39ff14;margin-bottom:12px">MILESTONES ACHIEVED</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${completedMilestones.map(m => `
          <div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(57,255,20,0.04);border-left:2px solid #39ff14;font-size:11px">
            <span style="color:#e6edf3">${m.title.toUpperCase()}</span>
            <span style="color:#39ff14">+${m.fame} FAME</span>
          </div>
        `).join('')}
      </div>
    </div>

    <button id="legacy-new-mission" class="btn btn-primary" style="padding:14px 48px;font-size:14px;letter-spacing:0.15em">
      NEW MISSION
    </button>
  `;

  el.querySelector('#legacy-new-mission').addEventListener('click', onNewMission);
  rootElement.appendChild(el);
}

// ─── Game Over Screen ─────────────────────────────────────────────────────────

/**
 * Full-screen defeat screen. Conditionally shows Mayday option.
 * @param {HTMLElement} rootElement
 * @param {string}      cause        'hull_breach' | 'dead_orbit'
 * @param {FameTracker} fameTracker
 * @param {object}      careerStats
 * @param {function}    onMayday     Callback for Mayday (null = not available)
 * @param {function}    onEndMission Callback for "END MISSION" button
 */
export function buildGameOverScreen(rootElement, cause, fameTracker, careerStats, onMayday, onEndMission) {
  rootElement.innerHTML = '';

  const isPermanent = fameTracker.isNegative;
  const causeLabel  = cause === 'hull_breach' ? 'HULL BREACH' : 'STRANDED — DEAD ORBIT';
  const causeColor  = '#ff003f';
  const canMayday   = !isPermanent && cause === 'dead_orbit' && onMayday !== null && WinLoss.canMayday(fameTracker);

  const el = document.createElement('div');
  el.style.cssText = `
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: #060a0f;
    font-family: 'Roboto Mono', monospace; color: #e6edf3;
    overflow-y: auto; padding: 40px 20px;
    pointer-events: all;
  `;

  el.innerHTML = `
    <style>
      @keyframes flicker { 0%,95%,100%{opacity:1} 96%,99%{opacity:0.6} }
      .gameover-flicker { animation: flicker 4s infinite; }
    </style>

    <div class="gameover-flicker" style="font-size:11px;letter-spacing:0.3em;color:${causeColor};text-transform:uppercase;margin-bottom:8px">Transmission Lost</div>
    <div class="gameover-flicker" style="font-size:52px;font-weight:700;letter-spacing:0.1em;color:${causeColor};text-shadow:0 0 40px rgba(255,0,63,0.3);margin-bottom:6px">GAME OVER</div>
    <div style="font-size:13px;color:#8b949e;letter-spacing:0.15em;margin-bottom:8px">${causeLabel}</div>

    ${isPermanent ? `
      <div style="margin-bottom:24px;padding:10px 20px;background:rgba(255,0,63,0.1);border:1px solid rgba(255,0,63,0.3);font-size:11px;color:#ff003f;letter-spacing:0.1em;text-align:center">
        INFAMY EXCEEDED — NO RESCUE AVAILABLE
      </div>
    ` : ''}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;width:min(500px,90vw);margin:24px 0">
      ${_statCard('FAME', `${fameTracker.fame}/20`, fameTracker.fame < 0 ? '#ff003f' : '#39ff14')}
      ${_statCard('SHIPS DESTROYED', careerStats.killCount ?? 0)}
      ${_statCard('CREDITS', _formatCredits(careerStats.creditsEarned ?? 0))}
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;align-items:center;margin-top:24px;width:min(400px,90vw)">
      ${canMayday ? `
        <div style="text-align:center;margin-bottom:8px">
          <div style="font-size:10px;color:#ffbf00;letter-spacing:0.1em;margin-bottom:4px">DISTRESS SIGNAL AVAILABLE</div>
          <div style="font-size:11px;color:#8b949e">Cost: 75% credits · −2 Fame</div>
        </div>
        <button id="gameover-mayday" style="
          width:100%;padding:12px;
          background:transparent;border:1px solid rgba(255,191,0,0.5);
          color:#ffbf00;font-family:'Roboto Mono',monospace;font-size:13px;
          letter-spacing:0.15em;cursor:pointer;
          transition:background 0.2s,box-shadow 0.2s;
        " onmouseover="this.style.background='rgba(255,191,0,0.08)';this.style.boxShadow='0 0 12px rgba(255,191,0,0.2)'"
           onmouseout="this.style.background='transparent';this.style.boxShadow='none'">
          ▶ BROADCAST MAYDAY
        </button>
      ` : ''}
      <button id="gameover-end" class="btn btn-primary" style="width:100%;padding:12px;font-size:13px;letter-spacing:0.15em">
        END MISSION
      </button>
    </div>
  `;

  if (canMayday) {
    el.querySelector('#gameover-mayday').addEventListener('click', onMayday);
  }
  el.querySelector('#gameover-end').addEventListener('click', onEndMission);
  rootElement.appendChild(el);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _statCard(label, value, valueColor = '#e6edf3') {
  return `
    <div style="text-align:center;padding:14px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:22px;font-weight:700;color:${valueColor}">${value}</div>
      <div style="font-size:9px;color:#484f58;letter-spacing:0.1em;margin-top:4px;text-transform:uppercase">${label}</div>
    </div>
  `;
}

function _formatCredits(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M ₡`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K ₡`;
  return `${n} ₡`;
}

function _formatTime(simSeconds) {
  const days  = Math.floor(simSeconds / 86400);
  const hours = Math.floor((simSeconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}
