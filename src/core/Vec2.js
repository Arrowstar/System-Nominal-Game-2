/**
 * Vec2 — Immutable 2D vector math helper.
 * All operations return new Vec2 instances unless noted.
 */
export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(v)        { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v)        { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s)      { return new Vec2(this.x * s, this.y * s); }
  dot(v)        { return this.x * v.x + this.y * v.y; }
  cross(v)      { return this.x * v.y - this.y * v.x; }
  lenSq()       { return this.x * this.x + this.y * this.y; }
  len()         { return Math.sqrt(this.lenSq()); }
  norm()        { const l = this.len(); return l > 0 ? this.scale(1 / l) : new Vec2(); }
  neg()         { return new Vec2(-this.x, -this.y); }
  clone()       { return new Vec2(this.x, this.y); }
  dist(v)       { return this.sub(v).len(); }
  distSq(v)     { return this.sub(v).lenSq(); }
  angle()       { return Math.atan2(this.y, this.x); }
  rotate(a)     {
    const c = Math.cos(a), s = Math.sin(a);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }

  /** Linearly interpolate toward v by t [0,1]. */
  lerp(v, t)    { return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t); }

  /** Mutable set (used in hot inner loops to avoid GC) */
  setXY(x, y)  { this.x = x; this.y = y; return this; }
  addMut(v)    { this.x += v.x; this.y += v.y; return this; }
  scaleMut(s)  { this.x *= s; this.y *= s; return this; }

  toString()    { return `Vec2(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`; }

  static fromAngle(a, len = 1) { return new Vec2(Math.cos(a) * len, Math.sin(a) * len); }
  static zero()                { return new Vec2(0, 0); }
}
