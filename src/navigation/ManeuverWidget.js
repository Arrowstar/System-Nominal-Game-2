/**
 * ManeuverWidget.js — Interactive canvas widget for adjusting ManeuverNodes.
 *
 * Drawn in screen-space. Handles clicks, drags, and scrolls on the vector arrows.
 */

import { Vec2 }         from '../core/Vec2.js';
import { ManeuverNode } from '../physics/Trajectory.js';

// Visual constants
const CENTER_R    = 8;
const ARROW_LEN   = 60;
const ARROW_TIP   = 10;
const HIT_RADIUS  = 20;  // more forgiving hit area for lines/tips

export class ManeuverWidget {
  constructor(camera) {
    this.camera = camera;
    this.activeNode = null;
    this.nodeWorldPos = null;
    this.nodeVelocity = null;
    this.primaryPos   = Vec2.zero();

    this._hoveredHandle = null;  // 'pro', 'retro', 'radOut', 'radIn', 'center'
    this._dragHandle    = null;
    this._dragStartVal  = 0;
    this._dragStartY    = 0;
  }

  /**
   * Set the active node and its context for rendering/interaction.
   */
  attach(node, worldPos, velocity, primaryPos) {
    this.activeNode   = node;
    this.nodeWorldPos = worldPos;
    this.nodeVelocity = velocity;
    this.primaryPos   = primaryPos || new Vec2(0, 0);
  }

  detach() {
    this.activeNode = null;
    this._hoveredHandle = null;
    this._dragHandle = null;
  }

