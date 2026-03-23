import { Vec2 } from './src/core/Vec2.js';
import { KeplerOrbit } from './src/physics/KeplerOrbit.js';

const GM = 1000;
const rVec = new Vec2(100, 0);
const vVec = new Vec2(0, -5); // retrograde

const elems = KeplerOrbit.getElementsFromState(rVec, vVec, GM);
console.log(elems);

// The position of the drawn ellipse at nu:
const nuOpts = [0, Math.PI/2, Math.PI, -Math.PI/2];
nuOpts.forEach(nu => {
  const r = elems.a * (1 - elems.e * elems.e) / (1 + elems.e * Math.cos(nu));
  const angle = nu + elems.w;
  console.log(`nu: ${nu.toFixed(2)} -> x: ${(r * Math.cos(angle)).toFixed(2)}, y: ${(r * Math.sin(angle)).toFixed(2)}`);
});
