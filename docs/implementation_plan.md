# System Nominal — Implementation Plan

An orbital-physics RPG / sandbox / trading simulator built as a single-page browser game. The player navigates an N-body solar system, trades commodities, engages in combat, and accumulates 20 Fame Points to win.

## User Review Required

> [!IMPORTANT]
> **Scope & Phasing**: This is an ambitious game. The plan is structured into 11 phases so we can build incrementally and you can playtest after each major phase. We have successfully completed the previous phases. We are now beginning **Phase 7: Station Terminal & Docking**, which introduces the ability to dock with planets, moons, and stations, and interact with the local market, shipyard, and mission board.
>
> **Design Review**: Please review the proposed docking mechanism (proximity-based prompt to transition to DOCKED state) and the structure of `StationUI`. Does this align with your expectations for how players will interact with markets and shipyards across various celestial bodies?


---

## Proposed Changes

### [Phase 7] Station Terminal & Docking

This phase introduces the ability for the player spacecraft to "dock" with celestial bodies (planets, moons) and orbital stations. Docking pauses the simulation and opens the Station Terminal, providing access to local markets, shipyards, and mission boards across the system.

#### [NEW] [src/ui/StationUI.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/ui/StationUI.js)
DOM-based station screens for player interaction:
- **Header/Tabs**: Navigation between Local Market, Shipyard, and Mission Board, along with an "UNDOCK" button.
- **Local Market**: Split-screen layout, commodity rows with price, sparkline, supply/demand arrows, legality warnings. Quick-action buttons (Sell All, Fill Hold, Refuel).
- **Shipyard**: Blueprint grid view of ship hull with slot outlines. Drag-and-drop components. Dynamic stat sidebar with green/red flash feedback.
- **Mission Board**: Tabs for Available/Active/Completed. Contract cards with payout, danger, destination. Red warning stamps for high-danger missions.

#### [NEW] [src/core/DockingManager.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/core/DockingManager.js)
System to handle proximity detection and docking logic:
- Continuously checks distance between player ship and bodies/stations in `SolarSystem`.
- Identifies the nearest dockable entity within a defined docking radius (which scales based on body radius).
- Exposes state to the HUD to display a "PRESS [F] TO DOCK AT [ENTITY NAME]" prompt.

#### [MODIFY] [src/core/StateManager.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/core/StateManager.js)
- Define new state: `STATES.DOCKED`.

#### [MODIFY] [src/main.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/main.js)
- Register `STATES.DOCKED` state with enter/update/render/exit lifecycle.
- Listen for the `F` key (or docking interaction) when a dockable target is in range.
- `enter()`: Pause physics simulation, populate and display `StationUI` with data from the docked entity.
- `exit()`: Hide `StationUI`, resume physics.

#### [MODIFY] [src/ui/HUDOverlay.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/ui/HUDOverlay.js)
- Add a docking prompt UI element that appears when `DockingManager` indicates a valid nearby target.

## Verification Plan
- **Physics Regression**: Run `npx vitest run` — previous core tests must pass.
- **Proximity Detection**: Fly the ship near a planet, moon, or station and verify the docking prompt appears. Fly away and ensure it disappears.
- **State Transition**: Press the docking key when prompted and verify the game transitions to `STATES.DOCKED`, physics pause, and the `StationUI` overlays the screen.
- **UI Functionality**: Verify tabs work in the Station Terminal, and the "Undock" button correctly resumes the game.

### Phase 0 — Project Scaffolding

#### [NEW] [package.json](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/package.json)
Vite project config. Dev server on `localhost:5173`.

#### [NEW] [index.html](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/index.html)
Single-page entry point with a full-viewport `<canvas>` and a DOM overlay layer for HUD/menus. Loads Google Fonts (Roboto Mono, Fira Code).

#### [NEW] [src/main.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/main.js)
Application bootstrap: initializes the game loop, canvas context, and state machine.

#### [NEW] [src/index.css](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/index.css)
Global styles: design tokens (CRT green `#39FF14`, amber `#FFBF00`, red `#FF003F`, void blacks), reset, scanline overlay, monospace font stacks.

