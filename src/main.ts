import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/tokens.css';
import './styles/app.css';

import { presetById } from './scenarios/presets';
import { Clock } from './state/clock';
import { Store } from './state/store';
import { ViewSettings } from './state/viewSettings';
import { decodeShareHash, loadLocal, saveLocal } from './state/persist';
import { BurnEditor } from './ui/BurnEditor';
import type { AppCtx, View } from './ui/context';
import { closePopover, h, icon, toast } from './ui/dom';
import { Header } from './ui/Header';
import { PlaybackBar } from './ui/PlaybackBar';
import { InertialView } from './views/InertialView';
import { RendezvousPlot } from './views/RendezvousPlot';
import type { Scenario } from './scenarios/schema';

// ----- initial scenario: share link > autosave > preset 1 -----
const params = new URLSearchParams(location.search);
let initial: { scenario: Scenario; presetId: string | null; edited: boolean } | null = null;
let hashError: string | null = null;
try {
  const shared = decodeShareHash(location.hash);
  if (shared) initial = { scenario: shared, presetId: null, edited: true };
} catch (e) {
  hashError = (e as Error).message;
}
const presetParam = params.get('preset');
if (!initial && presetParam && presetById(presetParam)) initial = { scenario: presetById(presetParam)!.scenario, presetId: presetParam, edited: false };
if (!initial) initial = loadLocal();
if (!initial) initial = { scenario: presetById('phasing')!.scenario, presetId: 'phasing', edited: false };
if (location.hash.startsWith('#s=')) history.replaceState(null, '', location.pathname + location.search);

const store = new Store(initial.scenario, initial.presetId, initial.edited);
const clock = new Clock();
const settings = new ViewSettings();
let dirty = true;
const app: AppCtx = {
  store,
  clock,
  settings,
  invalidate: () => {
    dirty = true;
  },
};

const syncClock = () =>
  clock.setTimeline(
    store.duration,
    store.timeline.burns.map((b) => b.tig),
  );
syncClock();
const t0 = Number(params.get('t'));
if (Number.isFinite(t0) && t0 > 0) clock.setTime(t0);

let saveTimer = 0;
store.subscribe((reason) => {
  syncClock();
  if (reason === 'load') clock.setTime(Math.min(clock.t, store.duration));
  dirty = true;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveLocal({ scenario: store.editing ? store.editing.snapshot : store.scenario, presetId: store.presetId, edited: store.edited }), 300);
});
clock.subscribe(() => (dirty = true));
settings.subscribe(() => (dirty = true));

// ----- components -----
const inertial = new InertialView(app);
const plot = new RendezvousPlot(app);
const views: View[] = [inertial, plot];
const playback = new PlaybackBar(app);
const header = new Header(app);
const editor = new BurnEditor(app);

// ----- layout skeleton -----
type Layout = 'desktop' | 'tablet' | 'phone' | 'phone-landscape';
type PhoneView = 'orbits' | 'plot';
const PHONE_VIEWS: PhoneView[] = ['orbits', 'plot'];
let phoneView: PhoneView = (params.get('view') as PhoneView) || 'plot';
if (!PHONE_VIEWS.includes(phoneView)) phoneView = 'plot';

const root = document.getElementById('app')!;
const logo = h('div', { class: 'logo' }, icon('logo', 22, 1.6), h('span', { class: 'logo-text' }, 'Rendezvous'));
const centerSlot = h('div', { class: 'header-center' });
const topbar = h('header', { class: 'topbar' }, logo, header.picker, centerSlot, header.actions, header.more);
const scrubRow = h('div', { class: 'scrub-row' });
const tabBtns = PHONE_VIEWS.map((v) =>
  h('button', { type: 'button', role: 'tab', class: 'vt-btn', 'aria-selected': String(v === phoneView), onclick: () => setPhoneView(v) }, v === 'orbits' ? 'Orbits' : 'Plot'),
);
const viewTabs = h('nav', { class: 'view-tabs', role: 'tablist', 'aria-label': 'View' }, ...tabBtns);
const viewsEl = h('main', { class: 'views' }, inertial.el, plot.el);
const drawer = h('div', { class: 'drawer' });
const dock = h('div', { class: 'dock' });
const sheetHandle = h(
  'button',
  { type: 'button', class: 'sheet-handle', 'aria-label': 'Burns sheet: tap or swipe up to open, swipe down to minimise', 'aria-expanded': 'false' },
  h('span', { class: 'grip' }),
  h('span', { class: 'sheet-chevron', 'aria-hidden': 'true' }, icon('chevronUp', 14, 2)),
);
const sheet = h('div', { class: 'sheet', 'data-state': 'mini' }, sheetHandle);
root.append(topbar, scrubRow, viewTabs, viewsEl, drawer, dock, sheet);
inertial.el.dataset.view = 'orbits';
plot.el.dataset.view = 'plot';

