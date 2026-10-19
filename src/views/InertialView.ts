import { RE, SAMPLE_DT } from '../physics/constants';
import type { Elements, State } from '../physics/kepler';
import { localAxes } from '../physics/frames';
import { chaserAt, segmentIndexAt, targetAt, type Timeline } from '../physics/timeline';
import { phaseAngle } from '../physics/frames';
import type { AppCtx, View } from '../ui/context';
import { h, icon, segmented, setText } from '../ui/dom';
import { num } from '../ui/format';
import { panel, telemetryItem } from '../ui/panel';
import { Surface } from './canvas';
import { arrow, drawBurnMarker, drawChaser, drawTarget, label, mono } from './draw';
import { attachGestures, type Pt } from './gestures';
import { alpha, theme } from './theme';

export const EXAGGERATIONS = [1, 10, 30, 100];

interface Hit {
  x: number;
  y: number;
  text: string;
  burn?: number;
}

/** View 1 — Earth-centred inertial view looking down the orbit normal. */
export class InertialView implements View {
  el: HTMLElement;
  k = 30;
  camera: 'fixed' | 'follow' = 'fixed';
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private surface: Surface;
  private hover: Pt | null = null;
  private hits: Hit[] = [];
  private kBtn: HTMLButtonElement;
  private cam;
  private tele: Record<string, HTMLElement> = {};
  // Current transform
  private cx = 0;
  private cy = 0;
  private s = 1;
  private ox = 0;
  private oy = 0;
  private ex = { x: 1, y: 0 };
  private ey = { x: 0, y: 1 };

  constructor(private app: AppCtx) {
    const p = panel('view-inertial', 'Inertial orbits', 'Earth-centered, looking down the orbit normal', 'Inertial orbits');
    this.el = p.el;
    this.kBtn = h('button', {
      type: 'button',
      class: 'chip chip-warn',
      title: 'Altitude exaggeration (click to change)',
      onclick: () => {
        this.k = EXAGGERATIONS[(EXAGGERATIONS.indexOf(this.k) + 1) % EXAGGERATIONS.length];
        this.updateK();
        app.invalidate();
      },
    });
    this.cam = segmented(
      'Camera',
      [
        { value: 'fixed', label: 'Fixed' },
        { value: 'follow', label: 'Follow', title: 'Centre on the Target, velocity left, radial up (LVLH orientation)' },
      ],
      this.camera,
      (v) => {
        this.camera = v;
        this.cam.set(v);
        this.fit();
      },
    );
    const fitBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fit view', title: 'Fit view (double-click)', onclick: () => this.fit() }, icon('fit', 16));
    p.controls.append(this.kBtn, this.cam.el, fitBtn);
    this.updateK();

    const tgt = h('span', { class: 'sw sw-target', 'aria-label': 'Target' });
    const ch = h('span', { class: 'sw sw-chaser', 'aria-label': 'Chaser' });
    const items: [string, string, Node?][] = [
      ['tAlt', 'Alt', tgt],
      ['tP', '· P'],
      ['cAlt', 'Alt', ch],
      ['cApPe', '· Ap/Pe'],
      ['cP', '· P'],
      ['cE', '· e'],
      ['phase', 'Phase'],
    ];
    const groups = [h('span', { class: 'tg' }), h('span', { class: 'tg' }), h('span', { class: 'tg' })];
    items.forEach(([key, lab, pre], i) => {
      const it = telemetryItem(lab, pre);
      this.tele[key] = it.value;
      groups[i < 2 ? 0 : i < 6 ? 1 : 2].append(it.el);
    });
    p.telemetry.append(...groups);

    this.surface = new Surface(p.host, () => app.invalidate());
    attachGestures(this.surface.canvas, (e) => this.surface.local(e), {
      onPress: () => ({
        move: (_p, dx, dy) => {
          this.pan.x += dx;
          this.pan.y += dy;
          app.invalidate();
        },
      }),
      onTap: (pt) => {
        const hit = this.hitAt(pt);
        if (hit?.burn !== undefined) app.store.beginEdit(hit.burn);
        this.hover = pt;
        app.invalidate();
      },
      onDoubleTap: () => this.fit(),
      onWheel: (e, pt) => this.zoomAt(Math.exp(-e.deltaY * 0.0015), pt),
      onPinch: (f, _axis, c, pan) => {
        this.pan.x += pan.x;
        this.pan.y += pan.y;
        this.zoomAt(f, c);
      },
      onHover: (pt) => {
        this.hover = pt;
        this.surface.canvas.style.cursor = pt && this.hitAt(pt)?.burn !== undefined ? 'pointer' : 'grab';
        app.invalidate();
      },
    });
  }