#### [NEW] Folder structure
```
src/
├── main.js            # Entry point & game loop
├── index.css          # Global styles & design tokens
├── core/              # Engine fundamentals
│   ├── GameLoop.js    # Fixed-timestep loop with render interpolation
│   ├── InputManager.js# Keyboard/mouse/scroll input
│   ├── StateManager.js# Game state machine (menu, nav, tactical, docked)
│   └── Camera.js      # Pan/zoom camera for map & tactical views
├── physics/           # N-body simulation
│   ├── NBodySim.js    # Gravity integrator, body updates
│   ├── Body.js        # Celestial body class (mass, position, velocity)
│   ├── Ship.js        # Player ship (extends Body with thrust, fuel, cargo)
│   └── Trajectory.js  # Ghost Path predictor (runs sim copies forward)
├── world/             # Solar system data & entities
│   ├── SolarSystem.js # Solara system definition (all bodies)
│   ├── Station.js     # Stations, docking ports
│   └── Asteroid.js    # Belt of Tears objects
├── navigation/        # Nav-Computer
│   ├── NavComputer.js # Map view renderer & interaction
│   ├── ManeuverNode.js# Node creation, vector widget, burn data
│   └── TimeWarp.js    # Time acceleration controller
├── tactical/          # Tactical Bridge
│   ├── TacticalHUD.js # Flight HUD renderer
│   ├── VectorMarkers.js# Prograde/retrograde/target markers
│   └── PursuitAssist.js# Relative-frame arcade mode
├── combat/            # Weapons & NPC AI
│   ├── Weapons.js     # AutoCannon, PulseLaser, Torpedo classes
│   ├── Projectile.js  # Projectile physics (inherits velocity)
│   └── EnemyAI.js     # NPC ship behavior
├── ship/              # Ship customization
│   ├── Hull.js        # Hull definitions & slot layout
│   ├── Component.js   # Engine, reactor, radiator, tank, weapon defs
│   └── Loadout.js     # Equipped components & stat calculator
├── economy/           # Trading & economy
│   ├── Commodity.js   # Commodity types, base prices, legality
│   ├── Market.js      # Station market with dynamic pricing
│   └── Credits.js     # Player wallet
├── progression/       # Fame & missions
│   ├── FameTracker.js # Milestone definitions, scoring
│   ├── MissionBoard.js# Contract generation & tracking
│   └── WinLoss.js     # Victory/defeat condition checks
├── ui/                # DOM-based HUD & menus
│   ├── HUDOverlay.js  # Resource bars, gauges, alerts
│   ├── StationUI.js   # Market, shipyard, mission board panels
│   ├── AlertSystem.js # Bingo fuel, missile lock, contraband alerts
│   └── FameUI.js      # Galactic Ledger & Legacy screen
├── audio/             # Sound effects
│   └── AudioManager.js# SFX playback, ambient loops
└── vfx/               # Visual effects
    ├── Scanlines.js   # CRT overlay
    ├── ScreenShake.js # Impact feedback
    └── GravityGrid.js # Warped wireframe grid
```

---

### Phase 1 — Core Physics Engine

**Architecture overview:**
- **Solara (Sun)**: Stationary. Fixed at world-space origin `(0, 0)`. Acts as the primary gravity source.
- **Planets & Moons (On Rails)**: Positions computed analytically from Keplerian orbital elements — semi-major axis, eccentricity, inclination (flat 2D system), and mean anomaly at epoch. Advancing time is a single equation solve (`M = n·t`, solved for eccentric anomaly `E`, then converted to position). No integration needed — any future time instant is computed in O(1).
- **Ships, Torpedoes, NPC Craft (Dynamic)**: Gravitational acceleration from Solara + all planets/moons is summed each tick and integrated with a symplectic Euler integrator. Ship mass decreases as fuel burns.

#### [NEW] [src/physics/KeplerOrbit.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/physics/KeplerOrbit.js)
- Orbital elements per body: `a` (semi-major axis), `e` (eccentricity), `ω` (argument of periapsis), `M₀` (mean anomaly at t=0)
- `getPosition(t)` → solves Kepler's equation `M = E - e·sin(E)` via Newton-Raphson iteration (typically converges in 3–5 steps)
- `getVelocity(t)` → analytical derivative for use in Ghost Path gravity calculations
- Used by all planets and moons; the sun simply returns `(0, 0)` always

#### [NEW] [src/physics/ShipSim.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/physics/ShipSim.js)
- Symplectic Euler integrator for ships only, with configurable sub-steps
- Per-tick: queries `KeplerOrbit.getPosition(t)` for all bodies, sums gravitational accelerations `a = -G·M/r² · r̂`
- Ship thrust: adds `F / currentMass` in heading direction
- Mass depletion: `Δm = thrust / (Isp · g₀) · Δt`
- Time-warp scales `Δt`; bodies' positions at the advanced `t` are computed without any extra integration cost

