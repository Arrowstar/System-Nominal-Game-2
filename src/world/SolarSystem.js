/**
 * SolarSystem.js — Solara system body definitions.
 *
 * Scale: All distances in meters. 1 AU = 1.496e11 m.
 * Orbital periods chosen for gameplay (compressed vs real — Inner Zone ~days,
 * Outer Zone ~weeks so the player sees meaningful movement).
 *
 * Each body has:
 *   orbit      — KeplerOrbit instance (or null for Solara)
 *   mass       — kg (for gravity on ships)
 *   radius     — m (display size, not to-scale)
 *   color      — hex string for rendering
 *   glowColor  — optional glow for the sun / hot bodies
 *   name       — display name
 *   type       — 'star' | 'rocky' | 'gas' | 'dwarf' | 'belt' | 'station'
 *   economy    — economy descriptor from design doc
 *   security   — 'high' | 'medium' | 'low' | 'none'
 *   produces   — array of commodity strings
 *   stations   — array of station descriptors { name, type }
 */

import { KeplerOrbit } from '../physics/KeplerOrbit.js';
import { Vec2 } from '../core/Vec2.js';

// ─── Scale & Constants ────────────────────────────────────────────────────────
export const AU = 1.496e11;      // meters per AU
const DAY      = 86400;          // seconds per day
const YEAR     = 365.25 * DAY;

/**
 * Compressed orbital periods for gameplay:
 *   Inner Zone  ~5 – 40 game-days  (fast enough to see planets move)
 *   Outer Zone  ~60 – 300 game-days
 * Real-time at 1× warp would be too slow; players will time-warp through coasting.
 */

// ─── Build bodies ─────────────────────────────────────────────────────────────

function makeBody(def) { return def; }

/**
 * Solara — stationary star at origin.
 */
const solara = makeBody({
  name:      'Solara',
  type:      'star',
  orbit:     null,              // Solara is fixed at (0,0)
  // Effective gravitational mass derived from Kepler III for compressed orbits:
  // GM = (2π)² a³ / T² where a = 1 AU (Aethelgard), T = 100 days
  // M_eff = GM / G = 2.654e31 kg (~13.3× real solar mass)
  mass:      2.654e31,
  radius:    6.957e9,           // 10× real sun radius for visibility
  color:     '#FFF176',
  glowColor: '#FF6F00',
  security:  'none',
  produces:  [],
  stations:  [],
  dangerZone: 0.15 * AU,        // Icarus Fame challenge inner limit
});

// ─── Inner Zone ───────────────────────────────────────────────────────────────

/**
 * Ignis — Tidally locked cinder. Produces Rare Metals.
 * Hot, fast, close to Solara.
 */
const ignis = makeBody({
  name:     'Ignis',
  type:     'rocky',
  orbit: new KeplerOrbit({
    a:      0.35 * AU,
    e:      0.15,
    w:      0.3,
    M0:     0,
    period: 28 * DAY,           // fast inner orbit
  }),
  mass:     3.3e23,
  radius:   2.4e6,
  color:    '#FF4500',
  security: 'medium',
  economy:  'industrial',
  produces: ['Raw Ore'],
  stations: [{ name: 'Ignis Forge', type: 'industrial' }],
  hazard:   'heat',
});

/**
 * The Foundry — Industrial hub. Produces Machinery.
 */
const foundry = makeBody({
  name:     'The Foundry',
  type:     'rocky',
  orbit: new KeplerOrbit({
    a:      0.65 * AU,
    e:      0.05,
    w:      1.8,
    M0:     1.2,
    period: 60 * DAY,
  }),
  mass:     4.87e24,
  radius:   6.05e6,
  color:    '#B0BEC5',
  security: 'high',
  economy:  'industrial',
  produces: ['Machinery Parts'],
  stations: [{ name: 'Foundry Station', type: 'industrial' }],
});

/**
 * Aethelgard — Capital world. High demand for Luxuries.
 */
const aethelgardOrbit = new KeplerOrbit({
    a:      1.0 * AU,
    e:      0.02,
    w:      0,
    M0:     0,
    period: 100 * DAY,          // "1 year" in game terms
});

