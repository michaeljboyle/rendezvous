import { RE } from '../physics/constants';
import { chaserElementsAt, relativeAt, sampleIndex } from '../physics/timeline';
import type { AppCtx, View } from '../ui/context';
import { closePopover, h, icon, popover, segmented, setText } from '../ui/dom';
import { countdown, dist, distPair, dv, num, span as fmtSpan, speed } from '../ui/format';
import { panel, telemetryItem } from '../ui/panel';
import { Surface } from './canvas';
import { arrow, drawChaser, drawTarget, fadingPolyline, label, mono, niceStep, ticks } from './draw';
import { attachGestures, type Pt } from './gestures';
import { alpha, theme } from './theme';

/** Auto-scale steps (half-extent of the shorter canvas side), m. */
export const LVLH_STEPS = [50, 200, 1000, 5000, 20000, 100000, 500000];
const EASE_MS = 300;

export function autoStep(range: number): number {
  for (const s of LVLH_STEPS) if (s >= range * 1.08) return s;
  return Math.pow(10, Math.ceil(Math.log10(range * 1.08)));
}

/** Largest 1 / 2 / 2.5 / 5 × 10^k not above x. */
function scaleBarLength(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [5, 2.5, 2, 1]) if (m * p <= x) return m * p;
  return p;
}

/** View 2 — Target-centred LVLH close-up, true geometry (equal scale on both axes). */
export class LvlhView implements View {
  el: HTMLElement;
  mode: 'auto' | 'manual' = 'auto';
  overlays = false;
  private surface: Surface;
  private shown = 100000;
  private easeFrom = 100000;
  private easeTo = 100000;
  private easeStart = -1e9;
  private center = { v: 0, r: 0 };
  private manualSpan = 100000;
  private seg;
  private chip: HTMLButtonElement;
  private chipText = h('span');
  private kosBtn: HTMLButtonElement;
  private tele: Record<string, HTMLElement> = {};
  private s = 1;
  private now = 0;

  constructor(private app: AppCtx) {
    const p = panel('view-lvlh', 'LVLH · now', 'Target-centered, true scale', 'LVLH current position');
    this.el = p.el;
    this.kosBtn = h(
      'button',
      {
        type: 'button',
        class: 'chip hide-phone',
        'aria-pressed': 'false',
        title: '200 m keep-out sphere and 4 × 2 km approach ellipsoid',
        onclick: () => {
          this.overlays = !this.overlays;
          this.kosBtn.setAttribute('aria-pressed', String(this.overlays));
          app.invalidate();
        },
      },
      'KOS / AE',
    );
    this.seg = segmented(
      'LVLH axis scaling',
      [
        { value: 'auto', label: 'Auto' },
        { value: 'manual', label: 'Manual' },
      ],
      this.mode,
      (v) => (v === 'auto' ? this.setAuto() : this.toManual()),
      'hide-phone',
    );
    this.chip = h('button', { type: 'button', class: 'chip chip-mono', 'aria-haspopup': 'dialog', 'aria-label': 'Axis range, opens axis settings', onclick: () => this.openPopover() }, this.chipText, icon('chevronDown', 12, 2));
    p.controls.append(this.kosBtn, this.seg.el, this.chip);

    for (const [key, lab] of [
      ['range', 'Range'],
      ['rate', 'Rate'],
      ['vr', ''],
      ['next', 'Next burn'],
    ]) {
      const it = telemetryItem(lab);
      this.tele[key] = it.value;
      p.telemetry.append(it.el);
    }

    this.surface = new Surface(p.host, () => app.invalidate());
    attachGestures(this.surface.canvas, (e) => this.surface.local(e), {
      onPress: () => ({
        move: (_p, dx, dy) => {
          this.toManual();
          this.center.v += dx / this.s;
          this.center.r += dy / this.s;
          app.invalidate();
        },
      }),
      onDoubleTap: () => this.setAuto(),
      onWheel: (e, pt) => this.zoomAt(Math.exp(e.deltaY * 0.0015), pt),
      onPinch: (f, _a, c, pan) => {
        this.toManual();
        this.center.v += pan.x / this.s;
        this.center.r += pan.y / this.s;
        this.zoomAt(1 / f, c);
      },
    });
  }

