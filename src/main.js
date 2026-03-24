/**
 * main.js — System Nominal entry point.
 *
 * Bootstraps the engine and wires together:
 *   GameLoop → StateManager → InputManager → Camera
 *
 * The game starts on the main menu and transitions based on player input.
 */
import '/src/index.css';

import { ActiveOrdersPanel } from './ui/ActiveOrdersPanel.js';
import { GameLoop } from './core/GameLoop.js';
import { InputManager } from './core/InputManager.js';
import { StateManager, STATES } from './core/StateManager.js';
import { Camera } from './core/Camera.js';
import { Vec2 } from './core/Vec2.js';
import { Ship } from './physics/Ship.js';
import { Loadout } from './ship/Loadout.js';
import { ShipSim } from './physics/ShipSim.js';
import { Trajectory } from './physics/Trajectory.js';
import { TimeWarp } from './navigation/TimeWarp.js';
import { NavComputer } from './navigation/NavComputer.js';
import { NavHUD } from './ui/NavHUD.js';
import { TacticalView } from './tactical/TacticalView.js';
import { TargetingSystem } from './tactical/TargetingSystem.js';
import { TacticalHUD } from './ui/TacticalHUD.js';
import { PursuitAssist } from './tactical/PursuitAssist.js';
import { WeaponSystem } from './combat/Weapons.js';
import { EnemyAI } from './combat/EnemyAI.js';
import { DockingManager } from './core/DockingManager.js';
import { StationUI } from './ui/StationUI.js';
import { BoardingUI } from './ui/BoardingUI.js';
import { solarSystem, AU } from './world/SolarSystem.js';
import { AutopilotManager } from './navigation/AutopilotManager.js';
import { EconomyEngine } from './economy/EconomyEngine.js';
import { OrderBoardUI } from './ui/OrderBoardUI.js';
import { DebugEconomyUI } from './ui/DebugEconomyUI.js';
import { FameTracker } from './progression/FameTracker.js';
import { WinLoss } from './progression/WinLoss.js';
import { FameBadge, MilestoneToast, GalacticLedger, buildLegacyScreen, buildGameOverScreen } from './ui/FameUI.js';

// ─── Canvas Setup ──────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ─── Core Systems ──────────────────────────────────────────────────────────
const input = new InputManager(canvas);
const camera = new Camera(canvas);
const states = new StateManager();

// GameLoop instantiated early so TimeWarp can reference it
const loop = new GameLoop(
  (dt, simTime) => {
    states.update(dt, simTime);
    input.endFrame();
  },
  (alpha) => {
    states.render(alpha);
  }
);

// ─── Game State Data ────────────────────────────────────────────────────────
const initialLoadout = new Loadout('NO_SHIP', []);
const playerShip = new Ship({
  position: new Vec2(1.05 * AU, 0),
  velocity: new Vec2(0, 106181), // Circular orbital velocity at 1.05 AU with compressed system mass
  loadout: initialLoadout,
  name: 'SN-01',
});
playerShip.firstLaunch = true;
const timeWarp = new TimeWarp(loop);
const targeting = new TargetingSystem(solarSystem);
const shipSim = new ShipSim(solarSystem.gravBodies);
const trajectory = new Trajectory(shipSim, new Vec2(0, 0));
const navComp = new NavComputer({
  canvas, ctx, camera, system: solarSystem, playerShip, trajectory, input, timeWarp, targeting
});
playerShip.weapons = new WeaponSystem(playerShip);
const pursuitAssist = new PursuitAssist(playerShip, targeting);
const tacticalView = new TacticalView(canvas, ctx, solarSystem, targeting);
const docking = new DockingManager(solarSystem);
const autopilot = new AutopilotManager(solarSystem);
const economy = new EconomyEngine(solarSystem);

// ─── Progression Systems ───────────────────────────────────────────────────
import { playerWallet } from './core/Wallet.js';
const winLoss     = new WinLoss();
const fameTracker = new FameTracker();
const galacticLedger = new GalacticLedger(document.getElementById('hud-root'));

// Career stats for end-screens
const careerStats = {
  killCount:      0,
  creditsEarned:  0,
  stationsDocked: 0,
  simTime:        0,
};

// NPC ships array (empty — remove test pirate for now)
const npcShips = [];

window.solarSystem = solarSystem;
solarSystem.gameLoop = loop;
window.playerShip = playerShip;
window.playerWallet = playerWallet;


// ─── HUD Root ──────────────────────────────────────────────────────────────
const hudRoot = document.getElementById('hud-root');
const orderBoardUI = new OrderBoardUI(document.body, solarSystem);
window.orderBoardToggleExpand = (id) => {
    if (orderBoardUI.expandedOrderId === id) {
        orderBoardUI.expandedOrderId = null;
    } else {
        orderBoardUI.expandedOrderId = id;
    }
    orderBoardUI.render();
};

window.orderBoardAcceptJob = (id, amount) => {
    const board = solarSystem.economy.orderBoard;
    const order = board.orders.find(o => o.id === id);
    
    if (!order) return;

    let targetOrderId = id;

    // Split order if partial amount requested
    if (amount && amount < order.amount) {
        const newOrder = board.splitOrder(id, amount);
        if (newOrder) {
            targetOrderId = newOrder.id;
        }
    }

    if (board.acceptOrder(targetOrderId, 'YOU')) {
        console.log('Contract Claimed:', targetOrderId);
        orderBoardUI.render();
    }
};

