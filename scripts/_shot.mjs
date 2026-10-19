import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4182', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:4182/?preset=phasing&t=1620');
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => {
  const v = window.rendezvous.views.lvlh;
  v.mode = 'manual'; v.manualSpan = 80000; v.center = { v: -250000, r: -40000 };
  window.rendezvous.views.plot.coords = 'rect';
  window.rendezvous.clock.setTime(1621);
});
await page.waitForTimeout(400);
await page.locator('#view-lvlh').screenshot({ path: 'screenshots/fix-lvlh.png' });
await page.locator('#view-plot').screenshot({ path: 'screenshots/fix-plot-rect.png' });
console.log(await page.evaluate(() => { const r = window.rendezvous; return JSON.stringify(r.store.timeline && null); }));
await b.close(); server.kill();
