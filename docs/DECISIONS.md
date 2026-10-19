# Build decisions

These are choices made while building v1 where the spec was silent, ambiguous, or in conflict with itself or the mockups. Where the spec and a mockup disagreed, the spec won.

## Physics and presets

1. **Preset 1 is an exact Hohmann transfer: initial phase −4.156846°, Δv 19.89072 / 19.83932 m/s, Circularize at T+5467.60 s.** The table's values round these: −4.16°, 19.89 / 19.84 m/s, T+01:31:08. The rounded Δvs leave a ±16 m residual ellipse (Ap/Pe 420.016/419.984 km). With exactly −4.16° the Chaser ends 5.38 km behind instead of 5 km, and the T+01:05:00 cross-check misses by 0.37 km on V-bar. The exact values end in a 420.000 km circular orbit, exactly 5.000 km behind. Every cross-check value matches to the stated rounding: range 51.26 km, rate −74.96 m/s, altitude 377.9 km, Ap/Pe 420.0/350.0, phase −0.25°, V −29.19 km, R −42.14 km. A test checks the orbit ends circular to within metres.
2. **Preset 4 Δvs are refined by two-body shooting** (`src/physics/targeting.ts`), starting from the CW values. In exact two-body, the 3-decimal CW values miss the short legs: leg 4 lands 4 m off on a 40 m leg, against a 2% tolerance. The refined values differ by at most 0.4 mm/s and round to the table's values, except Leg 2 R (2.532 vs 2.531). All waypoints are hit to well under 1 m.
3. **Preset 3 uses the table's values unchanged.** The hop test checks each hop's displacement against 4·Δv/n to 1%, and all three pass. Small arrival errors carry over from hop to hop, so the Chaser holds at −33 m rather than −30 m.
4. **LVLH initial offsets are curvilinear** (V-bar = arc length, R-bar = altitude difference). Velocity is relative to the rotating frame and defaults to 0, which means "at rest in LVLH". With R-bar = 0 this is exactly co-circular, as presets 3 and 5 need. With R-bar ≠ 0 the Chaser is at rest in LVLH, as preset 4 needs. The Scenario setup tab labels the option "LVLH offset (at rest in LVLH)".
5. **Schema additions:** optional `durationRevs` (presets 2 and 5 last 3 revolutions), `chaser.circular {altitudeKm, phaseDeg}` as an alternative to `chaser.lvlh`, and `description`.
6. The Target starts at the top of the fixed inertial view and orbits counter-clockwise.
7. Propagation uses universal variables, so escape trajectories from very large burns still propagate and draw.

## Views

8. **There is no separate LVLH-now view (spec View 2); the rendezvous plot does its job.** Everything View 2 showed is now on the plot:
   - a **Follow** scaling mode: centred on the Target at equal scale, stepping 50 m → 200 m → 1 km → 5 km → 20 km → 100 km → 500 km with range and easing between steps over 300 ms
   - the **KOS / AE** overlay (200 m keep-out sphere, 4 × 2 km approach ellipsoid), drawn in the plot's own scale
   - the **relative-velocity arrow** with its speed readout
   - View 2's telemetry: range, range rate, V/R and time to next burn

   The scaling control reads **Fit · Follow · Manual**; Fit is the spec's Auto. Desktop shows Inertial | Plot side by side. Tablet puts both views on top and the burn editor across the bottom. Phone tabs are Orbits · Plot.
