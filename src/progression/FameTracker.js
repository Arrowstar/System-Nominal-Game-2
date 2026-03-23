/**
 * FameTracker.js — Milestone definitions and fame scoring.
 *
 * Tracks the player's career stats and evaluates milestone conditions.
 * Fame is the primary win condition: reach 20 to trigger VICTORY.
 * If fame drops below 0, it's a permanent game over (no Mayday allowed).
 *
 * Usage:
 *   const fame = new FameTracker();
 *   fame.onFameChange((total, delta, milestone) => { ... });
 *   fame.recordKill(pursuitAssistActive);
 *   fame.recordTradeProfit(credits);
 *   fame.recordDock('Void-Gate', 'Solara-B');
 */

// ─── Milestone Definitions ────────────────────────────────────────────────────

export const MILESTONES = [
  // ── GDD Core Milestones ──────────────────────────────────────────────────
  {
    id:          'SPEED_DEMON',
    category:    'Pilot',
    title:       'Speed Demon',
    description: 'Reach a velocity of 250,000 m/s.',
    fame:        3,
    repeatable:  false,
  },
  {
    id:          'ACE',
    category:    'Ace',
    title:       'Top Gun',
    description: 'Destroy 3 ships in a single Pursuit Assist window.',
    fame:        2,
    repeatable:  false,
  },
  {
    id:          'TYCOON',
    category:    'Tycoon',
    title:       'Merchant Prince',
    description: 'Profit 50,000 credits from trading.',
    fame:        2,
    repeatable:  false,
  },
  {
    id:          'ICARUS',
    category:    'Icarus',
    title:       'Against the Sun',
    description: "Perform a burn within Solara's Danger Zone.",
    fame:        2,
    repeatable:  false,
  },
  {
    id:          'PIONEER',
    category:    'Pioneer',
    title:       'Beyond the Veil',
    description: 'Dock with the Void-Gate at the system edge.',
    fame:        4,
    repeatable:  false,
  },

  // ── Extended Milestones (to allow reach of 20) ───────────────────────────
  {
    id:          'TRADE_10K',
    category:    'Trader',
    title:       'First Profit',
    description: 'Earn 10,000 credits from trade.',
    fame:        1,
    repeatable:  false,
  },
  {
    id:          'TRADE_100K',
    category:    'Magnate',
    title:       'The Hundred Thousand',
    description: 'Earn 100,000 credits from trade.',
    fame:        2,
    repeatable:  false,
  },
  {
    id:          'KILLS_5',
    category:    'Enforcer',
    title:       'Hardened',
    description: 'Destroy 5 enemy ships total.',
    fame:        1,
    repeatable:  false,
  },
  {
    id:          'KILLS_15',
    category:    'Warlord',
    title:       'Angel of Death',
    description: 'Destroy 15 enemy ships total.',
    fame:        2,
    repeatable:  false,
  },
  {
    id:          'EXPLORER',
    category:    'Explorer',
    title:       'Cartographer',
    description: 'Dock at 10 different stations.',
    fame:        2,
    repeatable:  false,
  },
  {
    id:          'SMUGGLER',
    category:    'Smuggler',
    title:       'The Gray Market',
    description: 'Sell Illegal Stims at 3 different stations.',
    fame:        1,
    repeatable:  false,
  },
];

// Total possible fame from all milestones: 22 (player needs 20)

// ─── FameTracker Class ────────────────────────────────────────────────────────

export class FameTracker {
  constructor() {
    /** Current total fame points. */
    this.fame = 0;

    /** Set of completed milestone IDs. */
    this.completed = new Set();

    /** Running career statistics for milestone evaluation. */
    this.stats = {
      totalTradeProfit:          0,     // Credits earned from trading
      totalKills:                0,     // Total NPC ships destroyed
      killsThisPursuitWindow:    0,     // Resets when Pursuit Assist is toggled off
      uniqueStationsDocked:      new Set(), // Set of station name strings docked at
      stimSaleLocations:         new Set(), // Stations where stims were sold
    };

    /** Callbacks invoked when fame changes: (newTotal, delta, milestone|null) */
    this._listeners = [];

    /** Queue of recently earned milestone notifications waiting to display */
    this.pendingNotifications = [];
  }

  // ─── Subscription ──────────────────────────────────────────────────────────