const vane = makeBody({
    name:     'Vane',
    type:     'rocky',
    orbit: new KeplerOrbit({
        a:      0.5e9,
        e:      0.01,
        w:      1.2,
        M0:     2.5,
        period: 8 * DAY,
        parent: aethelgardOrbit,
    }),
    mass:     1.2e22,
    radius:   1.1e6,
    color:    '#B0BEC5',
    security: 'high',
    economy:  'shipyard',
    produces: [],
    stations: [{ name: 'Vane Shipyard', type: 'shipyard' }],
});

const aethelgard = makeBody({
  name:     'Aethelgard',
  type:     'rocky',
  orbit:    aethelgardOrbit,
  mass:     5.97e24,
  radius:   6.37e6,
  color:    '#42A5F5',
  security: 'high',
  economy:  'capital',
  produces: [],
  consumes: ['Luxuries'],
  stations: [
    { name: 'Aethelgard Prime', type: 'capital' },
  ],
  moons:    [vane],
});

/**
 * Gaea Prime — Terraformed garden world. Produces Food Paks and Medicine.
 */
const gaeaPrime = makeBody({
  name:     'Gaea Prime',
  type:     'rocky',
  orbit: new KeplerOrbit({
    a:      1.45 * AU,
    e:      0.04,
    w:      2.5,
    M0:     3.5,
    period: 150 * DAY,
  }),
  mass:     6.42e23,
  radius:   3.39e6,
  color:    '#66BB6A',
  security: 'high',
  economy:  'agricultural',
  produces: ['Biomass'],
  stations: [{ name: 'Harvest Station', type: 'agricultural' }],
});

// ─── Belt of Tears ────────────────────────────────────────────────────────────

/**
 * Ceres Prime — Major trade hub in the Belt. Has a black market fringe.
 * Represented as a single large "station asteroid."
 */
const ceresPrime = makeBody({
  name:     'Ceres Prime',
  type:     'station',
  orbit: new KeplerOrbit({
    a:      2.2 * AU,
    e:      0.08,
    w:      0.9,
    M0:     2.1,
    period: 280 * DAY,
  }),
  mass:     9.4e20,
  radius:   4.73e5,
  color:    '#9E9E9E',
  security: 'low',
  economy:  'trade',
  produces: [],
  stations: [
    { name: 'Ceres Market',  type: 'trade' },
    { name: 'The Underbelly', type: 'blackmarket' },
  ],
});

// ─── Outer Zone — Gas Giants & Frontier ─────────────────────────────────────

/**
 * Kronos — Primary Helium-3 (fuel) source.
 * Moons: Hyperion (Agricultural), Atlas (Refinery).
 */
const kronosOrbit = new KeplerOrbit({
  a:      4.0 * AU,
  e:      0.05,
  w:      0.2,
  M0:     1.0,
  period: 400 * DAY,
});

const hyperion = makeBody({
  name:     'Hyperion',
  type:     'rocky',
  orbit: new KeplerOrbit({
    a:      1.8e9,
    e:      0.02,
    w:      0,
    M0:     0,
    period: 15 * DAY,
    parent: kronosOrbit,
  }),
  mass:     5.68e19,
  radius:   1.35e5,
  color:    '#A5D6A7',
  security: 'low',
  economy:  'agricultural',
  produces: ['Biomass'],
  stations: [{ name: 'Hyperion Agri', type: 'agricultural' }],
});

const atlas = makeBody({
  name:     'Atlas',
  type:     'rocky',
  orbit: new KeplerOrbit({
    a:      3.2e9,
    e:      0.01,
    w:      1.57,
    M0:     3.14,
    period: 30 * DAY,
    parent: kronosOrbit,
  }),
  mass:     1.08e20,
  radius:   2.52e5,
  color:    '#78909C',
  security: 'medium',
  economy:  'refinery',
  produces: ['Helium-3'],
  stations: [{ name: 'Atlas Refinery', type: 'refinery' }],
});

