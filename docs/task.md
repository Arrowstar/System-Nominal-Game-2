# System Nominal Game — Implementation Task List

## Phase 0: Project Scaffolding
- [x] Initialize project with Vite (vanilla JS)
- [x] Set up folder structure (src/, assets/, etc.)
- [x] Configure HTML entry point, global CSS, Google Fonts

## Phase 1: Core Physics Engine
- [x] KeplerOrbit.js — on-rails analytical orbit solver
- [x] ShipSim.js — symplectic Euler integrator for ships
- [x] Ship.js — ship physics entity
- [x] Trajectory.js — ghost path predictor
- [x] TimeWarp.js wired into GameLoop
- [x] Unit tests for physics accuracy (19/19 passing)

## Phase 2: Solar System & World
- [x] Define Solara system data (planets, moons, orbits, properties)
- [x] Render the system map (Nav-Computer top-down view)
- [x] Gravity well grid visualization
- [x] Orbital trails & future path rendering
- [x] Data layer overlays (political, economic)
- [x] Wire up to main.js, replacing placeholder grid

## Phase 3: Navigation & Maneuver Nodes
- [x] Maneuver node creation on Ghost Path
- [x] Vector manipulation widget (prograde/retrograde/radial/normal)
- [x] Scroll-wheel fine-tuning for thrust
- [x] Burn data readout panel (fuel cost, duration, Δv, T-minus)
- [x] Auto-execute burn at node
- [x] Timeline Scrubbing (Drag center to move in time)
- [x] Performance Optimization (Zero-allocation prediction inner-loop)
- [x] Camera Focus & Path Initialization Fixes

## Phase 4: Ship System
- [x] Hull definitions (Wayfarer, Dart, Ox, Bastion, Leviathan)
- [x] Component slot system (S/M/L)
- [x] Engine components with thrust/Isp
- [x] Fuel/Power/Heat resource model
- [x] Ship mass calculation (hull + components + fuel + cargo)

## Phase 5: Tactical Bridge (Flight HUD)
- [x] Ship-centric flight view with crosshair
- [x] Prograde/Retrograde vector markers
- [x] Edge radar for off-screen entities
- [x] Target lock bracket & data block
- [x] Thrust/acceleration gauge
- [x] Tri-bar resource monitor (Fuel/Power/Heat)
- [x] Hull integrity wireframe display

## Phase 6: Combat & Pursuit Assist
- [ ] Pursuit Assist toggle (relative-frame velocity matching)
- [ ] Fuel drain indicator during Assist
- [ ] WASD arcade controls in Assist mode
- [ ] Auto-Cannons (kinetic projectiles, inherit velocity)
- [ ] Pulse Lasers (energy, hit-scan)
- [ ] Torpedoes (self-propelled, F=ma intercept AI)
- [ ] NPC enemy ships with basic AI

## Phase 7: Station Terminal (Docked UI)
- [ ] Station docking mechanic
- [ ] Local Market (trading UI with sparklines, supply/demand)
- [ ] Commodity system with prices & legality
- [ ] Shipyard (blueprint grid, drag-and-drop slotting)
- [ ] Dynamic stat recalculation sidebar
- [ ] Mission Board (available/active/completed tabs)

## Phase 8: Economy & Trade
- [ ] Commodity definitions & base prices
- [ ] Dynamic pricing model (supply/demand per station)
- [ ] NPC merchant traffic (visual trade routes)
- [ ] Contraband system & patrol scans
- [ ] Credits wallet & transaction system

## Phase 9: Fame & Win/Loss
- [ ] Fame point milestone tracking
- [ ] Fame UI (Galactic Ledger, medal/rank insignia)
- [ ] Victory condition (20 Fame → Legacy screen)
- [ ] Defeat conditions (hull breach, dead orbit, rescue)
- [ ] Bingo Fuel alert & manual override

## Phase 10: Audio, VFX & Polish
- [ ] Scanline / CRT overlay effects
- [ ] Chromatic aberration at screen edges
- [ ] Damage static flicker effects
- [ ] Button click audio (mechanical clack/chirp)
- [ ] Warning klaxons & alert sounds
- [ ] Ambient station audio
- [ ] High-G blur effect
- [ ] Smooth zoom transitions between views

## Phase 11: Verification & Playtesting
- [ ] Physics unit tests (gravity, thrust, mass)
- [ ] Nav-Computer interaction smoke tests (browser)
- [ ] Combat flow end-to-end test
- [ ] Trade loop test
- [ ] Fame progression test
- [ ] Full playthrough verification