  animating(): boolean {
    return this.now - this.easeStart < EASE_MS + 20;
  }

  setAuto(): void {
    this.mode = 'auto';
    this.seg.set('auto');
    this.center = { v: 0, r: 0 };
    this.app.invalidate();
  }

  private toManual(): void {
    if (this.mode === 'manual') return;
    this.mode = 'manual';
    this.manualSpan = this.shown;
    this.seg.set('manual');
    this.app.invalidate();
  }

  private zoomAt(f: number, p: Pt): void {
    this.toManual();
    const S = this.surface;
    const ns = Math.max(1, Math.min(5e7, this.manualSpan * f));
    // keep the world point under the pointer fixed
    const wx = this.center.v - (p.x - S.w / 2) / this.s;
    const wy = this.center.r + (S.h / 2 - p.y) / this.s;
    const s2 = this.s * (this.manualSpan / ns);
    this.center.v = wx + (p.x - S.w / 2) / s2;
    this.center.r = wy - (S.h / 2 - p.y) / s2;
    this.manualSpan = ns;
    this.app.invalidate();
  }

  private openPopover(): void {
    const toKm = (m: number) => String(Number((m / 1000).toPrecision(4)));
    const spanIn = h('input', { type: 'number', class: 'input', step: 'any', min: '0.001', value: toKm(this.mode === 'manual' ? this.manualSpan : this.shown), 'aria-label': 'Span ± km' });
    const vIn = h('input', { type: 'number', class: 'input', step: 'any', value: toKm(this.center.v), 'aria-label': 'Centre V-bar km' });
    const rIn = h('input', { type: 'number', class: 'input', step: 'any', value: toKm(this.center.r), 'aria-label': 'Centre R-bar km' });
    const apply = () => {
      const sp = Number(spanIn.value) * 1000;
      const v = Number(vIn.value) * 1000;
      const r = Number(rIn.value) * 1000;
      if (!(sp > 0) || !Number.isFinite(v) || !Number.isFinite(r)) return;
      this.toManual();
      this.manualSpan = sp;
      this.center = { v, r };
      this.app.invalidate();
    };
    for (const i of [spanIn, vIn, rIn]) {
      i.addEventListener('change', apply);
      i.addEventListener('keydown', (e) => e.key === 'Enter' && apply());
    }
    const body = h(
      'div',
      { class: 'axis-pop' },
      h('div', { class: 'pop-title' }, 'LVLH axes'),
      h('label', { class: 'field' }, h('span', null, 'Span ± (km)'), spanIn),
      h('div', { class: 'field-row' }, h('label', { class: 'field' }, h('span', null, 'Centre V-bar (km)'), vIn), h('label', { class: 'field' }, h('span', null, 'Centre R-bar (km)'), rIn)),
      this.overlayCheck(),
      h('p', { class: 'hint' }, 'Both axes share one scale. Drag to pan, scroll or pinch to zoom, double-click to return to Auto.'),
      h(
        'div',
        { class: 'pop-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => (this.setAuto(), closePopover()) }, 'Reset to Auto'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => (apply(), closePopover()) }, 'Apply'),
      ),
    );
    popover(this.chip, body);
  }

  private overlayCheck(): HTMLElement {
    const box = h('input', { type: 'checkbox', checked: this.overlays });
    box.addEventListener('change', () => {
      this.overlays = box.checked;
      this.kosBtn.setAttribute('aria-pressed', String(this.overlays));
      this.app.invalidate();
    });
    return h('label', { class: 'check' }, box, h('span', null, 'Keep-out sphere (200 m) and approach ellipsoid (4 × 2 km)'));
  }

  render(t: number, now: number): void {
    this.now = now;
    const S = this.surface;
    const { store } = this.app;
    const tl = store.timeline;
    const rel = relativeAt(tl, t);
    this.updateTelemetry(t, rel.range, rel.rangeRate, rel.rect.v, rel.rect.r);

    // Scale
    let span: number;
    if (this.mode === 'auto') {
      const step = autoStep(rel.range);
      if (step !== this.easeTo) {
        this.easeFrom = this.shown;
        this.easeTo = step;
        this.easeStart = now;
      }
      const p = Math.min(1, (now - this.easeStart) / EASE_MS);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      span = Math.exp(Math.log(this.easeFrom) + (Math.log(this.easeTo) - Math.log(this.easeFrom)) * e);
      this.shown = span;
      setText(this.chipText, `Auto · ${fmtSpan(this.easeTo)}`);
    } else {
      span = this.manualSpan;
      this.shown = span;
      this.easeTo = -1;
      setText(this.chipText, `Manual · ±${fmtSpan(span)}`);
    }
    if (!S.visible) return;

    const th = theme();
    const c = S.begin(th.surface);
    const s = (Math.min(S.w, S.h) / 2 - 12) / span;
    this.s = s;
    const cv = this.center.v;
    const cr = this.center.r;
    const X = (v: number) => S.w / 2 - (v - cv) * s;
    const Y = (r: number) => S.h / 2 - (r - cr) * s;
    const vMin = cv - S.w / 2 / s;
    const vMax = cv + S.w / 2 / s;
    const rMin = cr - S.h / 2 / s;
    const rMax = cr + S.h / 2 / s;

    // Grid
    const step = niceStep(span * 2, 4);
    c.strokeStyle = th.grid;
    c.lineWidth = 1;
    c.beginPath();
    for (const v of ticks(vMin, vMax, step)) {
      const x = Math.round(X(v)) + 0.5;
      c.moveTo(x, 0);
      c.lineTo(x, S.h);
    }
    for (const r of ticks(rMin, rMax, step)) {
      const y = Math.round(Y(r)) + 0.5;
      c.moveTo(0, y);
      c.lineTo(S.w, y);
    }
    c.stroke();
    // Axes
    c.strokeStyle = th.axis;
    c.beginPath();
    const x0 = Math.round(X(0)) + 0.5;
    const y0 = Math.round(Y(0)) + 0.5;
    c.moveTo(0, y0);
    c.lineTo(S.w, y0);
    c.moveTo(x0, 0);
    c.lineTo(x0, S.h);
    c.stroke();
    mono(c, 11);
    c.textBaseline = 'bottom';
    c.textAlign = 'left';
    label(c, '← +V-bar', 12, Math.min(S.h - 4, Math.max(14, y0 - 6)), th.textDim);
    c.textBaseline = 'top';
    label(c, '+R-bar ↑', Math.min(S.w - 70, Math.max(4, x0 + 8)), 8, th.textDim);

    // Ap / Pe lines
    const el = chaserElementsAt(tl, t);
    const rt = tl.targetRadius;
    this.apPeLines(c, el.e < 1 ? el.ra - rt : NaN, el.rp - rt, (el.e < 1 ? el.ra : NaN) - RE, el.rp - RE, Y, S.w);

    // Overlays: keep-out sphere and approach ellipsoid
    if (this.overlays) {
      c.save();
      c.setLineDash([4, 4]);
      c.strokeStyle = alpha(th.text, 0.45);
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(X(0), Y(0), 2000 * s, 1000 * s, 0, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = alpha(th.burn, 0.7);
      c.beginPath();
      c.arc(X(0), Y(0), 200 * s, 0, Math.PI * 2);
      c.stroke();
      c.restore();
      mono(c, 10.5);
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      if (2000 * s > 30) label(c, 'AE 4×2 km', X(0) - 2000 * s * 0.7, Y(0) - 1000 * s * 0.72, th.textDim);
      if (200 * s > 14) label(c, 'KOS 200 m', X(0) + 200 * s * 0.72, Y(0) - 200 * s * 0.72, th.burn);
    }

    // Tail: last quarter orbit, fading
    const t0 = Math.max(0, t - tl.targetPeriod / 4);
    const i0 = sampleIndex(tl, t0);
    const i1 = sampleIndex(tl, t);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = i0; i <= i1; i++) {
      xs.push(X(tl.rectV[i]));
      ys.push(Y(tl.rectR[i]));
    }
    const cx = X(rel.rect.v);
    const cy = Y(rel.rect.r);
    xs.push(cx);
    ys.push(cy);
    fadingPolyline(c, xs, ys, th.chaser, 2, 0, 1);

    // Target
    drawTarget(c, X(0), Y(0), 10);

    // Relative velocity arrow (length ∝ speed: displacement over 1/12 orbit)
    const vmag = Math.hypot(rel.rect.vv, rel.rect.vr);
    if (vmag > 1e-4) {
      const len = Math.max(12, Math.min(Math.min(S.w, S.h) * 0.35, vmag * (tl.targetPeriod / 12) * s));
      const dx = -rel.rect.vv / vmag;
      const dy = -rel.rect.vr / vmag;
      arrow(c, cx, cy, cx + dx * len, cy + dy * len, th.chaser, 1.6, 7);
      mono(c, 12);
      c.textBaseline = 'middle';
      c.textAlign = dx > 0 ? 'left' : 'right';
      label(c, speed(vmag), cx + dx * (len + 8), cy + dy * (len + 8) + (Math.abs(dy) < 0.3 ? -10 : 0), th.text);
    }
    drawChaser(c, cx, cy, 5.5);
    mono(c, 12);
    const arrowLeft = vmag > 1e-4 && -rel.rect.vv / vmag < 0;
    c.textAlign = arrowLeft || vmag <= 1e-4 ? 'left' : 'right';
    c.textBaseline = 'middle';
    label(c, 'Chaser', arrowLeft || vmag <= 1e-4 ? cx + 10 : cx - 10, cy + (-rel.rect.vr / Math.max(vmag, 1e-9) < 0 ? 12 : -12), th.chaser);

    // Scale bar
    const bar = scaleBarLength(span / 3.5);
    const bx = 14;
    const by = S.h - 16;
    c.strokeStyle = th.text;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(bx, by - 4);
    c.lineTo(bx, by + 4);
    c.moveTo(bx, by);
    c.lineTo(bx + bar * s, by);
    c.moveTo(bx + bar * s, by - 4);
    c.lineTo(bx + bar * s, by + 4);
    c.stroke();
    mono(c, 12);
    c.textAlign = 'left';
    label(c, fmtSpan(bar), bx + bar * s + 8, by, th.text);
  }

  private apPeLines(c: CanvasRenderingContext2D, rAp: number, rPe: number, apAlt: number, peAlt: number, Y: (r: number) => number, w: number): void {
    const th = theme();
    c.save();
    c.setLineDash([2, 4]);
    c.strokeStyle = alpha(th.chaser, 0.8);
    c.lineWidth = 1.2;
    mono(c, 11);
    c.textAlign = 'right';
    const lines: [number, string][] = [];
    if (Number.isFinite(rAp)) lines.push([rAp, `Ap ${num(apAlt / 1000, 1)} km`]);
    lines.push([rPe, `Pe ${num(peAlt / 1000, 1)} km`]);
    const same = lines.length === 2 && Math.abs(Y(lines[0][0]) - Y(lines[1][0])) < 14;
    lines.forEach(([r, text], i) => {
      const y = Y(r);
      if (y < -2 || y > this.surface.h + 2) return;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
      c.textBaseline = same ? (i === 0 ? 'bottom' : 'top') : 'bottom';
      label(c, text, w - 8, same && i === 1 ? y + 3 : y - 3, th.chaser);
    });
    c.restore();
  }

  private updateTelemetry(t: number, range: number, rate: number, v: number, r: number): void {
    setText(this.tele.range, dist(range));
    setText(this.tele.rate, dv(rate, true));
    const [vs, rs, u] = distPair(v, r);
    setText(this.tele.vr, `V ${vs}  R ${rs} ${u}`);
    const next = this.app.clock.nextBurnTime(t);
    setText(this.tele.next, next === null ? '—' : countdown(next - t));
  }
}