  private updateK(): void {
    this.kBtn.textContent = `Altitude ×${this.k}`;
    this.kBtn.setAttribute('aria-label', `Altitude exaggeration ×${this.k}, click to change`);
  }

  fit(): void {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.app.invalidate();
  }

  private zoomAt(f: number, p: Pt): void {
    const nz = Math.max(0.2, Math.min(400, this.zoom * f));
    const ff = nz / this.zoom;
    // Keep the point under the cursor fixed: pan' = p - c0 - (p - c0 - pan) * ff
    const c0x = this.surface.w / 2;
    const c0y = this.surface.h / 2;
    this.pan.x = p.x - c0x - (p.x - c0x - this.pan.x) * ff;
    this.pan.y = p.y - c0y - (p.y - c0y - this.pan.y) * ff;
    this.zoom = nz;
    this.app.invalidate();
  }

  private hitAt(p: Pt): Hit | undefined {
    let best: Hit | undefined;
    let bd = 14;
    for (const hit of this.hits) {
      const d = Math.hypot(hit.x - p.x, hit.y - p.y);
      if (d < bd) {
        bd = d;
        best = hit;
      }
    }
    return best;
  }

  // ----- geometry -----

  private exag(x: number, y: number): Pt {
    const r = Math.hypot(x, y);
    const rd = RE + this.k * (r - RE);
    return { x: (x * rd) / r, y: (y * rd) / r };
  }

  /** Exaggerated world point → screen. */
  private toScreen(p: Pt): Pt {
    const dx = p.x - this.ox;
    const dy = p.y - this.oy;
    return { x: this.cx + (dx * this.ex.x + dy * this.ex.y) * this.s, y: this.cy - (dx * this.ey.x + dy * this.ey.y) * this.s };
  }

  private pt(x: number, y: number): Pt {
    return this.toScreen(this.exag(x, y));
  }

  /** Inertial direction → screen direction (unit). */
  private dir(x: number, y: number): Pt {
    const sx = x * this.ex.x + y * this.ex.y;
    const sy = -(x * this.ey.x + y * this.ey.y);
    const n = Math.hypot(sx, sy) || 1;
    return { x: sx / n, y: sy / n };
  }

  /**
   * Sample a curve f(u), u ∈ [u0, u1], for drawing. A coarse pass finds the pieces that touch the
   * viewport; only those are subdivided (to ~3 px chords), so curves stay smooth at any zoom without
   * sampling the off-screen part finely. f returns null where the curve is undefined (a break).
   */
  private sampleCurve(f: (u: number) => Pt | null, u0: number, u1: number, coarse: number): ({ p: Pt; u: number } | null)[] {
    const W = this.surface.w;
    const H = this.surface.h;
    const out: ({ p: Pt; u: number } | null)[] = [];
    let prev = f(u0);
    out.push(prev ? { p: prev, u: u0 } : null);
    for (let i = 1; i <= coarse; i++) {
      const ua = u0 + ((u1 - u0) * (i - 1)) / coarse;
      const ub = u0 + ((u1 - u0) * i) / coarse;
      const q = f(ub);
      if (prev && q) {
        const chord = Math.hypot(q.x - prev.x, q.y - prev.y);
        // Margin covers how far the true curve can bulge beyond the chord.
        const m = 0.15 * chord + 4;
        const visible = Math.max(prev.x, q.x) + m >= 0 && Math.min(prev.x, q.x) - m <= W && Math.max(prev.y, q.y) + m >= 0 && Math.min(prev.y, q.y) - m <= H;
        const n = visible ? Math.min(4096, Math.ceil(chord / 3)) : 1;
        for (let k = 1; k < n; k++) {
          const u = ua + ((ub - ua) * k) / n;
          const p = f(u);
          out.push(p ? { p, u } : null);
        }
      }
      out.push(q ? { p: q, u: ub } : null);
      prev = q;
    }
    return out;
  }

  private tracePoints(c: CanvasRenderingContext2D, pts: ({ p: Pt } | null)[]): void {
    let started = false;
    for (const s of pts) {
      if (!s) {
        started = false;
        continue;
      }
      if (started) c.lineTo(s.p.x, s.p.y);
      else c.moveTo(s.p.x, s.p.y);
      started = true;
    }
  }