/**
 * Helper: record a trade sale profit for fame tracking.
 * Called from StationUI buy/sell and order fulfillment.
 */
window.recordTradeSale = (profit, commodityId, stationName) => {
    if (profit > 0) {
        fameTracker.recordTradeProfit(profit);
        careerStats.creditsEarned += profit;
    }
    // Illegal Stims smuggling milestone
    if (commodityId === 'illegal_stims' && stationName) {
        fameTracker.recordStimSale(stationName);
    }
};

window.orderBoardFulfillJob = (id) => {
    const board = solarSystem.economy.orderBoard;
    const order = board.orders.find(o => o.id === id);
    if (!order) return;

    // Double check conditions (though UI handles it)
    const cargo = playerShip.cargos.find(c => c.type === order.commodityId);
    if (cargo && cargo.amount >= order.amount) {
        // Fulfill!
        const earnings = order.priceOffered * order.amount;
        playerWallet.add(earnings);
        // Track trade profit for fame (use full earnings as simple proxy)
        window.recordTradeSale(earnings, order.commodityId, order.consumer?.name);
        cargo.amount -= order.amount;
        if (cargo.amount <= 0) {
            playerShip.cargos.splice(playerShip.cargos.indexOf(cargo), 1);
        }
        board.fulfillOrder(id);
        
        // Refresh UI
        if (states.is(STATES.DOCKED)) {
            // Need to re-build/render the StationUI
            // The StationUI is internal to the state handler, but we can trigger a re-render
            // if we have a reference. Currently we don't expose it easily.
            // However, the user is likely on the Mission tab.
            // Let's just force a state transition to refresh or simpler:
            // Since we're in DOCKED state, the handle is in states._handlers[DOCKED].stationUI
            const handler = states._handlers[STATES.DOCKED];
            if (handler.stationUI) {
                handler.stationUI._renderTab();
            }
        }
        orderBoardUI.render();
    }
};

const debugEconomyUI = new DebugEconomyUI(document.body, solarSystem);

/**
 * Dynamically adjust the maximum physics time step based on gravitational proximity.
 * Helps performance at high warp by taking fewer, larger steps in deep space.
 */
function updateAdaptiveTimestep(ship, simTime) {
  const result = solarSystem.nearestBody(ship.position, simTime);
  if (!result || !result.body) {
    loop.maxPhysicsDt = 1.0;
    return;
  }

  const body = result.body;
  const dist = result.distance;
  
  // Gravitational time scale heuristic: dt_max = k * sqrt(r^3 / GM)
  // GM = G * body.mass
  const G = 6.674e-11;
  const mu = G * (body.mass || 1e10);
  
  // Safety factor: 0.05 is ~5% of an orbit at any given radius.
  // This is generally very safe for symplectic Euler.
  const k = 0.05;
  const tau = Math.sqrt(Math.pow(dist, 3) / mu);
  let safeDt = k * tau;

  // Clamp:
  // - Minimum 1.0s (default accuracy)
  // - Maximum 3600.0s (1 hour - prevents extreme skips even in interstellar space)
  // - Also limit by total flight time to arrival if autopilot is active?
  //   Nah, GameLoop sub-stepping handles any overshoots by capping at simDelta.
  
  // Extra safety: If we are VERY close to a body (within 3 radii), stick to 1.0s.
  const bodyRadius = body.radius || 1000;
  if (dist < 3 * bodyRadius) {
    safeDt = 1.0;
  }

  loop.maxPhysicsDt = Math.min(3600, Math.max(1.0, safeDt));
}

// ─── Game State: Menu ──────────────────────────────────────────────────────
function buildMainMenu() {
  hudRoot.innerHTML = '';

  const menu = document.createElement('div');
  menu.style.cssText = `
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 24px;
    pointer-events: all;
    font-family: 'Roboto Mono', monospace;
  `;

  menu.innerHTML = `
    <div style="text-align:center">
      <div style="
        font-size: 48px; font-weight: 700; letter-spacing: 0.3em;
        color: #39ff14; text-shadow: 0 0 30px rgba(57,255,20,0.6);
        text-transform: uppercase;
      ">SYSTEM NOMINAL</div>
      <div style="
        font-size: 13px; letter-spacing: 0.25em; margin-top: 8px;
        color: #8b949e; text-transform: uppercase;
      ">Orbital Physics RPG</div>
    </div>

    <div style="
      width: 1px; height: 60px;
      background: linear-gradient(to bottom, transparent, #39ff14, transparent);
    "></div>

    <div style="display:flex; flex-direction:column; gap:12px; width:240px">
      <button id="btn-new-game"  class="btn btn-primary interactive" style="width:100%;padding:12px">NEW MISSION</button>
      <button id="btn-how-to"    class="btn btn-primary interactive" style="width:100%;padding:12px">HOW TO PLAY</button>
    </div>

    <div style="
      position:absolute; bottom: 24px;
      font-size: 10px; letter-spacing:0.15em; color:#484f58;
      text-transform:uppercase;
    ">v0.1.0 — PROTOTYPE BUILD</div>
  `;

  hudRoot.appendChild(menu);

  // Hook up buttons (will dispatch state transitions later once Nav is implemented)
  document.getElementById('btn-new-game').addEventListener('click', () => {
    docking.dockTarget = solarSystem.allBodies.find(b => b.name === 'Vane');
    states.transition(STATES.DOCKED);
  });
  document.getElementById('btn-how-to').addEventListener('click', () => {
    showHowToPlay();
  });
}

