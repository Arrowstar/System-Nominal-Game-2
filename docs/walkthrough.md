# System Nominal — Phase 0 Walkthrough

## What Was Built

Phase 0: Project scaffolding. The full browser-ready game skeleton is live at `http://localhost:5173/`.

## Files Created

| File | Purpose |
|------|---------|
| `package.json` | Vite + Vitest project with `npm run dev` / `npm test` scripts |
| `vite.config.js` | Dev server on port 5173, Vitest pointing to `src/**/__tests__/` |
| `index.html` | Full-viewport canvas + DOM HUD overlay + CRT effect div |
| `src/index.css` | Complete design token system (CRT green, amber, danger red), scanline overlay, vignette, all shared component styles |
| `src/main.js` | Bootstrap: initializes canvas, wires up all systems, runs the game loop, renders a live starfield menu |
| `src/core/Vec2.js` | Immutable 2D vector math (functional + mutable hot-path methods) |
| `src/core/GameLoop.js` | Fixed-timestep (60 Hz) game loop with render interpolation and warp factor |
| `src/core/InputManager.js` | Keyboard/mouse/scroll input tracking with per-frame just-pressed detection |
| `src/core/StateManager.js` | State machine with enter/update/exit/render lifecycle hooks |
| `src/core/Camera.js` | 2D pan/zoom camera with smooth interpolation and world↔screen coordinate conversion |
| `src/navigation/TimeWarp.js` | 4 warp levels, auto-cancel rules, emergency lock. |
| `physics.test.js` | 19 Vitest unit tests verifying accuracy of Kepler solver, mass model, Fuel, and Gravity. All passing. |

### Phase 2: Solar System & Map Rendering
- **Nav-Computer UI:** Implemented a zoomable, pannable, top-down map of the Solara system.
- **Gravity Wells:** Visualized orbital zones with a fading grid system spanning inwards to outwards.
- **On-Rails Orbits:** Planets and moons display their predicted orbits as continuous rings.
- **Orbital Trails:** Added fading trails that track body movement over time.

![Nav-Computer Map](/C:/Users/Adam/.gemini/antigravity/brain/145d45df-e6a9-4d89-9f1e-445c00a5f35d/phase2_fully_working_1774119265066.webp)

### **Phase 4: Ship Systems**
Phase 4 replaces the hardcoded ship physics parameters with a dynamic, modular loadout system.

1.  **Hulls**: Introduced base chassis definitions (e.g., Wayfarer, Bastion, Leviathan) that dictate empty mass, structural integrity, and available component slots (Small, Medium, Large).
2.  **Components**: Added equipable modules including Engines, Fuel Tanks, and generic Reactors. Engines now define specific thrust (N), specific impulse (Isp), and power draw, while tanks define fuel capacity.
3.  **Dynamic Loadouts**: The physics engine (`Ship.js`) now dynamically queries the active `Loadout` for all parameters. Total mass and thrust-weighted average Isp are calculated in real-time by summing the active components.
4.  **Resource Tracking**: Plumbed in logic for electrical power regeneration and thermal heat dissipation constraints natively into the symplectic integrator.

### **Phase 5: Tactical Bridge (Flight HUD)**
A ship-centric flight view that gives the player a cockpit-level perspective of their craft and immediate surroundings.

1.  **Ship-Centric Canvas**: Camera locked onto the player ship with triangular ship sprite, heading rotation, and scrollwheel zoom from 100m to 50,000 km viewport.
2.  **Engine Exhaust**: Particle trail behind the ship when throttle > 0, with green glow proportional to thrust level.
3.  **Crosshair Reticle**: Subtle green crosshair at screen center.
4.  **Vector Markers**: Prograde (green circle-with-dot) and Retrograde (red circle-with-X) indicators showing velocity direction with speed labels.
5.  **Cockpit HUD Overlay**: DOM-based panels for velocity readout, thrust gauge (kN + G-force), tri-bar resource monitor (Fuel/Power/Heat), hull integrity wireframe, and edge radar arrows for off-screen bodies.
6.  **WASD Flight Controls**: A/D for heading rotation, W/S for throttle ramp, Z for full throttle, X for kill throttle.
7.  **Tab Toggle**: Seamless switching between Nav Computer and Tactical Bridge preserving all game state.

![Tactical Bridge with full throttle](C:/Users/Adam/.gemini/antigravity/brain/145d45df-e6a9-4d89-9f1e-445c00a5f35d/phase5_tactical_hud.png)
*Tactical Bridge showing velocity readout (29.78 km/s), thrust gauge, tri-bar resources at 100%, hull wireframe, and Aethelgard visible on the local view.*