  private orbitPath(c: CanvasRenderingContext2D, el: Elements): void {
    const sgn = el.h >= 0 ? 1 : -1;
    const closed = el.e < 1;
    const numax = closed ? Math.PI : Math.acos(-1 / el.e) - 0.02;
    const rmax = 12 * RE;
    const f = (nu: number): Pt | null => {
      const r = el.p / (1 + el.e * Math.cos(nu));
      if (!(r > 0) || r > rmax) return null;
      const ang = el.argp + sgn * nu;
      return this.pt(r * Math.cos(ang), r * Math.sin(ang));
    };
    this.tracePoints(c, this.sampleCurve(f, -numax, numax, 720));
    if (closed) c.closePath();
  }

  private alignState = new Map<string, CanvasTextAlign>();

  /**
   * Text alignment for a label placed along screen direction dx: left when it points right, right when
   * it points left, centred when it is near-vertical. Hysteresis stops the label flipping sides from
   * frame to frame when dx hovers at a boundary (e.g. the Target in Follow mode, where dx ≈ 0).
   */
  private alignFor(key: string, dx: number): CanvasTextAlign {
    const prev = this.alignState.get(key) ?? 'center';
    const enter = 0.35;
    const exit = 0.25;
    let next: CanvasTextAlign = prev;
    if (prev === 'center') {
      if (dx > enter) next = 'left';
      else if (dx < -enter) next = 'right';
    } else if (prev === 'left' ? dx < exit : dx > -exit) {
      next = Math.abs(dx) > enter ? (dx > 0 ? 'left' : 'right') : 'center';
    }
    this.alignState.set(key, next);
    return next;
  }

  private apsisPoints(el: Elements): { ap: Pt; pe: Pt } {
    const sgn = el.h >= 0 ? 1 : -1;
    const pe = { x: el.rp * Math.cos(el.argp), y: el.rp * Math.sin(el.argp) };
    const ang = el.argp + sgn * Math.PI;
    const ap = { x: el.ra * Math.cos(ang), y: el.ra * Math.sin(ang) };
    return { ap, pe };
  }

  // ----- render -----

