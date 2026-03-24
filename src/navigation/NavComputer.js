/**
 * NavComputer.js — Nav-Computer map view renderer & interaction manager.
 *
 * Renders (in world-space via Camera):
 *   1. Gravity well grid — warped wireframe that dips toward heavy masses
 *   2. Belt of Tears       — procedural asteroid ring
 *   3. Orbital paths       — ellipses for all bodies (faint lines)
 *   4. Orbital trails      — fading recent history of each body's path
 *   5. Celestial bodies    — colored circles with glow effects
 *   6. Moon systems        — smaller circles near parent
 *   7. Ghost Path          — predicted ship trajectory (bright dashed green)
 *   8. Ship marker         — player ship crosshair icon
 *
 * DOM overlay (HUD):
 *   - Body info panel (on click)
 *   - Time-warp dial
 *   - Burn data readout (when node selected)
 */

import { Vec2 } from '../core/Vec2.js';
import { AU } from '../world/SolarSystem.js';
import { WARP_LEVELS } from '../navigation/TimeWarp.js';
import { ManeuverNode } from '../physics/Trajectory.js';
import { ManeuverWidget } from './ManeuverWidget.js';
import { KeplerOrbit, G } from '../physics/KeplerOrbit.js';

// ─── Visual Constants ─────────────────────────────────────────────────────────
const ORBIT_ALPHA = 0.18;    // orbit line opacity
const TRAIL_POINTS = 80;      // points in each body's historical trail
const TRAIL_SAMPLE_INTERVAL = 0.01; // fraction of period between trail samples
const BODY_SELECT_RADIUS_PX = 20;   // click hit radius for body selection (px)
const GHOST_DASH = [12, 8];  // ghost path dash pattern
const BELT_ASTEROIDS = 280;      // number of asteroid dots in the belt
const BELT_MIN_AU = 1.7;
const BELT_MAX_AU = 2.7;
const GRID_CELLS = 18;      // grid lines in each dimension
const GRID_ALPHA_BASE = 0.07;    // base wireframe opacity

// Security zone colors
const SECURITY_COLORS = {
  high: 'rgba(57, 255, 20,  0.04)',
  medium: 'rgba(255, 191, 0,  0.03)',
  low: 'rgba(255, 87,  34, 0.03)',
  none: 'rgba(255, 0,   63, 0.02)',
};

export class NavComputer {
  /**
   * @param {HTMLCanvasElement}  canvas
   * @param {CanvasRenderingContext2D} ctx
   * @param {Camera}      camera
   * @param {SolarSystem} system
   * @param {Ship}        playerShip
   * @param {Trajectory}  trajectory
   * @param {InputManager} input
   * @param {TimeWarp}    timeWarp    (optional, for UI warp dial)
   */
  constructor({ canvas, ctx, camera, system, playerShip, trajectory, input, timeWarp, targeting }) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.camera = camera;
    this.system = system;
    this.ship = playerShip;
    this.trajectory = trajectory;
    this.input = input;
    this.timeWarp = timeWarp || null;
    this.targeting = targeting || null;
    this.nodes = [];
    this.widget = new ManeuverWidget(camera);
    this.predictedElements = null;

    this._selectedBody = null;
    this._orbitalTrails = new Map();   // body → Vec2[] trail history
    this._belt = this._generateBelt();
    this.playerOrbitElements = null;   // computed per-frame for HUD readout

