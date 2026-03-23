/**
 * TacticalView.js — Ship-centric canvas flight view.
 *
 * Renders the local space around the player ship:
 *   - Starfield background (parallax-shifted by world position)
 *   - Nearby celestial bodies as labeled circles
 *   - Player ship sprite (triangle) rotated to heading
 *   - Engine exhaust particles when throttle > 0
 *   - Crosshair reticle at screen center
 *   - Prograde / Retrograde vector markers
 */

import { Vec2 } from '../core/Vec2.js';
import { DockingManager } from '../core/DockingManager.js';

// ─── Zoom Limits ────────────────────────────────────────────────────────────
const ZOOM_MIN = 2e-7;    // ~50,000 km viewport
const ZOOM_MAX = 5e-1;    // ~100 m viewport
const ZOOM_SPEED = 0.0015;

// ─── Starfield ──────────────────────────────────────────────────────────────
const NUM_STARS = 300;
const _stars = Array.from({ length: NUM_STARS }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.2 + 0.3,
  a: Math.random() * 0.5 + 0.15,
}));

// ─── Exhaust Particles ─────────────────────────────────────────────────────
const MAX_PARTICLES = 60;

export class TacticalView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} system  The SolarSystem descriptor (has .bodies array)
   * @param {TargetingSystem} targeting
   */
  constructor(canvas, ctx, system, targeting) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.system = system;
    this.targeting = targeting;
    this.zoom = 1e-4;   // pixels per meter — start at medium zoom
    this.panOffset = new Vec2(0, 0); // Panning offset in world coordinates
    this.particles = [];
    this.explosions = []; // active explosion particles
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  handleZoom(scrollDelta) {
    const factor = Math.exp(-scrollDelta * ZOOM_SPEED);
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom * factor));
  }

  // ─── Coordinate Helpers ─────────────────────────────────────────────────────

  /** World → screen, centered on ship position. */
  panByScreen(dx, dy) {
    // Convert screen pixel delta to world meters, scaled by current zoom
    this.panOffset.x -= dx / this.zoom;
    this.panOffset.y -= dy / this.zoom;
  }

  resetPan() {
    this.panOffset = Vec2.zero();
  }

  worldToScreen(wx, wy, shipPos) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    // Apply pan offset to world position
    const cx = W / 2;
    const cy = H / 2;
    return {
      x: ((wx - shipPos.x) - this.panOffset.x) * this.zoom + cx,
      y: ((wy - shipPos.y) - this.panOffset.y) * this.zoom + cy
    };
  }

  pixelsToWorld(px) { return px / this.zoom; }

  // ─── Render ─────────────────────────────────────────────────────────────────

  render(ship, simTime, alpha, npcShips = []) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const shipPos = ship.getRenderPosition(alpha);

    // 1. Background
    ctx.fillStyle = '#060910';
    ctx.fillRect(0, 0, W, H);
    this._renderStars(W, H, shipPos);

    // 1.5 Grid
    this._renderGrid(W, H);

    // 2. Celestial bodies
    this._renderBodies(shipPos, simTime);

    // 3. Exhaust particles
    this._spawnParticles(ship, alpha, true);
    npcShips.forEach(npc => { if (!npc.destroyed) this._spawnParticles(npc, alpha, false); });
    this._updateAllParticles();
    this._renderParticles(shipPos, alpha);

    // 3.5 Explosions
    this._renderExplosions(shipPos, alpha);

    // 4. Ships
    npcShips.forEach(npc => {
      if (npc.destroyed) return;
      const npcPos = npc.getRenderPosition ? npc.getRenderPosition(alpha) : npc.position;
      const sp = this.worldToScreen(npcPos.x, npcPos.y, shipPos);
      if (sp.x > -100 && sp.x < W + 100 && sp.y > -100 && sp.y < H + 100) {
        this._renderShipVelocityVector(sp.x, sp.y, npc, ship);
        this._renderShip(sp.x, sp.y, npc.heading, npc.throttle, false, npc.loadout?.hull?.id);
        this._renderNpcHealthBar(sp.x, sp.y, npc);
      }
    });

    const pSp = this.worldToScreen(shipPos.x, shipPos.y, shipPos);
    this._renderShipVelocityVector(pSp.x, pSp.y, ship, ship, true);
    this._renderShip(pSp.x, pSp.y, ship.heading, ship.throttle, true, ship.loadout?.hull?.id);

    // 8. Weapons (On top of ships)
    this._renderWeapons(shipPos, ship.weapons, true, alpha);
    npcShips.forEach(npc => {
      if (!npc.destroyed && npc.weapons) this._renderWeapons(shipPos, npc.weapons, false, alpha);
    });

    // 5. Crosshair
    this._renderCrosshair(W, H);

    // 6. Vector markers
    this._renderVectorMarkers(W, H, ship, simTime);

    // 7. Target Bracket
    this._renderTargetBracket(W, H, shipPos, simTime, alpha);

    // 7.5 Lead Indicator
    this._renderLeadIndicator(W, H, shipPos, ship, simTime, alpha);


  }

  _renderWeapons(shipPos, weapons, isPlayer, alpha) {
    if (!weapons) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    
    // ── Muzzle Flash (bright burst at the ship's nose) ──
    if (isPlayer && weapons.muzzleFlash > 0) {
      const intensity = weapons.muzzleFlash / 0.08;
      const flashR = 20 + intensity * 15;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
      grad.addColorStop(0, `rgba(255, 220, 80, ${0.8 * intensity})`);
      grad.addColorStop(0.4, `rgba(255, 160, 30, ${0.4 * intensity})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, flashR, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // ── AutoCannon Tracers ──
    weapons.projectiles.forEach(p => {
      const pPos = p.getRenderPosition ? p.getRenderPosition(alpha) : p.position;
      const sp = this.worldToScreen(pPos.x, pPos.y, shipPos);
      
      // Skip if off-screen
      if (sp.x < -50 || sp.x > W + 50 || sp.y < -50 || sp.y > H + 50) return;
      
      // Velocity relative to camera (ship) for trail direction
      const relVx = p.velocity.x - weapons.ship.velocity.x;
      const relVy = p.velocity.y - weapons.ship.velocity.y;
      const relSpeed = Math.sqrt(relVx*relVx + relVy*relVy);
      
      // Fixed-length tracer (30 pixels behind the projectile)
      const trailLen = 30;
      
      if (relSpeed > 0) {
        // Normalize velocity for direction
        const vx = relVx / relSpeed;
        const vy = relVy / relSpeed;
        
        // Bright tracer line
        ctx.strokeStyle = '#ffbf00';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(sp.x - vx * trailLen, sp.y - vy * trailLen);
        ctx.stroke();
        
        // Fading tail
        ctx.strokeStyle = 'rgba(255, 191, 0, 0.3)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sp.x - vx * trailLen, sp.y - vy * trailLen);
        ctx.lineTo(sp.x - vx * trailLen * 2, sp.y - vy * trailLen * 2);
        ctx.stroke();
        
        // Glow around the tip
        const glow = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 10);
        glow.addColorStop(0, 'rgba(255, 220, 80, 0.9)');
        glow.addColorStop(0.5, 'rgba(255, 160, 0, 0.4)');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright core dot
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // ── Torpedoes ──
    weapons.torpedoes.forEach(t => {
      const tPos = t.getRenderPosition ? t.getRenderPosition(alpha) : t.position;
      const sp = this.worldToScreen(tPos.x, tPos.y, shipPos);
      
      // Glowing red body
      const torpGlow = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 12);
      torpGlow.addColorStop(0, 'rgba(255, 60, 60, 0.9)');
      torpGlow.addColorStop(0.5, 'rgba(255, 0, 63, 0.4)');
      torpGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = torpGlow;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 12, 0, Math.PI * 2);
      ctx.fill();
      
      // Core
      ctx.fillStyle = '#ff003f';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Exhaust trail
      const ex = -Math.cos(t.heading);
      const ey = -Math.sin(t.heading);
      ctx.strokeStyle = '#ff9900';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sp.x + ex * 4, sp.y + ey * 4);
      ctx.lineTo(sp.x + ex * 18, sp.y + ey * 18);
      ctx.stroke();
      
      ctx.strokeStyle = 'rgba(255,153,0,0.3)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sp.x + ex * 12, sp.y + ey * 12);
      ctx.lineTo(sp.x + ex * 30, sp.y + ey * 30);
      ctx.stroke();
    });
    
    // ── Pulse Laser Beam ──
    if (weapons.laserFlash) {
      const lf = weapons.laserFlash;
      const fromSp = this.worldToScreen(lf.from.x, lf.from.y, shipPos);
      const toSp = this.worldToScreen(lf.to.x, lf.to.y, shipPos);
      const alpha = Math.min(1, lf.timer / 0.08);
      
      // Bright beam
      ctx.strokeStyle = `rgba(0, 200, 255, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fromSp.x, fromSp.y);
      ctx.lineTo(toSp.x, toSp.y);
      ctx.stroke();
      
      // Soft glow
      ctx.strokeStyle = `rgba(0, 200, 255, ${alpha * 0.3})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(fromSp.x, fromSp.y);
      ctx.lineTo(toSp.x, toSp.y);
      ctx.stroke();
    }
  }

  // ─── Lead Indicator ─────────────────────────────────────────────────────────

  /**
   * Draws a predictive aim point (lead indicator) for the locked target.
   * Uses first-order intercept: predicts where the target will be when a
   * round fired NOW at bullet speed would arrive.
   */
  _renderLeadIndicator(W, H, shipPos, ship, simTime, alpha) {
    if (!this.targeting || !this.targeting.hasTarget()) return;

    const target = this.targeting.lockedTarget;
    const tPos = target && target.getRenderPosition ? target.getRenderPosition(alpha) : this.targeting.getTargetPosition(simTime);
    const tVel = this.targeting.getTargetVelocity(simTime);
    if (!tPos || !tVel) return;

    // Only show within 50 km
    const dist = tPos.dist(ship.position);
    if (dist > 50000) return;

    // First-order intercept: time = dist / bulletSpeed
    const bulletSpeed = 10000; // m/s — must match AutoCannon speed in Weapons.js
    const timeOfFlight = dist / bulletSpeed;

    // Relative velocity of target vs player
    const relVel = tVel.sub(ship.velocity);

    // Predicted intercept position
    const interceptPos = tPos.add(relVel.scale(timeOfFlight));

    // Screen position of intercept
    const sp = this.worldToScreen(interceptPos.x, interceptPos.y, shipPos);

    // Don't draw if off-screen
    if (sp.x < -20 || sp.x > W + 20 || sp.y < -20 || sp.y > H + 20) return;

    const ctx = this.ctx;
    const r = 10;
    const color = '#00e5ff';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;

    // ⊕ crosshair circle
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Cross hairs inside
    ctx.beginPath();
    ctx.moveTo(sp.x - r, sp.y); ctx.lineTo(sp.x + r, sp.y);
    ctx.moveTo(sp.x, sp.y - r); ctx.lineTo(sp.x, sp.y + r);
    ctx.stroke();

    // Center pip
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.font = '9px "Roboto Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEAD', sp.x, sp.y - r - 5);

    ctx.restore();
  }

  // ─── Target Bracket ─────────────────────────────────────────────────────────


  _renderTargetBracket(W, H, shipPos, simTime, alpha) {
    if (!this.targeting || !this.targeting.hasTarget()) return;
    const target = this.targeting.lockedTarget;
    const tPos = target && target.getRenderPosition ? target.getRenderPosition(alpha) : this.targeting.getTargetPosition(simTime);
    if (!tPos) return;

    const sPos = this.worldToScreen(tPos.x, tPos.y, shipPos);

    // Don't draw if behind camera or way off screen
    if (sPos.x < -100 || sPos.x > W + 100 || sPos.y < -100 || sPos.y > H + 100) return;

    const size = 30; // tactical view bracket is a bit larger
    const ctx = this.ctx;
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Top Left
    ctx.moveTo(sPos.x - size, sPos.y - size + 8);
    ctx.lineTo(sPos.x - size, sPos.y - size);
    ctx.lineTo(sPos.x - size + 8, sPos.y - size);

    // Top Right
    ctx.moveTo(sPos.x + size - 8, sPos.y - size);
    ctx.lineTo(sPos.x + size, sPos.y - size);
    ctx.lineTo(sPos.x + size, sPos.y - size + 8);

    // Bottom Right
    ctx.moveTo(sPos.x + size, sPos.y + size - 8);
    ctx.lineTo(sPos.x + size, sPos.y + size);
    ctx.lineTo(sPos.x + size - 8, sPos.y + size);

    // Bottom Left
    ctx.moveTo(sPos.x - size + 8, sPos.y + size);
    ctx.lineTo(sPos.x - size, sPos.y + size);
    ctx.lineTo(sPos.x - size, sPos.y + size - 8);

    ctx.stroke();
  }

  // ─── Starfield ────────────────────────────────────────────────────────────

  _renderStars(W, H, shipPos) {
    const ctx = this.ctx;
    // Parallax: shift stars slightly based on world position
    const px = (shipPos.x * 1e-12) % 1;
    const py = (shipPos.y * 1e-12) % 1;

    for (const s of _stars) {
      const sx = ((s.x + px) % 1) * W;
      const sy = ((s.y + py) % 1) * H;
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,210,230,${s.a})`;
      ctx.fill();
    }
  }

  // ─── Grid ──────────────────────────────────────────────────────────────────

  _renderGrid(W, H) {
    const ctx = this.ctx;
    
    // We want grid squares to be around 100 pixels visually
    const targetPixels = 100;
    const targetWorld = targetPixels / this.zoom;
    
    // Find the nearest power of 10 for grid spacing in meters
    const exponent = Math.round(Math.log10(targetWorld));
    const spacing = Math.pow(10, exponent);
    const spacingPx = spacing * this.zoom;
    
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.15)'; // faint green radar line
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(57, 255, 20, 0.4)';
    ctx.font = '10px "Roboto Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    
    const cx = W / 2;
    const cy = H / 2;
    
    // Find how many grid lines fit on half the screen
    const linesX = Math.ceil(cx / spacingPx);
    const linesY = Math.ceil(cy / spacingPx);
    
    ctx.beginPath();
    
    for (let i = -linesX; i <= linesX; i++) {
        const x = cx + i * spacingPx;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
    }
    
    for (let j = -linesY; j <= linesY; j++) {
        const y = cy + j * spacingPx;
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
    }
    
    ctx.stroke();
    
    const formatDist = (m) => {
        if (m >= 1000) return (m / 1000) + ' km';
        return m + ' m';
    };
    
    for (let i = 1; i <= linesX; i++) {
        const xRight = cx + i * spacingPx;
        const xLeft = cx - i * spacingPx;
        const text = formatDist(i * spacing);
        ctx.fillText(text, xRight + 4, cy - 4);
        ctx.fillText(text, xLeft + 4, cy - 4);
    }
    
    for (let j = 1; j <= linesY; j++) {
        const yBottom = cy + j * spacingPx;
        const yTop = cy - j * spacingPx;
        const text = formatDist(j * spacing);
        ctx.fillText(text, cx + 4, yTop - 4);
        ctx.fillText(text, cx + 4, yBottom - 4);
    }
  }

  // ─── Bodies ───────────────────────────────────────────────────────────────

  _renderBodies(shipPos, simTime) {
    const ctx = this.ctx;

    for (const body of this.system.allBodies) {
      const bPos = body.orbit
        ? body.orbit.getPosition(simTime)
        : Vec2.zero();

      const sp = this.worldToScreen(bPos.x, bPos.y, shipPos);

      // True scale radius on screen
      const worldR = body.radius || 1e7;
      let screenR = worldR * this.zoom;
      screenR = Math.max(3, screenR); // enforce minimum size, but do not clamp maximum

      // Skip if way off screen (accounting for its screen radius, which might be huge)
      if (sp.x + screenR < -200 || sp.x - screenR > this.canvas.width + 200 ||
          sp.y + screenR < -200 || sp.y - screenR > this.canvas.height + 200) {
        continue;
      }

      // Glow
      if (body.glowColor) {
        const grad = ctx.createRadialGradient(sp.x, sp.y, screenR * 0.5, sp.x, sp.y, screenR * 3);
        grad.addColorStop(0, body.glowColor + '60');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, screenR * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Body circle
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, screenR, 0, Math.PI * 2);
      ctx.fillStyle = body.color || '#aaa';
      ctx.fill();

      // Label
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.fillStyle = '#8b949e';
      ctx.textAlign = 'center';
      ctx.fillText(body.name, sp.x, sp.y + screenR + 14);

      // Docking Radius Ring
      if ((body.stations && body.stations.length > 0) || body.economy) {
        const dockRadius = Math.max(
          (body.radius || 0) * (body.type === 'station' ? 5 : 3),
          DockingManager.MIN_DOCK_RADIUS
        ) * this.zoom;
        
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, Math.max(dockRadius, screenR + 2), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 191, 0, 0.4)'; // Amber docking color
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // ─── Ship Sprite ──────────────────────────────────────────────────────────

  _renderShip(cx, cy, heading, throttle, isPlayer, hullId = 'WAYFARER') {
    const ctx = this.ctx;
    const size = 14;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading);

    ctx.beginPath();
    
    // Choose shape based on hullId
    let glowLines = []; // Array of [{start: Vec2, end: Vec2}] for where engine glow emanates

    switch (hullId) {
      case 'DART':
        ctx.moveTo(size * 1.2, 0); 
        ctx.lineTo(-size * 0.8, -size * 0.4); 
        ctx.lineTo(-size * 0.8, size * 0.4); 
        glowLines.push({ start: {x: -size * 0.8, y: -size * 0.2}, end: {x: -size * 0.8, y: size * 0.2} });
        break;

      case 'PEREGRINE':
        ctx.moveTo(size * 1.5, 0); 
        ctx.lineTo(-size * 0.8, -size * 0.2); 
        ctx.lineTo(-size * 0.6, 0); 
        ctx.lineTo(-size * 0.8, size * 0.2); 
        glowLines.push({ start: {x: -size * 0.6, y: -size * 0.15}, end: {x: -size * 0.6, y: size * 0.15} });
        break;

      case 'PONY':
        ctx.arc(size * 0.2, 0, size * 0.6, -Math.PI/2, Math.PI/2);
        ctx.lineTo(-size * 0.8, size * 0.6);
        ctx.lineTo(-size * 0.8, -size * 0.6);
        glowLines.push({ start: {x: -size * 0.8, y: -size * 0.4}, end: {x: -size * 0.8, y: size * 0.4} });
        break;

      case 'OX':
        ctx.moveTo(size * 0.8, -size * 0.6); 
        ctx.lineTo(size * 0.8, size * 0.6); 
        ctx.lineTo(-size * 0.8, size * 0.8); 
        ctx.lineTo(-size * 0.8, -size * 0.8); 
        glowLines.push({ start: {x: -size * 0.8, y: -size * 0.6}, end: {x: -size * 0.8, y: -size * 0.3} });
        glowLines.push({ start: {x: -size * 0.8, y: size * 0.3}, end: {x: -size * 0.8, y: size * 0.6} });
        break;

      case 'CORVUS':
        ctx.moveTo(size * 1.2, 0); 
        ctx.lineTo(-size * 0.5, -size * 0.8); 
        ctx.lineTo(-size * 0.8, -size * 0.8); 
        ctx.lineTo(-size * 0.3, 0); 
        ctx.lineTo(-size * 0.8, size * 0.8); 
        ctx.lineTo(-size * 0.5, size * 0.8); 
        glowLines.push({ start: {x: -size * 0.3, y: -size * 0.2}, end: {x: -size * 0.3, y: size * 0.2} });
        break;

      case 'SCYTHE':
        ctx.moveTo(size * 0.4, 0); 
        ctx.quadraticCurveTo(-size * 0.4, -size * 1.2, -size * 1.0, -size * 1.2);
        ctx.lineTo(-size * 0.5, 0);
        ctx.lineTo(-size * 1.0, size * 1.2);
        ctx.quadraticCurveTo(-size * 0.4, size * 1.2, size * 0.4, 0);
        glowLines.push({ start: {x: -size * 0.5, y: -size * 0.4}, end: {x: -size * 0.5, y: size * 0.4} });
        break;

      case 'CAMEL':
        ctx.moveTo(size * 1.2, -size * 0.3); 
        ctx.lineTo(size * 1.2, size * 0.3); 
        ctx.lineTo(size * 0.8, size * 0.5); 
        ctx.lineTo(-size * 1.2, size * 0.5); 
        ctx.lineTo(-size * 1.2, -size * 0.5); 
        ctx.lineTo(size * 0.8, -size * 0.5); 
        glowLines.push({ start: {x: -size * 1.2, y: -size * 0.3}, end: {x: -size * 1.2, y: size * 0.3} });
        break;

      case 'MINOTAUR':
        ctx.moveTo(size * 0.8, -size * 1.0); 
        ctx.lineTo(size * 0.8, size * 1.0); 
        ctx.lineTo(size * 0.2, size * 1.0); 
        ctx.lineTo(size * 0.2, size * 0.4); 
        ctx.lineTo(-size * 0.8, size * 0.4); 
        ctx.lineTo(-size * 0.8, -size * 0.4); 
        ctx.lineTo(size * 0.2, -size * 0.4); 
        ctx.lineTo(size * 0.2, -size * 1.0); 
        glowLines.push({ start: {x: -size * 0.8, y: -size * 0.3}, end: {x: -size * 0.8, y: size * 0.3} });
        break;

      case 'VALKYRIE':
        ctx.moveTo(size * 1.6, 0); 
        ctx.lineTo(size * 0.4, -size * 0.2); 
        ctx.lineTo(-size * 1.0, -size * 0.8); 
        ctx.lineTo(-size * 1.0, size * 0.8); 
        ctx.lineTo(size * 0.4, size * 0.2); 
        glowLines.push({ start: {x: -size * 1.0, y: -size * 0.6}, end: {x: -size * 1.0, y: size * 0.6} });
        break;

      case 'MAMMOTH':
        ctx.moveTo(size * 1.5, -size * 0.8); 
        ctx.lineTo(size * 1.5, size * 0.8); 
        ctx.lineTo(-size * 1.5, size * 1.2); 
        ctx.lineTo(-size * 1.5, -size * 1.2); 
        glowLines.push({ start: {x: -size * 1.5, y: -size * 1.0}, end: {x: -size * 1.5, y: -size * 0.5} });
        glowLines.push({ start: {x: -size * 1.5, y: size * 0.5}, end: {x: -size * 1.5, y: size * 1.0} });
        break;

      case 'BASTION':
        ctx.moveTo(size * 1.0, -size * 0.5); 
        ctx.lineTo(size * 0.5, -size * 1.0); 
        ctx.lineTo(-size * 0.5, -size * 1.0); 
        ctx.lineTo(-size * 1.0, -size * 0.5); 
        ctx.lineTo(-size * 1.0, size * 0.5); 
        ctx.lineTo(-size * 0.5, size * 1.0); 
        ctx.lineTo(size * 0.5, size * 1.0); 
        ctx.lineTo(size * 1.0, size * 0.5); 
        glowLines.push({ start: {x: -size * 1.0, y: -size * 0.4}, end: {x: -size * 1.0, y: size * 0.4} });
        break;

      case 'LEVIATHAN':
        ctx.moveTo(size * 1.8, 0); 
        ctx.lineTo(size * 0.5, -size * 0.4); 
        ctx.lineTo(size * 1.5, -size * 1.0); 
        ctx.lineTo(-size * 1.2, -size * 1.0); 
        ctx.lineTo(-size * 1.2, size * 1.0); 
        ctx.lineTo(size * 1.5, size * 1.0); 
        ctx.lineTo(size * 0.5, size * 0.4); 
        glowLines.push({ start: {x: -size * 1.2, y: -size * 0.8}, end: {x: -size * 1.2, y: -size * 0.4} });
        glowLines.push({ start: {x: -size * 1.2, y: -size * 0.1}, end: {x: -size * 1.2, y: size * 0.1} });
        glowLines.push({ start: {x: -size * 1.2, y: size * 0.4}, end: {x: -size * 1.2, y: size * 0.8} });
        break;

      case 'BEHEMOTH':
        ctx.moveTo(size * 2.5, -size * 1.5); 
        ctx.lineTo(size * 2.5, size * 1.5); 
        ctx.lineTo(-size * 2.5, size * 1.5); 
        ctx.lineTo(-size * 2.5, -size * 1.5); 
        glowLines.push({ start: {x: -size * 2.5, y: -size * 1.2}, end: {x: -size * 2.5, y: -size * 0.8} });
        glowLines.push({ start: {x: -size * 2.5, y: -size * 0.4}, end: {x: -size * 2.5, y: size * 0.4} });
        glowLines.push({ start: {x: -size * 2.5, y: size * 0.8}, end: {x: -size * 2.5, y: size * 1.2} });
        break;

      case 'WAYFARER':
      default:
        ctx.moveTo(size, 0);                    // nose
        ctx.lineTo(-size * 0.7, -size * 0.5);   // top-left
        ctx.lineTo(-size * 0.5, 0);             // indent
        ctx.lineTo(-size * 0.7, size * 0.5);    // bottom-left
        glowLines.push({ start: {x: -size * 0.5, y: -size * 0.2}, end: {x: -size * 0.5, y: size * 0.2} });
        break;
    }
    
    ctx.closePath();
    ctx.fillStyle = isPlayer ? '#c9d1d9' : '#ff003f';
    ctx.fill();
    ctx.strokeStyle = isPlayer ? '#39ff14' : '#ff003f';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Engine glow when thrusting
    if (throttle > 0.01) {
      const glowLen = size * (0.6 + throttle * 0.8);
      const glowColor = isPlayer ? '57,255,20' : '255,191,0';
      ctx.fillStyle = `rgba(${glowColor},${0.3 + throttle * 0.5})`;
      
      for (const line of glowLines) {
        ctx.beginPath();
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.start.x - glowLen, (line.start.y + line.end.y) / 2); // point back
        ctx.lineTo(line.end.x, line.end.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ─── Ship Velocity Vector ───────────────────────────────────────────────────

  _renderShipVelocityVector(cx, cy, targetShip, playerShip, isPlayer = false) {
    // Determine relative velocity to player
    // If it is the player, we just draw absolute velocity to show drift
    const relVel = isPlayer ? playerShip.velocity : targetShip.velocity.sub(playerShip.velocity);
    
    const speed = relVel.len();
    if (speed < 1) return; // Don't draw if effectively stationary relative to camera

    // Proportional length: representing where the ship will be in N seconds
    // Cap the visual length so it doesn't stretch across the entire screen at high speeds
    const timeProjectionSeconds = 10;
    const projectedDistScreen = (speed * timeProjectionSeconds) * this.zoom;
    
    const maxLineLength = 300; // pixels
    const lineLen = Math.min(projectedDistScreen, maxLineLength);

    const W = this.canvas.width;
    const H = this.canvas.height;
    
    const angle = Math.atan2(relVel.y, relVel.x);
    const endX = cx + Math.cos(angle) * lineLen;
    const endY = cy + Math.sin(angle) * lineLen;

    // Optional: hide lines that are entirely offscreen
    if (
      (cx < 0 && endX < 0) || (cx > W && endX > W) &&
      (cy < 0 && endY < 0) || (cy > H && endY > H)
    ) {
      return;
    }

    const ctx = this.ctx;
    ctx.save();
    
    // Choose color: Green for player, Amber/Red for NPCs
    let colorHex = isPlayer ? '#39ff14' : '#ff003f';
    if (!isPlayer && targetShip.ai && targetShip.ai.state === 'MERCHANT') {
      colorHex = '#ffbf00';
    }

    // Line gradient fading out towards the tip
    const grad = ctx.createLinearGradient(cx, cy, endX, endY);
    grad.addColorStop(0, `${colorHex}40`); // 25% opacity
    grad.addColorStop(1, `${colorHex}00`); // 0% opacity

    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.restore();
  }

  // ─── NPC Health Bar ───────────────────────────────────────────────────────

  _renderNpcHealthBar(cx, cy, npc) {
    const pct = npc.maxIntegrity > 0 ? Math.max(0, npc.integrity / npc.maxIntegrity) : 0;
    const barW = 36;
    const barH = 4;
    const barX = cx - barW / 2;
    const barY = cy - 26; // above the ship sprite

    const ctx = this.ctx;

    // Background track
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    if (npc.disabled) {
        // Blinking DISABLED text instead of a bar
        const blink = Math.floor(Date.now() / 500) % 2 === 0;
        ctx.font = '8px "Roboto Mono", monospace';
        ctx.fillStyle = blink ? '#ff003f' : 'rgba(255,0,63,0.3)';
        ctx.textAlign = 'center';
        ctx.fillText('DISABLED', cx, barY + 4);
    } else {
        // Filled portion — green → yellow → red
        let color;
        if (pct > 0.6) color = '#39ff14';
        else if (pct > 0.3) color = '#ffbf00';
        else color = '#ff003f';

        ctx.fillStyle = color;
        ctx.fillRect(barX, barY, barW * pct, barH);
    }

    // Ship name label above bar
    ctx.font = '8px "Roboto Mono", monospace';
    ctx.fillStyle = npc.disabled ? '#8b949e' : 'rgba(200,200,200,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(npc.name, cx, barY - 3);
  }

  // ─── Crosshair ────────────────────────────────────────────────────────────

  _renderCrosshair(W, H) {
    const ctx = this.ctx;
    const cx = W / 2;
    const cy = H / 2;
    const gap = 12;
    const len = 20;

    ctx.strokeStyle = 'rgba(57,255,20,0.35)';
    ctx.lineWidth = 1;

    // Top
    ctx.beginPath(); ctx.moveTo(cx, cy - gap); ctx.lineTo(cx, cy - gap - len); ctx.stroke();
    // Bottom
    ctx.beginPath(); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len); ctx.stroke();
    // Left
    ctx.beginPath(); ctx.moveTo(cx - gap, cy); ctx.lineTo(cx - gap - len, cy); ctx.stroke();
    // Right
    ctx.beginPath(); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy); ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(57,255,20,0.5)';
    ctx.fill();
  }

  // ─── Vector Markers ───────────────────────────────────────────────────────

  _renderVectorMarkers(W, H, ship, simTime) {
    const cx = W / 2;
    const cy = H / 2;
    const markerDist = Math.min(W, H) * 0.35;

    // Target Marker
    if (this.targeting && this.targeting.hasTarget()) {
      const tPos = this.targeting.getTargetPosition(simTime);
      if (tPos) {
        const d = tPos.sub(ship.position);
        const tAngle = Math.atan2(d.y, d.x);
        const tVel = this.targeting.getTargetVelocity(simTime);
        const relVel = tVel.sub(ship.velocity).len();
        this._drawMarker(cx, cy, tAngle, markerDist, '#ffbf00', 'TGT', relVel, 'target');
      }
    }

    const speed = ship.velocity.len();
    if (speed < 0.1) return;

    // Prograde — direction of velocity
    const pAngle = Math.atan2(ship.velocity.y, ship.velocity.x);
    this._drawMarker(cx, cy, pAngle, markerDist, '#39ff14', 'PROG', speed, 'prograde');

    // Retrograde — opposite of velocity
    this._drawMarker(cx, cy, pAngle + Math.PI, markerDist, '#ff003f', 'RETR', speed, 'retrograde');
  }

  _drawMarker(cx, cy, angle, dist, color, label, speed, type) {
    const ctx = this.ctx;
    const mx = cx + Math.cos(angle) * dist;
    const my = cy + Math.sin(angle) * dist;
    const r = 12;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    if (type === 'prograde') {
      // Circle with center dot
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else if (type === 'target') {
      // Diamond
      ctx.beginPath();
      ctx.moveTo(mx, my - r); ctx.lineTo(mx + r, my);
      ctx.lineTo(mx, my + r); ctx.lineTo(mx - r, my);
      ctx.closePath();
      ctx.stroke();
    } else {
      // Retrograde: Circle with X
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.stroke();
      const d = r * 0.6;
      ctx.beginPath();
      ctx.moveTo(mx - d, my - d); ctx.lineTo(mx + d, my + d);
      ctx.moveTo(mx + d, my - d); ctx.lineTo(mx - d, my + d);
      ctx.stroke();
    }

    // Speed label
    const speedStr = speed > 1000
      ? `${(speed / 1000).toFixed(1)} km/s`
      : `${speed.toFixed(0)} m/s`;

    ctx.font = '9px "Roboto Mono", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(label, mx, my - r - 6);
    ctx.fillText(speedStr, mx, my + r + 12);
  }

  // ─── Explosion Particles ─────────────────────────────────────────────────

  /**
   * Spawn a burst of debris particles at the given world position.
   * Particles expand in SCREEN SPACE (pixels/frame) anchored to a world point,
   * so the explosion looks the same at any zoom level.
   * @param {Vec2} worldPos
   */
  spawnExplosion(worldPos, worldVel) {
    console.log('EXPLOSION SPAWNED at', worldPos.x, worldPos.y, 'zoom:', this.zoom);
    const COUNT = 120; // Increased particle count for visual impact
    for (let i = 0; i < COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const isCore = i < 30;
      // Screen-space speed: 1–8 px/frame
      const speed = isCore ? (2 + Math.random() * 6) : (0.5 + Math.random() * 3.5);
      this.explosions.push({
        _prevWx: worldPos.x, _prevWy: worldPos.y,
        wx: worldPos.x, wy: worldPos.y,  // world anchor
        wvx: worldVel ? worldVel.x : 0,  // world momentum
        wvy: worldVel ? worldVel.y : 0,  
        _prevOx: 0, _prevOy: 0,
        ox: 0, oy: 0,                     // screen-space offset (pixels)
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: isCore ? (0.015 + Math.random() * 0.015) : (0.008 + Math.random() * 0.01),
        r: isCore ? (3.5 + Math.random() * 3.5) : (1.5 + Math.random() * 3),
        color: isCore ? '255,180,40' : '255,70,15',
      });
    }
    // Central flash — massive short-lived glow
    this.explosions.push({
      _prevWx: worldPos.x, _prevWy: worldPos.y,
      wx: worldPos.x, wy: worldPos.y,
      wvx: worldVel ? worldVel.x : 0,
      wvy: worldVel ? worldVel.y : 0,
      _prevOx: 0, _prevOy: 0,
      ox: 0, oy: 0, vx: 0, vy: 0,
      life: 1.0, decay: 0.04,
      r: 120, color: '255,240,180', isFlash: true,
    });
  }

  updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const p = this.explosions[i];
      p._prevWx = p.wx;
      p._prevWy = p.wy;
      p._prevOx = p.ox;
      p._prevOy = p.oy;

      // Advance screen-space offset using dt (assuming 60fps baseline for vx/vy/decay)
      // Since vx/vy/decay were tuned for 60fps, we multiply dt by 60
      p.ox += p.vx * (dt * 60);
      p.oy += p.vy * (dt * 60);
      p.life -= p.decay * (dt * 60);
      // Advance world-space anchor so it drifts with the dead ship's momentum
      // dt is real seconds, so wvx (m/s) * dt = meters delta
      p.wx += p.wvx * dt;
      p.wy += p.wvy * dt;

      if (p.life <= 0) {
        this.explosions.splice(i, 1);
      }
    }
  }

  _renderExplosions(shipPos, alpha) {
    const ctx = this.ctx;
    // Debug: show count
    if (this.explosions.length > 0) {
      ctx.fillStyle = 'magenta';
      ctx.font = '16px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`EXPLOSIONS: ${this.explosions.length}`, 20, 260);
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const p = this.explosions[i];

      // Interpolate world position for rendering
      const rWx = p._prevWx + (p.wx - p._prevWx) * alpha;
      const rWy = p._prevWy + (p.wy - p._prevWy) * alpha;
      const rOx = p._prevOx + (p.ox - p._prevOx) * alpha;
      const rOy = p._prevOy + (p.oy - p._prevOy) * alpha;

      // World anchor → screen, then add pixel offset
      const anchor = this.worldToScreen(rWx, rWy, shipPos);
      const sx = anchor.x + rOx;
      const sy = anchor.y + rOy;

      ctx.beginPath();
      if (p.isFlash) {
        const rad = Math.max(0.1, p.r * p.life);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
        g.addColorStop(0, `rgba(${p.color},${p.life})`);
        g.addColorStop(0.4, `rgba(255,120,20,${p.life * 0.5})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = `rgba(${p.color},${p.life})`;
        ctx.arc(sx, sy, Math.max(0.1, p.r * p.life), 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  // ─── Exhaust Particles ────────────────────────────────────────────────────

  _spawnParticles(ship, alpha, isPlayer) {
    const maxParticles = 300; // Allow more particles for a dense plume
    if (ship.throttle > 0.01 && this.particles.length < maxParticles) {
      // Spawn 3-8 particles per frame based on throttle to create a continuous dense jet
      const spawnCount = Math.floor(ship.throttle * 5) + 3;
      
      for (let i = 0; i < spawnCount; i++) {
        // Tighter angle spread for a focused jet plume
        const spread = 0.15;
        const angle = ship.heading + Math.PI + (Math.random() - 0.5) * spread;
        
        // Slower screen-space drift (2-8 pixels per frame) so they bunch up and glow
        const spd = (2 + Math.random() * 6) * (0.5 + ship.throttle * 0.5);
        
        const startOx = -Math.cos(ship.heading) * 15;
        const startOy = -Math.sin(ship.heading) * 15;

        // Add slight random perpendicular offset at the nozzle so the flame has some width
        const perp = angle + Math.PI / 2;
        const widthOffset = (Math.random() - 0.5) * 4;
        const finalOx = startOx + Math.cos(perp) * widthOffset;
        const finalOy = startOy + Math.sin(perp) * widthOffset;

        this.particles.push({
          ship: ship, // Bind directly to the ship instance
          _prevOx: finalOx,
          _prevOy: finalOy,
          ox: finalOx,
          oy: finalOy,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 1.0,
          // Slower decay so the flame stretches out nicely
          decay: 0.03 + Math.random() * 0.04,
          isPlayer: isPlayer
        });
      }
    }
  }

  _updateAllParticles() {
    const dt = 1 / 60; // Fixed dt for consistent visual expansion rate
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p._prevOx = p.ox;
      p._prevOy = p.oy;
      
      p.ox += p.vx * (dt * 60);
      p.oy += p.vy * (dt * 60);
      
      p.life -= p.decay * (dt * 60);
      
      if (p.life <= 0 || p.ship.destroyed) {
        this.particles.splice(i, 1);
      }
    }
  }

  _renderParticles(cameraShipPos, alpha) {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const rOx = p._prevOx + (p.ox - p._prevOx) * alpha;
      const rOy = p._prevOy + (p.oy - p._prevOy) * alpha;

      // Ensure we use the exact rendered position of the ship owning the particle
      const ownerPos = p.ship.getRenderPosition ? p.ship.getRenderPosition(alpha) : p.ship.position;
      const anchor = this.worldToScreen(ownerPos.x, ownerPos.y, cameraShipPos);
      
      const sx = anchor.x + rOx;
      const sy = anchor.y + rOy;

      const r = 2.0 * p.life;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      const color = p.isPlayer ? '57,255,20' : '255,191,0';
      ctx.fillStyle = `rgba(${color},${p.life * 0.6})`;
      ctx.fill();
    }
  }
}