function showHowToPlay() {
  // Simple overlay for now
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:absolute; inset:0;
    background: rgba(8,11,15,0.92);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    gap:16px; padding:40px;
    pointer-events:all;
    font-family:'Roboto Mono',monospace; color:#e6edf3;
  `;
  overlay.innerHTML = `
    <div style="font-size:18px;font-weight:700;color:#39ff14;letter-spacing:0.2em;text-transform:uppercase;">HOW TO PLAY</div>
    <div style="max-width:550px;line-height:1.6;font-size:12px;color:#8b949e;text-align:center;">
      <div style="margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:left;">
        <div>
          <b style="color:#e6edf3">FLIGHT CONTROLS</b><br>
          <kbd style="color:#39ff14">W/S</kbd> Throttle (+/-)<br>
          <kbd style="color:#39ff14">A/D</kbd> Rotation<br>
          <kbd style="color:#39ff14">X</kbd> Cut / <kbd style="color:#39ff14">Z</kbd> Max Throttle<br>
          <kbd style="color:#39ff14">Tab</kbd> Map ↔ Tactical<br>
          <kbd style="color:#39ff14">F</kbd> Focus Ship &nbsp;·&nbsp; <kbd style="color:#39ff14">E</kbd> Dock
        </div>
        <div>
          <b style="color:#e6edf3">NAVIGATION</b><br>
          <kbd style="color:#39ff14">1–6</kbd> or <kbd style="color:#39ff14">[ / ]</kbd> Time Warp<br>
          <kbd style="color:#39ff14">N</kbd> Create Maneuver Node<br>
          <kbd style="color:#39ff14">Del</kbd> Delete Node<br>
          <kbd style="color:#39ff14">Enter</kbd> Execute Maneuver<br>
          <kbd style="color:#39ff14">T</kbd> Target / <kbd style="color:#39ff14">Esc</kbd> Clear
        </div>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;">
        <b style="color:#e6edf3">OBJECTIVE</b> — Trade and survive to earn 20 Fame Points.
      </div>
    </div>
    <button id="btn-back" class="btn btn-primary" style="padding:10px 32px;margin-top:8px">BACK</button>
  `;
  hudRoot.appendChild(overlay);
  overlay.querySelector('#btn-back').addEventListener('click', () => overlay.remove());
}

// ─── Register States ────────────────────────────────────────────────────────
// ─── Register States ────────────────────────────────────────────────────────
states.register(STATES.MENU, {
  enter: () => {
    buildMainMenu();
    // Basic static starfield for menu
    ctx.fillStyle = '#080b0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 100; i++) {
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
    }
  },
  update: () => { },
  render: () => {
    // Render a starfield on canvas behind the menu
    renderStarField();
  },
  exit: () => { hudRoot.innerHTML = ''; }
});

states.register(STATES.NAV, {
  navHUD:    null,
  fameBadge: null,
  toast:     null,
  enter: function () { // Use function() to get 'this' context
    // Clear menu HTML completely (we don't want the buttons anymore)
    document.getElementById('hud-root').innerHTML = '';

    // Initialize the NavHUD DOM overlay
    this.navHUD = new NavHUD(
      document.getElementById('hud-root'),
      timeWarp,
      (node) => {
        // On Execute Node - simply apply delta-V to ship immediately for Phase 3!
        const dv = node.getDeltaVVector(playerShip.velocity, new Vec2(0, 0), playerShip.position);
        playerShip.velocity.addMut(dv);

        // Remove node
        const idx = navComp.nodes.indexOf(node);
        if (idx > -1) navComp.nodes.splice(idx, 1);
        navComp.widget.detach();
        if (this.navHUD) this.navHUD.activeNode = null;
        trajectory.invalidate();
      },
      solarSystem,
      (body) => {
        // Callback to focus on body from search
        navComp._selectedBody = body;
        camera.follow({
          getPosition: () => solarSystem.getPosition(body, loop.simTime)
        });
      }
    );

    // Fame badge & toast for NAV view
    const navRoot = document.getElementById('hud-root');
    this.fameBadge = new FameBadge(this.navHUD.hudManager, 'nav', 'top-center');
    this.toast     = new MilestoneToast(navRoot);
    this.activeOrders = new ActiveOrdersPanel(this.navHUD.hudManager, solarSystem.economy);
    
    // Remount to include the new externally added panels
    this.navHUD.hudManager.mountAll();

    // Wire up node selection
    navComp.onNodeSelect = (node) => {
      if (this.navHUD) {
        this.navHUD.activeNode = node;
        this.navHUD._updateNodeUI();
      }
    };

    // Wire up node deletion
    if (this.navHUD) {
      this.navHUD.onDeleteNode = () => {
        if (this.navHUD && this.navHUD.activeNode) {
          const idx = navComp.nodes.indexOf(this.navHUD.activeNode);
          if (idx > -1) navComp.nodes.splice(idx, 1);
          navComp.widget.detach();
          this.navHUD.activeNode = null;
          this.navHUD._updateNodeUI();
          trajectory.invalidate();
        }
      };
    }

    // Focus camera on player ship initially (instant cut) ONLY if we haven't already
    if (!camera._hasBeenNavInitialized) {
      camera._pos = playerShip.position.clone();
      camera._zoom = 4e-8; // View a good portion of the inner system
      camera._hasBeenNavInitialized = true;
    }
  },
  update: function (dt, simTime) {
    timeWarp.tick(simTime, navComp.nodes);

    if (autopilot.active) autopilot.update(playerShip, dt, simTime, timeWarp);

    shipSim.step(playerShip, dt, simTime);
    playerShip.weapons.update(dt, simTime, solarSystem);
    npcShips.forEach(npc => {
      shipSim.step(npc, dt, simTime);
      npc.ai.update(dt, simTime, playerShip, solarSystem);
    });
    economy.update(dt, simTime, npcShips);
    docking.update(playerShip, simTime);
    camera.update(dt);
    navComp.handleInput(simTime, npcShips);
    navComp.update(simTime, dt);
    // ── Ship controls work in NAV too ───────────────────────────────────────
    if (input.consumePressed('KeyC')) {
      if (autopilot.active) {
        autopilot.disengage();
      } else if (navComp.selectedBody) {
        autopilot.engage(navComp.selectedBody);
      }
    }

    const rotSpeed = 2.0;
    const rotStep  = 5 * Math.PI / 180;
    
    const manualInput = input.isDown('KeyW') || input.isDown('ArrowUp') || input.isDown('KeyS') || input.isDown('ArrowDown') ||
                        input.isDown('KeyA') || input.isDown('ArrowLeft') || input.isDown('KeyD') || input.isDown('ArrowRight') ||
                        input.consumePressed('KeyZ') || input.consumePressed('KeyX');
    
    // Manual override: disengage if key is used, but ignore keys held during first 0.25s of engagement
    if (manualInput && autopilot.active) {
      if (simTime - autopilot.engageTime > 0.25) {
        autopilot.disengage();
      }
    }

    if (input.isDown('KeyA') || input.isDown('ArrowLeft'))  playerShip.heading -= rotSpeed * dt;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) playerShip.heading += rotSpeed * dt;
    if (input.consumePressed('KeyA') || input.consumePressed('ArrowLeft'))  playerShip.heading -= rotStep;
    if (input.consumePressed('KeyD') || input.consumePressed('ArrowRight')) playerShip.heading += rotStep;

    if (input.isDown('KeyW') || input.isDown('ArrowUp'))   playerShip.throttle = Math.min(1, playerShip.throttle + 1.5 * dt);
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) playerShip.throttle = Math.max(0, playerShip.throttle - 1.5 * dt);
    if (input.consumePressed('KeyW') || input.consumePressed('ArrowUp'))   playerShip.throttle = Math.min(1, playerShip.throttle + 0.1);
    if (input.consumePressed('KeyS') || input.consumePressed('ArrowDown')) playerShip.throttle = Math.max(0, playerShip.throttle - 0.1);
    if (input.consumePressed('KeyZ')) playerShip.throttle = 1;
    if (input.consumePressed('KeyX')) playerShip.throttle = 0;
    // ────────────────────────────────────────────────────────────────────────

    // ── Fame & Win/Loss checks ──────────────────────────────────────────────
    fameTracker.checkIcarus(playerShip.position, solarSystem);
    fameTracker.checkSpeedDemon(playerShip.velocity.len());
    careerStats.simTime = simTime;
    winLoss.update(dt, simTime, playerShip, fameTracker, solarSystem);

    if (this.fameBadge) this.fameBadge.update(fameTracker);
    if (this.toast)     this.toast.tick(dt, fameTracker);
    if (this.activeOrders) this.activeOrders.update();

    if (this.navHUD) this.navHUD.update(simTime, playerShip, navComp.widget.activeNode, navComp.predictedElements, navComp.selectedBody, autopilot, navComp.playerOrbitElements);

    orderBoardUI.update();
    debugEconomyUI.update();
    updateAdaptiveTimestep(playerShip, simTime);
  },
  render: (alpha) => {
    clearCanvas();
    navComp.render(loop.simTime, alpha, autopilot, npcShips);
  },
  exit: function () {
    if (this.navHUD)    { this.navHUD.destroy();    this.navHUD    = null; }
    if (this.fameBadge) { this.fameBadge.destroy(); this.fameBadge = null; }
    if (this.toast)     { this.toast.destroy();     this.toast     = null; }
    if (this.activeOrders) { this.activeOrders.destroy(); this.activeOrders = null; }
  }
});

// ─── Game State: Tactical ──────────────────────────────────────────────────
states.register(STATES.TACTICAL, {
  tacHUD:    null,
  fameBadge: null,
  toast:     null,
  enter: function () {
    document.getElementById('hud-root').innerHTML = '';
    const tacRoot = document.getElementById('hud-root');
    this.tacHUD    = new TacticalHUD(tacRoot);
    this.fameBadge = new FameBadge(this.tacHUD.hudManager, 'tac', 'top-center');
    this.toast     = new MilestoneToast(tacRoot);
    
    // Remount to include the new externally added panels
    this.tacHUD.hudManager.mountAll();
  },
  update: function (dt, simTime) {
    timeWarp.tick(simTime, navComp.nodes);

    tacticalView.updateExplosions(dt);

    if (autopilot.active) autopilot.update(playerShip, dt, simTime, timeWarp);

    shipSim.step(playerShip, dt, simTime);
    playerShip.weapons.update(dt, simTime, solarSystem);
    npcShips.forEach(npc => {
      shipSim.step(npc, dt, simTime);
      npc.ai.update(dt, simTime, playerShip, solarSystem);
    });
    economy.update(dt, simTime, npcShips);

    // ── Projectile Hit Detection ────────────────────────────────────────────

    // Player rounds → NPC ships
    playerShip.weapons.projectiles.forEach(p => {
      if (!p.active) return;
      npcShips.forEach(npc => {
        if (npc.destroyed) return;
        const hitRadius = Math.max(300, p.proxRadius || 0);
        const radSq = hitRadius * hitRadius;
        if (p.position.distSq(npc.position) < radSq) {
          npc.takeDamage(p.damage);
          p.active = false;
          // If it was a proximity fuze hit, maybe spawn explosion (already triggered by destroyed check below, but we can also spawn a small flak burst)
          if (p.proxRadius > 0 && !npc.destroyed) {
              tacticalView.spawnExplosion(p.position, npc.velocity); 
          }
          // Kill shot — spawn explosion and drop target lock
          if (npc.destroyed) {
            tacticalView.spawnExplosion(npc.position, npc.velocity);
            if (targeting.lockedTarget === npc) targeting.clear();
            // ── Fame: record kill ─────────────────────────────────────────
            fameTracker.recordKill(pursuitAssist.active);
            careerStats.killCount += 1;
          }
        }
      });
    });

    // NPC rounds → player ship
    npcShips.forEach(npc => {
      if (!npc.ai || !npc.ai.weapons) return;
      npc.ai.weapons.projectiles.forEach(p => {
        if (!p.active) return;
        const hitRadius = Math.max(300, p.proxRadius || 0);
        const radSq = hitRadius * hitRadius;
        if (p.position.distSq(playerShip.position) < radSq) {
          playerShip.takeDamage(p.damage);
          p.active = false;
          if (p.proxRadius > 0 && !playerShip.destroyed) {
              tacticalView.spawnExplosion(p.position, playerShip.velocity);
          }
        }
      });
    });

    // Player torpedoes/missiles → NPC ships
    playerShip.weapons.torpedoes.forEach(t => {
      if (!t.active) return;
      npcShips.forEach(npc => {
        if (npc.destroyed) return;
        const hitRadius = Math.max(500, t.proxRadius || 0);
        const radSq = hitRadius * hitRadius;
        if (t.position.distSq(npc.position) < radSq) {
          npc.takeDamage(t.damage);
          t.active = false;
          tacticalView.spawnExplosion(t.position, npc.velocity);
          if (npc.destroyed) {
            if (targeting.lockedTarget === npc) targeting.clear();
            fameTracker.recordKill(pursuitAssist.active);
            careerStats.killCount += 1;
          }
        }
      });
    });

    // NPC torpedoes/missiles → player ship
    npcShips.forEach(npc => {
      if (!npc.ai || !npc.ai.weapons) return;
      npc.ai.weapons.torpedoes.forEach(t => {
        if (!t.active) return;
        const hitRadius = Math.max(500, t.proxRadius || 0);
        const radSq = hitRadius * hitRadius;
        if (t.position.distSq(playerShip.position) < radSq) {
          playerShip.takeDamage(t.damage);
          t.active = false;
          tacticalView.spawnExplosion(t.position, playerShip.velocity);
        }
      });
    });

    // Validate target lock — clear if the locked target is gone
    if (targeting.lockedTarget?.destroyed) targeting.clear();
    // ───────────────────────────────────────────────────────────────────────

    if (input.consumePressed('KeyP')) {
      // If deactivating, notify fame tracker the pursuit window ended
      if (pursuitAssist.active) fameTracker.recordPursuitWindowEnd();
      pursuitAssist.toggle();
    }
    
    // ── Weapon cycling (Q to cycle forward, Shift+Q to cycle back) ────────
    if (input.consumePressed('KeyQ')) {
      playerShip.weapons.cycleWeapon();
    }

    if (input.consumePressed('Space')) {
      const selectedDef = playerShip.weapons.getSelectedWeapon();
      if (selectedDef) {
        let leadPos = null;
        if (targeting.hasTarget() && selectedDef.speed !== Infinity) {
          leadPos = targeting.getLeadIndicator(playerShip.position, playerShip.velocity, selectedDef.speed, simTime);
        } else if (targeting.hasTarget() && selectedDef.speed === Infinity) {
          // For hitscan, use target position directly
          leadPos = targeting.getTargetPosition(simTime);
        }
        playerShip.weapons.fireSelected(leadPos, targeting.lockedTarget);
      }
    }

    if (pursuitAssist.active) {
      pursuitAssist.update(dt, simTime, input);
    } else {
      // WASD flight controls — smooth ramp when held, step bump on just-press
      const rotSpeed = 2.0; // rad/s
      const rotStep = 5 * Math.PI / 180; // 5° per tap

      if (input.consumePressed('KeyC')) {
        if (autopilot.active) {
          autopilot.disengage();
        } else if (navComp.selectedBody) {
          autopilot.engage(navComp.selectedBody);
        }
      }

      const manualInput = input.isDown('KeyW') || input.isDown('ArrowUp') || input.isDown('KeyS') || input.isDown('ArrowDown') ||
                          input.isDown('KeyA') || input.isDown('ArrowLeft') || input.isDown('KeyD') || input.isDown('ArrowRight') ||
                          input.consumePressed('KeyZ') || input.consumePressed('KeyX');
      
      // Manual override: disengage if key is used, but ignore keys held during first 0.25s of engagement
      if (manualInput && autopilot.active) {
        if (simTime - autopilot.engageTime > 0.25) {
          autopilot.disengage();
        }
      }

      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) playerShip.heading -= rotSpeed * dt;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) playerShip.heading += rotSpeed * dt;
      if (input.consumePressed('KeyA') || input.consumePressed('ArrowLeft')) playerShip.heading -= rotStep;
      if (input.consumePressed('KeyD') || input.consumePressed('ArrowRight')) playerShip.heading += rotStep;

      if (input.isDown('KeyW') || input.isDown('ArrowUp')) playerShip.throttle = Math.min(1, playerShip.throttle + 1.5 * dt);
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) playerShip.throttle = Math.max(0, playerShip.throttle - 1.5 * dt);
      if (input.consumePressed('KeyW') || input.consumePressed('ArrowUp')) playerShip.throttle = Math.min(1, playerShip.throttle + 0.1);
      if (input.consumePressed('KeyS') || input.consumePressed('ArrowDown')) playerShip.throttle = Math.max(0, playerShip.throttle - 0.1);
      if (input.consumePressed('KeyZ')) playerShip.throttle = 1;

      // Kill throttle (always allowed)
      if (input.consumePressed('KeyX')) playerShip.throttle = 0;
    }

    // Zoom
    docking.update(playerShip, simTime);

    if (input.mouse.scrollDelta !== 0) {
      tacticalView.handleZoom(input.mouse.scrollDelta);
      input.mouse.scrollDelta = 0; // Consume the scroll event so it doesn't fire 120x per frame at Warp 4
    }

    // ── Pan with left-button drag ──────────────────────────────────────────
    if (input.mouseDown(0)) {
       tacticalView.panByScreen(input.mouse.dx, input.mouse.dy);
       input.mouse.dx = 0;
       input.mouse.dy = 0;
    }

    // F to center camera
    if (input.consumePressed('KeyF')) {
      tacticalView.resetPan();
    }

    if (this.tacHUD)    this.tacHUD.update(playerShip, solarSystem, simTime, tacticalView, targeting, pursuitAssist, docking, autopilot);
    if (this.fameBadge) this.fameBadge.update(fameTracker);
    if (this.toast)     this.toast.tick(dt, fameTracker);

    // ── Fame & Win/Loss checks ────────────────────────────────────────────
    fameTracker.checkIcarus(playerShip.position, solarSystem);
    fameTracker.checkSpeedDemon(playerShip.velocity.len());
    careerStats.simTime = simTime;
    winLoss.update(dt, simTime, playerShip, fameTracker, solarSystem);

    orderBoardUI.update();
    debugEconomyUI.update();
    updateAdaptiveTimestep(playerShip, simTime);
  },
  render: function (alpha) {
    tacticalView.render(playerShip, loop.simTime, alpha, npcShips);
  },
  exit: function () {
    playerShip.throttle = 0;  // Cut engines when leaving tactical
    if (this.tacHUD)    { this.tacHUD.destroy();    this.tacHUD    = null; }
    if (this.fameBadge) { this.fameBadge.destroy(); this.fameBadge = null; }
    if (this.toast)     { this.toast.destroy();     this.toast     = null; }
  }
});

// ─── Game State: Docked ─────────────────────────────────────────────────────
states.register(STATES.DOCKED, {
  stationUI: null,
  enter: function () {
    document.getElementById('hud-root').innerHTML = '';
    playerShip.throttle = 0;  // Cut engines
    timeWarp.setFactor(1);    // Reset time warp

    const body = docking.dockTarget;

    // ── Fame: record docking ──────────────────────────────────────────────
    if (body && body.stations && body.stations.length > 0) {
      const stationName = body.stations[0].name;
      fameTracker.recordDock(stationName, body.name);
      careerStats.stationsDocked = fameTracker.stats.uniqueStationsDocked.size;
    }

    this.stationUI = new StationUI(
      document.getElementById('hud-root'),
      body,
      playerShip,
      () => {
        // Undock callback — return to previous flight state
        
        // Match ship velocity to station velocity so we don't instantly violently fly away 
        // with the velocity we had *before* we docked.
        const bVel = body.orbit ? body.orbit.getVelocity(loop.simTime) : new Vec2(0, 0);
        playerShip.velocity.x = bVel.x;
        playerShip.velocity.y = bVel.y;
        
        if (playerShip.firstLaunch && playerShip.loadout.hull.id !== 'NO_SHIP') {
          playerShip.firstLaunch = false;
          const r_orbit = 1.5 * body.radius;
          const G = 6.674e-11; // Matches ShipSim's G
          const v_c = Math.sqrt((G * body.mass) / r_orbit);
          
          const bPos = body.orbit ? body.orbit.getPosition(loop.simTime) : new Vec2(0, 0);
          playerShip.position.x = bPos.x + r_orbit;
          playerShip.position.y = bPos.y;
          
          playerShip.velocity.x = bVel.x;
          playerShip.velocity.y = bVel.y + v_c;
          playerShip.heading = Math.PI / 2; // Face prograde
          
          // Zoom in for the first launch to see the initial orbit
          camera._pos = playerShip.position.clone();
          camera._zoom = 2e-7; // Closer zoom to see orbit around Vane
          camera._hasBeenNavInitialized = true;
          
          states.transition(STATES.NAV);
          return;
        }

        const prev = states.previous;
        states.transition(prev === STATES.NAV ? STATES.NAV : STATES.TACTICAL);
      },
      fameTracker  // Pass to StationUI so it can record stim sales
    );
  },
  update: function (_dt, _simTime) {
    // Physics are paused while docked — only update HUD if needed
  },
  render: function (_alpha) {
    // Clear canvas to black (station screens are DOM)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#060a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  },
  exit: function () {
    if (this.stationUI) {
      this.stationUI.destroy();
      this.stationUI = null;
    }
  }
});

// ─── Game State: Boarding ───────────────────────────────────────────────────
states.register(STATES.BOARDING, {
  boardingUI: null,
  enter: function () {
    document.getElementById('hud-root').innerHTML = '';
    playerShip.throttle = 0;  // Cut engines
    timeWarp.setFactor(1);    // Reset time warp

    const targetShip = states._boardingTarget;
    this.boardingUI = new BoardingUI(
      document.getElementById('hud-root'),
      targetShip,
      playerShip,
      () => {
        // Match player velocity to the boarded ship, just like docking
        playerShip.velocity.x = targetShip.velocity.x;
        playerShip.velocity.y = targetShip.velocity.y;

        // Depart callback — return to previous flight state
        const prev = states.previous;
        states.transition(prev === STATES.NAV ? STATES.NAV : STATES.TACTICAL);
      }
    );
  },
  update: function (_dt, _simTime) {
    // Physics are paused while boarding
  },
  render: function (_alpha) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#060a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  },
  exit: function () {
    if (this.boardingUI) {
      this.boardingUI.destroy();
      this.boardingUI = null;
    }
    states._boardingTarget = null;
  }
});

// ─── Game State: Game Over ──────────────────────────────────────────────────
states.register(STATES.GAMEOVER, {
  enter: function (cause) {
    const root = document.getElementById('hud-root');
    root.innerHTML = '';
    playerShip.throttle = 0;
    timeWarp.setFactor(1);

    // cause is passed via states._gameOverCause set before transition
    const deathCause = states._gameOverCause ?? 'hull_breach';
    const canMayDay  = deathCause === 'dead_orbit' && WinLoss.canMayday(fameTracker);

    buildGameOverScreen(
      root,
      deathCause,
      fameTracker,
      careerStats,
      canMayDay ? () => {
        // Mayday: deduct credits/fame, refuel ship, and send back to flight
        const { creditsLost } = WinLoss.executeMayday(fameTracker);
        console.log(`Mayday executed: lost ${creditsLost} credits, −2 fame.`);
        // Give ship minimal fuel to move
        playerShip.fuel = playerShip.maxFuel * 0.1;
        playerShip.destroyed = false;
        playerShip.disabled  = false;
        playerShip.integrity = playerShip.maxIntegrity * 0.3;
        winLoss.reset();
        states.transition(STATES.TACTICAL);
      } : null,
      () => {
        // End Mission → main menu
        winLoss.reset();
        fameTracker.reset();
        careerStats.killCount = 0;
        careerStats.creditsEarned = 0;
        careerStats.stationsDocked = 0;
        careerStats.simTime = 0;
        playerWallet.credits = 75000;
        states.transition(STATES.MENU);
      }
    );
  },
  update: () => {},
  render: function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#060a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  },
  exit: () => { document.getElementById('hud-root').innerHTML = ''; }
});

// ─── Game State: Victory ────────────────────────────────────────────────────
states.register(STATES.VICTORY, {
  enter: function () {
    const root = document.getElementById('hud-root');
    root.innerHTML = '';
    playerShip.throttle = 0;
    timeWarp.setFactor(1);

    buildLegacyScreen(
      root,
      fameTracker,
      careerStats,
      () => {
        // New Mission → reset and go to menu
        winLoss.reset();
        fameTracker.reset();
        careerStats.killCount = 0;
        careerStats.creditsEarned = 0;
        careerStats.stationsDocked = 0;
        careerStats.simTime = 0;
        playerWallet.credits = 5000;
        states.transition(STATES.MENU);
      }
    );
  },
  update: () => {},
  render: function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#060a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  },
  exit: () => { document.getElementById('hud-root').innerHTML = ''; }
});

// ─── Win/Loss event handler ──────────────────────────────────────────────────
winLoss.onGameEnd((cause, _data) => {
  if (cause === 'victory') {
    states.transition(STATES.VICTORY);
  } else {
    states._gameOverCause = cause;
    states.transition(STATES.GAMEOVER);
  }
});

// ─── Placeholder Rendering ──────────────────────────────────────────────────

// Pre-generate a starfield once
const STARS = Array.from({ length: 400 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.5 + 0.3,
  a: Math.random() * 0.6 + 0.2,
}));

function renderStarField() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#080b0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  STARS.forEach(s => {
    ctx.beginPath();
    ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(230,237,243,${s.a})`;
    ctx.fill();
  });
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#080b0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Dim stars behind
  STARS.forEach(s => {
    ctx.beginPath();
    ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(230,237,243,${s.a * 0.4})`;
    ctx.fill();
  });
}

// ─── Boot ───────────────────────────────────────────────────────────────────
states.transition(STATES.MENU);
// ─── Global Keyboard Shortcuts ──────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  // Tab toggles between NAV ↔ TACTICAL
  if (e.key === 'Tab') {
    e.preventDefault();
    if (states.is(STATES.NAV)) {
      states.transition(STATES.TACTICAL);
    } else if (states.is(STATES.TACTICAL)) {
      states.transition(STATES.NAV);
    }
    return;
  }

  // Targeting (Global in flight states)
  if (states.is(STATES.NAV) || states.is(STATES.TACTICAL)) {
    if (e.key === 't' || e.key === 'T') {
      targeting.cycleNext(playerShip.position, loop.simTime, npcShips);
    }
    if (e.key === 'Escape') {
      targeting.clear();
    }
  }

  // Docking — E key
  if ((states.is(STATES.TACTICAL) || states.is(STATES.NAV)) && (e.key === 'e' || e.key === 'E')) {
    if (docking.canDock) {
      e.preventDefault();
      states.transition(STATES.DOCKED);
      return;
    } else {
      // Check for disabled ship to board
      let boardTarget = null;
      for (const npc of npcShips) {
        if (npc.disabled && !npc.destroyed) {
          const distSq = playerShip.position.distSq(npc.position);
          if (distSq < 250000) { // 500m
            const dpX = playerShip.velocity.x - npc.velocity.x;
            const dpY = playerShip.velocity.y - npc.velocity.y;
            const relVelSq = dpX * dpX + dpY * dpY;
            if (relVelSq < 100) { // < 10 m/s relative velocity
              boardTarget = npc;
              break;
            }
          }
        }
      }

      if (boardTarget) {
        e.preventDefault();
        states._boardingTarget = boardTarget;
        states.transition(STATES.BOARDING);
        return;
      }
    }
  }

  // Order Board Toggle
  if ((states.is(STATES.TACTICAL) || states.is(STATES.NAV)) && (e.key === 'o' || e.key === 'O')) {
      e.preventDefault();
      orderBoardUI.toggle();
      return;
  }

  // Galactic Ledger Toggle [L]
  if ((states.is(STATES.TACTICAL) || states.is(STATES.NAV)) && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      galacticLedger.root = document.getElementById('hud-root');
      galacticLedger.toggle(fameTracker);
      return;
  }

  // Debug Economy Toggle
  if ((states.is(STATES.TACTICAL) || states.is(STATES.NAV)) && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault();
      debugEconomyUI.toggle();
      return;
  }

  // Only in NAV state
  if (states.is(STATES.NAV)) {
    if (e.key === 'f' || e.key === 'F') {
      camera.focusOn(playerShip.position);
    }
    if (e.key === 'Enter') {
      if (navComp.widget.activeNode) {
        const node = navComp.widget.activeNode;
        const dv = node.getDeltaVVector(playerShip.velocity, new Vec2(0, 0), playerShip.position);
        playerShip.velocity.addMut(dv);
        const idx = navComp.nodes.indexOf(node);
        if (idx > -1) navComp.nodes.splice(idx, 1);
        navComp.widget.detach();
        trajectory.invalidate();
      }
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (navComp.widget.activeNode) {
        const node = navComp.widget.activeNode;
        const idx = navComp.nodes.indexOf(node);
        if (idx > -1) navComp.nodes.splice(idx, 1);
        navComp.widget.detach();
        trajectory.invalidate();
      }
    }
  }

  // Time warp (both NAV and TACTICAL)
  if (states.is(STATES.NAV) || states.is(STATES.TACTICAL)) {
    if (e.key === '[') timeWarp.warpDown();
    if (e.key === ']') timeWarp.warpUp();
    if (e.key === '1') timeWarp.setFactor(1);
    if (e.key === '2') timeWarp.setFactor(100);
    if (e.key === '3') timeWarp.setFactor(500);
    if (e.key === '4') timeWarp.setFactor(1000);
    if (e.key === '5') timeWarp.setFactor(5000);
    if (e.key === '6') timeWarp.setFactor(86400);
  }
});

loop.start();