    this.onNodeSelect = null; // Callback when a node is selected/created
    this.onDockRequest = null; // called when player clicks "Dock" on a station body
  }

  /** The currently selected body (or null). */
  get selectedBody() { return this._selectedBody; }

  // ─── Public API ──────────────────────────────────────────────────────────────

  render(simTime, alpha, autopilot, npcShips = []) {
    this._syncTrajectory(simTime, autopilot);

    const ctx = this.ctx;
    ctx.save();

    this._drawGravityGrid(simTime);
    this._drawBelt();
    this._drawOrbitalPaths(simTime);
    this._drawOrbitalTrails(simTime);
    this._drawBodies(simTime);
    this._drawPlayerOrbit(simTime);
    this._drawGhostPath(autopilot);
    this._drawShip(alpha);
    this._drawNpcs(alpha, npcShips);
    this._drawNodes(simTime);
    this._drawTargetBracket(simTime);
    
    if (autopilot && autopilot.active) {
      this._drawAutopilotMarkers(autopilot);
    }
    
    this.widget.render(ctx);

    ctx.restore();

    // DOM-space overlays
    this._drawBodyLabels(simTime);
  }

  _syncTrajectory(simTime, autopilot) {
    // Recompute trajectory once per render frame so it smoothly anchors to the ship's live physics state
    this.trajectory.invalidate();
    this.trajectory.update(this.ship, simTime, this.nodes, autopilot);

    // Sync active widget position to the newly computed ghost path
    if (this.widget.activeNode) {
      if (this.widget.activeNode.burnTime < simTime) {
        this.widget.detach();
        if (this.onNodeSelect) this.onNodeSelect(null);
      } else {
        const pt = this.trajectory.points.find(p => p.t >= this.widget.activeNode.burnTime);
        if (pt) {
          const dominant = this.trajectory.sim.getDominantBodyAt(pt.pos, pt.t);
          const primaryPos = dominant ? dominant.getPosition(pt.t) : new Vec2(0, 0);
          this.widget.attach(this.widget.activeNode, pt.pos.clone(), pt.vel.clone(), primaryPos);

          // Compute predicted orbit elements after burn
          const dv = this.widget.activeNode.getDeltaVVector(pt.vel, primaryPos, pt.pos);
          const postVel = pt.vel.add(dv);
          const relPos = pt.pos.sub(primaryPos);
          this.predictedElements = KeplerOrbit.getElementsFromState(relPos, postVel, G * (dominant ? dominant.mass : 2.654e31));
          this.predictedElements.primaryName = dominant ? dominant.name : 'Solara';
        }
      }
    } else {
      this.predictedElements = null;
    }
  }

  update(simTime, dt) {
    this._updateTrails(simTime);
    // Remove past nodes
    this.nodes = this.nodes.filter(n => n.burnTime >= simTime);
  }

  handleInput(simTime, npcShips = []) {
    const input = this.input;

    if (this.widget.handleInput(this.input, this.trajectory)) {
      this.trajectory.invalidate();
      if (this.onNodeSelect) this.onNodeSelect(this.widget.activeNode);
      return;
    }

    // ── Body click FIRST — takes priority over ghost-path node placement ───
    // Peek at MouseLeft without consuming; check if a body was hit.
    const hadClick = input.consumePressed('MouseLeft') || this._pendingClick;
    this._pendingClick = false;

    let clickConsumedByBody = false;
    if (hadClick) {
      // Try to select a body or a ship at the click position
      const { hit } = this._trySelectBody(simTime, npcShips);
      clickConsumedByBody = hit;
    }

    // ── Ghost-path / maneuver node (only if click wasn't on a body) ────────
    if (hadClick && !clickConsumedByBody) {
      // Re-inject the click for ghost path handling by temporarily re-marking it pressed.
      // We do this by calling ghost-path logic directly with the known position.
      this._checkGhostPathClickDirect(simTime);
    }

    // ── Pan with left-button drag ──────────────────────────────────────────
    if (input.mouseDown(0) && !hadClick) {
      this.camera.panByScreen(input.mouse.dx, input.mouse.dy);
      input.mouse.dx = 0;
      input.mouse.dy = 0;
    }

    // ── Zoom ──────────────────────────────────────────────────────────────
    if (input.mouse.scrollDelta !== 0) {
      this.camera.zoomAt(input.mouse.x, input.mouse.y, input.mouse.scrollDelta);
      input.mouse.scrollDelta = 0;
    }

    // Focus on ship with 'F'
    if (input.consumePressed('KeyF')) this.camera.follow(this.ship);
    // Focus on selected body with 'G'
    if (input.consumePressed('KeyG') && this._selectedBody) {
      const pos = this.system.getPosition(this._selectedBody, simTime);
      this.camera.focusOn(new Vec2(pos.x, pos.y));
    }
    // Deselect with Escape
    if (input.consumePressed('Escape')) this._selectedBody = null;
  }

  // ─── Body Selection ──────────────────────────────────────────────────────────

  /**
   * Try to select a body or ship at the current mouse position.
   * Only updates selection on a hit; empty-space clicks leave current selection intact.
   * @returns {{ hit: boolean }}
   */
  _trySelectBody(simTime, npcShips = []) {
    // 1. Check celestial bodies
    for (const body of this.system.allBodies) {
      const pos = this.system.getPosition(body, simTime);
      const sPos = this.camera.worldToScreen(pos.x, pos.y);
      const dx = sPos.x - this.input.mouse.x;
      const dy = sPos.y - this.input.mouse.y;
      if (Math.sqrt(dx * dx + dy * dy) < BODY_SELECT_RADIUS_PX) {
        this._selectedBody = body;
        return { hit: true };
      }
    }

    // 2. Check NPC ships
    for (const ship of npcShips) {
      if (ship.destroyed) continue;
      // Ships are dynamic and use position directly instead of system.getPosition
      const sPos = this.camera.worldToScreen(ship.position.x, ship.position.y);
      const dx = sPos.x - this.input.mouse.x;
      const dy = sPos.y - this.input.mouse.y;
      if (Math.sqrt(dx * dx + dy * dy) < BODY_SELECT_RADIUS_PX) {
        this._selectedBody = ship;
        return { hit: true };
      }
    }

    // Empty-space click — leave current selection alone (use Escape to deselect)
    return { hit: false };
  }


  // ─── Gravity Well Grid ───────────────────────────────────────────────────────

  _drawGravityGrid(simTime) {
    const ctx = this.ctx;
    const extent = 25 * AU;    // grid covers entire system
    const step = (2 * extent) / GRID_CELLS;
    const G = 6.674e-11;

    ctx.strokeStyle = `rgba(57, 255, 20, ${GRID_ALPHA_BASE})`;
    ctx.lineWidth = 1;

    // Horizontal lines
    for (let row = 0; row <= GRID_CELLS; row++) {
      const baseY = -extent + row * step;
      ctx.beginPath();
      let started = false;
      for (let col = 0; col <= GRID_CELLS; col++) {
        const baseX = -extent + col * step;
        const warp = this._gridWarp(baseX, baseY, simTime, G);
        const sPos = this.camera.worldToScreen(baseX + warp.x, baseY + warp.y);
        if (!started) { ctx.moveTo(sPos.x, sPos.y); started = true; }
        else ctx.lineTo(sPos.x, sPos.y);
      }
      ctx.stroke();
    }

    // Vertical lines
    for (let col = 0; col <= GRID_CELLS; col++) {
      const baseX = -extent + col * step;
      ctx.beginPath();
      let started = false;
      for (let row = 0; row <= GRID_CELLS; row++) {
        const baseY = -extent + row * step;
        const warp = this._gridWarp(baseX, baseY, simTime, G);
        const sPos = this.camera.worldToScreen(baseX + warp.x, baseY + warp.y);
        if (!started) { ctx.moveTo(sPos.x, sPos.y); started = true; }
        else ctx.lineTo(sPos.x, sPos.y);
      }
      ctx.stroke();
    }
  }

  /** Compute displacement of a grid point due to gravitational potential. */
  _gridWarp(x, y, simTime, G) {
    let wx = 0, wy = 0;
    const scale = 0.12;   // visual scale for warp amplitude

    for (const body of this.system.allBodies) {
      if (body.type === 'belt') continue;
      const pos = this.system.getPosition(body, simTime);
      const dx = x - pos.x;
      const dy = y - pos.y;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2);
      if (r < 1e9) continue;
      // Warp proportional to GM/r — toward the body
      const strength = (G * body.mass / r) * scale;
      const maxWarp = 0.18 * AU;
      const clampedS = Math.min(strength, maxWarp);
      wx += -clampedS * (dx / r);
      wy += -clampedS * (dy / r);
    }
    return { x: wx, y: wy };
  }

  // ─── Asteroid Belt ───────────────────────────────────────────────────────────

  _generateBelt() {
    const pts = [];
    for (let i = 0; i < BELT_ASTEROIDS; i++) {
      const r = (BELT_MIN_AU + Math.random() * (BELT_MAX_AU - BELT_MIN_AU)) * AU;
      const angle = Math.random() * 2 * Math.PI;
      const size = Math.random() * 0.8e9 + 0.2e9;
      pts.push({ r, angle, size, alpha: 0.2 + Math.random() * 0.4 });
    }
    return pts;
  }

  _drawBelt() {
    const ctx = this.ctx;
    for (const a of this._belt) {
      const x = Math.cos(a.angle) * a.r;
      const y = Math.sin(a.angle) * a.r;
      const sPos = this.camera.worldToScreen(x, y);
      const sSize = Math.max(1, a.size * this.camera.zoom * 0.1);
      ctx.beginPath();
      ctx.arc(sPos.x, sPos.y, sSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(158, 158, 158, ${a.alpha})`;
      ctx.fill();
    }
  }

  // ─── Orbital Paths ───────────────────────────────────────────────────────────

  _drawOrbitalPaths(simTime) {
    const ctx = this.ctx;
    for (const body of this.system.allBodies) {
      if (!body.orbit) continue;
      const pts = body.orbit.getOrbitPath(simTime, 128);
      if (pts.length < 2) continue;

      const isSelected = body === this._selectedBody;
      const isMoon = body.orbit.parent !== null;

      if (isSelected) {
        // Glowing thick selection orbit
        const rgba = this._hexToRgba(body.color, 0.9);
        ctx.shadowColor = body.color;
        ctx.shadowBlur  = 12;
        ctx.strokeStyle = rgba;
        ctx.lineWidth   = 2.5;
        ctx.setLineDash([]);
      } else {
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = this._hexToRgba(body.color, isMoon ? 0.12 : ORBIT_ALPHA);
        ctx.lineWidth   = 1;
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      const p0 = this.camera.worldToScreen(pts[0].x, pts[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < pts.length; i++) {
        const p = this.camera.worldToScreen(pts[i].x, pts[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Direction-of-motion arrow marker at ~3/4 of the orbit
      if (isSelected && pts.length > 4) {
        const arrowIdx = Math.floor(pts.length * 0.75);
        const pp = this.camera.worldToScreen(pts[arrowIdx].x, pts[arrowIdx].y);
        const pq = this.camera.worldToScreen(pts[(arrowIdx + 2) % pts.length].x, pts[(arrowIdx + 2) % pts.length].y);
        const ang = Math.atan2(pq.y - pp.y, pq.x - pp.x);
        const arrowSize = 7;
        ctx.save();
        ctx.translate(pp.x, pp.y);
        ctx.rotate(ang);
        ctx.fillStyle = this._hexToRgba(body.color, 0.9);
        ctx.beginPath();
        ctx.moveTo(arrowSize, 0);
        ctx.lineTo(-arrowSize * 0.6, -arrowSize * 0.5);
        ctx.lineTo(-arrowSize * 0.6,  arrowSize * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.setLineDash([]);
  }

  // ─── Orbital Trails ──────────────────────────────────────────────────────────

  _updateTrails(simTime) {
    for (const body of this.system.primaries) {
      if (!body.orbit) continue;
      let trail = this._orbitalTrails.get(body);
      if (!trail) { trail = []; this._orbitalTrails.set(body, trail); }

      const pos = body.orbit.getPosition(simTime);
      trail.push(new Vec2(pos.x, pos.y));
      if (trail.length > TRAIL_POINTS) trail.shift();
    }
  }

  _drawOrbitalTrails(simTime) {
    const ctx = this.ctx;
    for (const [body, trail] of this._orbitalTrails) {
      if (trail.length < 2) continue;
      for (let i = 1; i < trail.length; i++) {
        const t0 = trail[i - 1];
        const t1 = trail[i];
        const alpha = (i / trail.length) * 0.35;
        ctx.strokeStyle = this._hexToRgba(body.color, alpha);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const p0 = this.camera.worldToScreen(t0.x, t0.y);
        const p1 = this.camera.worldToScreen(t1.x, t1.y);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
  }

  // ─── Autopilot Markers ────────────────────────────────────────────────────────
  
  _drawAutopilotMarkers(autopilot) {
    const ctx = this.ctx;

    // 1. Intercept point (where the planet will be)
    if (autopilot.interceptPt) {
      const sPos = this.camera.worldToScreen(autopilot.interceptPt.x, autopilot.interceptPt.y);
      ctx.beginPath();
      ctx.arc(sPos.x, sPos.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = '#fff';
      ctx.font = '10px Roboto Mono';
      ctx.textAlign = 'center';
      ctx.fillText('INTERCEPT', sPos.x, sPos.y - 12);
    }

    // 2. Target Aim Point (where the ship is currently pointing to compensate)
    if (autopilot.targetAimPt) {
      const sPos = this.camera.worldToScreen(autopilot.targetAimPt.x, autopilot.targetAimPt.y);
      
      // Draw a crosshair for the aim point
      ctx.beginPath();
      ctx.moveTo(sPos.x - 6, sPos.y);
      ctx.lineTo(sPos.x + 6, sPos.y);
      ctx.moveTo(sPos.x, sPos.y - 6);
      ctx.lineTo(sPos.x, sPos.y + 6);
      ctx.strokeStyle = '#ffb000';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffb000';
      ctx.font = '10px Roboto Mono';
      ctx.textAlign = 'center';
      ctx.fillText('AIM VECTOR', sPos.x, sPos.y + 16);
      
      // Draw line from ship to aim point
      const sShip = this.camera.worldToScreen(this.ship.position.x, this.ship.position.y);
      ctx.beginPath();
      ctx.moveTo(sShip.x, sShip.y);
      ctx.lineTo(sPos.x, sPos.y);
      ctx.strokeStyle = 'rgba(255, 176, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ─── Body Rendering ───────────────────────────────────────────────────────────

  _drawBodies(simTime) {
    const ctx = this.ctx;
    for (const body of this.system.allBodies) {
      const pos = this.system.getPosition(body, simTime);
      const sPos = this.camera.worldToScreen(pos.x, pos.y);

      // Adaptive screen radius: actual body radius in world → screen, clamped
      const realScreenR = body.radius * this.camera.zoom;
      const iconR = Math.max(body.type === 'star' ? 10 : (body.type === 'gas' ? 6 : 3), Math.min(realScreenR, 60));
      const r = Math.max(iconR, realScreenR);

      // Selection ring
      if (body === this._selectedBody) {
        ctx.beginPath();
        ctx.arc(sPos.x, sPos.y, r * 2.2, 0, Math.PI * 2);
        ctx.strokeStyle = this._hexToRgba(body.color || '#39ff14', 0.7);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ring system for Caelus
      if (body.hasRings) {
        ctx.beginPath();
        ctx.ellipse(sPos.x, sPos.y, r * 3, r * 0.7, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(128, 222, 234, 0.25)';
        ctx.lineWidth = Math.max(1, r * 0.6);
        ctx.stroke();
      }

      // Body fill
      const grd = ctx.createRadialGradient(
        sPos.x - r * 0.3, sPos.y - r * 0.3, r * 0.1,
        sPos.x, sPos.y, r * 1.2
      );
      grd.addColorStop(0, this._lighten(body.color, 40));
      grd.addColorStop(1, this._darken(body.color, 30));

      ctx.beginPath();
      ctx.arc(sPos.x, sPos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Star outer glow
      if (body.type === 'star') {
        const glowGrd = ctx.createRadialGradient(sPos.x, sPos.y, r, sPos.x, sPos.y, r * 5);
        glowGrd.addColorStop(0, this._hexToRgba(body.glowColor || body.color, 0.4));
        glowGrd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(sPos.x, sPos.y, r * 5, 0, Math.PI * 2);
        ctx.fillStyle = glowGrd;
        ctx.fill();
      }
    }
  }

  // ─── Body Labels (drawn in screen space) ───────────────────────────────────

  _drawBodyLabels(simTime) {
    const ctx = this.ctx;
    const zoom = this.camera.zoom;

    // Only show labels above a zoom threshold to avoid clutter
    const showMoons = zoom > 1e-5;

    ctx.save();
    // No camera transform — drawing in screen space
    ctx.font = '11px "Roboto Mono", monospace';
    ctx.textAlign = 'center';

    for (const body of this.system.allBodies) {
      const isMoon = body.orbit && body.orbit.parent !== null;
      if (isMoon && !showMoons) continue;

      const pos = this.system.getPosition(body, simTime);
      const sPos = this.camera.worldToScreen(pos.x, pos.y);

      // Don't label off-screen bodies
      if (sPos.x < -50 || sPos.x > this.canvas.width + 50) continue;
      if (sPos.y < -50 || sPos.y > this.canvas.height + 50) continue;

      const isSelected = body === this._selectedBody;

      // Body name label
      const screenR = Math.max(body.type === 'star' ? 12 : (body.type === 'gas' ? 7 : 4),
        Math.min(body.radius * zoom, 60));
      const labelY = sPos.y + screenR + 14;

      ctx.fillStyle = isSelected
        ? body.color
        : this._hexToRgba(body.color, 0.65);
      ctx.letterSpacing = '0.08em';
      ctx.fillText(body.name.toUpperCase(), sPos.x, labelY);

      // Station dots
      if (body.stations && body.stations.length > 0 && zoom > 2e-6) {
        ctx.font = '9px "Roboto Mono", monospace';
        ctx.fillStyle = 'rgba(57, 255, 20, 0.5)';
        
        body.stations.forEach((station, index) => {
          ctx.fillText('◆ ' + station.name.toUpperCase(), sPos.x, labelY + 14 + (index * 12));
        });

        ctx.font = '11px "Roboto Mono", monospace';
      }

      // Security indicator dot
      if (isSelected) {
        const secColors = { high: '#39FF14', medium: '#FFBF00', low: '#FF6D00', none: '#FF003F' };
        const col = secColors[body.security] || '#888';
        ctx.beginPath();
        ctx.arc(sPos.x + 40, labelY - 5, 4, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ─── Player Orbit Ellipse ──────────────────────────────────────────────────────

  _drawPlayerOrbit(simTime) {
    const G_CONST = 6.674e-11;

    // Determine reference body: selected body if any, otherwise dominant body
    let refBody = this._selectedBody;
    if (!refBody) {
      const dominant = this.trajectory.sim.getDominantBodyAt(this.ship.position, simTime);
      refBody = dominant
        ? this.system.allBodies.find(b => b.name === dominant.name) || null
        : null;
    }
    if (!refBody) {
      this.playerOrbitElements = null;
      return;
    }

    // Get reference body position & velocity
    const bPos = refBody.orbit ? refBody.orbit.getPosition(simTime) : new Vec2(0, 0);
    const bVel = refBody.orbit ? refBody.orbit.getVelocity(simTime) : new Vec2(0, 0);

    // Player state relative to reference body
    const relPos = this.ship.position.sub(bPos);
    const relVel = this.ship.velocity.sub(bVel);
    const GM = G_CONST * refBody.mass;

    // Compute orbital elements
    const elems = KeplerOrbit.getElementsFromState(relPos, relVel, GM);
    elems.refBodyName = refBody.name;
    elems.refBodyColor = refBody.color;
    elems.altitude = relPos.len() - (refBody.radius || 0);
    this.playerOrbitElements = elems;

    const { a, e, w } = elems;
    const isHyperbolic = e >= 1;
    const isBound = !isHyperbolic && a > 0;

    // ── Sample the orbit path via true anomaly ν ──────────────────────────
    //
    // r(ν) = a*(1 - e²) / (1 + e*cos(ν))
    //   Works for both ellipse (e<1) and hyperbola (e>=1, a<0).
    //
    // Ellipse:   ν ∈ [-π, π]
    // Hyperbola: ν ∈ (-(νmax-ε), +(νmax-ε)) where νmax = arccos(-1/e)
    //

    const ctx = this.ctx;
    ctx.save();

    let nuMin, nuMax, samples;
    if (isHyperbolic) {
      // Asymptotic limit of ν — we can never reach it, use 95% of the way
      const nuInf = Math.acos(-1 / e);
      nuMin = -(nuInf * 0.95);
      nuMax =  (nuInf * 0.95);
      samples = 80;
      // Hyperbola: orange-red dashed arc (approaching) — distinct from ellipse
      ctx.strokeStyle = 'rgba(255, 120, 0, 0.65)';
    } else {
      nuMin = -Math.PI;
      nuMax =  Math.PI;
      samples = 128;
      // Bound orbit: cyan dashed ellipse
      ctx.strokeStyle = 'rgba(0, 220, 255, 0.55)';
    }

    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.shadowColor = isHyperbolic ? 'rgba(255,120,0,0.3)' : 'rgba(0,220,255,0.3)';
    ctx.shadowBlur = 6;

    ctx.beginPath();
    let firstPt = true;
    for (let i = 0; i <= samples; i++) {
      const nu = nuMin + (i / samples) * (nuMax - nuMin);
      const denom = 1 + e * Math.cos(nu);
      if (denom <= 0) continue;   // Should not happen within our range, safety guard
      const r = a * (1 - e * e) / denom;
      if (r <= 0) continue;       // Past body surface
      const angle = nu + w;
      const worldX = bPos.x + r * Math.cos(angle);
      const worldY = bPos.y + r * Math.sin(angle);
      const sPos = this.camera.worldToScreen(worldX, worldY);
      if (firstPt) { ctx.moveTo(sPos.x, sPos.y); firstPt = false; }
      else ctx.lineTo(sPos.x, sPos.y);
    }
    if (isBound) ctx.closePath();
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // ── PE marker (always shown) ──────────────────────────────────────────
    const peR = a * (1 - e);   // Works for both: a<0,e>1 → positive; a>0,e<1 → positive
    const peWorld = new Vec2(
      bPos.x + peR * Math.cos(w),
      bPos.y + peR * Math.sin(w)
    );
    const peSPos = this.camera.worldToScreen(peWorld.x, peWorld.y);
    ctx.fillStyle = isHyperbolic ? '#ff7800' : '#00dcff';
    ctx.font = '10px "Roboto Mono", monospace';
    ctx.textAlign = 'center';
    ctx.beginPath();
    ctx.arc(peSPos.x, peSPos.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('PE', peSPos.x, peSPos.y - 8);

    // ── AP marker (only for bound orbits) ────────────────────────────────
    if (isBound) {
      const apR = a * (1 + e);
      const apWorld = new Vec2(
        bPos.x + apR * Math.cos(w + Math.PI),
        bPos.y + apR * Math.sin(w + Math.PI)
      );
      const apSPos = this.camera.worldToScreen(apWorld.x, apWorld.y);
      ctx.beginPath();
      ctx.arc(apSPos.x, apSPos.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('AP', apSPos.x, apSPos.y - 8);
    }

    ctx.restore();
  }


  // ─── Ghost Path ───────────────────────────────────────────────────────────────

  _drawGhostPath(autopilot) {
    let pts = this.trajectory.points;
    let ptsLen = this.trajectory.pointsLength || pts.length;

    // Use autopilot path if available and active (shows the guidance plan)
    if (autopilot && autopilot.active && autopilot.path && autopilot.path.length > 1) {
      pts = autopilot.path;
      ptsLen = pts.length;
    }

    if (ptsLen < 2) return;

    const ctx = this.ctx;

    const isAutopilot = autopilot && autopilot.active;

    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.75;
    ctx.setLineDash(GHOST_DASH);

    // Draw prediction line
    if (!isAutopilot) {
      ctx.strokeStyle = '#39ff14'; // Green for manual nodes
      ctx.beginPath();
      const sShip = this.camera.worldToScreen(this.ship.position.x, this.ship.position.y);
      ctx.moveTo(sShip.x, sShip.y);
      for (let i = 0; i < ptsLen; i++) {
        const p = this.camera.worldToScreen(pts[i].pos.x, pts[i].pos.y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    } else {
      // Draw autopilot path with color-coded states
      const stateColors = {
        'ACCEL': '#ff7800',  // Orange
        'ALIGN': '#ff7800',  // Orange
        'COAST': '#777777',  // Grey
        'BRAKE': '#00d2ff',  // Cyan
        'HOLD':  '#39ff14',  // Green
        'OFF':   '#39ff14',   // Default
        'OPTIMAL': '#ffb000' // Yellow-orange guidance
      };

      let currentPathState = pts[0].apState;
      ctx.strokeStyle = stateColors[currentPathState] || '#ffbf00';
      ctx.beginPath();
      
      const sShip = this.camera.worldToScreen(this.ship.position.x, this.ship.position.y);
      ctx.moveTo(sShip.x, sShip.y);

      for (let i = 0; i < ptsLen; i++) {
        const pt = pts[i];
        const p = this.camera.worldToScreen(pt.pos.x, pt.pos.y);
        
        if (pt.apState !== currentPathState) {
          // Finish the current path segment and start a new one
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          
          currentPathState = pt.apState;
          ctx.strokeStyle = stateColors[currentPathState] || '#ffbf00';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
    }

    // Hover Highlight
    const mousePos = this.input.mouse;
    let closestPt = null;
    let minDist = 30;
    for (let i = 0; i < ptsLen; i++) {
      const p = pts[i];
      const sPos = this.camera.worldToScreen(p.pos.x, p.pos.y);
      const d = new Vec2(mousePos.x, mousePos.y).dist(sPos);
      if (d < minDist) {
        minDist = d;
        closestPt = sPos;
      }
    }
    if (closestPt) {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(closestPt.x, closestPt.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Fade the tail: redraw with gradient opacity
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // ─── Maneuver Nodes ──────────────────────────────────────────────────────────

  _checkGhostPathClick(simTime) {
    // Handle trajectory clicking or 'N' key
    const isNKey = this.input.consumePressed('KeyN');
    if ((this.input.consumePressed('MouseLeft') || isNKey) && !this.input.isDown('Space')) {
      const mousePos = this.input.mouse;
      const pts = this.trajectory.points;

      // Check if clicking near an existing node
      for (const node of this.nodes) {
        const pt = this.trajectory.points.find(p => p.t >= node.burnTime);
        if (pt) {
          const sPos = this.camera.worldToScreen(pt.pos.x, pt.pos.y);
          if (new Vec2(mousePos.x, mousePos.y).dist(sPos) < 20) {
            const dominant = this.trajectory.sim.getDominantBodyAt(pt.pos, pt.t);
            const primaryPos = dominant ? dominant.getPosition(pt.t) : new Vec2(0, 0);
            this.widget.attach(node, pt.pos.clone(), pt.vel.clone(), primaryPos);
            if (this.onNodeSelect) this.onNodeSelect(node);
            return;
          }
        }
      }

      let bestDist = 40; // Even more forgiving hit area
      let bestPt = null;
      let bestT = 0;

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const sPos = this.camera.worldToScreen(p.pos.x, p.pos.y);
        const d = new Vec2(mousePos.x, mousePos.y).dist(sPos);
        if (d < bestDist) {
          bestDist = d;
          bestPt = p;
          bestT = p.t;
        }
      }

      if (bestPt) {
        if (this.nodes.some(n => n.burnTime === bestT)) return true; // prevent duplicate node

        const node = new ManeuverNode({ burnTime: bestT });
        this.nodes.push(node);
        // Find dominant body for initial radial alignment
        const primary = this.trajectory.sim.getDominantBodyAt(bestPt.pos, bestPt.t);
        const primaryPos = primary ? primary.getPosition(bestPt.t) : new Vec2(0, 0);

        this.widget.attach(node, bestPt.pos, bestPt.vel, primaryPos);
        if (this.onNodeSelect) this.onNodeSelect(node);
        this.trajectory.invalidate();
        return true;
      }
    }
    return false;
  }

  /**
   * Ghost-path node placement triggered by a click that was NOT on a body.
   * Does not call consumePressed (the click was already consumed by handleInput).
   */
  _checkGhostPathClickDirect(simTime) {
    const isNKey = this.input.consumePressed('KeyN');
    if (this.input.isDown('Space') && !isNKey) return false;

    const mousePos = this.input.mouse;
    const pts = this.trajectory.points;

    // Check for existing node click
    for (const node of this.nodes) {
      const pt = this.trajectory.points.find(p => p.t >= node.burnTime);
      if (pt) {
        const sPos = this.camera.worldToScreen(pt.pos.x, pt.pos.y);
        if (new Vec2(mousePos.x, mousePos.y).dist(sPos) < 20) {
          const dominant = this.trajectory.sim.getDominantBodyAt(pt.pos, pt.t);
          const primaryPos = dominant ? dominant.getPosition(pt.t) : new Vec2(0, 0);
          this.widget.attach(node, pt.pos.clone(), pt.vel.clone(), primaryPos);
          if (this.onNodeSelect) this.onNodeSelect(node);
          return true;
        }
      }
    }

    let bestDist = 40;
    let bestPt = null;
    let bestT = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const sPos = this.camera.worldToScreen(p.pos.x, p.pos.y);
      const d = new Vec2(mousePos.x, mousePos.y).dist(sPos);
      if (d < bestDist) { bestDist = d; bestPt = p; bestT = p.t; }
    }
    if (bestPt) {
      if (this.nodes.some(n => n.burnTime === bestT)) return true;
      const node = new ManeuverNode({ burnTime: bestT });
      this.nodes.push(node);
      const primary = this.trajectory.sim.getDominantBodyAt(bestPt.pos, bestPt.t);
      const primaryPos = primary ? primary.getPosition(bestPt.t) : new Vec2(0, 0);
      this.widget.attach(node, bestPt.pos, bestPt.vel, primaryPos);
      if (this.onNodeSelect) this.onNodeSelect(node);
      this.trajectory.invalidate();
      return true;
    }
    return false;
  }

  // ─── Target Bracket ──────────────────────────────────────────────────────────

  _drawTargetBracket(simTime) {
    if (!this.targeting || !this.targeting.hasTarget()) return;
    const tPos = this.targeting.getTargetPosition(simTime);
    if (!tPos) return;

    const sPos = this.camera.worldToScreen(tPos.x, tPos.y);

    const ctx = this.ctx;
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 2;
    const size = 15;
    ctx.beginPath();

    // Top Left
    ctx.moveTo(sPos.x - size, sPos.y - size + 5);
    ctx.lineTo(sPos.x - size, sPos.y - size);
    ctx.lineTo(sPos.x - size + 5, sPos.y - size);

    // Top Right
    ctx.moveTo(sPos.x + size - 5, sPos.y - size);
    ctx.lineTo(sPos.x + size, sPos.y - size);
    ctx.lineTo(sPos.x + size, sPos.y - size + 5);

    // Bottom Right
    ctx.moveTo(sPos.x + size, sPos.y + size - 5);
    ctx.lineTo(sPos.x + size, sPos.y + size);
    ctx.lineTo(sPos.x + size - 5, sPos.y + size);

    // Bottom Left
    ctx.moveTo(sPos.x - size + 5, sPos.y + size);
    ctx.lineTo(sPos.x - size, sPos.y + size);
    ctx.lineTo(sPos.x - size, sPos.y + size - 5);

    ctx.stroke();
  }

  // ─── Nodes ───────────────────────────────────────────────────────────────────

  _drawNodes(simTime) {
    const ctx = this.ctx;
    for (const node of this.nodes) {
      const pt = this.trajectory.points.find(p => p.t >= node.burnTime);
      if (pt) {
        const sPos = this.camera.worldToScreen(pt.pos.x, pt.pos.y);

        const isActive = (this.widget.activeNode === node);

        ctx.fillStyle = isActive ? '#fff' : '#ffbf00';
        ctx.strokeStyle = '#080b0f';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sPos.x, sPos.y, isActive ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isActive ? '#fff' : '#ffbf00';
        ctx.font = '10px Roboto Mono';
        ctx.textAlign = 'left';
        ctx.fillText(`MN NODE @ T+${Math.floor((node.burnTime - simTime) / 60)}m`, sPos.x + 12, sPos.y + 4);
      }
    }
  }

  // ─── Ship Marker ─────────────────────────────────────────────────────────────

  _drawShip(alpha) {
    const pos = this.ship.getRenderPosition(alpha);
    const sPos = this.camera.worldToScreen(pos.x, pos.y);
    const r = 7;
    const ctx = this.ctx;
    const angle = this.ship.heading;

    ctx.save();
    ctx.translate(sPos.x, sPos.y);
    ctx.rotate(angle);

    // Ship triangle (pointing right = +x = angle 0)
    ctx.beginPath();
    ctx.moveTo(r * 2, 0);
    ctx.lineTo(-r, r);
    ctx.lineTo(-r, -r);
    ctx.closePath();
    ctx.fillStyle = '#39ff14';
    ctx.strokeStyle = '#080b0f';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    // Engine glow if thrusting
    if (this.ship.throttle > 0) {
      const glowGrd = ctx.createRadialGradient(-r * 1.5, 0, 0, -r * 1.5, 0, r * 4);
      glowGrd.addColorStop(0, 'rgba(100, 200, 255, 0.9)');
      glowGrd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(-r * 1.5, 0, r * 3, 0, Math.PI * 2);
      ctx.fillStyle = glowGrd;
      ctx.fill();
    }

    ctx.restore();
  }

  // ─── NPC Ships ───────────────────────────────────────────────────────────────

  _drawNpcs(alpha, npcShips) {
    if (!npcShips || npcShips.length === 0) return;
    const ctx = this.ctx;
    
    for (const npc of npcShips) {
      if (npc.destroyed) continue;
      
      const pos = npc.getRenderPosition ? npc.getRenderPosition(alpha) : npc.position;
      const sPos = this.camera.worldToScreen(pos.x, pos.y);
      
      // Skip if off-screen
      if (sPos.x < -20 || sPos.x > this.canvas.width + 20 || sPos.y < -20 || sPos.y > this.canvas.height + 20) continue;

      ctx.save();
      ctx.translate(sPos.x, sPos.y);
      ctx.rotate(npc.heading || 0);
      
      // Triangle marker for NPC
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-4, 3);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-4, -3);
      ctx.closePath();
      
      const isMerchant = npc.ai && npc.ai.state === 'MERCHANT';
      ctx.fillStyle = isMerchant ? '#ffbf00' : '#ff003f'; // Amber for merchant, Red for hostile
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#080b0f';
      ctx.fill();
      ctx.stroke();
      
      // Select ring
      if (npc === this._selectedBody) {
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(57, 255, 20, 0.7)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      ctx.restore();
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  _lighten(hex, amt) {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amt);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amt);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amt);
    return `rgb(${r},${g},${b})`;
  }

  _darken(hex, amt) {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amt);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amt);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amt);
    return `rgb(${r},${g},${b})`;
  }
}