function setPhoneView(v: PhoneView): void {
  phoneView = v;
  root.dataset.view = v;
  tabBtns.forEach((b, i) => b.setAttribute('aria-selected', String(PHONE_VIEWS[i] === v)));
  dirty = true;
}
setPhoneView(phoneView);

// Swipe between views on phone: from the canvas edges, or anywhere on title/telemetry rows.
let swipe: { x: number; y: number; t: number } | null = null;
viewsEl.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('canvas, button, input')) return;
  swipe = { x: e.clientX, y: e.clientY, t: performance.now() };
});
viewsEl.addEventListener('pointerup', (e) => {
  if (!swipe || !root.dataset.layout?.startsWith('phone')) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy) && performance.now() - swipe.t < 700) stepView(dx < 0 ? 1 : -1);
  swipe = null;
});
function stepView(dir: 1 | -1): void {
  if (root.dataset.layout !== 'phone') return;
  const i = PHONE_VIEWS.indexOf(phoneView);
  setPhoneView(PHONE_VIEWS[Math.max(0, Math.min(PHONE_VIEWS.length - 1, i + dir))]);
}
for (const v of views) {
  const canvas = v.el.querySelector('canvas')!;
  let s: { x: number; y: number; t: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    s = x < 24 || x > r.width - 24 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(e.clientY - s.y) && performance.now() - s.t < 700) stepView(dx < 0 ? 1 : -1);
    s = null;
  });
}

