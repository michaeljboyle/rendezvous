// Screenshot checks at the mockup viewports. Usage: npm run build && node scripts/screenshots.mjs
// Serves dist/ with `vite preview` and writes PNGs to screenshots/.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 4179;
// BASE_URL tests an already-running or deployed site (e.g. GitHub Pages); otherwise serve dist/ locally.
const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const server = process.env.BASE_URL ? null : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/?$/, '/') : `http://localhost:${PORT}/`;
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 200));
}
fs.mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ executablePath: exe });
const shots = [
  { name: 'desktop', vp: { width: 1440, height: 1000 }, q: '?preset=phasing&t=3900' },
  { name: 'desktop-900', vp: { width: 1440, height: 900 }, q: '?preset=phasing&t=3900' },
  { name: 'tablet', vp: { width: 1024, height: 768 }, q: '?preset=phasing&t=3900' },
  { name: 'phone-plot', vp: { width: 390, height: 844 }, q: '?preset=phasing&t=3900&view=plot', mobile: true },
  { name: 'phone-sheet-peek', vp: { width: 390, height: 844 }, q: '?preset=phasing&t=3900&view=plot', mobile: true, sheet: 'peek' },
  { name: 'phone-orbits', vp: { width: 390, height: 844 }, q: '?preset=phasing&t=3900&view=orbits', mobile: true },
  { name: 'phone-editor', vp: { width: 390, height: 844 }, q: '?preset=phasing&t=3900&view=plot', mobile: true, edit: true },
  { name: 'phone-landscape', vp: { width: 844, height: 390 }, q: '?preset=phasing&t=3900', mobile: true },
  // Chaser 350 km circular, ~300 km behind: it must sit on its Ap/Pe line(s) in both coordinate modes.
  { name: 'plot-long-range-curv', vp: { width: 1440, height: 1000 }, q: '?preset=phasing&t=1620', plotManual: { vMin: -380000, vMax: -180000, rMin: -110000, rMax: 10000 }, clip: '#view-plot' },
  { name: 'plot-long-range-rect', vp: { width: 1440, height: 1000 }, q: '?preset=phasing&t=1620', plotManual: { vMin: -380000, vMax: -180000, rMin: -110000, rMax: 10000 }, rect: true, clip: '#view-plot' },
  // Follow mode close in, with the keep-out sphere and approach ellipsoid.
  { name: 'plot-follow-vbar', vp: { width: 1440, height: 1000 }, q: '?preset=vbar&t=8000', follow: true, overlays: true, clip: '#view-plot' },
  { name: 'phone-follow', vp: { width: 390, height: 844 }, q: '?preset=phasing&t=3900&view=plot', mobile: true, follow: true },
  // Orbits zoomed in hard around the Target: orbits and trails must stay smooth curves.
  { name: 'orbits-zoom', vp: { width: 1440, height: 1000 }, q: '?preset=phasing&t=3900', orbitsZoom: 12, clip: '#view-inertial' },
  { name: 'desktop-multiphase', vp: { width: 1440, height: 1000 }, q: '?preset=multiphase&t=12000' },
  { name: 'desktop-multiphase-final', vp: { width: 1440, height: 1000 }, q: '?preset=multiphase&t=23500', follow: true, overlays: true },
  { name: 'desktop-vbar', vp: { width: 1440, height: 1000 }, q: '?preset=vbar&t=4000' },
  { name: 'desktop-rbar', vp: { width: 1440, height: 1000 }, q: '?preset=rbar&t=2000' },
  { name: 'desktop-undock', vp: { width: 1440, height: 1000 }, q: '?preset=undock&t=7000' },
];
const only = process.argv[2];
const errors = [];
for (const s of shots) {
  if (only && !s.name.includes(only)) continue;
  const ctx = await browser.newContext({ viewport: s.vp, deviceScaleFactor: 2, isMobile: !!s.mobile, hasTouch: !!s.mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${s.name}: ${m.text()}`));
  await page.goto(base + s.q);
  await page.evaluate(() => document.fonts.ready);
  if (s.edit) {
    await page.evaluate(() => {
      const r = window.rendezvous;
      r.store.beginEdit(1);
      r.store.updateDraft((b) => (b.dv.s = 18.8));
    });
  }
  if (s.rect) await page.evaluate(() => window.rendezvous.settings.setCoords('rect'));
  if (s.sheet) await page.evaluate((st) => localStorage.setItem('rendezvous:sheet', st), s.sheet).then(() => page.reload());
  if (s.orbitsZoom) {
    await page.evaluate((z) => {
      const v = window.rendezvous.views.inertial;
      v.camera = 'follow';
      v.cam.set('follow');
      v.zoom = z;
      window.rendezvous.clock.setTime(window.rendezvous.clock.t);
    }, s.orbitsZoom);
  }
  if (s.plotManual || s.follow || s.overlays) {
    await page.evaluate((s) => {
      const p = window.rendezvous.views.plot;
      if (s.plotManual) {
        p.setMode('manual');
        p.manual = s.plotManual;
      }
      if (s.follow) p.setMode('follow');
      if (s.overlays) p.setOverlays(true);
    }, s);
  }
  await page.waitForTimeout(500);
  if (s.clip) await page.locator(s.clip).screenshot({ path: `screenshots/${s.name}.png` });
  else await page.screenshot({ path: `screenshots/${s.name}.png` });
  await ctx.close();
}
await browser.close();
server?.kill();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('screenshots written to screenshots/');