#### [NEW] [src/physics/Ship.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/physics/Ship.js)
- Properties: `position` (Vec2), `velocity` (Vec2), `mass`, `fuel`, `maxFuel`, `heading`, `throttle`
- Method: `burn(dt)` — applies thrust in heading direction, depletes fuel, reduces mass
- Properties for hull integrity, heat, power
- Cargo hold with mass contribution

#### [NEW] [src/physics/Trajectory.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/physics/Trajectory.js)
- Clones current ship state and runs `ShipSim` forward N steps
- At each step, body positions are fetched analytically via `KeplerOrbit.getPosition(t)` — no body integration needed
- Returns array of predicted ship positions (the "Ghost Path")
- Recalculates on ship velocity change or maneuver node edit
- Configurable lookahead duration and sample count

---

### Phase 2 — Solar System & Map Rendering

#### [NEW] [src/world/SolarSystem.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/world/SolarSystem.js)
Complete Solara system definition with all bodies from the design doc:
- **Solara**: Fixed at `(0, 0)`, very high mass (primary gravity source)
- **Inner Zone**: Ignis, The Foundry, Aethelgard, Gaea Prime — each defined by Keplerian elements
- **Belt of Tears**: Asteroid belt (ring of static/on-rails objects), Ceres Prime station
- **Outer Zone**: Kronos (+Hyperion, Atlas), Oceanus (+Triton), Erebus (+Nyx), Caelus (+Ariel), Tartarus, Solara-B — moons defined relative to parent body's on-rails position

Each body has: mass (for gravity on ships), Keplerian elements (`a`, `e`, `ω`, `M₀`), radius, color, economy type, security level.

#### [NEW] [src/navigation/NavComputer.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/navigation/NavComputer.js)
- Top-down zoomable/pannable canvas rendering of the system
- Body rendering with size scaling and labels
- Orbital trail rendering (fading historical path)
- Ghost Path rendering (dashed green line from ship)
- Click-to-select bodies for info display
- Gravity well grid as a faint warped wireframe background

#### [NEW] [src/core/Camera.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/core/Camera.js)
- 2D camera with pan (click-drag), zoom (scroll wheel), and focus-on-target
- Smooth interpolation for transitions
- Coordinate conversion: world ↔ screen

---

### Phase 3 — Navigation & Maneuver Nodes

#### [NEW] [src/navigation/ManeuverNode.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/navigation/ManeuverNode.js)
- Click on Ghost Path to create a node at that future time
- Vector widget with draggable arrows: prograde, retrograde, radial in/out, normal/anti-normal
- Scroll-wheel fine-tuning on hovered arrow
- Updates Ghost Path in real-time as vectors are adjusted
- Data panel: fuel cost, burn duration, Δv, time-to-burn countdown

#### [NEW] [src/navigation/TimeWarp.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/navigation/TimeWarp.js)
- Warp speeds: 1×, 10×, 100×, 1000×
- UI dial/buttons at top of Nav-Computer
- Auto-revert to 1× when approaching a maneuver node or emergency event
- Pause capability

---

### Phase 4 — Ship System

#### [NEW] [src/ship/Hull.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/ship/Hull.js)
Hull definitions from design doc:

| Hull | Tier | Mass | Integrity | Slots (S/M/L) |
|------|------|------|-----------|----------------|
| Wayfarer | 1 | 100t | 100 | 3/1/0 |
| Dart | 1 | 40t | 80 | 2/0/0 |
| Ox | 1 | 250t | 150 | 1/2/0 |
| Bastion | 3 | 1000t | 900 | 4/4/1 |
| Leviathan | 3 | 1500t | 800 | 2/3/4 |

#### [NEW] [src/ship/Component.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/ship/Component.js)
Engine definitions:

| Component | Slot | Thrust | Isp | Notes |
|-----------|------|--------|-----|-------|
| Mono-Prop RCS | S | 50 | Low | Docking/rotation |
| Kerosene Rocket | S | 500 | Med | High power, high fuel use |
| Nuclear Engine | M | 1500 | High | Interplanetary standard |
| Plasma Torch | L | 6000 | Max | Brachistochrone capable |

Plus: Fuel Tanks, Reactors, Solar Panels, Radiators, Shield Generators, Cargo Bays.

#### [NEW] [src/ship/Loadout.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/ship/Loadout.js)
- Manage equipped components per slot
- Calculate aggregate stats: total thrust, total Isp (weighted), total mass, fuel capacity, power generation, heat dissipation, cargo volume

