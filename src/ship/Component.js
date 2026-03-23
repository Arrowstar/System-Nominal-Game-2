/**
 * Component.js — Ship modular components.
 * 
 * Defines equipable items for ship slots (Small, Medium, Large).
 * Categories include: Engine, Reactor, Tank, Plating.
 */

export const COMPONENTS = {
  // --- ENGINES ---
  ENG_S_MONO: {
    id: 'ENG_S_MONO',
    name: 'Mono-Prop RCS',
    type: 'Engine',
    size: 'S',
    cost: 5000,
    mass: 500,        // 0.5t
    thrust: 50000,    // 50 kN
    isp: 250,         // low efficiency
    powerDraw: 1      // 1 MW
  },
  ENG_S_KERO: {
    id: 'ENG_S_KERO',
    name: 'Kerosene Rocket',
    type: 'Engine',
    size: 'S',
    cost: 15000,
    mass: 1200,       // 1.2t
    thrust: 150000,   // 150 kN
    isp: 350,         // medium efficiency
    powerDraw: 2
  },
  ENG_M_NUC: {
    id: 'ENG_M_NUC',
    name: 'NERVA Nuclear',
    type: 'Engine',
    size: 'M',
    cost: 150000,
    mass: 8000,       // 8t
    thrust: 400000,   // 400 kN
    isp: 900,         // high efficiency
    powerDraw: 0      // uses its own reactor
  },
  ENG_L_PLASMA: {
    id: 'ENG_L_PLASMA',
    name: 'Plasma Torch',
    type: 'Engine',
    size: 'L',
    cost: 500000,
    mass: 25000,      // 25t
    thrust: 2000000,  // 2000 kN
    isp: 5000,        // ultra efficiency
    powerDraw: 50     // requires massive external power
  },
  DEBUG_TORCH: {
    id: 'DEBUG_TORCH',
    name: '[DEBUG] God Drive',
    type: 'Engine',
    size: 'S',
    cost: 0,
    mass: 1,          // negligible
    thrust: 200000000, // 200,000 kN (100× Plasma Torch)
    isp: 50000000,     // 10000× Plasma Torch — essentially infinite dV
    powerDraw: 0
  },

  // --- TANKS ---
  TANK_S_STD: {
    id: 'TANK_S_STD',
    name: 'Small Fuel Cell',
    type: 'Tank',
    size: 'S',
    cost: 2000,
    mass: 200,        // empty mass 0.2t
    fuelCap: 10000    // 10t fuel
  },
  TANK_M_STD: {
    id: 'TANK_M_STD',
    name: 'Medium Drop Tank',
    type: 'Tank',
    size: 'M',
    cost: 10000,
    mass: 800,        // empty mass 0.8t
    fuelCap: 50000    // 50t fuel
  },
  TANK_L_STD: {
    id: 'TANK_L_STD',
    name: 'Large Core Stage',
    type: 'Tank',
    size: 'L',
    cost: 45000,
    mass: 4000,       // empty mass 4.0t
    fuelCap: 250000   // 250t fuel
  },

  // --- REACTORS ---
  RX_S_FUSION: {
    id: 'RX_S_FUSION',
    name: 'Micro-Fusion Core',
    type: 'Reactor',
    size: 'S',
    cost: 50000,
    mass: 2000,       // 2t
    powerGen: 10      // 10 MW
  },
  RX_M_FUSION: {
    id: 'RX_M_FUSION',
    name: 'Standard Fusion Plant',
    type: 'Reactor',
    size: 'M',
    cost: 180000,
    mass: 6000,       // 6t
    powerGen: 35      // 35 MW
  },
  RX_L_FUSION: {
    id: 'RX_L_FUSION',
    name: 'Stellarator Ring',
    type: 'Reactor',
    size: 'L',
    cost: 400000,
    mass: 18000,      // 18t
    powerGen: 120     // 120 MW
  },

  // --- WEAPONS (Small) ---
  WPN_S_AUTOCANNON: {
    id: 'WPN_S_AUTOCANNON',
    name: 'Light Autocannon',
    type: 'Weapon',
    size: 'S',
    cost: 3000,
    mass: 300,
    category: 'kinetic',
    damage: 8,
    speed: 10000,
    coolingTime: 0.08,
    range: 300000,       // 300 km
    heat: 2,
    powerDraw: 0,
    proxRadius: 0,
    gimbalAngle: 15,     // degrees
    burstCount: 1,
    burstDelay: 0,
    guided: false,
    turret: false
  },
  WPN_S_PDC: {
    id: 'WPN_S_PDC',
    name: 'Point Defense Turret',
    type: 'Weapon',
    size: 'S',
    cost: 8000,
    mass: 500,
    category: 'kinetic',
    damage: 5,
    speed: 12000,
    coolingTime: 0.05,
    range: 100000,       // 100 km
    heat: 1,
    powerDraw: 1,
    proxRadius: 0,
    gimbalAngle: 0,
    burstCount: 3,
    burstDelay: 0.02,
    guided: false,
    turret: true
  },
  WPN_S_MINING_LASER: {
    id: 'WPN_S_MINING_LASER',
    name: 'Mining Laser',
    type: 'Weapon',
    size: 'S',
    cost: 5000,
    mass: 400,
    category: 'energy',
    damage: 4,
    speed: Infinity,     // hitscan
    coolingTime: 0.3,
    range: 15000,        // 15 km
    heat: 6,
    powerDraw: 8,
    proxRadius: 0,
    gimbalAngle: 5,
    burstCount: 1,
    burstDelay: 0,
    guided: false,
    turret: false
  },
  WPN_S_SCATTER: {
    id: 'WPN_S_SCATTER',
    name: 'Scattershot Pod',
    type: 'Weapon',
    size: 'S',
    cost: 6000,
    mass: 350,
    category: 'kinetic',
    damage: 3,
    speed: 8000,
    coolingTime: 0.6,
    range: 80000,        // 80 km
    heat: 3,
    powerDraw: 0,
    proxRadius: 200,
    gimbalAngle: 10,
    burstCount: 8,
    burstDelay: 0.01,
    guided: false,
    turret: false
  },
  WPN_S_PULSE_LASER: {
    id: 'WPN_S_PULSE_LASER',
    name: 'Pulse Laser',
    type: 'Weapon',
    size: 'S',
    cost: 12000,
    mass: 600,
    category: 'energy',
    damage: 15,
    speed: Infinity,     // hitscan
    coolingTime: 0.5,
    range: 40000,        // 40 km
    heat: 8,
    powerDraw: 12,
    proxRadius: 0,
    gimbalAngle: 10,
    burstCount: 1,
    burstDelay: 0,
    guided: false,
    turret: false
  },
  WPN_S_MICRO_MISSILE: {
    id: 'WPN_S_MICRO_MISSILE',
    name: 'Micro-Missile Rack',
    type: 'Weapon',
    size: 'S',
    cost: 10000,
    mass: 250,
    category: 'missile',
    damage: 20,
    speed: 5000,
    coolingTime: 1.5,
    range: 500000,       // 500 km
    heat: 3,
    powerDraw: 0,
    proxRadius: 150,
    gimbalAngle: 0,
    burstCount: 1,
    burstDelay: 0,
    guided: true,
    turret: false
  },
  WPN_S_RAILGUN: {
    id: 'WPN_S_RAILGUN',
    name: 'Light Railgun',
    type: 'Weapon',
    size: 'S',
    cost: 20000,
    mass: 800,
    category: 'kinetic',
    damage: 35,
    speed: 50000,
    coolingTime: 2.0,
    range: 1500000,      // 1500 km
    heat: 12,
    powerDraw: 15,
    proxRadius: 0,
    gimbalAngle: 0,
    burstCount: 1,
    burstDelay: 0,
    guided: false,
    turret: false
  },

  // --- WEAPONS (Medium) ---
  WPN_M_FLAK: {
    id: 'WPN_M_FLAK',
    name: 'Flak Battery',
    type: 'Weapon',
    size: 'M',
    cost: 25000,
    mass: 2000,
    category: 'kinetic',
    damage: 20,
    speed: 8000,
    coolingTime: 0.4,
    range: 250000,       // 250 km
    heat: 4,
    powerDraw: 0,
    proxRadius: 400,
    gimbalAngle: 15,
    burstCount: 1,
    burstDelay: 0,
    guided: false,
    turret: false
  },
  WPN_M_BEAM_LASER: {
    id: 'WPN_M_BEAM_LASER',
    name: 'Beam Laser',
    type: 'Weapon',
    size: 'M',
    cost: 60000,
    mass: 3000,
    category: 'energy',
    damage: 30,
    speed: Infinity,     // hitscan
    coolingTime: 0.8,
    range: 60000,        // 60 km
    heat: 15,
    powerDraw: 25,
    proxRadius: 0,
    gimbalAngle: 20,
    burstCount: 1,
    burstDelay: 0,
    guided: false,
    turret: false
  },
  WPN_M_TORPEDO: {
    id: 'WPN_M_TORPEDO',
    name: 'Torpedo Launcher',
    type: 'Weapon',
    size: 'M',
    cost: 75000,
    mass: 4000,
    category: 'missile',
    damage: 80,
    speed: 3000,
    coolingTime: 3.0,
    range: 2000000,      // 2000 km
    heat: 5,
    powerDraw: 0,
    proxRadius: 0,
    gimbalAngle: 0,
    burstCount: 1,
    burstDelay: 0,
    guided: true,
    turret: false
  },
  WPN_M_GATLING: {
    id: 'WPN_M_GATLING',
    name: 'Vulcan Gatling',
    type: 'Weapon',
    size: 'M',
    cost: 45000,
    mass: 3500,
    category: 'kinetic',
    damage: 6,
    speed: 10000,
    coolingTime: 0.03,
    range: 300000,       // 300 km
    heat: 1,
    powerDraw: 0,
    proxRadius: 0,
    gimbalAngle: 5,
    burstCount: 1,
    burstDelay: 0,
    guided: false,
    turret: true
  },
  WPN_M_PLASMA_CANNON: {
    id: 'WPN_M_PLASMA_CANNON',
    name: 'Plasma Cannon',
    type: 'Weapon',
    size: 'M',
    cost: 90000,
    mass: 5000,
    category: 'energy',
    damage: 50,
    speed: 6000,
    coolingTime: 1.5,
    range: 200000,       // 200 km
    heat: 20,
    powerDraw: 30,
    proxRadius: 300,
    gimbalAngle: 10,
    burstCount: 1,
    burstDelay: 0,
    guided: false,
    turret: false
  },

  // --- WEAPONS (Large) ---
  WPN_L_HEAVY_RAILGUN: {
    id: 'WPN_L_HEAVY_RAILGUN',
    name: 'Heavy Railgun',
    type: 'Weapon',
    size: 'L',
    cost: 200000,
    mass: 12000,
    category: 'kinetic',
    damage: 120,
    speed: 100000,
    coolingTime: 4.0,
    range: 5000000,      // 5000 km
    heat: 25,
    powerDraw: 50,
    proxRadius: 0,
    gimbalAngle: 0,
    burstCount: 1,
    burstDelay: 0,
    guided: false,
    turret: false
  },
  WPN_L_LANCE: {
    id: 'WPN_L_LANCE',
    name: 'Particle Lance',
    type: 'Weapon',
    size: 'L',
    cost: 250000,
    mass: 15000,
    category: 'energy',
    damage: 90,
    speed: Infinity,     // hitscan
    coolingTime: 2.0,
    range: 100000,       // 100 km
    heat: 30,
    powerDraw: 60,
    proxRadius: 0,
    gimbalAngle: 5,
    burstCount: 1,
    burstDelay: 0,
    guided: false,
    turret: false
  },
  WPN_L_CRUISE_MISSILE: {
    id: 'WPN_L_CRUISE_MISSILE',
    name: 'Cruise Missile Bay',
    type: 'Weapon',
    size: 'L',
    cost: 300000,
    mass: 10000,
    category: 'missile',
    damage: 200,
    speed: 2000,
    coolingTime: 6.0,
    range: 10000000,     // 10000 km
    heat: 8,
    powerDraw: 0,
    proxRadius: 500,
    gimbalAngle: 0,
    burstCount: 1,
    burstDelay: 0,
    guided: true,
    turret: false
  }
};