  render(t: number): void {
    const S = this.surface;
    if (!S.visible) return;
    const th = theme();
    const c = S.begin(th.surface);
    const { store } = this.app;
    const tl = store.timeline;
    const T = targetAt(tl, t);
    const C = chaserAt(tl, t);
    const segI = segmentIndexAt(tl, t);
    const seg = tl.segments[segI];
    const prevSeg = segI > 0 ? tl.segments[segI - 1] : null;

    // Camera
    const extent = (el: Elements) => (el.e < 1 ? RE + this.k * (el.ra - RE) : RE + this.k * (tl.targetRadius - RE) * 1.5);
    const narrow = S.w < 560 ? 1.12 : 1;
    const fitR = narrow * Math.max(extent(tl.targetEl), Math.min(extent(seg.el), 3 * extent(tl.targetEl))) * 1.14;
    const base = Math.min(S.w, S.h) / 2 / fitR;
    this.cx = S.w / 2 + this.pan.x;
    this.cy = S.h / 2 + this.pan.y;
    if (this.camera === 'fixed') {
      this.s = base * this.zoom;
      this.ox = 0;
      this.oy = 0;
      this.ex = { x: 1, y: 0 };
      this.ey = { x: 0, y: 1 };
    } else {
      this.s = base * this.zoom * 3.5;
      const P = this.exag(T.x, T.y);
      this.ox = P.x;
      this.oy = P.y;
      const ax = localAxes(T);
      this.ex = { x: -ax.sx, y: -ax.sy };
      this.ey = { x: ax.rx, y: ax.ry };
    }
    this.hits = [];

    // Earth (to scale: exaggeration leaves r = Rₑ unchanged)
    const e0 = this.toScreen({ x: 0, y: 0 });
    c.beginPath();
    c.arc(e0.x, e0.y, RE * this.s, 0, Math.PI * 2);
    c.fillStyle = th.earth;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = th.earthLimb;
    c.stroke();
    if (RE * this.s > 40) {
      c.fillStyle = th.textDim;
      mono(c, 12);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (e0.x > 0 && e0.x < S.w && e0.y > 0 && e0.y < S.h) c.fillText('Earth', e0.x, e0.y);
    }

    // Ghost orbit: before the most recent burn
    if (prevSeg) {
      c.beginPath();
      this.orbitPath(c, prevSeg.el);
      c.strokeStyle = alpha(th.chaser, 0.2);
      c.lineWidth = 1.5;
      c.stroke();
    }

    // Orbits
    c.beginPath();
    this.orbitPath(c, tl.targetEl);
    c.strokeStyle = th.target;
    c.lineWidth = 1.5;
    c.stroke();
    c.beginPath();
    this.orbitPath(c, seg.el);
    c.strokeStyle = th.chaser;
    c.lineWidth = 1.5;
    c.stroke();

    // What-if ghost: the committed plan's future path while a burn is being edited.
    const ghost = store.ghost;
    if (ghost) this.drawGhostPath(c, ghost, t);

    // Apoapsis / periapsis ticks
    for (const [el, color] of [
      [seg.el, th.chaser],
      [tl.targetEl, th.target],
    ] as [Elements, string][]) {
      if (el.e < 2e-4 || el.e >= 1) continue;
      const { ap, pe } = this.apsisPoints(el);
      for (const [p, name, r] of [
        [ap, 'Ap', el.ra],
        [pe, 'Pe', el.rp],
      ] as [Pt, string, number][]) {
        const s = this.pt(p.x, p.y);
        const d = this.dir(p.x, p.y);
        c.beginPath();
        c.moveTo(s.x - d.x * 5, s.y - d.y * 5);
        c.lineTo(s.x + d.x * 5, s.y + d.y * 5);
        c.strokeStyle = color;
        c.lineWidth = 2;
        c.stroke();
        this.hits.push({ x: s.x, y: s.y, text: `${name} ${num((r - RE) / 1000, 1)} km` });
      }
    }

    // Trails: last 10% of an orbit
    this.drawTrail(c, tl, t, 'target', th.target);
    this.drawTrail(c, tl, t, 'chaser', th.chaser);

    // Burn markers
    this.drawBurns(c, tl, t);

    // LVLH triad at the Target
    const tS = this.pt(T.x, T.y);
    const ax = localAxes(T);
    const dv = this.dir(ax.sx, ax.sy);
    const dr = this.dir(ax.rx, ax.ry);
    arrow(c, tS.x, tS.y, tS.x + dv.x * 26, tS.y + dv.y * 26, th.textDim, 1.3, 5);
    arrow(c, tS.x, tS.y, tS.x + dr.x * 26, tS.y + dr.y * 26, th.textDim, 1.3, 5);
    mono(c, 10.5);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    label(c, 'V', tS.x + dv.x * 36, tS.y + dv.y * 36, th.textDim);
    label(c, 'R', tS.x + dr.x * 36, tS.y + dr.y * 36, th.textDim);

    // Vehicles
    const cS = this.pt(C.x, C.y);
    drawTarget(c, tS.x, tS.y, 10);
    drawChaser(c, cS.x, cS.y, 5);
    mono(c, 12);
    // Target label outward from Earth, Chaser label inward; alignment is hysteretic (no flicker).
    const out = this.dir(T.x, T.y);
    const ta = this.alignFor('target', out.x);
    if (ta === 'center') {
      // Near-vertical: the triad's R arrow points the same way, so sit beside it, not on it.
      c.textAlign = 'left';
      label(c, 'Target', tS.x + out.x * 30 + 12, tS.y + out.y * 30, th.target);
    } else {
      c.textAlign = ta;
      label(c, 'Target', tS.x + out.x * 40 + (ta === 'left' ? 6 : -6), tS.y + out.y * 40, th.target);
    }
    const cin = this.dir(C.x, C.y);
    const ca = this.alignFor('chaser', -cin.x);
    c.textAlign = ca;
    const sep = Math.hypot(cS.x - tS.x, cS.y - tS.y) < 24 ? 26 : 16;
    label(c, 'Chaser', cS.x - cin.x * sep + (ca === 'left' ? 4 : ca === 'right' ? -4 : 0), cS.y - cin.y * sep, th.chaser);

    // Legend
    this.drawLegend(c, tl, seg.el, !!prevSeg, !!ghost);

    // Hover tooltip
    if (this.hover) {
      const hit = this.hitAt(this.hover);
      if (hit && hit.burn === undefined) this.tooltip(c, hit);
    }

    this.updateTelemetry(tl, T, C, seg.el);
  }