---

### Phase 5 — Tactical Bridge (Flight HUD)

#### [NEW] [src/tactical/TacticalHUD.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/tactical/TacticalHUD.js)
- Ship-centric view with centered crosshair
- Render nearby space (stars background, nearby bodies)
- Engine thrust visual (particle-like exhaust)

#### [NEW] [src/tactical/VectorMarkers.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/tactical/VectorMarkers.js)
- Prograde marker (circle with lines) at velocity direction
- Retrograde marker (circle with X) at anti-velocity
- Target marker when locked

#### [NEW] [src/ui/HUDOverlay.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/ui/HUDOverlay.js)
DOM-based HUD elements:
- Thrust & acceleration gauge (kN and G-forces)
- Tri-Bar: Fuel (blue), Power (yellow), Heat (red) with segmented bars
- Hull integrity wireframe (top-down ship outline with color-coded sections)
- Edge radar arrows for off-screen entities

---

### Phase 6 — Combat & Pursuit Assist

#### [NEW] [src/tactical/PursuitAssist.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/tactical/PursuitAssist.js)
- Toggle on/off with target locked
- Auto-burns to match target orbital velocity
- WASD controls become relative to target (strafe, forward, back)
- Continuous fuel drain display
- UI state: "MANUAL FLIGHT" (grey/amber) ↔ "ASSIST ACTIVE" (pulsing green)

#### [NEW] [src/combat/Weapons.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/combat/Weapons.js)
- **Auto-Cannons**: Kinetic projectiles inheriting ship velocity, travel in a straight line
- **Pulse Lasers**: Hit-scan at close range, drains power, generates heat
- **Torpedoes**: Self-propelled with F=ma intercept logic, tracks target trajectory

#### [NEW] [src/combat/EnemyAI.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/combat/EnemyAI.js)
- NPC ships with patrol, attack, and flee behaviors
- Pirates in the Belt of Tears and near Nyx
- Patrol ships in high-security zones
- Merchant NPCs on trade routes

---

### Phase 7 — Station Terminal

#### [NEW] [src/ui/StationUI.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/ui/StationUI.js)
DOM-based station screens:
- **Local Market**: Split-screen layout, commodity rows with price, sparkline, supply/demand arrows, legality warnings. Quick-action buttons (Sell All, Fill Hold, Refuel).
- **Shipyard**: Blueprint grid view of ship hull with slot outlines. Drag-and-drop components. Dynamic stat sidebar with green/red flash feedback.
- **Mission Board**: Tabs for Available/Active/Completed. Contract cards with payout, danger, destination. Red warning stamps for high-danger missions.

---

### Phase 8 — Economy & Trade

#### [NEW] src/economy/Commodity.js
Defines the three-tiered commodity system:
- **Raw Materials**: Water Ice, Raw Ore, Helium-3, Biomass.
- **Intermediate Goods**: Refined Metals, Plastics, Chemicals, Machinery Parts.
- **End Products**: Food Paks, Medicine, Advanced Electronics, Luxuries, Ship Components, Illegal Stims.
Each commodity has a base price, mass per unit, legality, and category.

#### [NEW] src/economy/Production.js
Defines recipes and factory logic for stations:
- **Recipes**: Inputs (e.g., 2 Raw Ore) → Output (e.g., 1 Refined Metal).
- **Processing**: Stations process inputs into outputs over time if inputs are available.
- **Sinks**: Population centers slow-consume End Products (Food, Medicine, Luxuries) and remove them from the economy.
- **Sources**: Extraction stations (Mines, Gas Collectors, Ag-Domes) generate Raw Materials over time.

#### [NEW] src/economy/Market.js
- Local market inventory and dynamic pricing based on actual supply/demand ratios (inventory levels vs. consumption rates).
- High supply = price drop; High demand (low inventory) = price spike.
- Stations have a maximum storage capacity for goods. Production halts if outputs are full.
- Price history tracking for sparkline graphs.
- Contraband flags per station (security level determines scan chance).

#### [NEW] src/economy/TradeRoute.js
- Central logic to identify profitable arbitrage between stations.
- Queries the Market to find where a good is cheap vs where it is expensive.

#### [MODIFY] src/combat/EnemyAI.js
- Add `Merchant` AI behavior: Spawn merchant ships that physically travel TradeRoutes.
- Merchants spawn with cargo at a Source/Producer, fly to a Sink/Consumer, dock, and move goods, driving the physical flow of the economy.
- Generates life and scale in the system. Pirates and the Player can intercept them.

