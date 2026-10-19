# Rendezvous Simulator

A browser app that shows a Target and a Chaser spacecraft in two synchronized views: inertial orbits and the LVLH rendezvous plot (whole scenario, or following the Chaser in at equal scale). It lets you watch two elliptical orbits turn into a relative-motion plot. You can play the five preset scenarios, or add your own burns and see the predicted trajectory change while you type.

- Spec: [`docs/prompt.md`](docs/prompt.md) · Mockups: [`docs/mockups/`](docs/mockups/) · Build decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Static TypeScript + Vite app, Canvas 2D views, no backend. Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## Develop

```sh
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest: physics, presets, store, clock, persistence
npm run build      # type-check + production build into dist/
npm run e2e        # browser checks against the build (needs Chromium; see below)
npm run screenshots  # PNGs at the mockup viewports into screenshots/
```

`e2e` and `screenshots` use `playwright-core`. They pick up Chromium from `CHROMIUM_PATH`, or use the build installed by `npx playwright-core install chromium`. They serve `dist/` locally unless `BASE_URL` points them at a running or deployed site, e.g. `BASE_URL=https://michaeljboyle.github.io/rendezvous/ npm run e2e`. CI runs both on every PR, and again against the live site after each deploy; screenshots are uploaded as a workflow artifact.

Deep links for demos and checks: `?preset=phasing|undock|vbar|rbar|sandbox`, `&t=<seconds>`, `&view=orbits|plot` (phone). A share link (`#s=…`) carries a whole scenario.

## Layout

| Folder | Contents |
| --- | --- |
| `src/physics/` | `kepler.ts` (universal-variable propagation), `frames.ts` (ECI ↔ LVLH, rectilinear and curvilinear), `burns.ts`, `timeline.ts`, `targeting.ts` (two-body shooting, used to design preset 4). Pure functions with no DOM access. |
| `src/scenarios/` | `schema.ts` (validation), `presets/*.json`, `presets.ts` |
| `src/state/` | `store.ts` (scenario, edit session, undo/redo), `clock.ts`, `persist.ts` (localStorage, share link, JSON) |
| `src/views/` | `InertialView`, `RendezvousPlot` (each has `render(t)`), canvas and gesture helpers |
| `src/ui/` | `PlaybackBar`, `BurnEditor`, `Header` (scenario picker, share, settings), DOM helpers |
| `src/styles/` | `tokens.css` (design tokens), `app.css` |

## Keyboard

Space play/pause · ← / → previous / next burn · [ / ] slower / faster · B add burn at current time · Z undo · Shift+Z redo · Esc cancel edit.
