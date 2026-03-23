/**
 * Camera — 2D pan/zoom camera for canvas rendering.
 *
 * Converts between world-space (simulation units, km-scale) and
 * screen-space (pixels). The center of the canvas is the focal point.
 *
 * Usage:
 *   camera.applyTransform(ctx);   // call before drawing world objects
 *   camera.resetTransform(ctx);   // call after to restore for HUD drawing
 *   const wp = camera.screenToWorld(sx, sy);
 *   const sp = camera.worldToScreen(wx, wy);
 */
import { Vec2 } from './Vec2.js';

const ZOOM_MIN = 1e-10;
const ZOOM_MAX = 1e-3;
const ZOOM_SPEED = 0.001;     // per pixel of scroll delta

export class Camera {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;
    // World-space position of the screen center
    this._pos = Vec2.zero();
    this._zoom = 1e-4;         // pixels per simulation unit (AU-scale tuned in SolarSystem)
    this._targetPos = null;     // for smooth pan-to
    this._targetZoom = null;     // for smooth zoom-to
    this._followTarget = null;   // { getPosition(): Vec2 }
  }

  get zoom() { return this._zoom; }
  get pos() { return this._pos.clone(); }

  /** Pan by screen-space delta (from mouse drag). */
  panByScreen(dsx, dsy) {
    this._pos = this._pos.sub(new Vec2(dsx / this._zoom, dsy / this._zoom));
    this._followTarget = null;
  }

  /** Zoom toward/away from a screen-space anchor point. */
  zoomAt(screenX, screenY, scrollDelta) {
    const factor = Math.exp(-scrollDelta * ZOOM_SPEED);
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._zoom * factor));

    // Adjust position so the world point under the cursor stays fixed
    const wBefore = this.screenToWorld(screenX, screenY);
    this._zoom = newZoom;
    const wAfter = this.screenToWorld(screenX, screenY);
    this._pos = this._pos.add(wBefore.sub(wAfter));
  }

  /** Smoothly move camera to focus on a world-space position. */
  focusOn(worldPos, zoom = null) {
    this._targetPos = worldPos;
    this._targetZoom = zoom ?? this._zoom;
    this._followTarget = null;
  }

  /** Continuously follow an entity with { getPosition() } each frame. */
  follow(entity) {
    this._followTarget = entity;
    this._targetPos = null;
  }

  /** Update smooth transitions. Call every frame before rendering. */
  update(dt) {
    // Continuously follow an entity
    if (this._followTarget) {
      const tp = this._followTarget.getPosition();
      this._pos = this._pos.lerp(tp, Math.min(1, dt * 8));
    }

    // Smooth pan to target
    if (this._targetPos) {
      this._pos = this._pos.lerp(this._targetPos, Math.min(1, dt * 6));
      if (this._pos.dist(this._targetPos) < 0.1) {
        this._pos = this._targetPos;
        this._targetPos = null;
      }
    }

    // Smooth zoom to target
    if (this._targetZoom !== null) {
      this._zoom += (this._targetZoom - this._zoom) * Math.min(1, dt * 6);
      if (Math.abs(this._zoom - this._targetZoom) < this._targetZoom * 0.001) {
        this._zoom = this._targetZoom;
        this._targetZoom = null;
      }
    }
  }

  /** Returns the canvas center in pixels. */
  _center() {
    return { cx: this._canvas.width / 2, cy: this._canvas.height / 2 };
  }

  /** Convert world-space point to screen-space pixel coordinates. */
  worldToScreen(wx, wy) {
    const { cx, cy } = this._center();
    return new Vec2(
      (wx - this._pos.x) * this._zoom + cx,
      (wy - this._pos.y) * this._zoom + cy
    );
  }

  /** Convert screen-space pixels to world-space coordinates. */
  screenToWorld(sx, sy) {
    const { cx, cy } = this._center();
    return new Vec2(
      (sx - cx) / this._zoom + this._pos.x,
      (sy - cy) / this._zoom + this._pos.y
    );
  }

  /** Returns world-space radius of n pixels at current zoom. */
  pixelsToWorld(n) { return n / this._zoom; }

  /** Apply camera transform to canvas context (call before drawing world). */
  applyTransform(ctx) {
    const { cx, cy } = this._center();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this._zoom, this._zoom);
    ctx.translate(-this._pos.x, -this._pos.y);
  }

  /** Restore canvas context to un-transformed state (call after world drawing). */
  resetTransform(ctx) {
    ctx.restore();
  }
}
