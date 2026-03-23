/**
 * Hull.js — Ship chassis definitions.
 * 
 * Defines the base mass, structural integrity, and component slot layouts
 * for the different ship classes available in the game.
 */

export const HULLS = {
  NO_SHIP: {
    id: 'NO_SHIP',
    name: 'NO SHIP',
    cost: 0,
    baseMass: 100,
    integrity: 1,
    cargoCap: 0,
    slots: { S: 0, M: 0, L: 0 }
  },
  // --- STARTER HULLS (Affordable at 75k CR) ---
  KESTREL: {
    id: 'KESTREL',
    name: 'Kestrel',
    cost: 15000,
    baseMass: 15000,     // 15t
    integrity: 40,
    cargoCap: 10,
    slots: { S: 2, M: 0, L: 0 }
  },
  PEREGRINE: {
    id: 'PEREGRINE',
    name: 'Peregrine',
    cost: 35000,
    baseMass: 30000,     // 30t
    integrity: 60,
    cargoCap: 25,
    slots: { S: 2, M: 0, L: 0 }
  },
  BADGER: {
    id: 'BADGER',
    name: 'Badger',
    cost: 40000,
    baseMass: 50000,     // 50t
    integrity: 80,
    cargoCap: 60,
    slots: { S: 2, M: 0, L: 0 }
  },
  DART: {
    id: 'DART',
    name: 'Dart',
    cost: 50000,
    baseMass: 40000,     // 40t
    integrity: 80,
    cargoCap: 15,
    slots: { S: 2, M: 0, L: 0 }
  },
  WASP: {
    id: 'WASP',
    name: 'Wasp',
    cost: 65000,
    baseMass: 25000,     // 25t
    integrity: 70,
    cargoCap: 8,
    slots: { S: 3, M: 0, L: 0 }
  },

  // --- MID-RANGE HULLS ---
  PONY: {
    id: 'PONY',
    name: 'Pony',
    cost: 100000,
    baseMass: 150000,    // 150t
    integrity: 120,
    cargoCap: 150,
    slots: { S: 1, M: 1, L: 0 }
  },
  WAYFARER: {
    id: 'WAYFARER',
    name: 'Wayfarer',
    cost: 120000,
    baseMass: 100000,    // 100t
    integrity: 100,
    cargoCap: 100,
    slots: { S: 3, M: 1, L: 0 }
  },
  SCYTHE: {
    id: 'SCYTHE',
    name: 'Scythe',
    cost: 180000,
    baseMass: 60000,     // 60t
    integrity: 120,
    cargoCap: 20,
    slots: { S: 4, M: 0, L: 0 }
  },
  OX: {
    id: 'OX',
    name: 'Ox',
    cost: 200000,
    baseMass: 250000,    // 250t
    integrity: 150,
    cargoCap: 400,
    slots: { S: 1, M: 2, L: 0 }
  },
  CORVUS: {
    id: 'CORVUS',
    name: 'Corvus',
    cost: 350000,
    baseMass: 150000,    // 150t
    integrity: 250,
    cargoCap: 50,
    slots: { S: 2, M: 2, L: 0 }
  },

  // --- HEAVY HULLS ---
  CAMEL: {
    id: 'CAMEL',
    name: 'Camel',
    cost: 400000,
    baseMass: 500000,    // 500t
    integrity: 300,
    cargoCap: 800,
    slots: { S: 0, M: 2, L: 1 }
  },
  VALKYRIE: {
    id: 'VALKYRIE',
    name: 'Valkyrie',
    cost: 550000,
    baseMass: 120000,    // 120t
    integrity: 200,
    cargoCap: 30,
    slots: { S: 2, M: 1, L: 1 }
  },
  MINOTAUR: {
    id: 'MINOTAUR',
    name: 'Minotaur',
    cost: 750000,
    baseMass: 400000,    // 400t
    integrity: 450,
    cargoCap: 100,
    slots: { S: 2, M: 3, L: 1 }
  },
  MAMMOTH: {
    id: 'MAMMOTH',
    name: 'Mammoth',
    cost: 900000,
    baseMass: 1200000,   // 1200t
    integrity: 600,
    cargoCap: 2500,
    slots: { S: 1, M: 1, L: 2 }
  },

  // --- CAPITAL HULLS ---
  BASTION: {
    id: 'BASTION',
    name: 'Bastion',
    cost: 1500000,
    baseMass: 1000000,   // 1000t
    integrity: 900,
    cargoCap: 300,
    slots: { S: 4, M: 4, L: 1 }
  },
  BEHEMOTH: {
    id: 'BEHEMOTH',
    name: 'Behemoth',
    cost: 2000000,
    baseMass: 2500000,   // 2500t
    integrity: 1000,
    cargoCap: 5000,
    slots: { S: 0, M: 0, L: 4 }
  },
  LEVIATHAN: {
    id: 'LEVIATHAN',
    name: 'Leviathan',
    cost: 2500000,
    baseMass: 1500000,   // 1500t
    integrity: 800,
    cargoCap: 500,
    slots: { S: 2, M: 3, L: 4 }
  }
};