  private drawGhostPath(c: CanvasRenderingContext2D, g: Timeline, t: number): void {
    const th = theme();
    if (t >= g.duration) return;
    const coarse = Math.max(2, Math.ceil((g.duration - t) / SAMPLE_DT));
    const pts = this.sampleCurve(
      (u) => {
        const s = chaserAt(g, u);
        return this.pt(s.x, s.y);
      },
      t,
      g.duration,
      coarse,
    );
    c.save();
    c.beginPath();
    this.tracePoints(c, pts);
    c.setLineDash([3, 4]);
    c.strokeStyle = alpha(th.text, 0.35);
    c.lineWidth = 1.2;
    c.stroke();
    c.restore();
  }

  private drawTrail(c: CanvasRenderingContext2D, tl: Timeline, t: number, who: 'target' | 'chaser', color: string): void {
    const t0 = Math.max(0, t - 0.1 * tl.targetPeriod);
    if (t <= t0) return;
    const at = who === 'target' ? (u: number) => targetAt(tl, u) : (u: number) => chaserAt(tl, u);
    const pts = this.sampleCurve(
      (u) => {
        const s = at(u);
        return this.pt(s.x, s.y);
      },
      t0,
      t,
      Math.max(2, Math.ceil((t - t0) / SAMPLE_DT)),
    );
    // Fade from transparent (oldest) to 0.9 at the vehicle, in bands of equal time.
    const BANDS = 24;
    c.save();
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    let band = -1;
    let last: Pt | null = null;
    for (const s of pts) {
      if (!s) {
        last = null;
        continue;
      }
      const b = Math.min(BANDS - 1, Math.floor(((s.u - t0) / (t - t0)) * BANDS));
      if (b !== band) {
        if (band >= 0) c.stroke();
        band = b;
        c.strokeStyle = alpha(color, (0.9 * (b + 0.5)) / BANDS);
        c.beginPath();
        if (last) c.moveTo(last.x, last.y);
        else c.moveTo(s.p.x, s.p.y);
      }
      c.lineTo(s.p.x, s.p.y);
      last = s.p;
    }
    if (band >= 0) c.stroke();
    c.restore();
  }

