/**
 * InputManager — Centralised keyboard, mouse, and scroll input.
 *
 * Tracks:
 *  - keys    : Set of currently held key codes
 *  - mouse   : { x, y, buttons Set, worldX, worldY, scrollDelta }
 *  - once    : Set of keys pressed this frame (cleared after polling)
 */
export class InputManager {
  constructor(canvas) {
    this._canvas = canvas;

    // Current held keys
    this.keys = new Set();
    // Just-pressed keys (consumed once per frame)
    this._justPressed  = new Set();
    this._justReleased = new Set();

    // Mouse state in screen space
    this.mouse = {
      x: 0, y: 0,
      dx: 0, dy: 0,          // delta since last frame
      buttons: new Set(),
      scrollDelta: 0,        // accumulated since last frame
      dragging: false,
    };

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this._justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      this._justReleased.add(e.code);
    });

    this._canvas.addEventListener('mousemove', e => {
      const rect = this._canvas.getBoundingClientRect();
      this.mouse.dx = e.clientX - rect.left - this.mouse.x;
      this.mouse.dy = e.clientY - rect.top  - this.mouse.y;
      this.mouse.x  = e.clientX - rect.left;
      this.mouse.y  = e.clientY - rect.top;
    });

    this._canvas.addEventListener('mousedown', e => {
      const btnMap = ['MouseLeft', 'MouseMiddle', 'MouseRight'];
      const btnName = btnMap[e.button];
      if (btnName && !this.mouse.buttons.has(e.button)) {
        this._justPressed.add(btnName);
      }
      this.mouse.buttons.add(e.button);
    });
    this._canvas.addEventListener('mouseup', e => {
      const btnMap = ['MouseLeft', 'MouseMiddle', 'MouseRight'];
      const btnName = btnMap[e.button];
      if (btnName) this._justReleased.add(btnName);
      this.mouse.buttons.delete(e.button);
    });

    // Prevent browser scroll on wheel events over canvas
    this._canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.mouse.scrollDelta += e.deltaY;
    }, { passive: false });
  }

  /** Returns true while key is held */
  isDown(code) { return this.keys.has(code); }

  /** Returns true only the first time it is queried per frame */
  consumePressed(code) {
    if (this._justPressed.has(code)) {
      this._justPressed.delete(code);
      return true;
    }
    return false;
  }
  justReleased(code) { return this._justReleased.has(code); }

  /** Returns true while mouse button is held (0=left, 1=mid, 2=right) */
  mouseDown(btn) { return this.mouse.buttons.has(btn); }

  /** Call at the end of each frame to reset per-frame state */
  endFrame() {
    this._justPressed.clear();
    this._justReleased.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.scrollDelta = 0;
  }
}
