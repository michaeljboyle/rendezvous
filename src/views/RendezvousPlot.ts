import { RE } from '../physics/constants';
import { altitudeArcR } from '../physics/frames';
import { chaserElementsAt, relativeAt, sampleIndex, type Timeline } from '../physics/timeline';
import { dvMagnitude } from '../physics/burns';
import type { AppCtx, View } from '../ui/context';
import { closePopover, h, icon, menuAt, popover, setText } from '../ui/dom';
import { countdown, dist, dv, met, metShort, num, tick as fmtTick } from '../ui/format';
import { panel } from '../ui/panel';
import { coordsCheck, coordsChip } from '../ui/coords';
import type { Coords } from '../state/viewSettings';
import { Surface } from './canvas';
import { DASH, drawBurnMarker, drawChaser, drawTarget, label, mono, niceStep, ticks } from './draw';
import { attachGestures, type Pt } from './gestures';
import { alpha, theme } from './theme';

export interface Range {
  vMin: number;
  vMax: number;
  rMin: number;
  rMax: number;
}

const MARGIN = 0.08;
const MIN_SPAN = 40;

/** Auto-fit range for a set of points (with the Target at the origin), 8% margin. */
export function fitRange(V: ArrayLike<number>, R: ArrayLike<number>, n: number): Range {
  let vMin = 0;
  let vMax = 0;
  let rMin = 0;
  let rMax = 0;
  for (let i = 0; i < n; i++) {
    if (V[i] < vMin) vMin = V[i];
    if (V[i] > vMax) vMax = V[i];
    if (R[i] < rMin) rMin = R[i];
    if (R[i] > rMax) rMax = R[i];
  }
  const pad = (lo: number, hi: number): [number, number] => {
    let span = hi - lo;
    if (span < MIN_SPAN) {
      const c = (hi + lo) / 2;
      lo = c - MIN_SPAN / 2;
      hi = c + MIN_SPAN / 2;
      span = MIN_SPAN;
    }
    return [lo - span * MARGIN, hi + span * MARGIN];
  };
  [vMin, vMax] = pad(vMin, vMax);
  [rMin, rMax] = pad(rMin, rMax);
  return { vMin, vMax, rMin, rMax };
}

