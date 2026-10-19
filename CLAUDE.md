# Rendezvous Simulator

A browser app that shows two spacecraft (Target and Chaser) in three synchronized views (inertial orbits, LVLH now, LVLH rendezvous plot) so viewers can see how elliptical orbits become relative-motion plots. Users play preset scenarios or add their own burns and watch them play out.

## Source of truth

- **Spec:** `docs/prompt.md`. Read it fully before starting. It governs behavior, physics, presets, layout and acceptance criteria.
- **Mockups:** `docs/mockups/` (standalone HTML plus a PNG of each). They show the intended look: colors, type, spacing, panel structure, chart styling.
  - `desktop.html` / `.png`: 1440 px, all three views plus the burn drawer.
  - `phone-plot.html` / `.png`: 390 × 844, Plot tab, burn list peeking.
  - `phone-burn-editor.html` / `.png`: 390 × 844, editing a burn with the what-if trajectory.
- **When they disagree, the spec wins.** The mockups are static pictures, not code to copy. Rebuild their look with the tokens and components the spec describes; never paste their hard-coded SVG paths or numbers into the app.
- The architecture diagram in the spec did not survive export (it shows as "embedded content"). The data flow it showed: Burn editor → Scenario → Propagator → Timeline (rebuilt on every edit); Playback bar → Sim clock (time t); all three views draw the Timeline's state at t. Views write back only through the store or clock (scrubbing sets the clock; tapping a burn selects it).

## Decisions already made (do not reopen)

- v1 is **coplanar**: 2D motion in one orbital plane; burns have radial and along-track components only, with no cross-track and no H-bar.
- Burns are **impulsive** (instantaneous Δv).
- The Target never burns.
- +V-bar (ahead) is plotted to the **left**; +R-bar up.
- Exact two-body propagation (Kepler), no numerical integrator, no CW propagation in the sim (CW is only how preset hop burns were designed).
- Fonts: IBM Plex Sans (UI) and IBM Plex Mono (all changing numbers).
- TypeScript + Vite, Canvas 2D views, no backend; deploy to GitHub Pages with a GitHub Actions workflow.
- Write all code fresh. Do not reuse any earlier orbit.js / orbit-viz.html.

## Working rules

- Build in this order and keep tests green at each step:
  1. `src/physics/` (Kepler propagation, frames, burns, timeline) with Vitest unit tests, including the spec's accuracy tests and preset end-state tests.
  2. Scenario store, clock and preset JSON files.
  3. The three views, then telemetry, playback and scrubber.
  4. Burn editor, what-if ghost, saving and sharing.
  5. Phone and tablet layouts, then the GitHub Pages workflow.
- Physics code is pure TypeScript with no DOM access.
- Before calling a view done, open the matching mockup and your build side by side at the same viewport (1440 × 1000 or 390 × 844) and compare them.
- **Cross-check:** the mockups show preset 1 (Phasing from below) at T+01:05:00. Loading that preset at that time should give, within rounding: range 51.26 km, range rate −74.96 m/s, Chaser altitude 377.9 km, Chaser Ap/Pe 420.0 / 350.0 km, phase −0.25°, LVLH (rectilinear) V −29.19 km, R −42.14 km. Add this as a test.
- Units: SI internally (m, s, rad); format for display only.
