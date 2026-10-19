# Rendezvous Simulator — Web Design Spec

Oct 18, 2026 · @Michael Boyle

## Overview

A single-page, dark-themed browser app that shows a Target and a Chaser spacecraft in three synchronized views, so a viewer can watch two inertial orbits turn into an LVLH relative-motion plot. It runs on desktop and phone, ships with preset scenarios, and lets users add their own burns and watch them play out.

**Goals**

- Show one instant in three frames at once: inertial orbits, LVLH current position, and the LVLH rendezvous plot.
- Make cause and effect visible: a burn appears as a marker in every view, and the predicted trajectory updates the moment it is edited.
- Teach the classic counterintuitive results through presets: lower is faster, a retrograde burn moves you ahead, a radial burn makes a loop.

**Out of scope for v1:** perturbations (J2, drag), finite-duration burns (all burns are instantaneous Δv), out-of-plane motion (cross-track burns, plane changes), attitude, 3D vehicle models, accounts or server storage.

**Terms used in this spec**

- **Target** — the passive vehicle (e.g. a station). The LVLH frame is centered on it. It never burns.
- **Chaser** — the maneuvering vehicle. All burns belong to it.
- **LVLH** — local-vertical, local-horizontal frame centered on the Target. **V-bar** = along-track (+ = ahead, in the direction of motion; plotted to the left). **R-bar** = radial (+ = up, away from Earth). **H-bar** (cross-track) is not used: v1 is coplanar.
- **TIG** — time of ignition of a burn, shown as mission elapsed time (MET), e.g. T+01:31:08.

## Visual design

Dark, instrument-panel look: near-black background, quiet grid lines, and two saturated vehicle colors that stay identical across all three views. Color carries identity (which vehicle) and time (past vs future); nothing else is brightly colored.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | #0B0F14 | Page background |
| `--surface` | #121820 | Panels, view backgrounds |
| `--surface-2` | #1A2230 | Inputs, hovered rows, bottom sheet |
| `--border` | #243042 | Panel borders, dividers |
| `--grid` | #1C2633 | Plot grid lines |
| `--axis` | #3A4A5F | Axes, V-bar / R-bar lines |
| `--text` | #E6EDF3 | Primary text |
| `--text-dim` | #8B98A9 | Labels, units, secondary text |
| `--target` | #4FC3F7 | Target: orbit, icon, labels (cyan) |
| `--chaser` | #FFB74D | Chaser: orbit, dot, trajectory (amber) |
| `--burn` | #FF5C7A | Burn markers and Δv arrows |
| `--earth` | #16324F | Earth disk fill; limb stroke #2B5A86 |
| `--accent` | #7C9CFF | Focus rings, selected controls, play button |

**Rules**

- **Past vs future:** past path is a solid 2 px line at full color; future path is a dashed 1.5 px line at 55% opacity. The current position is a filled dot with a 2 px ring in `--bg` so it reads over the line.
- **Shape as well as color:** Target is a small square (station) icon, Chaser a circle, burns a numbered triangle. Cyan/amber stays distinguishable for common color-vision deficiencies; shape is the backup.
- **Typography:** IBM Plex Sans for UI; IBM Plex Mono for every number that changes — MET, range, Δv — so digits don't jitter. Sizes 12 / 14 / 16 px; telemetry values 14 px mono.
- **Contrast:** text at least 4.5:1 against its surface. Grid lines stay below 1.5:1 so data dominates.
- **Motion:** no decorative animation. Only the simulation moves.

## Layout

Desktop shows all three views at once; phone shows one view at a time with the playback bar always visible. The same components rearrange — there is no separate mobile app.

| Breakpoint | Views | Burn editor | Playback | Telemetry |
| --- | --- | --- | --- | --- |
| Desktop ≥ 1200 px | Inertial view left (\~50% width, full height); LVLH current (top) and rendezvous plot (bottom) stacked on the right | Collapsible drawer along the bottom, burn list + edit form side by side | Top bar, with scenario picker on the left | Strip under each view |
| Tablet 768–1199 px | 2 × 2 grid: inertial, LVLH current, rendezvous plot, burn editor | Fourth grid cell | Top bar | Strip under each view |
| Phone < 768 px | One view, full width, \~60% of viewport height; segmented control **Orbits · LVLH · Plot** above it; swipe left/right to change | Bottom sheet: peek (burn list), half, full (edit form) | Pinned to the bottom above the sheet | Collapsible row under the view |