  /**
   * Render the widget overlay on the canvas.
   */
  render(ctx) {
    if (!this.activeNode || !this.nodeWorldPos) return;

    const sPos = this.camera.worldToScreen(this.nodeWorldPos.x, this.nodeWorldPos.y);

    // Compute screen directions for the 4 axes
    const progWorld = this.nodeVelocity.lenSq() > 0 ? this.nodeVelocity.norm() : new Vec2(1, 0);
    const radWorld  = this.nodeWorldPos.sub(this.primaryPos).norm();

    // Since worldToScreen preserves angles (no rotation), we can just use the world directions.
    // Screen +y is down, but Canvas +y is also down.
    
    this._drawArrow(ctx, sPos, progWorld, '#39ff14', 'pro', 'PROG');
    this._drawArrow(ctx, sPos, progWorld.neg(), '#ff003f', 'retro', 'RETR');
    this._drawArrow(ctx, sPos, radWorld, '#29b6f6', 'radOut', 'RAD+');
    this._drawArrow(ctx, sPos, radWorld.neg(), '#ffbf00', 'radIn', 'RAD-');

    // Central grip
    ctx.beginPath();
    ctx.arc(sPos.x, sPos.y, CENTER_R, 0, Math.PI * 2);
    ctx.fillStyle = this._hoveredHandle === 'center' ? '#fff' : '#080b0f';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  _drawArrow(ctx, sPos, dir, color, id, label) {
    const isHover = this._hoveredHandle === id || this._dragHandle === id;
    const pEnd = sPos.add(dir.scale(ARROW_LEN + (isHover ? 8 : 0)));
    
    ctx.lineWidth = isHover ? 4 : 2;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(sPos.x, sPos.y);
    ctx.lineTo(pEnd.x, pEnd.y);
    
    // Draw tip
    const pTipL = pEnd.add(dir.rotate( Math.PI * 0.82).scale(ARROW_TIP));
    const pTipR = pEnd.add(dir.rotate(-Math.PI * 0.82).scale(ARROW_TIP));
    ctx.moveTo(pTipL.x, pTipL.y);
    ctx.lineTo(pEnd.x, pEnd.y);
    ctx.lineTo(pTipR.x, pTipR.y);
    ctx.stroke();

    if (isHover || this.activeNode.deltaV > 0) {
      ctx.fillStyle = color;
      ctx.font = '10px Roboto Mono';
      ctx.textAlign = 'center';
      const pLabel = pEnd.add(dir.scale(15));
      ctx.fillText(label, pLabel.x, pLabel.y);
    }
  }

  /**
   * Handle mouse interactions. Returns true if input was consumed.
   */
  handleInput(input, trajectory) {
    if (!this.activeNode) return false;

    const mx = input.mouse.x;
    const my = input.mouse.y;
    const sPos = this.camera.worldToScreen(this.nodeWorldPos.x, this.nodeWorldPos.y);

    // Compute handle positions
    const progDir = this.nodeVelocity.lenSq() > 0 ? this.nodeVelocity.norm() : new Vec2(1, 0);
    const radDir  = this.nodeWorldPos.sub(this.primaryPos).norm();

    const handles = [
      { id: 'pro',    dir: progDir },
      { id: 'retro',  dir: progDir.neg() },
      { id: 'radOut', dir: radDir },
      { id: 'radIn',  dir: radDir.neg() }
    ];

    // 1. Dragging
    if (this._dragHandle) {
      if (!input.mouseDown(0)) {
        this._dragHandle = null;
      } else {
        const currentMouse = new Vec2(input.mouse.x, input.mouse.y);
        
        if (this._dragHandle === 'center') {
          if (trajectory) {
            let bestDist = 100;
            let bestT = this.activeNode.burnTime;
            for (const pt of trajectory.points) {
              const sPos = this.camera.worldToScreen(pt.pos.x, pt.pos.y);
              const d = currentMouse.dist(sPos);
              if (d < bestDist) {
                bestDist = d;
                bestT = pt.t;
              }
            }
            this.activeNode.burnTime = bestT;
          }
          return true;
        }

        const dragVec = currentMouse.sub(this._dragStartMouse);

        let handleDir;
        if (this._dragHandle === 'pro')    handleDir = progDir;
        if (this._dragHandle === 'retro')  handleDir = progDir.neg();
        if (this._dragHandle === 'radOut') handleDir = radDir;
        if (this._dragHandle === 'radIn')  handleDir = radDir.neg();

        // Project drag vector onto the handle direction
        const pxMoved = dragVec.dot(handleDir);
        const sensitivity = input.isDown('ShiftLeft') ? 0.1 : 1.0;
        const deltaV = pxMoved * sensitivity;
        const newVal = this._dragStartVal + deltaV;

        if (this._dragHandle === 'pro' || this._dragHandle === 'retro') {
          if ((this._dragHandle === 'pro' && newVal >= 0) || (this._dragHandle === 'retro' && newVal < 0)) {
            this.activeNode.prograde = Math.abs(newVal);
            this.activeNode.retrograde = 0;
          } else {
            this.activeNode.retrograde = Math.abs(newVal);
            this.activeNode.prograde = 0;
          }
        } else {
          if ((this._dragHandle === 'radOut' && newVal >= 0) || (this._dragHandle === 'radIn' && newVal < 0)) {
            this.activeNode.radialOut = Math.abs(newVal);
            this.activeNode.radialIn = 0;
          } else {
            this.activeNode.radialIn = Math.abs(newVal);
            this.activeNode.radialOut = 0;
          }
        }
        
        return true; // consumed
      }
    }

    // 2. Hover detection
    this._hoveredHandle = null;
    const dCenter = new Vec2(mx, my).dist(sPos);
    if (dCenter <= CENTER_R * 2) {
      this._hoveredHandle = 'center';
    } else {
      let bestDist = HIT_RADIUS;
      for (const h of handles) {
        const pEnd = sPos.add(h.dir.scale(ARROW_LEN));
        const d = this._distToSegment(new Vec2(mx, my), sPos, pEnd);
        if (d < bestDist) {
          bestDist = d;
          this._hoveredHandle = h.id;
        }
      }
    }

    // 3. Initiate Drag (left click)
    if (this._hoveredHandle && input.consumePressed('MouseLeft')) {
      this._dragHandle = this._hoveredHandle;
      this._dragStartMouse = new Vec2(input.mouse.x, input.mouse.y);
      
      if (this._dragHandle === 'pro')    this._dragStartVal = this.activeNode.prograde - this.activeNode.retrograde;
      if (this._dragHandle === 'retro')  this._dragStartVal = this.activeNode.retrograde - this.activeNode.prograde;
      if (this._dragHandle === 'radOut') this._dragStartVal = this.activeNode.radialOut - this.activeNode.radialIn;
      if (this._dragHandle === 'radIn')  this._dragStartVal = this.activeNode.radialIn - this.activeNode.radialOut;
      if (this._dragHandle === 'center') this._dragStartVal = this.activeNode.burnTime;
      return true;
    }

    // 4. Scroll to fine-tune
    if (this._hoveredHandle && this._hoveredHandle !== 'center' && input.mouse.scrollDelta !== 0) {
      // scrollDelta > 0 is scroll down. We want scroll UP (neg delta) to increase Δv.
      const sign = input.mouse.scrollDelta < 0 ? 1 : -1;
      const amt = input.isDown('ShiftLeft') ? 0.1 : 1.0;
      const deltaV = sign * amt;

      let val = 0;
      if (this._hoveredHandle === 'pro')    { this.activeNode.prograde = Math.max(0, this.activeNode.prograde + deltaV); this.activeNode.retrograde = 0; }
      if (this._hoveredHandle === 'retro')  { this.activeNode.retrograde = Math.max(0, this.activeNode.retrograde + deltaV); this.activeNode.prograde = 0; }
      if (this._hoveredHandle === 'radOut') { this.activeNode.radialOut = Math.max(0, this.activeNode.radialOut + deltaV); this.activeNode.radialIn = 0; }
      if (this._hoveredHandle === 'radIn')  { this.activeNode.radialIn = Math.max(0, this.activeNode.radialIn + deltaV); this.activeNode.radialOut = 0; }

      // Consume scroll
      input.mouse.scrollDelta = 0;
      return true;
    }

    return this._hoveredHandle !== null;
  }

  _distToSegment(p, v, w) {
    const l2 = v.distSq(w);
    if (l2 === 0) return p.dist(v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return p.dist( new Vec2(v.x + t * (w.x - v.x), v.y + t * (w.y - v.y)) );
  }
}