  private drawBurns(c: CanvasRenderingContext2D, tl: Timeline, t: number): void {
    const th = theme();
    const { store } = this.app;
    const sel = store.editing?.index;
    // Reserve the legend's corner so burn labels never sit on it.
    const compact = this.surface.w < 560;
    const legendLines = 2 + (tl.segments.length > 1 && !compact ? 1 : 0) + (store.ghost ? 1 : 0);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [{ x0: 0, y0: 0, x1: compact ? 260 : 330, y1: (compact ? 6 : 12) + legendLines * 22 }];
    for (const b of tl.burns) {
      const s = this.pt(b.pre.x, b.pre.y);
      // Off-screen burns get no marker or label (clamping their labels to the edge was misleading).
      if (s.x < -10 || s.x > this.surface.w + 10 || s.y < -10 || s.y > this.surface.h + 10) continue;
      const past = b.tig <= t;
      // Δv arrow
      const d = this.dir(b.post.vx - b.pre.vx, b.post.vy - b.pre.vy);
      if (Math.hypot(b.post.vx - b.pre.vx, b.post.vy - b.pre.vy) > 0) arrow(c, s.x, s.y, s.x + d.x * 22, s.y + d.y * 22, th.burn, 1.6, 6);
      drawBurnMarker(c, s.x, s.y, past, 6, sel === b.index);
      this.hits.push({ x: s.x, y: s.y, text: '', burn: b.index });
      // Label outward from Earth
      const out = this.dir(b.pre.x, b.pre.y);
      const lx = Math.max(8, Math.min(this.surface.w - 8, s.x + out.x * 22));
      const ly = Math.max(16, Math.min(this.surface.h - 22, s.y + out.y * 22));
      const burn = store.scenario.burns[b.index];
      const r = Math.hypot(b.pre.x, b.pre.y);
      const near = (x: number) => Math.abs(r - x) < 500;
      const apsis =
        b.before.e > 1e-3 && near(b.before.ra) ? 'Ap' : b.before.e > 1e-3 && near(b.before.rp) ? 'Pe' : b.after.e > 1e-3 && near(b.after.rp) ? 'Pe' : b.after.e > 1e-3 && near(b.after.ra) ? 'Ap' : 'Alt';
      const ba = this.alignFor(`burn${b.index}`, out.x);
      c.textAlign = ba;
      c.textBaseline = 'middle';
      mono(c, 12);
      const l1 = `${store.numbers[b.index]} ${burn.name}`;
      const l2 = `${apsis} ${num((r - RE) / 1000, 1)} km`;
      const w = Math.max(c.measureText(l1).width, c.measureText(l2).width);
      const bx0 = ba === 'left' ? lx : ba === 'right' ? lx - w : lx - w / 2;
      const box = { x0: bx0, y0: ly - 15, x1: bx0 + w, y1: ly + 15 };
      if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) {
        const nb = { x0: s.x - 18, y0: s.y + 8, x1: s.x + 18, y1: s.y + 22 };
        if (!placed.some((p) => nb.x0 < p.x1 && nb.x1 > p.x0 && nb.y0 < p.y1 && nb.y1 > p.y0)) {
          placed.push(nb);
          c.textAlign = 'center';
          label(c, String(store.numbers[b.index]), s.x, s.y + 16, th.text);
        }
        continue;
      }
      placed.push(box);
      label(c, l1, lx, ly - 7, th.text);
      mono(c, 11);
      label(c, l2, lx, ly + 8, th.textDim);
    }
  }

  private drawLegend(c: CanvasRenderingContext2D, tl: Timeline, el: Elements, hasGhost: boolean, whatIf: boolean): void {
    const th = theme();
    const compact = this.surface.w < 560;
    if (compact) hasGhost = false;
    mono(c, compact ? 11 : 12);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    let y = compact ? 16 : 22;
    const x = compact ? 10 : 16;
    c.fillStyle = th.target;
    c.fillRect(x, y - 5, 10, 10);
    label(c, `Target · ${num((tl.targetRadius - RE) / 1000, 0)} km circular`, x + 18, y, th.text);
    y += 22;
    c.beginPath();
    c.arc(x + 5, y, 5, 0, Math.PI * 2);
    c.fillStyle = th.chaser;
    c.fill();
    let desc: string;
    if (el.e >= 1) desc = 'escape trajectory';
    else if (el.e < 5e-4) desc = `${num((el.a - RE) / 1000, 0)} km circular`;
    else desc = `${num((el.rp - RE) / 1000, 0)} × ${num((el.ra - RE) / 1000, 0)} km`;
    label(c, `Chaser · ${desc}`, x + 18, y, th.text);
    if (hasGhost) {
      y += 22;
      c.strokeStyle = alpha(th.chaser, 0.35);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 12, y);
      c.stroke();
      label(c, 'Orbit before last burn', x + 18, y, th.textDim);
    }
    if (whatIf) {
      y += 22;
      c.save();
      c.setLineDash([3, 4]);
      c.strokeStyle = alpha(th.text, 0.5);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 12, y);
      c.stroke();
      c.restore();
      label(c, 'What-if: plan before this edit', x + 18, y, th.textDim);
    }
    c.textAlign = 'right';
    c.textBaseline = 'bottom';
    mono(c, 11);
    label(c, `Altitude ×${this.k}${this.k === 1 ? ' (true scale)' : ' · not to scale'}`, this.surface.w - 12, this.surface.h - 10, th.textDim);
  }

  private tooltip(c: CanvasRenderingContext2D, hit: Hit): void {
    const th = theme();
    mono(c, 12);
    const w = c.measureText(hit.text).width + 14;
    const x = Math.min(this.surface.w - w - 4, hit.x + 10);
    const y = Math.max(4, hit.y - 30);
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
    c.fillText(hit.text, x + 7, y + 11);
  }

  private updateTelemetry(tl: Timeline, T: State, C: State, el: Elements): void {
    const tAlt = (Math.hypot(T.x, T.y) - RE) / 1000;
    const cAlt = (Math.hypot(C.x, C.y) - RE) / 1000;
    setText(this.tele.tAlt, `${num(tAlt, 1)} km`);
    setText(this.tele.tP, `${num(tl.targetPeriod / 60, 2)} min`);
    setText(this.tele.cAlt, `${num(cAlt, 1)} km`);
    setText(this.tele.cApPe, el.e < 1 ? `${num((el.ra - RE) / 1000, 1)}/${num((el.rp - RE) / 1000, 1)}` : `—/${num((el.rp - RE) / 1000, 1)}`);
    setText(this.tele.cP, el.e < 1 ? `${num(el.period / 60, 2)} min` : '—');
    setText(this.tele.cE, num(el.e, 4));
    setText(this.tele.phase, `${num((phaseAngle(T, C) * 180) / Math.PI, 2)}°`);
  }
}