const kronos = makeBody({
  name:     'Kronos',
  type:     'gas',
  orbit:    kronosOrbit,
  mass:     1.898e27,
  radius:   7.15e7,
  color:    '#FFD54F',
  security: 'low',
  economy:  'fuel',
  produces: ['Helium-3'],
  stations: [],
  moons:    [hyperion, atlas],
});

/**
 * Oceanus — Ice giant. Produces Water/Oxygen.
 * Moon: Triton (Military outpost).
 */
const oceanusOrbit = new KeplerOrbit({
  a:      6.5 * AU,
  e:      0.06,
  w:      3.0,
  M0:     0.5,
  period: 600 * DAY,
});

const triton = makeBody({
  name:     'Triton',
  type:     'rocky',
  orbit: new KeplerOrbit({
    a:      3.55e8,
    e:      0.0,
    w:      0,
    M0:     1.0,
    period: 6 * DAY,
    parent: oceanusOrbit,
  }),
  mass:     2.14e22,
  radius:   1.35e6,
  color:    '#B0BEC5',
  security: 'high',
  economy:  'military',
  produces: ['Ship Components'],
  stations: [{ name: 'Triton Command', type: 'military' }],
});

const oceanus = makeBody({
  name:     'Oceanus',
  type:     'gas',
  orbit:    oceanusOrbit,
  mass:     8.68e25,
  radius:   2.54e7,
  color:    '#29B6F6',
  security: 'medium',
  economy:  'industrial',
  produces: ['Water Ice'],
  stations: [],
  moons:    [triton],
});

/**
 * Erebus — Stormy giant. Produces Advanced Electronics.
 * Moon: Nyx (Black Market hub).
 */
const erebusOrbit = new KeplerOrbit({
  a:      9.0 * AU,
  e:      0.09,
  w:      1.1,
  M0:     4.0,
  period: 800 * DAY,
});

const nyx = makeBody({
  name:     'Nyx',
  type:     'rocky',
  orbit: new KeplerOrbit({
    a:      5.0e8,
    e:      0.05,
    w:      0.8,
    M0:     2.0,
    period: 10 * DAY,
    parent: erebusOrbit,
  }),
  mass:     1.62e21,
  radius:   1.13e6,
  color:    '#7E57C2',
  security: 'none',
  economy:  'blackmarket',
  produces: ['Illegal Stims'],
  stations: [{ name: 'The Black Spire', type: 'blackmarket' }],
});

const erebus = makeBody({
  name:     'Erebus',
  type:     'gas',
  orbit:    erebusOrbit,
  mass:     5.68e26,
  radius:   5.82e7,
  color:    '#EF5350',
  security: 'low',
  economy:  'industrial',
  produces: ['Advanced Electronics'],
  stations: [],
  moons:    [nyx],
});

/**
 * Caelus — Ringed ice giant. Source of Rare Crystals.
 * Moon: Ariel (Science outpost).
 */
const caelusOrbit = new KeplerOrbit({
  a:      12.5 * AU,
  e:      0.04,
  w:      2.2,
  M0:     1.8,
  period: 1100 * DAY,
});

const ariel = makeBody({
  name:     'Ariel',
  type:     'rocky',
  orbit: new KeplerOrbit({
    a:      1.91e8,
    e:      0.0012,
    w:      0,
    M0:     0,
    period: 4 * DAY,
    parent: caelusOrbit,
  }),
  mass:     1.35e21,
  radius:   5.79e5,
  color:    '#E0E0E0',
  security: 'medium',
  economy:  'science',
  produces: ['Raw Ore'],
  stations: [{ name: 'Ariel Research Station', type: 'science' }],
});

const caelus = makeBody({
  name:     'Caelus',
  type:     'gas',
  orbit:    caelusOrbit,
  mass:     8.68e25,
  radius:   2.56e7,
  color:    '#80DEEA',
  security: 'low',
  economy:  'mining',
  produces: ['Water Ice', 'Raw Ore'],
  stations: [],
  moons:    [ariel],
  hasRings: true,
});

/**
 * Tartarus — Dwarf planet on an eccentric orbit. Source of Illegal Stims.
 */