  /**
   * Subscribe to fame change events.
   * Callback receives (newTotal, delta, milestone) where milestone may be null
   * on penalty deductions.
   * @returns {function} Unsubscribe function
   */
  onFameChange(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  /** Reset all state for a new game. */
  reset() {
    this.fame = 0;
    this.completed = new Set();
    this.pendingNotifications = [];
    this.stats = {
      totalTradeProfit:          0,
      totalKills:                0,
      killsThisPursuitWindow:    0,
      uniqueStationsDocked:      new Set(),
      stimSaleLocations:         new Set(),
    };
  }

  _emit(delta, milestone = null) {
    this.fame += delta;
    for (const fn of this._listeners) {
      fn(this.fame, delta, milestone);
    }
    if (milestone && delta > 0) {
      this.pendingNotifications.push({ milestone, delta });
    }
  }

  // ─── Penalty ───────────────────────────────────────────────────────────────

  /**
   * Apply a fame penalty (e.g. Mayday rescue −2).
   * @param {number} amount  Positive number to subtract.
   */
  applyPenalty(amount) {
    this._emit(-amount, null);
  }

  // ─── Event Recorders ───────────────────────────────────────────────────────

  /**
   * Record an NPC ship kill.
   * @param {boolean} pursuitAssistActive  Whether Pursuit Assist was active this kill.
   */
  recordKill(pursuitAssistActive = false) {
    this.stats.totalKills += 1;
    if (pursuitAssistActive) {
      this.stats.killsThisPursuitWindow += 1;
    }
    this._checkMilestones();
  }

  /**
   * Call this when Pursuit Assist window ends (toggled off).
   * Resets the per-window kill counter.
   */
  recordPursuitWindowEnd() {
    this.stats.killsThisPursuitWindow = 0;
  }

  /**
   * Record profit from a trade transaction.
   * @param {number} credits  Net profit (buy price vs sell price).
   */
  recordTradeProfit(credits) {
    if (credits <= 0) return;
    this.stats.totalTradeProfit += credits;
    this._checkMilestones();
  }

  /**
   * Record a docking event. Tracks unique stations for EXPLORER milestone.
   * Also checks for PIONEER milestone (Void-Gate).
   * @param {string} stationName  e.g. 'Void-Gate'
   * @param {string} bodyName     e.g. 'Solara-B'
   */
  recordDock(stationName, bodyName) {
    this.stats.uniqueStationsDocked.add(stationName);
    this._checkMilestones();
  }

  /**
   * Record a stim sale. Tracks unique stations where stims were sold.
   * @param {string} stationName
   */
  recordStimSale(stationName) {
    this.stats.stimSaleLocations.add(stationName);
    this._checkMilestones();
  }

  /**
   * Check whether the player is going fast enough for the Speed Demon milestone.
   * Call once per tick from main.js.
   * @param {number} speed  Current speed in m/s.
   */
  checkSpeedDemon(speed) {
    if (this.completed.has('SPEED_DEMON')) return;
    if (speed >= 250000) {
      this._awardMilestone('SPEED_DEMON');
    }
  }

  /**
   * Check whether the player is within Solara's danger zone.
   * Call once per tick from main.js.
   * @param {Vec2}   shipPos       Player position in world space.
   * @param {object} solarSystem   The SolarSystem instance (has .solara.dangerZone).
   */
  checkIcarus(shipPos, solarSystem) {
    if (this.completed.has('ICARUS')) return;
    const dangerRadius = solarSystem.solara.dangerZone ?? 0;
    if (dangerRadius > 0 && shipPos.len() < dangerRadius) {
      this._awardMilestone('ICARUS');
    }
  }

  // ─── Internal Milestone Evaluation ────────────────────────────────────────

  /** Evaluate all incomplete milestones against current stats. */
  _checkMilestones() {
    const s = this.stats;

    if (!this.completed.has('TRADE_10K') && s.totalTradeProfit >= 10000) {
      this._awardMilestone('TRADE_10K');
    }
    if (!this.completed.has('TYCOON') && s.totalTradeProfit >= 50000) {
      this._awardMilestone('TYCOON');
    }
    if (!this.completed.has('TRADE_100K') && s.totalTradeProfit >= 100000) {
      this._awardMilestone('TRADE_100K');
    }

    if (!this.completed.has('ACE') && s.killsThisPursuitWindow >= 3) {
      this._awardMilestone('ACE');
    }
    if (!this.completed.has('KILLS_5') && s.totalKills >= 5) {
      this._awardMilestone('KILLS_5');
    }
    if (!this.completed.has('KILLS_15') && s.totalKills >= 15) {
      this._awardMilestone('KILLS_15');
    }


    if (!this.completed.has('PIONEER') &&
        s.uniqueStationsDocked.has('Void-Gate')) {
      this._awardMilestone('PIONEER');
    }
    if (!this.completed.has('EXPLORER') &&
        s.uniqueStationsDocked.size >= 10) {
      this._awardMilestone('EXPLORER');
    }

    if (!this.completed.has('SMUGGLER') &&
        s.stimSaleLocations.size >= 3) {
      this._awardMilestone('SMUGGLER');
    }
  }

  _awardMilestone(id) {
    if (this.completed.has(id)) return;
    const milestone = MILESTONES.find(m => m.id === id);
    if (!milestone) return;
    this.completed.add(id);
    this._emit(milestone.fame, milestone);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /** True if the player has won. */
  get hasWon() { return this.fame >= 20; }

  /** True if fame is negative (permanent game over condition). */
  get isNegative() { return this.fame < 0; }

  /** Get milestone def by id. */
  getMilestone(id) { return MILESTONES.find(m => m.id === id); }

  /** Pop the oldest pending notification, or null. */
  popNotification() { return this.pendingNotifications.shift() ?? null; }
}