/** Expand one axis so both share the same px/m scale. */
function equalize(r: Range, pw: number, ph: number): Range {
  const sx = pw / (r.vMax - r.vMin);
  const sy = ph / (r.rMax - r.rMin);
  const out = { ...r };
  if (sx < sy) {
    const half = ph / sx / 2;
    const c = (r.rMax + r.rMin) / 2;
    out.rMin = c - half;
    out.rMax = c + half;
  } else {
    const half = pw / sy / 2;
    const c = (r.vMax + r.vMin) / 2;
    out.vMin = c - half;
    out.vMax = c + half;
  }
  return out;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** View 3 — the whole-scenario rendezvous plot in Target LVLH. */
export class RendezvousPlot implements View {
  el: HTMLElement;
  /** LVLH coordinates, shared with the LVLH-now view. */
  get coords(): Coords {
    return this.app.settings.coords;
  }
  mode: 'auto' | 'manual' = 'auto';
  trueShape = false;
  lockAspect = false;
  private manual: Range = { vMin: -1, vMax: 1, rMin: -1, rMax: 1 };
  private cur: Range = { vMin: -1, vMax: 1, rMin: -1, rMax: 1 };
  private surface: Surface;
  private coordBtn: HTMLButtonElement;
  private segBtns: HTMLButtonElement[];
  private chip: HTMLButtonElement;
  private chipText = h('span');
  private hover: Pt | null = null;
  private stats: Record<string, HTMLElement> = {};
  private burnHits: { x: number; y: number; index: number }[] = [];
  private nowPt: Pt = { x: -99, y: -99 };
  // plot rect
  private px0 = 0;
  private px1 = 0;
  private py0 = 0;
  private py1 = 0;

  constructor(private app: AppCtx) {
    const p = panel('view-plot', 'Rendezvous plot', 'Target LVLH, whole scenario', 'Rendezvous plot');
    this.el = p.el;
    this.coordBtn = coordsChip(app);
    this.segBtns = (['auto', 'manual'] as const).map((m) =>
      h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(m === this.mode), onclick: () => (m === 'auto' ? this.setAuto() : this.toManual()) }, m === 'auto' ? 'Auto' : 'Manual'),
    );
    const seg = h('div', { class: 'seg hide-phone', role: 'group', 'aria-label': 'Plot axis scaling' }, ...this.segBtns);
    this.chip = h('button', { type: 'button', class: 'chip chip-mono', 'aria-haspopup': 'dialog', 'aria-label': 'Axis ranges, opens axis settings', onclick: () => this.openPopover() }, this.chipText, icon('chevronDown', 12, 2));
    p.controls.append(this.coordBtn, seg, this.chip);

    const legendLine = (dash: boolean) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '22');
      svg.setAttribute('height', '6');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = dash
        ? '<line x1="0" y1="3" x2="22" y2="3" stroke="var(--chaser)" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="5 4"/>'
        : '<line x1="0" y1="3" x2="22" y2="3" stroke="var(--chaser)" stroke-width="2"/>';
      return svg;
    };
    p.telemetry.classList.add('legend');
    const stat = (key: string, lab: string) => {
      const v = h('span', { class: 'tv' });
      this.stats[key] = v;
      return h('span', { class: 'stat' }, h('span', { class: 'tl' }, lab), v);
    };
    p.telemetry.append(
      h('span', { class: 'phone-stats' }, stat('range', 'Range'), stat('rate', 'Range rate'), stat('next', 'Next burn')),
      h('span', { class: 'lg' }, legendLine(false), 'Past'),
      h('span', { class: 'lg' }, legendLine(true), 'Predicted'),
      h('span', { class: 'lg' }, h('span', { class: 'lg-tri', 'aria-hidden': 'true' }), 'Burn'),
      h('span', { class: 'lg' }, h('span', { class: 'lg-dot', 'aria-hidden': 'true' }), h('span', { class: 'lg-ticks' }, '10-min ticks')),
      h('span', { class: 'spacer' }),
      h('span', { class: 'lg-hint' }, 'Drag the dot to scrub · long-press to add a burn'),
    );

    this.surface = new Surface(p.host, () => app.invalidate());
    attachGestures(this.surface.canvas, (e) => this.surface.local(e), {
      onPress: (pt) => {
        if (Math.hypot(pt.x - this.nowPt.x, pt.y - this.nowPt.y) < 18) {
          const wasPlaying = app.clock.playing;
          app.clock.pause();
          return {
            immediate: true,
            move: (q) => {
              const hit = this.nearest(q);
              if (hit) app.clock.setTime(hit.t);
            },
            end: () => wasPlaying && app.clock.play(),
          };
        }
        if (pt.y > this.py1) return { move: (_q, dx) => this.zoomAxis(Math.exp(dx * 0.01), 'x', { x: (this.px0 + this.px1) / 2, y: 0 }) };
        if (pt.x > this.px1) return { move: (_q, _dx, dy) => this.zoomAxis(Math.exp(-dy * 0.01), 'y', { x: 0, y: (this.py0 + this.py1) / 2 }) };
        return { move: (_q, dx, dy) => this.panBy(dx, dy) };
      },
      onTap: (pt) => {
        const b = this.burnAt(pt);
        if (b !== null) {
          app.store.beginEdit(b);
          return;
        }
        const hit = this.nearest(pt);
        if (hit && hit.d < 12) app.clock.setTime(hit.t);
      },
      onDoubleTap: () => this.setAuto(),
      onLongPress: (pt, client) => {
        const hit = this.nearest(pt);
        if (!hit || hit.d > 40) return;
        menuAt(client.x, client.y, [{ label: `Add burn here · ${met(hit.t)}`, action: () => app.store.addBurn(hit.t) }]);
      },
      onWheel: (e, pt) => {
        const d = e.deltaY || e.deltaX;
        const f = Math.exp(-d * 0.0015);
        this.zoomAxis(f, e.shiftKey ? 'x' : e.altKey ? 'y' : 'both', pt);
      },
      onPinch: (f, axis, c, pan) => {
        this.panBy(pan.x, pan.y);
        this.zoomAxis(f, axis, c);
      },
      onHover: (pt) => {
        this.hover = pt;
        const S = this.surface.canvas;
        if (!pt) S.style.cursor = '';
        else if (Math.hypot(pt.x - this.nowPt.x, pt.y - this.nowPt.y) < 18 || this.burnAt(pt) !== null) S.style.cursor = 'pointer';
        else if (pt.y > this.py1) S.style.cursor = 'ew-resize';
        else if (pt.x > this.px1) S.style.cursor = 'ns-resize';
        else S.style.cursor = 'grab';
        app.invalidate();
      },
    });
  }

  setAuto(): void {
    this.mode = 'auto';
    this.segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === 0)));
    this.app.invalidate();
  }

  private toManual(): void {
    if (this.mode === 'manual') return;
    this.manual = { ...this.cur };
    this.mode = 'manual';
    this.segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === 1)));
    this.app.invalidate();
  }

  private panBy(dx: number, dy: number): void {
    this.toManual();
    const m = this.manual;
    const dv = (dx / (this.px1 - this.px0)) * (m.vMax - m.vMin);
    const dr = (dy / (this.py1 - this.py0)) * (m.rMax - m.rMin);
    m.vMin += dv;
    m.vMax += dv;
    m.rMin += dr;
    m.rMax += dr;
    this.app.invalidate();
  }

  /** Zoom about a screen point; f > 1 zooms in. */
  private zoomAxis(f: number, axis: 'x' | 'y' | 'both', p: Pt): void {
    this.toManual();
    if (this.lockAspect) axis = 'both';
    const m = this.manual;
    if (axis !== 'y') {
      const v = m.vMax - ((p.x - this.px0) / (this.px1 - this.px0)) * (m.vMax - m.vMin);
      const span = Math.max(1, (m.vMax - m.vMin) / f);
      const frac = (m.vMax - v) / (m.vMax - m.vMin);
      m.vMax = v + frac * span;
      m.vMin = m.vMax - span;
    }
    if (axis !== 'x') {
      const r = m.rMax - ((p.y - this.py0) / (this.py1 - this.py0)) * (m.rMax - m.rMin);
      const span = Math.max(0.5, (m.rMax - m.rMin) / f);
      const frac = (m.rMax - r) / (m.rMax - m.rMin);
      m.rMax = r + frac * span;
      m.rMin = m.rMax - span;
    }
    this.app.invalidate();
  }

  private openPopover(): void {
    const r = this.mode === 'manual' ? this.manual : this.cur;
    const unit = Math.max(Math.abs(r.vMin), Math.abs(r.vMax), Math.abs(r.rMin), Math.abs(r.rMax)) >= 10000 ? 'km' : 'm';
    const k = unit === 'km' ? 1000 : 1;
    const fmt = (x: number) => String(Number((x / k).toPrecision(5)));
    const mk = (v: number, lab: string) => h('input', { type: 'number', class: 'input', step: 'any', value: fmt(v), 'aria-label': lab });
    const vMin = mk(r.vMin, 'V-bar min');
    const vMax = mk(r.vMax, 'V-bar max');
    const rMin = mk(r.rMin, 'R-bar min');
    const rMax = mk(r.rMax, 'R-bar max');
    const lock = h('input', { type: 'checkbox', checked: this.lockAspect });
    const shape = h('input', { type: 'checkbox', checked: this.trueShape });
    const apply = () => {
      const nr = { vMin: Number(vMin.value) * k, vMax: Number(vMax.value) * k, rMin: Number(rMin.value) * k, rMax: Number(rMax.value) * k };
      if (!Object.values(nr).every(Number.isFinite) || nr.vMax <= nr.vMin || nr.rMax <= nr.rMin) return;
      this.toManual();
      this.manual = nr;
      this.app.invalidate();
    };
    for (const i of [vMin, vMax, rMin, rMax]) {
      i.addEventListener('change', apply);
      i.addEventListener('keydown', (e) => e.key === 'Enter' && apply());
    }
    lock.addEventListener('change', () => (this.lockAspect = lock.checked));
    shape.addEventListener('change', () => {
      this.trueShape = shape.checked;
      this.app.invalidate();
    });
    const body = h(
      'div',
      { class: 'axis-pop' },
      h('div', { class: 'pop-title' }, `Plot axes (${unit})`),
      h('div', { class: 'field-row' }, h('label', { class: 'field' }, h('span', null, 'V-bar min'), vMin), h('label', { class: 'field' }, h('span', null, 'V-bar max'), vMax)),
      h('div', { class: 'field-row' }, h('label', { class: 'field' }, h('span', null, 'R-bar min'), rMin), h('label', { class: 'field' }, h('span', null, 'R-bar max'), rMax)),
      coordsCheck(this.app),
      h('label', { class: 'check' }, lock, h('span', null, 'Lock aspect (zoom both axes together)')),
      h('label', { class: 'check' }, shape, h('span', null, 'True shape in Auto (equal scale)')),
      h('p', { class: 'hint' }, 'Wheel zooms both axes, Shift+wheel V-bar, Alt+wheel R-bar. Drag the tick labels to stretch one axis.'),
      h(
        'div',
        { class: 'pop-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => (this.setAuto(), closePopover()) }, 'Reset to Auto'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => (apply(), closePopover()) }, 'Apply'),
      ),
    );
    popover(this.chip, body);
  }

  private arrays(tl: Timeline): [Float64Array, Float64Array] {
    return this.coords === 'curv' ? [tl.curvV, tl.curvR] : [tl.rectV, tl.rectR];
  }

  private X(v: number): number {
    const r = this.cur;
    return this.px0 + ((r.vMax - v) / (r.vMax - r.vMin)) * (this.px1 - this.px0);
  }

  private Y(rr: number): number {
    const r = this.cur;
    return this.py0 + ((r.rMax - rr) / (r.rMax - r.rMin)) * (this.py1 - this.py0);
  }

  /** Nearest point on the trajectory to a screen point (interpolated between samples). */
  private nearest(p: Pt): { t: number; d: number } | null {
    const tl = this.app.store.timeline;
    const [V, R] = this.arrays(tl);
    let best: { t: number; d: number } | null = null;
    let px = this.X(V[0]);
    let py = this.Y(R[0]);
    for (let i = 1; i < tl.count; i++) {
      const qx = this.X(V[i]);
      const qy = this.Y(R[i]);
      const dx = qx - px;
      const dy = qy - py;
      const L = dx * dx + dy * dy;
      const u = L > 0 ? Math.max(0, Math.min(1, ((p.x - px) * dx + (p.y - py) * dy) / L)) : 0;
      const d = Math.hypot(px + u * dx - p.x, py + u * dy - p.y);
      if (!best || d < best.d) best = { t: tl.t[i - 1] + u * (tl.t[i] - tl.t[i - 1]), d };
      px = qx;
      py = qy;
    }
    return best;
  }

  private burnAt(p: Pt): number | null {
    for (const b of this.burnHits) if (Math.hypot(b.x - p.x, b.y - p.y) < 12) return b.index;
    return null;
  }

  render(t: number): void {
    const S = this.surface;
    const { store } = this.app;
    const tl = store.timeline;
    const [V, R] = this.arrays(tl);
    this.px0 = 14;
    this.px1 = S.w - 50;
    this.py0 = 14;
    this.py1 = S.h - 28;
    const pw = Math.max(1, this.px1 - this.px0);
    const ph = Math.max(1, this.py1 - this.py0);

    if (this.mode === 'auto') {
      let r = fitRange(V, R, tl.count);
      if (this.trueShape) r = equalize(r, pw, ph);
      this.cur = r;
    } else {
      this.cur = { ...this.manual };
    }
    const sx = pw / (this.cur.vMax - this.cur.vMin);
    const sy = ph / (this.cur.rMax - this.cur.rMin);
    const ratio = sy / sx;
    const stretched = Math.abs(Math.log(ratio)) > Math.log(1.05);
    const desc = !stretched ? `${dist(this.cur.vMax - this.cur.vMin)}` : ratio > 1 ? `R-bar ×${num(ratio, ratio >= 10 ? 0 : 1)}` : `V-bar ×${num(1 / ratio, 1 / ratio >= 10 ? 0 : 1)}`;
    setText(this.chipText, `${this.mode === 'auto' ? 'Auto' : 'Manual'} · ${desc}`);
    this.chip.classList.toggle('chip-warn', stretched);
    this.chip.title = stretched ? 'Axes use different scales: the shape is stretched' : 'Equal scale on both axes';
    if (!S.visible) return;

    const th = theme();
    const c = S.begin(th.surface);
    const cur = this.cur;

    // Grid + tick labels
    const vUnit = Math.max(Math.abs(cur.vMin), Math.abs(cur.vMax)) >= 10000 ? 'km' : 'm';
    const rUnit = Math.max(Math.abs(cur.rMin), Math.abs(cur.rMax)) >= 10000 ? 'km' : 'm';
    const vStep = niceStep(cur.vMax - cur.vMin, Math.max(2, Math.floor(pw / 90)));
    const rStep = niceStep(cur.rMax - cur.rMin, Math.max(2, Math.floor(ph / 60)));
    const vt = ticks(cur.vMin, cur.vMax, vStep);
    const rtk = ticks(cur.rMin, cur.rMax, rStep);
    c.strokeStyle = th.grid;
    c.lineWidth = 1;
    c.beginPath();
    for (const v of vt) {
      const x = Math.round(this.X(v)) + 0.5;
      c.moveTo(x, this.py0);
      c.lineTo(x, this.py1);
    }
    for (const r of rtk) {
      const y = Math.round(this.Y(r)) + 0.5;
      c.moveTo(this.px0, y);
      c.lineTo(this.px1, y);
    }
    c.stroke();
    // Axes through the origin (crosshair at the Target)
    c.strokeStyle = th.axis;
    c.beginPath();
    const x0 = Math.round(this.X(0)) + 0.5;
    const y0 = Math.round(this.Y(0)) + 0.5;
    if (x0 >= this.px0 && x0 <= this.px1) {
      c.moveTo(x0, this.py0);
      c.lineTo(x0, this.py1);
    }
    if (y0 >= this.py0 && y0 <= this.py1) {
      c.moveTo(this.px0, y0);
      c.lineTo(this.px1, y0);
    }
    c.stroke();

    mono(c, 11);
    c.fillStyle = th.textDim;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (const v of vt) {
      const x = this.X(v);
      if (x < this.px0 + 4 || x > this.px1 - 4) continue;
      c.fillText(fmtTick(v, vUnit), x, this.py1 + 8);
    }
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    for (const r of rtk) {
      const y = this.Y(r);
      if (y < this.py0 + 4 || y > this.py1 - 4) continue;
      c.fillText(fmtTick(r, rUnit), this.px1 + 8, y);
    }
    c.textBaseline = 'top';
    c.fillText(rUnit, this.px1 + 8, this.py1 + 8);
    if (vUnit !== rUnit) {
      c.textAlign = 'left';
      c.fillText(vUnit, this.px0, this.py1 + 8);
    }

    c.save();
    c.beginPath();
    c.rect(this.px0, this.py0 - 6, pw, ph + 12);
    c.clip();

    // Axis names
    mono(c, 11);
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    const axisY = y0 >= this.py0 + 14 && y0 <= this.py1 ? y0 - 5 : this.py0 + 12;
    const axX = Math.max(this.px0 + 4, Math.min(this.px1 - 130, x0 + 10));
    label(c, '← +V-bar (ahead)', axX, axisY, th.textDim);

    // Ap / Pe lines
    const el = chaserElementsAt(tl, t);
    const rt = tl.targetRadius;
    const placed: Box[] = [{ x0: axX, y0: axisY - 14, x1: axX + c.measureText('← +V-bar (ahead)').width, y1: axisY }];
    c.setLineDash([2, 4]);
    c.strokeStyle = alpha(th.chaser, 0.8);
    c.lineWidth = 1.2;
    // Curvilinear: constant altitude is a horizontal line. Rectilinear: it is an arc about Earth's centre.
    const apPe: [number, string][] = [];
    if (el.e < 1) apPe.push([el.ra, `Ap ${num((el.ra - RE) / 1000, 1)} km`]);
    apPe.push([el.rp, `Pe ${num((el.rp - RE) / 1000, 1)} km`]);
    const arcR = (radius: number, v: number) => (this.coords === 'curv' ? radius - rt : altitudeArcR(radius, rt, v));
    for (const [radius] of apPe) {
      c.beginPath();
      let started = false;
      const N = this.coords === 'curv' ? 1 : 120;
      for (let k = 0; k <= N; k++) {
        const v = cur.vMax - ((cur.vMax - cur.vMin) * k) / N;
        const y = this.Y(arcR(radius, v));
        if (!Number.isFinite(y)) {
          started = false;
          continue;
        }
        if (started) c.lineTo(this.X(v), y);
        else c.moveTo(this.X(v), y);
        started = true;
      }
      c.stroke();
    }
    c.setLineDash([]);
    mono(c, 11);
    c.textAlign = 'right';
    c.textBaseline = 'bottom';
    for (const [radius, text] of apPe) {
      const y = this.Y(arcR(radius, cur.vMin));
      if (!Number.isFinite(y) || y < this.py0 + 10 || y > this.py1 + 2) continue;
      const w = c.measureText(text).width;
      const box = { x0: this.px1 - 6 - w, y0: y - 16, x1: this.px1 - 6, y1: y - 2 };
      if (this.collides(box, placed)) continue;
      placed.push(box);
      label(c, text, this.px1 - 6, y - 3, th.chaser);
    }

    // What-if ghost: the previous future trajectory, faint
    const ghost = store.ghost;
    if (ghost) {
      const [gV, gR] = this.arrays(ghost);
      const g0 = sampleIndex(ghost, t);
      c.beginPath();
      for (let i = g0; i < ghost.count; i++) {
        const x = this.X(gV[i]);
        const y = this.Y(gR[i]);
        if (i === g0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.strokeStyle = alpha(th.text, 0.28);
      c.lineWidth = 1.5;
      c.stroke();
    }

    // Trajectory: past solid, future dashed, split exactly at "now"
    const rel = relativeAt(tl, t);
    setText(this.stats.range, dist(rel.range));
    setText(this.stats.rate, dv(rel.rangeRate, true));
    const nb = this.app.clock.nextBurnTime(t);
    setText(this.stats.next, nb === null ? '—' : countdown(nb - t));
    const nowV = this.coords === 'curv' ? rel.curv.v : rel.rect.v;
    const nowR = this.coords === 'curv' ? rel.curv.r : rel.rect.r;
    const nx = this.X(nowV);
    const ny = this.Y(nowR);
    this.nowPt = { x: nx, y: ny };
    const iNow = sampleIndex(tl, t);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(this.X(V[0]), this.Y(R[0]));
    for (let i = 1; i <= iNow; i++) c.lineTo(this.X(V[i]), this.Y(R[i]));
    c.lineTo(nx, ny);
    c.strokeStyle = th.chaser;
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.moveTo(nx, ny);
    for (let i = iNow + 1; i < tl.count; i++) c.lineTo(this.X(V[i]), this.Y(R[i]));
    c.setLineDash(DASH);
    c.strokeStyle = alpha(th.chaser, 0.55);
    c.lineWidth = 1.5;
    c.stroke();
    c.setLineDash([]);

    // Revolution marks
    mono(c, 10.5);
    for (let k = 1; k * tl.targetPeriod <= tl.duration; k++) {
      const tk = k * tl.targetPeriod;
      const [x, y] = this.pointAt(tl, V, R, tk);
      c.strokeStyle = th.text;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x - 5, y - 5);
      c.lineTo(x + 5, y + 5);
      c.moveTo(x + 5, y - 5);
      c.lineTo(x - 5, y + 5);
      c.stroke();
      const text = `Rev ${k}`;
      const w = c.measureText(text).width;
      const box = { x0: x + 8, y0: y - 20, x1: x + 8 + w, y1: y - 6 };
      if (!this.collides(box, placed)) {
        placed.push(box);
        c.textAlign = 'left';
        c.textBaseline = 'bottom';
        label(c, text, x + 8, y - 6, th.text);
      }
    }

    // Burn markers (reserve their label space first)
    this.burnHits = [];
    const sel = store.editing?.index;
    const burnLabels: [number, number, string, boolean][] = [];
    for (const b of tl.burns) {
      const i = sampleIndex(tl, b.tig);
      const x = this.X(V[i]);
      const y = this.Y(R[i]);
      this.burnHits.push({ x, y, index: b.index });
      burnLabels.push([x, y, `${store.numbers[b.index]} ${store.scenario.burns[b.index].name}`, b.tig <= t]);
    }
    // "Now" label box is reserved before tick labels so they never overlap it.
    mono(c, 12);
    const nowText = `Now · ${metShort(t)}`;
    const nw = c.measureText(nowText).width;
    const nowRight = nx + 14 + nw < this.px1 - 4;
    const nowBox = nowRight ? { x0: nx + 12, y0: ny - 9, x1: nx + 14 + nw, y1: ny + 9 } : { x0: nx - 14 - nw, y0: ny - 9, x1: nx - 12, y1: ny + 9 };
    placed.push(nowBox);
    // Burn labels: first free spot around the marker; if crowded, just the number; else nothing.
    const burnLabelPos: ({ x: number; y: number; text: string } | null)[] = [];
    for (const [x, y, text] of burnLabels) {
      let pos: { x: number; y: number; text: string } | null = null;
      for (const t2 of [text, text.split(' ')[0]]) {
        const w = c.measureText(t2).width;
        for (const [ox, oy] of [
          [12, 14],
          [12, -14],
          [-12 - w, 14],
          [-12 - w, -14],
          [12, 0],
          [-12 - w, 0],
          [12, 30],
          [12, -30],
        ]) {
          const box = { x0: x + ox, y0: y + oy - 8, x1: x + ox + w, y1: y + oy + 8 };
          if (this.collides(box, placed)) continue;
          placed.push(box);
          pos = { x: x + ox, y: y + oy, text: t2 };
          break;
        }
        if (pos) break;
      }
      burnLabelPos.push(pos);
    }

    // Time ticks: every 10 min (adaptive), labelled every 30 min, labels never overlap
    const minor = this.tickInterval(tl.duration);
    mono(c, 10.5);
    for (let k = 1; k * minor < tl.duration; k++) {
      const tk = k * minor;
      const [x, y] = this.pointAt(tl, V, R, tk);
      if (x < this.px0 - 4 || x > this.px1 + 4 || y < this.py0 - 4 || y > this.py1 + 4) continue;
      const major = k % 3 === 0;
      const past = tk <= t;
      c.beginPath();
      c.arc(x, y, major ? 3 : 2.5, 0, Math.PI * 2);
      c.fillStyle = major && past ? th.text : th.textDim;
      c.fill();
      if (!major) continue;
      const text = metShort(tk);
      const w = c.measureText(text).width;
      for (const [ox, oy, align] of [
        [6, -12, 'left'],
        [-6, -12, 'right'],
        [6, 12, 'left'],
      ] as [number, number, CanvasTextAlign][]) {
        const bx = align === 'left' ? x + ox : x + ox - w;
        const box = { x0: bx, y0: y + oy - 7, x1: bx + w, y1: y + oy + 7 };
        if (this.collides(box, placed)) continue;
        placed.push(box);
        c.textAlign = align;
        c.textBaseline = 'middle';
        label(c, text, x + ox, y + oy, th.textDim);
        break;
      }
    }

    // Burn markers drawn over the line
    mono(c, 12);
    for (let k = 0; k < tl.burns.length; k++) {
      const [x, y, , past] = burnLabels[k];
      drawBurnMarker(c, x, y, past, 6, sel === tl.burns[k].index);
      const pos = burnLabelPos[k];
      if (!pos) continue;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      label(c, pos.text, pos.x, pos.y, th.text);
    }

    // Target at the origin
    drawTarget(c, this.X(0), this.Y(0), 9, th.surface);

    // End-state annotations while editing
    if (ghost) {
      const [gV, gR] = this.arrays(ghost);
      const gi = ghost.count - 1;
      this.endLabel(c, gV[gi], gR[gi], 'was: ', th.textDim, placed);
      const ei = tl.count - 1;
      this.endLabel(c, V[ei], R[ei], 'End: ', th.chaser, placed);
    }

    // Now dot + label
    drawChaser(c, nx, ny, 6);
    mono(c, 12);
    c.textAlign = nowRight ? 'left' : 'right';
    c.textBaseline = 'middle';
    label(c, nowText, nowRight ? nx + 12 : nx - 12, ny, th.text);

    c.restore();

    // Burn tooltip
    if (this.hover) {
      const bi = this.burnAt(this.hover);
      if (bi !== null) {
        const b = store.scenario.burns[bi];
        const text = `${met(b.tigS)} · Δv ${dv(dvMagnitude(b))}`;
        this.tooltip(c, this.hover, text);
      }
    }
  }

  private endLabel(c: CanvasRenderingContext2D, v: number, r: number, prefix: string, color: string, placed: Box[]): void {
    const x = this.X(v);
    const y = this.Y(r);
    if (x < this.px0 || x > this.px1 || y < this.py0 || y > this.py1) return;
    c.beginPath();
    c.arc(x, y, 3.5, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    const where = Math.abs(v) < 1 ? 'at Target' : `${dist(Math.abs(v))} ${v > 0 ? 'ahead' : 'behind'}`;
    const text = `${prefix}${where}`;
    mono(c, 11.5);
    const w = c.measureText(text).width;
    for (const [ox, oy] of [
      [8, 14],
      [8, -14],
      [8, 30],
      [-8 - w, 14],
      [8, 46],
      [-8 - w, 30],
      [-8 - w, -14],
    ]) {
      const last = ox === -8 - w && oy === -14;
      let bx = x + ox;
      if (last) bx = Math.max(this.px0 + 2, Math.min(this.px1 - w - 2, bx));
      const box = { x0: bx, y0: y + oy - 8, x1: bx + w, y1: y + oy + 8 };
      if (this.collides(box, placed) && !last) continue;
      placed.push(box);
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      label(c, text, bx, y + oy, color);
      break;
    }
  }

  private tooltip(c: CanvasRenderingContext2D, p: Pt, text: string): void {
    const th = theme();
    mono(c, 12);
    const w = c.measureText(text).width + 14;
    const x = Math.max(4, Math.min(this.surface.w - w - 4, p.x + 12));
    const y = Math.max(4, p.y - 32);
    c.fillStyle = th.surface2;
    c.strokeStyle = th.border;
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(x, y, w, 22, 4);
    c.fill();
    c.stroke();
    c.fillStyle = th.text;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(text, x + 7, y + 11);
  }

  private collides(b: Box, placed: Box[]): boolean {
    if (b.x0 < this.px0 || b.x1 > this.px1 || b.y0 < this.py0 - 4 || b.y1 > this.py1) return true;
    return placed.some((p) => b.x0 < p.x1 + 3 && b.x1 > p.x0 - 3 && b.y0 < p.y1 + 1 && b.y1 > p.y0 - 1);
  }

  /** Minor tick interval: 10 min by default, wider for long scenarios. */
  private tickInterval(duration: number): number {
    for (const m of [600, 1200, 1800, 3600, 7200, 14400]) if (duration / m <= 40) return m;
    return 28800;
  }

  private pointAt(tl: Timeline, V: Float64Array, R: Float64Array, t: number): [number, number] {
    const i = sampleIndex(tl, t);
    const j = Math.min(tl.count - 1, i + 1);
    const u = j > i ? (t - tl.t[i]) / (tl.t[j] - tl.t[i]) : 0;
    return [this.X(V[i] + u * (V[j] - V[i])), this.Y(R[i] + u * (R[j] - R[i]))];
  }
}