const tartarus = makeBody({
  name:     'Tartarus',
  type:     'dwarf',
  orbit: new KeplerOrbit({
    a:      16.0 * AU,
    e:      0.35,              // very eccentric — crosses other orbits
    w:      4.5,
    M0:     5.8,
    period: 1500 * DAY,
  }),
  mass:     1.3e22,
  radius:   1.18e6,
  color:    '#6D4C41',
  security: 'none',
  economy:  'contraband',
  produces: ['Illegal Stims'],
  stations: [{ name: 'Tartarus Cache', type: 'contraband' }],
});

/**
 * Solara-B — Brown dwarf at the system edge.
 * Home of the Void-Gate derelict — the Pioneer Fame milestone.
 */
const solaraB = makeBody({
  name:     'Solara-B',
  type:     'star',
  orbit: new KeplerOrbit({
    a:      22.0 * AU,
    e:      0.02,
    w:      0,
    M0:     0,
    period: 2500 * DAY,
  }),
  mass:     1.5e29,            // brown dwarf — much lighter than Solara
  radius:   3.5e7,
  color:    '#BF360C',
  glowColor: '#6D1F00',
  security: 'none',
  economy:  'derelict',
  produces: [],
  stations: [{ name: 'Void-Gate', type: 'derelict' }],
});

// ─── SolarSystem class ────────────────────────────────────────────────────────

/**
 * SolarSystem — Container for all bodies and query helpers.
 *
 * Provides:
 *   - allBodies       : flat array of every body (for physics: gravity sources)
 *   - primaries       : top-level bodies (planets, dwarfs, Solara-B)
 *   - getPosition(body, t) : shortcut to body.orbit.getPosition(t) or Vec2.zero()
 *   - gravBodies      : array of { getPosition(t), mass } for ShipSim
 */
export class SolarSystem {
  constructor() {
    this.solara    = solara;

    // Top-level primaries (orbit Solara)
    this.primaries = [
      ignis, foundry, aethelgard, gaeaPrime, ceresPrime,
      kronos, oceanus, erebus, caelus, tartarus, solaraB,
    ];

    // All moons
    this.moons = [
      vane,               // Aethelgard
      hyperion, atlas,    // Kronos
      triton,             // Oceanus
      nyx,                // Erebus
      ariel,              // Caelus
    ];

    // Everything (for rendering)
    this.allBodies = [solara, ...this.primaries, ...this.moons];

    // Bodies that exert gravity on ships
    // (All bodies have mass, but tiny moons contribute negligibly —
    //  we include all for correctness; ShipSim skips tiny r anyway)
    this.gravBodies = this.allBodies.map(body => ({
      name: body.name,
      mass: body.mass,
      radius: body.radius || 0,
      getPosition: body.orbit
        ? (t) => body.orbit.getPosition(t)
        : () => Vec2.zero(),  // Solara at origin
    }));
  }

  /**
   * Get the world-space Vec2 position of a body at sim time t.
   * @param {object} body
   * @param {number} t
   */
  getPosition(body, t) {
    if (!body.orbit) return Vec2.zero();
    return body.orbit.getPosition(t);
  }

  /**
   * Get all stations in the system as a flat array.
   * @returns {{ name, type, body }[]}
   */
  getAllStations() {
    const result = [];
    for (const body of this.allBodies) {
      for (const station of (body.stations || [])) {
        result.push({ ...station, body });
      }
    }
    return result;
  }

  /**
   * Find the nearest body to a world-space point (at time t).
   * @param {Vec2}   pos
   * @param {number} t
   * @returns {{ body, distance }}
   */
  nearestBody(pos, t) {
    let nearest  = null;
    let minDist  = Infinity;
    for (const body of this.allBodies) {
      const bPos = this.getPosition(body, t);
      const dx   = bPos.x - pos.x;
      const dy   = bPos.y - pos.y;
      const d    = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) { minDist = d; nearest = body; }
    }
    return { body: nearest, distance: minDist };
  }
}

// Singleton export — one shared system instance
export const solarSystem = new SolarSystem();