---

### Phase 9 — Fame & Win/Loss

#### [NEW] [src/progression/FameTracker.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/progression/FameTracker.js)
Milestones from design doc:

| Category | Task | Fame |
|----------|------|------|
| Navigator | Chain 3 gravity assists in one trip | +3 |
| Ace | Destroy 3 ships in one Pursuit Assist window | +2 |
| Tycoon | Profit 50,000 credits from trading | +2 |
| Icarus | Burn within Solara's Danger Zone | +2 |
| Pioneer | Dock with the Void-Gate at system edge | +4 |

Plus additional repeatable milestones to reach 20 total.

#### [NEW] [src/progression/WinLoss.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/progression/WinLoss.js)
- **Victory**: Fame ≥ 20 → Legacy summary screen
- **Hull Breach**: Integrity ≤ 0 → Game Over
- **Dead Orbit**: No fuel + no path to station → Stranded (offer Mayday rescue at 75% credits, −2 Fame)

---

### Phase 10 — Audio, VFX & Polish

#### [NEW] [src/vfx/Scanlines.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/vfx/Scanlines.js)
CSS-based CRT scanline overlay with subtle opacity.

#### [NEW] [src/vfx/ScreenShake.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/vfx/ScreenShake.js)
Canvas shake on impacts, chromatic aberration at screen edges via post-processing.

#### [NEW] [src/vfx/GravityGrid.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/vfx/GravityGrid.js)
Wireframe grid that visually distorts near massive bodies.

#### [NEW] [src/audio/AudioManager.js](file:///c:/Users/Adam/Dropbox/Documents/homework/Personal%20Projects/System%20Nominal%20Game/src/audio/AudioManager.js)
- Web Audio API for SFX (clicks, klaxons, engine hum)
- Ambient loops per context (space, station, combat)
- Generated procedural audio where possible to avoid large asset downloads

---

## Verification Plan

### Automated Tests

**Physics unit tests** (`src/physics/__tests__/`):
Tests will be written using Vitest (bundled with Vite) and run with `npx vitest run`.

- **Keplerian orbit**: `KeplerOrbit.getPosition(t)` for a circular orbit (`e=0`) returns the exact analytical position; for an eccentric orbit, the solved eccentric anomaly satisfies `E - e·sin(E) = M` within 1e-10
- **On-rails time invariance**: Body position at `t=1000s` via `getPosition(1000)` matches stepping through 1000 1-second ticks of `getPosition(t)` — verifies no drift
- **Ship gravity**: Ship falling from rest toward Solara (only body) accelerates correctly per `a = -G·M/r²`
- **Thrust & mass**: Ship burning at known thrust/Isp depletes correct fuel mass per second
- **Trajectory prediction**: Ghost Path end-point matches actual `ShipSim` position after same elapsed time within tolerance

**Ship & economy unit tests**:
- **Loadout stats**: Equipping known components produces correct aggregate thrust, mass, fuel capacity
- **Market pricing**: Price fluctuation stays within expected bounds over simulated time
- **Fame scoring**: Triggering milestone conditions awards correct Fame points

### Browser Smoke Tests

Using the browser subagent tool after each major phase:

1. **Phase 1 complete**: Open `localhost:5173`, verify canvas renders, a ship and sun are visible, ship responds to thrust input, and orbits the sun under gravity
2. **Phase 2 complete**: Verify all planets/moons render at correct relative positions, zoom/pan works, orbital trails display
3. **Phase 3 complete**: Click on Ghost Path to create maneuver node, adjust vectors, verify burn data panel updates, execute burn and verify ship follows new trajectory
4. **Phase 5 complete**: Switch to tactical view, verify HUD elements render (gauges, resource bars, crosshair, vector markers)
5. **Phase 7 complete**: Dock at a station, verify market UI shows commodities, can buy/sell, shipyard shows hull blueprint

### Manual Verification (User)

After implementation is complete, I'll ask you to play through a loop:
1. Start in orbit around Aethelgard
2. Plot a transfer to Kronos using the Nav-Computer
3. Execute the burn and time-warp to arrival
4. Dock at Atlas station, buy Helium-3
5. Plot return, sell at Aethelgard for profit
6. Verify Fame tracker updates as milestones are hit

This tests the full gameplay loop: navigation → burn → time warp → docking → trading → progression.
