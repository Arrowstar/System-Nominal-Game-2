/**
 * fame.test.js — Unit tests for FameTracker and WinLoss.
 *
 * Run with: npx vitest run src/progression/__tests__/fame.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FameTracker, MILESTONES } from '../FameTracker.js';
import { WinLoss } from '../WinLoss.js';

// ─── FameTracker Tests ───────────────────────────────────────────────────────

describe('FameTracker', () => {
  let ft;
  beforeEach(() => { ft = new FameTracker(); });

  it('starts at 0 fame with no milestones completed', () => {
    expect(ft.fame).toBe(0);
    expect(ft.completed.size).toBe(0);
  });

  it('has 11 milestone definitions covering 22 total possible fame', () => {
    expect(MILESTONES.length).toBe(11);
    const totalFame = MILESTONES.reduce((sum, m) => sum + m.fame, 0);
    expect(totalFame).toBe(22);
  });

  // ── Trade milestones ────────────────────────────────────────────────────

  it('recordTradeProfit below 10k does not trigger any milestone', () => {
    ft.recordTradeProfit(9999);
    expect(ft.fame).toBe(0);
    expect(ft.completed.has('TRADE_10K')).toBe(false);
  });

  it('recordTradeProfit >= 10k triggers TRADE_10K (+1 fame)', () => {
    ft.recordTradeProfit(10000);
    expect(ft.completed.has('TRADE_10K')).toBe(true);
    expect(ft.fame).toBe(1);
  });

  it('recordTradeProfit >= 50k triggers TYCOON (+2 fame) and TRADE_10K (+1)', () => {
    ft.recordTradeProfit(50000);
    expect(ft.completed.has('TYCOON')).toBe(true);
    expect(ft.completed.has('TRADE_10K')).toBe(true);
    // 1 + 2 = 3
    expect(ft.fame).toBe(3);
  });

  it('TRADE_10K milestone is only awarded once even if called multiple times', () => {
    ft.recordTradeProfit(5000);
    ft.recordTradeProfit(5000); // hits 10k
    ft.recordTradeProfit(5000); // still above 10k
    expect(ft.completed.has('TRADE_10K')).toBe(true);
    expect(ft.fame).toBe(1);
  });

  // ── Speed Demon ─────────────────────────────────────────────────────────

  it('checkSpeedDemon below 250,000 m/s does not trigger milestone', () => {
    ft.checkSpeedDemon(249999);
    expect(ft.completed.has('SPEED_DEMON')).toBe(false);
    expect(ft.fame).toBe(0);
  });

  it('checkSpeedDemon >= 250,000 m/s triggers SPEED_DEMON (+3 fame)', () => {
    ft.checkSpeedDemon(250000);
    expect(ft.completed.has('SPEED_DEMON')).toBe(true);
    expect(ft.fame).toBe(3);
  });

  it('checkSpeedDemon only fires milestone once', () => {
    ft.checkSpeedDemon(260000);
    ft.checkSpeedDemon(300000);
    expect(ft.completed.has('SPEED_DEMON')).toBe(true);
    expect(ft.fame).toBe(3);
  });

  it('4 kills does not trigger KILLS_5', () => {
    for (let i = 0; i < 4; i++) ft.recordKill(false);
    expect(ft.completed.has('KILLS_5')).toBe(false);
    expect(ft.fame).toBe(0);
  });

  it('5 total kills triggers KILLS_5 (+1 fame)', () => {
    for (let i = 0; i < 5; i++) ft.recordKill(false);
    expect(ft.completed.has('KILLS_5')).toBe(true);
    expect(ft.fame).toBe(1);
  });

  it('15 total kills triggers both KILLS_5 and KILLS_15', () => {
    for (let i = 0; i < 15; i++) ft.recordKill(false);
    expect(ft.completed.has('KILLS_5')).toBe(true);
    expect(ft.completed.has('KILLS_15')).toBe(true);
    expect(ft.fame).toBe(3); // 1 + 2
  });

  // ── Ace (Pursuit Assist window) ─────────────────────────────────────────

  it('3 kills in one Pursuit Assist window triggers ACE (+2 fame)', () => {
    ft.recordKill(true);
    ft.recordKill(true);
    ft.recordKill(true);
    expect(ft.completed.has('ACE')).toBe(true);
    expect(ft.fame).toBe(2);
  });

  it('2 kills then window reset then 1 kill does NOT trigger ACE', () => {
    ft.recordKill(true);
    ft.recordKill(true);
    ft.recordPursuitWindowEnd();
    ft.recordKill(true); // new window, count resets
    expect(ft.completed.has('ACE')).toBe(false);
  });

  it('kills without Pursuit Assist do not count toward ACE', () => {
    ft.recordKill(false);
    ft.recordKill(false);
    ft.recordKill(false);
    expect(ft.completed.has('ACE')).toBe(false);
  });

  // ── Pioneer / Explorer ──────────────────────────────────────────────────

  it('docking at Void-Gate triggers PIONEER (+4 fame)', () => {
    ft.recordDock('Void-Gate', 'Solara-B');
    expect(ft.completed.has('PIONEER')).toBe(true);
    expect(ft.fame).toBe(4);
  });

  it('docking at 10 unique stations triggers EXPLORER (+2 fame)', () => {
    for (let i = 0; i < 10; i++) {
      ft.recordDock(`Station-${i}`, `Body-${i}`);
    }
    expect(ft.completed.has('EXPLORER')).toBe(true);
    expect(ft.fame).toBe(2);
  });

  it('docking at same station multiple times only counts once toward EXPLORER', () => {
    for (let i = 0; i < 20; i++) {
      ft.recordDock('Same Station', 'Same Body'); // same name every time
    }
    expect(ft.completed.has('EXPLORER')).toBe(false);
    expect(ft.stats.uniqueStationsDocked.size).toBe(1);
  });

  // ── Icarus ──────────────────────────────────────────────────────────────

  it('checkIcarus triggers ICARUS when within danger zone', () => {
    const fakeSystem = { solara: { dangerZone: 1e11 } };
    // Position at distance 0.5e11 — inside the zone
    const insidePos = { len: () => 0.5e11 };
    ft.checkIcarus(insidePos, fakeSystem);
    expect(ft.completed.has('ICARUS')).toBe(true);
    expect(ft.fame).toBe(2);
  });

  it('checkIcarus does NOT trigger ICARUS outside danger zone', () => {
    const fakeSystem = { solara: { dangerZone: 1e11 } };
    const outsidePos = { len: () => 2e11 };
    ft.checkIcarus(outsidePos, fakeSystem);
    expect(ft.completed.has('ICARUS')).toBe(false);
  });

  it('checkIcarus only fires ICARUS milestone once', () => {
    const fakeSystem = { solara: { dangerZone: 1e11 } };
    const insidePos = { len: () => 0.5e11 };
    ft.checkIcarus(insidePos, fakeSystem);
    ft.checkIcarus(insidePos, fakeSystem);
    ft.checkIcarus(insidePos, fakeSystem);
    expect(ft.fame).toBe(2); // Only +2 once
  });

  // ── Fame penalty & negative ─────────────────────────────────────────────

  it('applyPenalty reduces fame', () => {
    ft.recordDock('Void-Gate', 'Solara-B'); // +4 fame
    ft.applyPenalty(2);
    expect(ft.fame).toBe(2);
  });

  it('isNegative is false when fame >= 0', () => {
    expect(ft.isNegative).toBe(false);  // starts at 0
    ft.fame = 5;
    expect(ft.isNegative).toBe(false);  // positive
  });

  it('isNegative is true when fame < 0', () => {
    ft.applyPenalty(1);  // fame drops to -1
    expect(ft.isNegative).toBe(true);
  });

  it('hasWon is false below 20 fame', () => {
    ft.recordDock('Void-Gate', 'Solara-B'); // +4
    expect(ft.hasWon).toBe(false);
  });

  it('hasWon is true at exactly 20 fame', () => {
    // Need to get to 20: PIONEER(4) + TYCOON(2) + TRADE_10K(1) + TRADE_100K(2) + ACE(2) + KILLS_5(1) + KILLS_15(2) + EXPLORER(2) + NAVIGATOR? 
    // Easier: manually set fame
    ft.fame = 20;
    expect(ft.hasWon).toBe(true);
  });

  // ── Notifications ───────────────────────────────────────────────────────

  it('unlocking a milestone enqueues a pending notification', () => {
    ft.recordDock('Void-Gate', 'Solara-B');
    expect(ft.pendingNotifications.length).toBe(1);
    const notif = ft.popNotification();
    expect(notif.milestone.id).toBe('PIONEER');
    expect(notif.delta).toBe(4);
  });

  it('popNotification returns null when queue is empty', () => {
    expect(ft.popNotification()).toBeNull();
  });

  // ── onFameChange listener ────────────────────────────────────────────────

  it('onFameChange callback fires with correct values', () => {
    const events = [];
    ft.onFameChange((total, delta, m) => events.push({ total, delta, id: m?.id }));
    ft.recordDock('Void-Gate', 'Solara-B'); // +4

    expect(events.length).toBe(1);
    expect(events[0].total).toBe(4);
    expect(events[0].delta).toBe(4);
    expect(events[0].id).toBe('PIONEER');
  });

  it('onFameChange unsubscribe works', () => {
    const events = [];
    const unsub = ft.onFameChange((total) => events.push(total));
    ft.recordDock('Void-Gate', 'Solara-B');
    unsub();
    ft.recordTradeProfit(100000); // more fame events
    expect(events.length).toBe(1); // Only the first event
  });
});

// ─── WinLoss Tests ────────────────────────────────────────────────────────────

describe('WinLoss', () => {
  let wl, ft;

  /** Minimal mock ship. */
  function mockShip(opts = {}) {
    return {
      destroyed: opts.destroyed ?? false,
      disabled:  opts.disabled  ?? false,
      fuel:      opts.fuel      ?? 1000,
      throttle:  opts.throttle  ?? 0,
      integrity: opts.integrity ?? 100,
      maxIntegrity: 100,
      maxFuel: 1000,
      // x/y needed by WinLoss._hasReachableStation distance math
      position: { x: 0, y: 0, len: () => 1e12 },
    };
  }

  /** Minimal SolarSystem mock — one station nearby. */
  function mockSystem(stationDist = 1e13) {
    return {
      allBodies: [
        {
          stations: [{ name: 'Test Station' }],
          orbit: null,
        }
      ],
      solara: { dangerZone: 0.15 * 1.496e11 },
      // getPosition returns a plain {x,y} — WinLoss now handles plain objects
      getPosition: () => ({ x: stationDist, y: 0 }),
    };
  }

  beforeEach(() => {
    wl = new WinLoss();
    ft = new FameTracker();
  });

  it('does not fire on a healthy ship with low fame', () => {
    const events = [];
    wl.onGameEnd((cause) => events.push(cause));
    const ship = mockShip();
    wl.update(1, 0, ship, ft, mockSystem());
    expect(events.length).toBe(0);
  });

  it('fires "victory" when fame >= 20', () => {
    const events = [];
    wl.onGameEnd((cause) => events.push(cause));
    ft.fame = 20;
    const ship = mockShip();
    wl.update(1, 0, ship, ft, mockSystem());
    expect(events).toContain('victory');
  });

  it('fires "hull_breach" when ship.destroyed is true', () => {
    const events = [];
    wl.onGameEnd((cause) => events.push(cause));
    const ship = mockShip({ destroyed: true });
    wl.update(1, 0, ship, ft, mockSystem());
    expect(events).toContain('hull_breach');
  });

  it('does NOT fire "dead_orbit" when ship has fuel', () => {
    const events = [];
    wl.onGameEnd((cause) => events.push(cause));
    const ship = mockShip({ fuel: 1000 });
    // Advance past dead orbit check interval (60s)
    wl.update(65, 65, ship, ft, mockSystem(1e14));
    expect(events.length).toBe(0);
  });

  it('fires "dead_orbit" when no fuel and no nearby station', () => {
    const events = [];
    wl.onGameEnd((cause) => events.push(cause));
    const ship = mockShip({ fuel: 0, throttle: 0 });
    // Station is 1e14 m away (> 5 AU) — not reachable
    wl.update(65, 65, ship, ft, mockSystem(1e14));
    expect(events).toContain('dead_orbit');
  });

  it('does NOT fire "dead_orbit" when station is nearby', () => {
    const events = [];
    wl.onGameEnd((cause) => events.push(cause));
    const ship = mockShip({ fuel: 0, throttle: 0 });
    // Station 1 AU away — within DEAD_ORBIT_RADIUS
    wl.update(65, 65, ship, ft, mockSystem(1.496e11));
    expect(events.length).toBe(0);
  });

  it('only fires once even if conditions persist', () => {
    const events = [];
    wl.onGameEnd((cause) => events.push(cause));
    ft.fame = 20;
    const ship = mockShip();
    wl.update(1, 0, ship, ft, mockSystem());
    wl.update(1, 1, ship, ft, mockSystem());
    wl.update(1, 2, ship, ft, mockSystem());
    expect(events.length).toBe(1);
  });

  it('reset() allows re-triggering', () => {
    const events = [];
    wl.onGameEnd((cause) => events.push(cause));
    ft.fame = 20;
    wl.update(1, 0, mockShip(), ft, mockSystem());
    expect(events.length).toBe(1);

    wl.reset();
    ft.fame = 20; // still at 20
    wl.update(1, 0, mockShip(), ft, mockSystem());
    expect(events.length).toBe(2);
  });

  // ── Mayday static methods ────────────────────────────────────────────────

  it('canMayday returns true when fame >= 0', () => {
    ft.fame = 0;
    expect(WinLoss.canMayday(ft)).toBe(true);
    ft.fame = 5;
    expect(WinLoss.canMayday(ft)).toBe(true);
  });

  it('canMayday returns false when fame < 0', () => {
    ft.fame = -1;
    expect(WinLoss.canMayday(ft)).toBe(false);
  });

  it('executeMayday deducts 75% credits and applies -2 fame penalty', () => {
    ft.fame = 5;
    const globals = { _credits: 10000 };
    const result  = WinLoss.executeMayday(ft, globals);

    expect(result.creditsLost).toBe(7500);
    expect(globals._credits).toBe(2500);
    expect(ft.fame).toBe(3); // 5 - 2
  });

  it('executeMayday with 0 credits loses 0 and penalties fame still', () => {
    ft.fame = 5;
    const globals = { _credits: 0 };
    WinLoss.executeMayday(ft, globals);
    expect(globals._credits).toBe(0);
    expect(ft.fame).toBe(3);
  });
});
