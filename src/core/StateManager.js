/**
 * StateManager — Game state machine.
 *
 * States:
 *   'menu'      — Main menu / title screen
 *   'nav'       — Nav-Computer (map view): plotting trajectories, time-warp
 *   'tactical'  — Tactical Bridge: flight, combat, manual burns
 *   'docked'    — Station Terminal: trading, shipyard, missions
 *   'gameover'  — Hull breach or dead orbit
 *   'victory'   — Legacy summary screen
 */

export const STATES = {
  MENU:     'menu',
  NAV:      'nav',
  TACTICAL: 'tactical',
  DOCKED:   'docked',
  GAMEOVER: 'gameover',
  VICTORY:  'victory',
  BOARDING: 'boarding',
};

export class StateManager {
  constructor() {
    this._current  = null;  // null means no state yet; first transition() always fires enter()
    this._previous = null;
    this._handlers = {};   // { stateName: { enter, update, exit, render } }
    this._listeners = [];  // (prevState, nextState) callbacks
  }

  /** Register lifecycle hooks for a state. All hooks are optional. */
  register(state, { enter, update, exit, render } = {}) {
    this._handlers[state] = { enter, update, exit, render };
  }

  get current() { return this._current; }
  get previous() { return this._previous; }

  is(state) { return this._current === state; }

  /** Transition to newState (calls exit on old, enter on new). */
  transition(newState) {
    if (newState === this._current) return;

    const old = this._handlers[this._current];
    if (old?.exit) old.exit(newState);

    this._previous = this._current;
    this._current  = newState;

    const next = this._handlers[newState];
    if (next?.enter) next.enter(this._previous);

    this._listeners.forEach(fn => fn(this._previous, newState));
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onChange(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  /** Call each frame — delegates to the active state's update/render hooks. */
  update(dt, simTime) {
    const h = this._handlers[this._current];
    if (h?.update) h.update(dt, simTime);
  }

  render(alpha) {
    const h = this._handlers[this._current];
    if (h?.render) h.render(alpha);
  }
}