![Tactical Bridge recording](C:/Users/Adam/.gemini/antigravity/brain/145d45df-e6a9-4d89-9f1e-445c00a5f35d/phase5_final_verify_1774127423232.webp)
*Animated recording showing Tab toggle, Z-key full throttle, and Tab back to Nav Computer.*

### **Phase 3: Navigation & Maneuver Nodes**
The core navigation system was enhanced to provide professional-grade orbital planning with seamless, high-performance interactions.

1.  **Intuitive Interaction**: Use the **`N`** key to place a maneuver node directly on your trajectory. A **"Hover Highlight"** white circle helps you see exactly where it will land.
2.  **Labeled Handles**: The maneuver widget now specifically labels each handle: **PROG** (Green, Prograde), **RETR** (Red, Retrograde), **RAD+** (Radial Out), and **RAD-** (Radial In).
3.  **Timeline Scrubbing**: Click and drag the **center** of any node to slide it forwards or backwards in time along your trajectory, allowing you to perfectly time your burns.
4.  **SOI-Aware Logic**: Radial maneuvers are calculated relative to the **local dominant gravity well** (e.g., Aethelgard) rather than just the Sun, allowing for precise orbital captures and satellite-style transfers.
5.  **Real-Time Telemetry**: The HUD now displays **NEW PE** (Periapsis) and **NEW AP** (Apoapsis) in real-time as you drag handles, enabling highly precise orbital planning.
6.  **60FPS Optimization**: Completely rewrote the trajectory prediction engine to use zero-allocation math and cached orbital paths. Even with a **333-day lookahead**, the UI remains butter-smooth during interactions.

![Full Maneuver Functionality](/C:/Users/Adam/.gemini/antigravity/brain/145d45df-e6a9-4d89-9f1e-445c00a5f35d/phase3_full_functionality_verify_1774122371848.webp)
*Verification of Phase 3 UX improvements including scrubbing and real-time telemetry.*

---

## 🛠️ How to Play

### **Interface & Controls**
-   **Mouse Wheel**: Zoom In/Out (Solar scope)
-   **Left Mouse Drag**: Pan Map
-   **`N` Key / Click Path**: Place Maneuver Node at mouse position
-   **Drag Node Center**: Scrub node forwards/backwards in time
-   **`F` Key**: Focus camera on Ship
-   **`1-4` Keys**: Set Time Warp Level (1x, 10x, 100x, 1000x)
-   **`[` and `]`**: Decrease / Increase Time Warp
-   **`Enter`**: Auto-execute active maneuver node
-   **`Backspace` / `Delete`**: Delete active maneuver node

### **Planning a Burn**
1.  Hover over the green dashed **Ghost Path**.
2.  Press `N` to create a node.
3.  Click the node to see the **Maneuver Widget**.
4.  Drag the **PROG** handle (green) to raise your orbit, or **RETR** (red) to lower it.
5.  Check the **NEW PE / AP** values in the HUD to see your estimated final orbit.
6.  Time-warp until you reach the node, then press `Enter`.

![Maneuver Node Creation recorded by subagent](/C:/Users/Adam/.gemini/antigravity/brain/145d45df-e6a9-4d89-9f1e-445c00a5f35d/phase3_maneuver_node_verify2_1774120960664.webp)
*Animated recording showing the interactive pan/zoom capabilities of the new Nav-Computer, revealing the Keplerian orbits of Kronos, Caelus, and Oceanus around Solara.*

## Verified in Browser

![Main menu](/C:/Users/Adam/.gemini/antigravity/brain/145d45df-e6a9-4d89-9f1e-445c00a5f35d/initial_load_system_nominal_1774117008333.png)
*Main menu: CRT-styled title with live starfield, scanline overlay, and green glowing "SYSTEM NOMINAL" heading. NEW MISSION and HOW TO PLAY buttons work.*

![Nav-Computer Map View](/C:/Users/Adam/.gemini/antigravity/brain/145d45df-e6a9-4d89-9f1e-445c00a5f35d/phase2_fully_working_1774119265066.webp)
*Animated recording showing the interactive pan/zoom capabilities of the new Nav-Computer, revealing the Keplerian orbits of Kronos, Caelus, and Oceanus around Solara.*