9. **The plot is curvilinear by default** (V-bar = arc length, R-bar = altitude difference), with a Curvilinear/Rectilinear toggle. At long range, rectilinear coordinates put a circular Chaser visibly below its own Ap/Pe altitude: 293 km downrange it shows R −76.4 km for a 70 km altitude difference, because constant altitude curves away by about V²/2r. In rectilinear mode the Ap/Pe markers are therefore drawn as true constant-altitude arcs. The V/R telemetry follows the selected frame: at T+01:05 it reads V −29.37 R −42.08 km in curvilinear, and the CLAUDE.md cross-check values (−29.19 / −42.14) in rectilinear.
9a. **The velocity arrow shows the relative-velocity magnitude** (85.0 m/s at T+01:05 in curvilinear), as the spec describes for View 2. The mockup's label shows 75.0 m/s, which is the range rate. The arrow is the Chaser's displacement over 1/12 of an orbit, mapped through the plot's axes so it follows the trajectory's slope even when the axes are stretched, and clamped so it stays readable.
10. Clicking the altitude-exaggeration chip cycles through 1× → 10× → 30× → 100×. Follow Target mode zooms in 3.5× around the Target. Wheel, pinch and drag zoom and pan in both camera modes, and double-click fits.
11. The plot's **True shape** toggle (equal scale in Fit) lives in the axis popover, together with Lock aspect, the coordinates toggle and KOS/AE. With Lock aspect on, single-axis zooms (Shift- or Alt-wheel, axis-label drags, one-direction pinches) zoom both axes.
12. Disabled and out-of-range burns are not drawn in the views because they never happen. They stay greyed or flagged red in the list.
13. Tick and label collisions are resolved by trying alternative positions and dropping a label that still collides. A crowded burn falls back to its number only.
13a. **Orbits panel drawing.** Labels placed along a radial direction use hysteretic left / centred / right alignment, so they can't flip sides from frame to frame (e.g. the Target label in Follow mode). Off-screen burns get no marker or label. Orbits, trails and the what-if path sample adaptively: only the on-screen part is subdivided to ~3 px chords, with trails using exact propagation, so curves stay smooth at any zoom.

## Playback and editing

14. **Space is a global play/pause.** Focused buttons still activate with Enter. Arrow keys inside the scrubber move time by ±60 s (±10 min with Shift) instead of jumping between burns.
15. Previous/next burn jumps to the exact TIG, where the state shown is just after the burn. "Slow near burns" sub-steps each frame, so 600× can never skip the ±60 s window.
16. **One edit session is one undo step:** everything from opening a burn to Done. Pressing Z during an edit cancels it. Toggle, duplicate, delete, setup changes and loading a preset are each one undo step.
17. The burn array is re-sorted by TIG when each edit is committed. Burn numbers are ranks by TIG, and ties are applied in list order.
18. Tapping a burn marker or list row opens that burn in the editor, so selecting and editing are the same action.
19. The share link is read once on load and then cleared from the address bar, so later edits autosave to localStorage. Autosave stores the committed scenario, never a half-finished edit.
20. A deep-link query (`?preset=`, `&t=`, `&view=`) was added for demos and automated checks.
21. Δv values show 2 decimals, or 3 below 0.1 m/s, so preset 3's 0.048 m/s hop stays visible.

## Layout

22. **Phone:** the plot's title row keeps only the scale chip. Curvilinear, Fit/Follow/Manual and KOS/AE move into the axis popover to fit 390 px, and any gesture still switches to Manual. On tablet only Curvilinear and KOS/AE move there. The telemetry row under each view collapses with a toggle.
23. **Phone swipe** between views starts at the canvas edges (24 px) or on the title and telemetry rows, because a drag inside a canvas pans it.
24. Undo/redo buttons sit in the burn drawer header on desktop and tablet, and in the ⋮ menu on phone.
25. Phone landscape (height < 500 px) shows Orbits + Plot side by side with the sheet collapsed to its header.
26. Fonts are bundled with `@fontsource`, so there is no third-party font request.

## Testing

27. Browser checks use `playwright-core` scripts (`scripts/e2e.mjs`, `scripts/screenshots.mjs`), not the `@playwright/test` runner. CI runs them on every PR against the build (the `browser` job, which uploads the screenshots as an artifact). After each deploy, the `smoke` job runs them again against the live Pages URL (`BASE_URL`).
28. Verified in Chromium at 1440 × 900/1000, 1024 × 768, 390 × 844 and 844 × 390, including 60 fps at 600× under 4× CPU throttling. Safari, Firefox and real iPhone/Android devices have not been tested yet.
