// End-to-end behaviour checks in a real browser. Usage: npm run build && node scripts/e2e.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const PORT = 4180;
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
const browser = await chromium.launch({ executablePath: exe });
let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n    ${e.message.split('\n').join('\n    ')}`);
  }
}
const R = (page, fn, arg) => page.evaluate(fn, arg);

// ---------- desktop ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.goto(base + '?preset=phasing');
  await page.waitForTimeout(300);
  console.log('desktop 1440×900');

  await check('all three views and the burn drawer are visible', async () => {
    for (const id of ['#view-inertial', '#view-lvlh', '#view-plot', '.editor']) assert.ok(await page.locator(id).isVisible(), id);
    assert.match(await page.locator('.panel-head').first().innerText(), /Altitude ×30/);
  });

  await check('Space plays and pauses; time advances at 120×', async () => {
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
    await page.keyboard.press('Space');
    const t = await R(page, () => window.rendezvous.clock.t);
    assert.ok(t > 30 && t < 200, `t=${t}`);
  });

  await check('[ and ] change speed; ← / → jump between burns', async () => {
    await page.keyboard.press(']');
    assert.equal(await R(page, () => window.rendezvous.clock.speed), 300);
    await page.keyboard.press('[');
    await page.keyboard.press('ArrowRight');
    assert.equal(await R(page, () => window.rendezvous.clock.t), 2700);
    await page.keyboard.press('ArrowRight');
    assert.equal(await R(page, () => window.rendezvous.clock.t), 5468);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await R(page, () => window.rendezvous.clock.t), 2700);
  });

  await check('B adds a burn at the current time; editing re-propagates with a ghost; Done commits', async () => {
    await R(page, () => window.rendezvous.clock.setTime(1200));
    await page.keyboard.press('b');
    await page.waitForTimeout(50);
    assert.ok(await page.locator('.burn-form .form').isVisible());
    assert.equal(await page.locator('.burn-form input[aria-label="Time of ignition (MET)"]').inputValue(), 'T+00:20:00');
    const before = await R(page, () => window.rendezvous.store.timeline.curvV.at(-1));
    const input = page.locator('.burn-form input[aria-label="Along-track Δv, m/s"]');
    await input.fill('1.5');
    await page.waitForTimeout(50);
    const after = await R(page, () => window.rendezvous.store.timeline.curvV.at(-1));
    assert.notEqual(Math.round(before), Math.round(after));
    assert.ok(await R(page, () => window.rendezvous.store.ghost !== null), 'ghost shown while editing');
    await page.locator('.btn-done').click();
    assert.equal(await R(page, () => window.rendezvous.store.scenario.burns.length), 3);
    assert.ok(await R(page, () => window.rendezvous.store.ghost === null));
  });

  await check('Shift+arrow steps Δv by 0.1, arrow by 0.01', async () => {
    await page.locator('.burn-row:not(.burn-row-head)').first().click();
    const input = page.locator('.burn-form input[aria-label="Radial Δv, m/s"]');
    await input.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    assert.equal(await R(page, () => window.rendezvous.store.draft.dv.r), 0.11);
    await page.locator('.btn-cancel').click();
    assert.equal(await R(page, () => window.rendezvous.store.scenario.burns[0].dv.r), 0);
  });

  await check('Z undoes, Shift+Z redoes', async () => {
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('z');
    assert.equal(await R(page, () => window.rendezvous.store.scenario.burns.length), 2);
    await page.keyboard.press('Shift+Z');
    assert.equal(await R(page, () => window.rendezvous.store.scenario.burns.length), 3);
  });

  await check('disabling a burn removes it from the propagation; delete works', async () => {
    await page.locator('.burn-row input[type=checkbox]').first().uncheck();
    assert.equal(await R(page, () => window.rendezvous.store.timeline.burns.length), 2);
    await page.locator('.row-act[aria-label^="Delete"]').first().click();
    assert.equal(await R(page, () => window.rendezvous.store.scenario.burns.length), 2);
  });

  await check('scenario survives a reload (localStorage)', async () => {
    await R(page, () => window.rendezvous.store.updateSetup((s) => (s.name = 'Reload test')));
    await page.waitForTimeout(400);
    await page.goto(base);
    const s1 = await R(page, () => JSON.stringify(window.rendezvous.store.scenario));
    await page.reload();
    await page.waitForTimeout(300);
    const s2 = await R(page, () => JSON.stringify(window.rendezvous.store.scenario));
    assert.equal(s2, s1);
    assert.ok(await R(page, () => window.rendezvous.store.edited));
  });

  await check('share link round-trips the scenario', async () => {
    const s1 = await R(page, () => JSON.stringify(window.rendezvous.store.scenario));
    const hash = await page.evaluate(async () => {
      const m = await import('/src/state/persist.ts').catch(() => null);
      return m ? m.encodeShareHash(window.rendezvous.store.scenario) : null;
    });
    // Built app: use the Copy link button and read the clipboard fallback from the address bar.
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy link' }).click();
    await page.waitForTimeout(100);
    const url = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(url.includes('#s='), url);
    const p2 = await ctx.newPage();
    await p2.evaluate(() => 0);
    await p2.goto(base);
    await p2.evaluate(() => localStorage.clear());
    await p2.goto(url);
    await p2.waitForTimeout(300);
    assert.equal(await p2.evaluate(() => JSON.stringify(window.rendezvous.store.scenario)), s1);
    await p2.close();
    void hash;
  });

  await check('JSON export downloads a valid scenario', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export scenario as JSON' }).click()]);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    const s = JSON.parse(text);
    assert.equal(s.burns.length, 2);
  });

  await check('JSON import loads a scenario', async () => {
    const f = path.join(os.tmpdir(), 'rv-import.json');
    fs.writeFileSync(f, fs.readFileSync('src/scenarios/presets/3-vbar.json'));
    await page.locator('input[type=file]').setInputFiles(f);
    await page.waitForTimeout(200);
    assert.equal(await R(page, () => window.rendezvous.store.scenario.name), 'V-bar approach');
  });

  await check('rendezvous plot: drag the now dot scrubs; wheel switches to Manual; Manual survives edits; double-click restores Auto', async () => {
    await R(page, () => {
      window.rendezvous.store.loadPreset('phasing');
      window.rendezvous.clock.setTime(3900);
    });
    await page.waitForTimeout(100);
    const canvas = page.locator('#view-plot canvas');
    const box = await canvas.boundingBox();
    const plot = await R(page, () => window.rendezvous.views.plot.nowPt);
    await page.mouse.move(box.x + plot.x, box.y + plot.y);
    await page.mouse.down();
    await page.mouse.move(box.x + plot.x + 40, box.y + plot.y + 30, { steps: 5 });
    await page.mouse.up();
    const t = await R(page, () => window.rendezvous.clock.t);
    assert.ok(t < 3900 - 60, `scrubbed t=${t}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(50);
    assert.equal(await R(page, () => window.rendezvous.views.plot.mode), 'manual');
    const m1 = await R(page, () => JSON.stringify(window.rendezvous.views.plot.manual));
    await R(page, () => {
      const st = window.rendezvous.store;
      st.beginEdit(1);
      st.updateDraft((b) => (b.dv.s = 18.8));
      st.commitEdit();
    });
    await page.waitForTimeout(50);
    assert.equal(await R(page, () => JSON.stringify(window.rendezvous.views.plot.manual)), m1);
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(await R(page, () => window.rendezvous.views.plot.mode), 'auto');
  });

  await check('right-click on the trajectory offers "Add burn here"', async () => {
    await page.keyboard.press('Escape');
    const canvas = page.locator('#view-plot canvas');
    const box = await canvas.boundingBox();
    const p = await R(page, () => window.rendezvous.views.plot.nowPt);
    await page.mouse.click(box.x + p.x, box.y + p.y, { button: 'right' });
    await page.waitForTimeout(50);
    const item = page.locator('.menu-item', { hasText: 'Add burn here' });
    assert.ok(await item.isVisible());
    const n = await R(page, () => window.rendezvous.store.scenario.burns.length);
    await item.click();
    assert.equal(await R(page, () => window.rendezvous.store.scenario.burns.length), n + 1);
    await page.locator('.btn-cancel').click();
  });

  await check('LVLH view: wheel → Manual, Reset to Auto from the popover', async () => {
    const canvas = page.locator('#view-lvlh canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 300);
    assert.equal(await R(page, () => window.rendezvous.views.lvlh.mode), 'manual');
    await page.locator('#view-lvlh .chip-mono').click();
    await page.getByRole('button', { name: 'Reset to Auto' }).click();
    assert.equal(await R(page, () => window.rendezvous.views.lvlh.mode), 'auto');
  });

  await check('keyboard focus is visible (focus ring uses --accent)', async () => {
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineColor);
    assert.match(outline, /124, 156, 255/);
  });

  await check('timeline rebuild for a 5-orbit scenario is under 10 ms', async () => {
    const ms = await R(page, () => {
      const st = window.rendezvous.store;
      st.updateSetup((s) => {
        s.durationRevs = 5;
      });
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) st.updateSetup((s) => (s.target.altitudeKm = 420 + (i % 2)));
      return (performance.now() - t0) / 20;
    });
    console.log(`    rebuild ${ms.toFixed(2)} ms`);
    assert.ok(ms < 10, `${ms} ms`);
  });

  await check('no page errors', async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// ---------- phone ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '?preset=phasing&t=3900');
  await page.waitForTimeout(300);
  console.log('phone 390×844');

  await check('one view at a time with the segmented control', async () => {
    assert.ok(await page.locator('#view-plot').isVisible());
    assert.ok(!(await page.locator('#view-inertial').isVisible()));
    await page.getByRole('tab', { name: 'Orbits' }).tap();
    assert.ok(await page.locator('#view-inertial').isVisible());
    assert.ok(!(await page.locator('#view-plot').isVisible()));
    await page.getByRole('tab', { name: 'Plot' }).tap();
  });

  await check('touch targets in the dock are at least 44 × 44', async () => {
    for (const el of await page.locator('.dock button').all()) {
      if (!(await el.isVisible())) continue;
      const b = await el.boundingBox();
      assert.ok(b.width >= 44 && b.height >= 44, `${await el.getAttribute('aria-label')} ${b.width}×${b.height}`);
    }
  });

  await check('bottom sheet: tapping a burn opens the edit form at half height; Done returns to peek', async () => {
    assert.equal(await page.locator('.sheet').getAttribute('data-state'), 'peek');
    await page.locator('.sheet .burn-row', { hasText: 'Circularize' }).tap();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.sheet').getAttribute('data-state'), 'half');
    assert.ok(await page.locator('.sheet .form').isVisible());
    await page.locator('.sheet .btn-done').tap();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.sheet').getAttribute('data-state'), 'peek');
  });

  await check('sheet handle cycles peek → half → full', async () => {
    await page.locator('.sheet-handle').tap();
    assert.equal(await page.locator('.sheet').getAttribute('data-state'), 'half');
    await page.locator('.sheet-handle').tap();
    assert.equal(await page.locator('.sheet').getAttribute('data-state'), 'full');
    await page.locator('.sheet-handle').tap();
    assert.equal(await page.locator('.sheet').getAttribute('data-state'), 'peek');
  });

  await check('60 fps playback at 600× (4× CPU throttle)', async () => {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await R(page, () => {
      const c = window.rendezvous.clock;
      c.setSpeed(600);
      c.setSlowNearBurns(false);
      c.setLoop(true);
      c.play();
    });
    const fps = await page.evaluate(
      () =>
        new Promise((res) => {
          let n = 0;
          const t0 = performance.now();
          const f = () => {
            n++;
            if (performance.now() - t0 < 2000) requestAnimationFrame(f);
            else res((n * 1000) / (performance.now() - t0));
          };
          requestAnimationFrame(f);
        }),
    );
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(`    ${fps.toFixed(1)} fps`);
    assert.ok(fps > 50, `${fps} fps`);
  });

  await check('no page errors', async () => assert.deepEqual(errors, []));
  await ctx.close();
}

await browser.close();
server?.kill();
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