**Layout rules**

- Each view is a panel with a title row (view name, scale readout, zoom/fit button) and a canvas that fills the rest.
- Views never scroll internally; pan and zoom instead (drag / pinch, scroll wheel, double-tap to fit).
- On phone, all touch targets are at least 44 × 44 px and the playback controls sit within thumb reach at the bottom.
- Landscape phone switches to two views side by side (Orbits + Plot) with the sheet collapsed.

## View 1 — Inertial orbits

An Earth-centered inertial view looking down the Target's orbit normal, so both orbits draw as ellipses around Earth's center of mass with the vehicles at their current positions. Its job is to show *why* the relative motion happens: different orbit sizes, different periods.

**Contents**

- Earth as a filled disk at the focus, to scale.
- Each vehicle's current osculating orbit as a full ellipse (1.5 px, vehicle color), redrawn after every burn. The orbit before the most recent burn stays as a faint ghost (20% opacity) until the next burn.
- Current position: Target square, Chaser circle. A short motion trail (last 10% of an orbit) behind each.
- Apoapsis and periapsis ticks on each ellipse; hover/tap shows altitude, e.g. “Ap 420.0 km”.
- Burn markers at the point on the Chaser's orbit where each burn occurs, with a Δv arrow; future burns hollow, past burns filled.
- A small LVLH triad (V-bar and R-bar arrows) drawn at the Target, so the viewer can connect this view to Views 2 and 3.

**Altitude exaggeration (required).** At true scale a 70 km altitude difference is about 1% of the orbit radius and is invisible. Draw radius as rᵈ = Rₑ + k(r − Rₑ) with k selectable at 1×, 10×, 30×, 100×; default 30×. The current factor is always shown in the title row (“Altitude ×30”) so the picture is never mistaken for true scale.

**Camera modes**

- **Fixed** (default): inertial, north-of-orbit-plane up, whole orbits in frame.
- **Follow Target**: centered on the Target and rotated so its velocity points left and radial points up — the same orientation as LVLH. This is the bridge between the inertial and relative views.

**Telemetry strip:** per vehicle — altitude, apoapsis / periapsis altitude, period, eccentricity. Plus phase angle (Chaser relative to Target, °, negative = behind).

**Coplanar:** both vehicles share one orbital plane in v1, so this view is the true orbit plane, not a projection.

## View 2 — LVLH current position

A Target-centered close-up that answers “where is the Chaser right now, and which way is it moving?” It auto-zooms with range, so it stays useful from 500 km out to 10 m.

**Axes:** V-bar horizontal (+ ahead to the left), R-bar vertical (+ up). Equal scale on both axes, always — this view shows true geometry.

**Contents**

- Target icon at the origin; Chaser dot at its current relative position.
- Short history tail: the last quarter orbit, fading from 100% to 0% opacity.
- Relative velocity arrow from the Chaser, length proportional to speed, with a readout (“0.42 m/s”).
- Optional overlays (off by default, toggled in the title row): 200 m keep-out sphere and 4 × 2 km approach ellipsoid, as used for ISS operations.
- Scale bar in the corner (“1 km”) and the current zoom level.

**Apoapsis / periapsis lines** (both LVLH views): the Chaser's current apoapsis and periapsis altitudes drawn as dotted horizontal lines in `--chaser` at 80% opacity, at R-bar = Chaser Ap (or Pe) altitude − Target altitude, labeled at the right edge (“Ap 420.0 km”, “Pe 350.0 km”). They update after every burn and show the vertical band the Chaser will move within.

**Axis scaling: Auto or Manual**, switched in the title row with a segmented control; the scale chip beside it shows the current span (“Auto · 100 km”, “Manual · ±8 km”). Both axes always share one scale in this view.