// Bottom sheet (phone). States, smallest first: mini (a labelled bar, the default), peek (burn list),
// half (editing), full. Swipe the header anywhere: a flick moves one state, a slow drag snaps to the
// nearest. The resting state (mini or peek) is remembered per browser.
type SheetState = 'mini' | 'peek' | 'half' | 'full';
const SHEET_ORDER: SheetState[] = ['mini', 'peek', 'half', 'full'];
const SHEET_KEY = 'rendezvous:sheet';
let restState: SheetState = 'mini';
try {
  if (localStorage.getItem(SHEET_KEY) === 'peek') restState = 'peek';
} catch {
  /* storage unavailable: start minimised */
}
function sheetHeight(state: SheetState): number {
  const H = window.innerHeight;
  const cs = getComputedStyle(root);
  const px = (name: string, fallback: number) => parseFloat(cs.getPropertyValue(name)) || fallback;
  return state === 'mini' ? px('--sheet-mini', 60) : state === 'peek' ? px('--sheet-peek', 172) : state === 'half' ? H * 0.52 : H * 0.92;
}
function setSheet(state: SheetState): void {
  sheet.dataset.state = state;
  root.dataset.sheet = state;
  sheet.style.height = '';
  sheetHandle.setAttribute('aria-expanded', String(state !== 'mini'));
  if (state === 'mini' || state === 'peek') {
    restState = state;
    try {
      localStorage.setItem(SHEET_KEY, state);
    } catch {
      /* best effort */
    }
  }
  dirty = true;
}
editor.onEditChange = (editing) => {
  if (!root.dataset.layout?.startsWith('phone')) return;
  setSheet(editing ? 'half' : restState);
};
{
  let drag: { y: number; h: number; moved: boolean; lastY: number; lastT: number; vy: number } | null = null;
  // Drag zones: the handle, the sheet's header row and the edit form's title row. Buttons and inputs
  // inside them keep working; the burn list itself still scrolls normally.
  const inZone = (el: HTMLElement) => !!el.closest('.sheet-handle, .sheet .editor-head, .sheet .form-title') && !el.closest('button:not(.sheet-handle), input, select, a');
  sheet.addEventListener('pointerdown', (e) => {
    if (!inZone(e.target as HTMLElement)) return;
    sheet.setPointerCapture(e.pointerId);
    const now = performance.now();
    drag = { y: e.clientY, h: sheet.getBoundingClientRect().height, moved: false, lastY: e.clientY, lastT: now, vy: 0 };
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 6) drag.moved = true;
    const now = performance.now();
    if (now > drag.lastT) drag.vy = 0.7 * ((e.clientY - drag.lastY) / (now - drag.lastT)) + 0.3 * drag.vy;
    drag.lastY = e.clientY;
    drag.lastT = now;
    if (drag.moved) sheet.style.height = `${Math.max(sheetHeight('mini'), Math.min(sheetHeight('full'), drag.h - dy))}px`;
  });
  const end = (cancelled: boolean) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const cur = SHEET_ORDER.indexOf(sheet.dataset.state as SheetState);
    if (cancelled) return setSheet(SHEET_ORDER[cur]);
    if (!d.moved) {
      // Tap: open a minimised sheet; otherwise step up, wrapping from full back to the resting state.
      setSheet(cur === SHEET_ORDER.length - 1 ? restState : SHEET_ORDER[cur + 1]);
      return;
    }
    const hNow = sheet.getBoundingClientRect().height;
    if (Math.abs(d.vy) > 0.5) {
      // Flick: move one state in the flick's direction from the state nearest where it was released.
      const near = nearestState(hNow);
      const i = SHEET_ORDER.indexOf(near);
      const dir = d.vy < 0 ? 1 : -1; // up = bigger
      const target = SHEET_ORDER[Math.max(0, Math.min(SHEET_ORDER.length - 1, (dir > 0 ? Math.max(i, cur) : Math.min(i, cur)) + dir))];
      setSheet(target);
    } else setSheet(nearestState(hNow));
  };
  const nearestState = (hNow: number): SheetState =>
    SHEET_ORDER.reduce((best, st) => (Math.abs(sheetHeight(st) - hNow) < Math.abs(sheetHeight(best) - hNow) ? st : best), 'mini' as SheetState);
  sheet.addEventListener('pointerup', () => end(false));
  sheet.addEventListener('pointercancel', () => end(true));
  sheetHandle.addEventListener('keydown', (e) => {
    const i = SHEET_ORDER.indexOf(sheet.dataset.state as SheetState);
    if (e.key === 'ArrowUp') setSheet(SHEET_ORDER[Math.min(SHEET_ORDER.length - 1, i + 1)]);
    else if (e.key === 'ArrowDown') setSheet(SHEET_ORDER[Math.max(0, i - 1)]);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
}

let layout: Layout | null = null;
function applyLayout(): void {
  const w = window.innerWidth;
  const hgt = window.innerHeight;
  const next: Layout = w >= 1200 ? 'desktop' : w >= 768 && hgt >= 500 ? 'tablet' : w > hgt && hgt < 500 ? 'phone-landscape' : 'phone';
  if (next === layout) return;
  layout = next;
  root.dataset.layout = next;
  closePopover();
  if (next === 'desktop' || next === 'tablet') {
    centerSlot.replaceChildren(playback.transport, playback.speeds, playback.clockEl);
    editor.extras.replaceChildren(header.undoBtn, header.redoBtn);
    scrubRow.replaceChildren(playback.scrubber);
    if (next === 'desktop') drawer.replaceChildren(editor.el);
    else viewsEl.append(editor.el);
    editor.setCollapsed(false);
  } else {
    centerSlot.replaceChildren(playback.clockEl);
    dock.replaceChildren(playback.scrubber, h('div', { class: 'dock-controls' }, playback.speedCycle, playback.transport));
    sheet.replaceChildren(sheetHandle, editor.el);
    editor.setCollapsed(false);
    setSheet(store.editing && next === 'phone' ? 'half' : restState);
  }
  dirty = true;
}
applyLayout();
window.addEventListener('resize', applyLayout);

// ----- keyboard -----
document.addEventListener('keydown', (e) => {
  const el = e.target as HTMLElement;
  const typing = el.closest('input, textarea, select, [contenteditable="true"]') && !(el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio' || el.type === 'range'));
  if (typing || e.metaKey || e.ctrlKey) return;
  if (el instanceof HTMLInputElement && el.type === 'range' && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')) return;
  if (e.key === ' ' && el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      clock.toggle();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      clock.jumpPrev();
      break;
    case 'ArrowRight':
      e.preventDefault();
      clock.jumpNext();
      break;
    case '[':
      clock.slower();
      break;
    case ']':
      clock.faster();
      break;
    case 'b':
    case 'B':
      editor.addBurn();
      break;
    case 'z':
    case 'Z':
      if (e.shiftKey) store.redo();
      else store.undo();
      break;
    case 'Escape':
      if (store.editing) store.cancelEdit();
      break;
    default:
      return;
  }
});

// ----- render loop -----
let last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  clock.tick(dt);
  if (dirty || views.some((v) => v.animating?.())) {
    dirty = false;
    const t = clock.t;
    for (const v of views) v.render(t, now);
    playback.update(t);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.fonts?.ready.then(() => (dirty = true));

if (hashError) toast(`Share link could not be read: ${hashError}`, 'error');

// Expose for automated checks (Playwright) and debugging.
(window as unknown as { rendezvous: unknown }).rendezvous = { store, clock, settings, views: { inertial, plot }, header };