## Bugs Fixed
- **Prediction Lag**: Extended trajectory lookahead to 1 year caused massive GC pauses. Fixed by refactoring `Trajectory.js` to use zero-allocation math and cached body paths.
- **Node Duplication**: Keyboard 'N' polling in the fixed-timestep loop could spawn multiple nodes if frames lagged. Added a timestamp check to prevent duplicates.
- **Camera Focus Crash**: `main.js` was calling a non-existent `camera.zoomTo()` function on load, crashing the initial transition. Fixed to use direct state assignment.
- **Ghost Path Gap**: The 1-hour prediction step left a visible gap between the ship and the path start. Added a connection line from the ship's current position to the path.
- **Input Fall-through**: Panning logic was overriding widget drags because of a missing "just pressed" state for mouse buttons in `InputManager.js`. Fixed by adding mouse button tracking to the manager.
- **StateManager init bug**: `_current` was initialized to `STATES.MENU`, causing the first `transition(STATES.MENU)` call to be silently dropped. Fixed by initializing to `null`.
- **Canvas float overflow limit**: Canvas `arc` and `moveTo` silently clips rendering if coordinates are too massive (`> 1e6`). Refactored `NavComputer.js` to pre-project all `1e11` (AU scale) world coordinates into screen pixel coordinates dynamically, fixing the "invisible planets" issue.
- **Camera Zoom Limit**: Raised camera zoom out distance from `1e-6` to `1e-10` to allow the user to see the entire 25 AU span of the solar system at a glance.

---

## Phase 2 Completed Features

Phase 2 replaces the placeholder grid with the fully realized N-body Solara system and interactive map renderer.

| Module | Key Points |
|--------|-----------|
| `SolarSystem.js` | Definitions for Solara, 11 primary bodies, 5 moons, Ceres Prime station, and the Belt of Tears. Realistic masses (kg), custom AU-scale distances, and gameplay-compressed orbital periods so you can actually see the planets orbit in real-time. |
| `NavComputer.js` | Top-down map renderer. It uses adaptive screen-space Canvas rendering to prevent float precision overflow across millions of kilometers. Features include: 1) Warped gravity grid proportionate to `GM/r`, 2) Procedural asteroid belt rings, 3) Dashed Ghost Path trajectory predictor, 4) Faint orbital trails for moon historical paths, and 5) Screen-space body labels with security threat level colors. |

---

## Phase 1: Core Physics Engine

### What Was Built

| File | Purpose |
|------|--------|
| `src/physics/KeplerOrbit.js` | Analytical Keplerian orbit solver (Newton-Raphson on Kepler's equation). Planets/moons are on-rails — position at any time t is O(1). Supports eccentric orbits, argument of periapsis, and hierarchical parent orbits for moon systems. |
| `src/physics/Ship.js` | Ship physics entity. Mass model: hull + components + fuel + cargo. Tsiolkovsky fuel flow. Power regen, heat dissipation, thermal damage, render interpolation snapshot. |
| `src/physics/ShipSim.js` | Symplectic Euler integrator. Only ships are integrated; body positions are queried analytically each step. Velocity-first integration keeps orbits stable forever. |
| `src/physics/Trajectory.js` | Ghost path predictor. Clones ship state, runs 500 steps at 10s each (~83 min lookahead). `ManeuverNode` stores prograde/retrograde/radial Δv and computes the vector from current heading. `estimateFuelCost()` uses the Tsiolkovsky rocket equation. |
| `src/navigation/TimeWarp.js` | 4-level time warp (1×, 10×, 100×, 1000×). Auto-cancels when approaching a maneuver node. Emergency lock/unlock for combat. |

### Test Results

```
✓ KeplerOrbit (7 tests)
  ✓ Kepler equation accurate for circular orbit (e=0)
  ✓ Kepler equation accurate for eccentric orbit (e=0.5)
  ✓ Correct quarter-period positions for circular orbit
  ✓ Position repeats after one full period
  ✓ getPosition(1000) is deterministic (no state drift)
  ✓ Hierarchical moon orbit stays within correct radial bounds
  ✓ getOrbitPath samples all lie on the ellipse
✓ Ship (5 tests)
  ✓ totalMass = hull + components + fuel + cargo
  ✓ consumeFuel burns correct mass/s via Tsiolkovsky
  ✓ Throttle cuts at fuel=0
  ✓ getState/setState round-trips
  ✓ takeDamage + destroyed flag
✓ ShipSim (4 tests)
  ✓ Gravity falls correctly toward Solara (G·M/r²)
  ✓ Thrust in heading direction adds correct acceleration
  ✓ Acceleration increases as fuel burns (decreasing mass)
  ✓ gravAccelAt magnitude and direction correct
✓ Trajectory (3 tests)
  ✓ Ghost path end matches actual sim within 1000 km
  ✓ Prograde maneuver node Dv vector in correct direction
  ✓ estimateFuelCost matches rocket equation

Total: 19/19 passed ✅
```