- **Auto** (default): picks the next step up from current range, from the set 50 m, 200 m, 1 km, 5 km, 20 km, 100 km, 500 km, and eases between steps over 300 ms. Stays centered on the Target.
- **Manual:** pinch, scroll wheel or drag to zoom and pan; or tap the scale chip to open the axis popover and type the span (e.g. ±8 km) and center. Any zoom or pan gesture switches to Manual. Manual settings hold until the user returns to Auto (segmented control, double-tap, or the popover's **Reset to Auto**).

**Telemetry strip:** range, range rate (+ opening, − closing), V-bar / R-bar offsets, time to next burn.

**How it differs from View 3:** this view follows the present and rescales; View 3 holds the whole scenario at a fixed scale.

## View 3 — Rendezvous plot

The operations-style plot: the Chaser's entire trajectory in Target LVLH, from scenario start to end, drawn once as a line — solid where it has already been, dashed where it is going — with the current time as a dot moving along it. Burns sit on the line as numbered markers, so the plan reads as one picture.

**Contents**

- Axes: V-bar horizontal (+ ahead to the left), R-bar vertical (+ up), both labeled with units; origin crosshair at the Target.
- Trajectory: past solid, future dashed (see Visual design). The split point is the “now” dot.
- Time ticks along the path every 10 min (small dots), labeled every 30 min (“T+0:30”); spacing adapts to scenario length so labels never overlap.
- Burn markers: numbered triangles with the burn name beside them (e.g. “1 NC”, “2 NH”). Hover/tap shows TIG and Δv.
- Orbit-count marks where the Target completes each revolution (“Rev 1”), so periodicity is visible.

View 3 also shows the Chaser's apoapsis and periapsis lines, as described in View 2.

**Scaling**

- **Auto** (default): fits the whole trajectory with 8% margin and refits after every burn edit. V-bar and R-bar scale independently; when they differ, the scale chip says so (“Auto · R-bar ×4”), because phasing trajectories are far longer than they are tall. A **True shape** toggle forces equal scale on both axes in Auto.
- **Manual:** each axis set on its own. The axis popover (tap the scale chip) has V-bar min / max and R-bar min / max fields, a **Lock aspect** toggle, and **Reset to Auto**. Gestures: drag pans; pinch zooms both axes, or one axis when the pinch is mainly horizontal or vertical; on desktop the wheel zooms both, Shift+wheel V-bar only, Alt+wheel R-bar only. Dragging along an axis's tick labels stretches that axis alone. Any of these switches to Manual. Manual ranges survive burn edits, so a user can stay zoomed on the final approach while tuning a burn.
- **Coordinates:** curvilinear by default (V-bar = arc length along the Target's orbit, R-bar = altitude difference). Rectilinear available as a toggle. See Simulation model for why this matters at long range.

**Interaction**

- Drag the “now” dot, or tap anywhere on the trajectory, to scrub time there. All views follow.
- Tap a burn marker to select it in the burn editor.
- Long-press (or right-click) on the trajectory → **Add burn here**, with TIG prefilled.
- **What-if ghost:** while a burn is being edited, the previous future trajectory stays as a faint line under the new one until the edit is committed or cancelled.

## Time and playback

One simulation clock drives every view. Because the whole trajectory is precomputed, scrubbing to any time is instant and play speed only changes how fast the clock advances.

- **Clock display:** MET (“T+01:31:08”) and Target revolution count (“Rev 1.62”), monospace.
- **Controls:** play/pause, jump to previous / next burn, restart, loop toggle.
- **Speed:** 1×, 10×, 60×, 120×, 300×, 600×; default 120× (one LEO orbit in about 46 s).
- **Slow near burns** (on by default): playback drops to 10× within ±60 s of each TIG so the burn is visible, then returns to the chosen speed.
- **Scrubber:** full-width timeline under the controls, from T+0 to scenario end, with a tick per burn (in `--burn`) and per Target revolution.
- **Keyboard:** Space play/pause · ← / → previous / next burn · \[ / \] slower / faster · B add burn at current time · Z undo · Shift+Z redo.

## Preset scenarios

Five presets ship in v1. In all of them the Target is in a 420 km circular orbit (period 92.97 min, mean motion n = 1.12638 × 10⁻³ rad/s). Presets 1 and 3 chain: phasing ends 5 km behind the Target, and approach starts there. Values below are two-body reference values; each preset is a JSON file, and unit tests check the listed end state.

| Preset | Chaser start | Ends at | What it teaches |
| --- | --- | --- | --- |
| 1 Phasing from below | 350 km circular, 493 km behind (phase −4.16°) | 5 km behind on V-bar, co-circular | Lower orbit is faster; a Hohmann transfer takes half an orbit |
| 2 Undock and depart | Docked (at origin) | Ahead of and below the Target, range > 10 km | A radial push makes a closed loop; a retrograde burn moves you *ahead* |
| 3 V-bar approach | 5 km behind on V-bar, co-circular | 30 m behind, holding | Radial “hops” move you along V-bar; each takes half an orbit |
| 4 R-bar approach | 2 km below on R-bar, at rest in LVLH | 20 m below, momentarily at rest | R-bar is not a natural hold point: staying on it takes a burn every leg |
| 5 Sandbox | 1 km behind on V-bar, co-circular, no burns | — | Starting point for user burns |

**Burns** (Δv in the Chaser's local frame: R = radial, + up; S = along-track, + prograde; no cross-track in v1)

| Preset | # | Name | TIG | Δv R | Δv S | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | Transfer | T+00:45:00 | 0 | +19.89 m/s | Raises apoapsis to 420 km |
| 1 | 2 | Circularize | T+01:31:08 | 0 | +19.84 m/s | Matches Target orbit, 5 km behind |
| 2 | 1 | Undock | T+00:00:00 | −0.12 m/s | 0 | Loop ahead/below, would return in one orbit |
| 2 | 2 | Sep 1 | T+00:10:00 | 0 | −0.50 m/s | Drifts ahead \~8.4 km per orbit |
| 2 | 3 | Sep 2 | T+00:56:30 | 0 | −1.00 m/s | Drift increases; departure committed |
| 3 | 1 | Hop 1 | T+00:05:00 | −1.126 m/s | 0 | Starts hop −5000 → −1000 m |
| 3 | 2 | Hop 1 stop | T+00:51:29 | −1.126 m/s | 0 | Stops at −1000 m |
| 3 | 3 | Hop 2 | T+00:55:00 | −0.225 m/s | 0 | Starts hop −1000 → −200 m |
| 3 | 4 | Hop 2 stop | T+01:41:29 | −0.225 m/s | 0 | Stops at −200 m |
| 3 | 5 | Hop 3 | T+01:45:00 | −0.048 m/s | 0 | Starts hop −200 → −30 m |
| 3 | 6 | Hop 3 stop | T+02:31:29 | −0.048 m/s | 0 | Stops at −30 m hold point |
| 4 | 1 | Leg 1 | T+00:00:00 | +3.016 m/s | +2.362 m/s | R-bar −2000 → −800 m |
| 4 | 2 | Leg 2 | T+00:20:00 | +2.531 m/s | +1.340 m/s | −800 → −250 m |
| 4 | 3 | Leg 3 | T+00:40:00 | +0.803 m/s | +0.567 m/s | −250 → −60 m |
| 4 | 4 | Leg 4 | T+01:00:00 | +0.197 m/s | +0.176 m/s | −60 → −20 m |
| 4 | 5 | Stop | T+01:20:00 | +0.034 m/s | +0.016 m/s | Nulls relative velocity at −20 m |

**Notes for implementation**

- Scenario durations: preset 1 = 2.5 h, preset 2 = 3 Target revolutions, preset 3 = 2 h 40 min, preset 4 = 1 h 30 min, sandbox = 3 revolutions (user-extendable).
- Hop Δv comes from the Clohessy–Wiltshire result: a radial impulse moves the Chaser 4·Δv/n along V-bar after half an orbit. Both burns of a forward hop point down (−R). Run in the full two-body propagator, arrival should be within 1% of the hop distance; test to that tolerance.
- Preset 1's initial phase is set so that, after the chaser gains 5.55° per revolution for 45 min and then transfers for 46.1 min, it arrives 5 km behind.
- Preset 4's burns are CW two-impulse transfers between R-bar waypoints, 20 min per leg, each burn combining the previous leg's stop with the next leg's start. Its start state is at rest in LVLH, so the scenario format needs optional LVLH velocity (default 0). Test: each waypoint reached within 2% of its leg length.

## Burn editor

Users build a plan as a list of impulsive Chaser burns, see the predicted trajectory change while they type, then press play to watch it fly. Editing any preset turns it into a user scenario; the original preset is never overwritten.

**Burn list**

- One row per burn, sorted by TIG: number, name, TIG, |Δv|, enable toggle.
- Footer: total Δv for the plan (“Total 39.73 m/s”).
- Actions per row: edit, duplicate, delete. Disabled burns stay in the list, greyed, and are skipped by the propagator — useful for “with vs without” comparisons.

**Adding a burn**

- **+ Burn** button or B key: adds a burn at the current sim time with zero Δv and opens it.
- Long-press / right-click on the rendezvous plot trajectory: adds a burn at that point's time.

**Edit form**

- Name (free text, defaults to “Burn n”).
- TIG: MET field (“T+01:31:08”), plus nudge buttons −60 s, −10 s, +10 s, +60 s.
- Δv components, each a number field with stepper (0.01 m/s; Shift = 0.1 m/s) and a slider (±2 m/s by default, expands if the typed value is larger): **Radial** (+ up) and **Along-track** (+ prograde). No cross-track component in v1.
- Read-only result row: |Δv|, and where this burn leaves the Chaser (apoapsis / periapsis altitude).
- Every change re-propagates immediately and shows the what-if ghost in Views 1 and 3. **Done** commits; **Cancel** restores.

**Scenario setup** (separate tab in the same panel)

- Target circular altitude (default 420 km).
- Chaser initial state, entered either as LVLH offset (V-bar, R-bar in m or km, co-circular velocity assumed) or as its own circular altitude plus phase angle.
- Scenario duration (in Target revolutions).

**Validation**

- TIG must fall inside the scenario; out-of-range burns are flagged red and skipped.
- Two burns at the same TIG show a warning (they are applied in list order).
- |Δv| above 50 m/s shows a warning, not a block.

**Saving and sharing**

- Autosave the working scenario to localStorage.
- Export / import as a JSON file.
- **Copy link:** encodes the scenario as base64 JSON in the URL hash, so a plan can be shared with no server.
- Undo / redo for every edit.

**Later (v1.1, not required for v1):** targeting helpers — “Hohmann to Target altitude”, “Hop to V-bar distance d”, “Circularize” — that fill in burns automatically; dragging a Δv arrow handle directly in View 2.

## Simulation model

Exact two-body motion around a point-mass Earth, with impulsive burns, precomputed into a timeline whenever the scenario changes. No linearized (CW) propagation anywhere in the sim — CW is used only to design preset hops — so long-range phasing and close approach are both correct.

**Constants:** μ = 3.986004418 × 10¹⁴ m³/s², Rₑ = 6378.137 km. SI units internally (m, s, rad); display switches from m to km above 10 km.

**Propagation**

- State per vehicle: position and velocity in the shared orbit plane (2D). v1 is coplanar: no initial state or burn leaves the plane.
- Between burns, propagate analytically (Kepler's equation / universal variables). No numerical integrator, so no energy drift.
- At each TIG: rotate the Chaser's Δv from its local frame (R, S) to the inertial frame and add it to the velocity.
- **Timeline:** after any edit, sample both vehicles every 10 s from T+0 to the end, plus exact states at every TIG. Views read from the timeline (interpolating between samples) and propagate exactly for the “now” dot. Target: rebuild in under 10 ms for a 5-orbit scenario.

**ECI → Target LVLH**

Unit vectors from the Target's state, then the relative state. The relative velocity must remove the frame's rotation — the most common bug in this kind of tool.

```latex
\hat{R} = \frac{\mathbf{r}_t}{|\mathbf{r}_t|}, \quad \hat{W} = \frac{\mathbf{r}_t \times \mathbf{v}_t}{|\mathbf{r}_t \times \mathbf{v}_t|}, \quad \hat{S} = \hat{W} \times \hat{R}
```

```latex
\boldsymbol{\rho} = \mathbf{r}_c - \mathbf{r}_t, \quad \boldsymbol{\omega} = \frac{\mathbf{r}_t \times \mathbf{v}_t}{|\mathbf{r}_t|^2}, \quad \dot{\boldsymbol{\rho}}_{LVLH} = C\,(\mathbf{v}_c - \mathbf{v}_t - \boldsymbol{\omega} \times \boldsymbol{\rho})
```

C is the matrix with rows Ŕ and Ŝ. V-bar = Ŝ component, R-bar = Ŕ component. Ŵ appears only to build Ŝ; in the 2D implementation Ŝ is simply Ŕ rotated 90° toward the direction of motion.

**Curvilinear vs rectilinear.** In rectilinear LVLH, a Chaser 493 km behind on the same circular orbit appears about 18 km *below* the Target, purely because the orbit curves away from the straight V-bar axis. The rendezvous plot therefore defaults to curvilinear coordinates: V-bar = Target radius × phase angle (arc length), R-bar = |r\_c| − |r\_t|. View 2 uses rectilinear (it only matters at long range, where View 2 is zoomed out anyway); the toggle in View 3 lets the viewer see the difference.

**Accuracy tests**

- A co-circular Chaser stays fixed in curvilinear LVLH to within 1 m over 10 orbits.
- Energy and angular momentum of each vehicle are constant between burns to 1 part in 10⁹.
- A 0.1 m/s radial burn traces a closed 2:1 loop (about 89 m radial by 355 m along-track) and returns to its start within 1 m after one orbit.

## Architecture and tech stack

A static, client-only TypeScript app: a pure physics core, one scenario store, and three canvas views that each draw “the state at time t” from a shared, precomputed timeline.

&#91;embedded content: data flow · edit → timeline → views\]

Edits flow left to right into a rebuilt timeline; the clock picks a time and all three views draw it. Views also write back: scrubbing sets the clock, and tapping a burn marker selects it in the editor.

**Stack**

- TypeScript + Vite. No UI framework required; Preact is acceptable for the panels if it simplifies the editor.
- Canvas 2D for the three views (handle devicePixelRatio; thousands of points at 60 fps on phones). DOM + CSS for controls. Design tokens as CSS custom properties.
- Vitest for physics and preset tests; Playwright screenshot checks at 1440 × 900 and 390 × 844.
- Static build, no backend. Deploy to GitHub Pages with a GitHub Actions workflow on every push to main.

**Repo:** work in the existing Rendezvous repo if one exists; otherwise create a new one. Write all code fresh — do not reuse the earlier `orbit.js` or `orbit-viz.html`.

| Folder | Contents | Rule |
| --- | --- | --- |
| `src/physics/` | kepler.ts, frames.ts (inertial ↔ LVLH, RS), burns.ts, timeline.ts | Pure functions, no DOM; fully unit tested |
| `src/scenarios/` | presets/\*.json, schema.ts | Every scenario validated against the schema on load |
| `src/state/` | store.ts (scenario, undo/redo), clock.ts | Single source of truth |
| `src/views/` | InertialView, LvlhView, RendezvousPlot | Each exposes `render(t)` and reads the timeline |
| `src/ui/` | PlaybackBar, BurnEditor, ScenarioPicker, Telemetry | Writes only through the store or clock |
| `src/styles/` | tokens.css | Values from Visual design |

**Scenario JSON** (shape of each preset file and of export/import)

```json
{
  "name": "V-bar approach",
  "target": { "altitudeKm": 420 },
  "chaser": { "lvlh": { "vbarM": -5000, "rbarM": 0, "vVbarMps": 0, "vRbarMps": 0 } },
  "durationS": 9600,
  "burns": [
    { "name": "Hop 1", "tigS": 300, "dv": { "r": -1.126, "s": 0 }, "enabled": true }
  ]
}
```

## Acceptance criteria

v1 is done when every item below passes on desktop Chrome, Safari and Firefox, and on iPhone Safari and Android Chrome.

- [ ] All three views render the same instant; scrubbing or playing moves all three together with no visible lag.
- [ ] 60 fps playback at 600× on a mid-range phone (e.g. iPhone 12, Pixel 6).
- [ ] Desktop (≥ 1200 px) shows all three views at once; phone (390 × 844) shows one view with the segmented control and a working bottom sheet.
- [ ] Presets 1–4 reach the end states in the Preset table within the stated tolerances (automated tests).
- [ ] Physics accuracy tests in Simulation model pass.
- [ ] Adding, editing, disabling and deleting a burn updates the predicted trajectory within one frame, with the what-if ghost shown while editing.
- [ ] Past is solid and future is dashed on the rendezvous plot, and the “now” dot sits exactly at the split.
- [ ] Altitude exaggeration factor is always visible in View 1's title row. Views 2 and 3 switch between Auto and Manual scaling as specified, Manual ranges survive burn edits, and Reset to Auto restores the fit.
- [ ] Scenario survives a reload (localStorage) and round-trips through JSON export/import and the share link.
- [ ] Keyboard shortcuts work; every control is reachable by keyboard with a visible focus ring.
- [ ] Text meets 4.5:1 contrast; Target and Chaser are distinguishable in a grayscale screenshot by shape alone.

## Decisions

| Question | Decision |
| --- | --- |
| Reuse earlier orbit.js / orbit-viz.html? | No. Fresh code; existing repo if there is one, else a new repo |
| V-bar direction on plots | + (ahead) to the left |
| Does the Target burn? | No, never |
| R-bar approach preset? | Yes — preset 4 |
| Sunrise/sunset on the plot? | No |
| Hosting | GitHub Pages via GitHub Actions |

Also decided: v1 is coplanar (no cross-track Δv, no H-bar); burns are impulsive (instantaneous Δv), and the UI uses IBM Plex Sans and IBM Plex Mono, as in the mockups.
