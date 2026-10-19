import { MU, RE, SAMPLE_DT } from './constants';
import { circularPeriod, circularState, elements, propagate, type Elements, type State } from './kepler';
import { fromCurvilinear, toCurvilinear, toLvlh, type Lvlh } from './frames';
import { applyBurn } from './burns';
import type { Scenario } from '../scenarios/schema';

/** Inertial angle of the Target at T+0 (straight "up" in the fixed inertial view). */
export const TARGET_THETA0 = Math.PI / 2;

export interface BurnEvent {
  /** Index into scenario.burns. */
  index: number;
  tig: number;
  pre: State;
  post: State;
  before: Elements;
  after: Elements;
}

export interface Segment {
  t0: number;
  t1: number;
  /** Chaser state at t0 (after the burn that starts the segment, if any). */
  state0: State;
  el: Elements;
  /** Index into scenario.burns of the burn that starts this segment, or -1 for the initial coast. */
  burnIndex: number;
}

export interface RelState {
  rect: Lvlh;
  curv: Lvlh;
  range: number;
  rangeRate: number;
}

export interface Timeline {
  duration: number;
  targetRadius: number;
  targetPeriod: number;
  /** Target mean motion, rad/s. */
  n: number;
  target0: State;
  chaser0: State;
  targetEl: Elements;
  segments: Segment[];
  burns: BurnEvent[];
  count: number;
  t: Float64Array;
  tx: Float64Array;
  ty: Float64Array;
  cx: Float64Array;
  cy: Float64Array;
  rectV: Float64Array;
  rectR: Float64Array;
  curvV: Float64Array;
  curvR: Float64Array;
  range: Float64Array;
}

export function scenarioDuration(s: Scenario): number {
  const rt = RE + s.target.altitudeKm * 1000;
  return s.durationRevs !== undefined ? s.durationRevs * circularPeriod(rt) : s.durationS;
}

export function initialStates(s: Scenario): { target: State; chaser: State } {
  const rt = RE + s.target.altitudeKm * 1000;
  const target = circularState(rt, TARGET_THETA0);
  let chaser: State;
  if ('lvlh' in s.chaser) {
    const l = s.chaser.lvlh;
    chaser = fromCurvilinear(target, { v: l.vbarM, r: l.rbarM, vv: l.vVbarMps ?? 0, vr: l.vRbarMps ?? 0 });
  } else {
    const c = s.chaser.circular;
    chaser = circularState(RE + c.altitudeKm * 1000, TARGET_THETA0 + (c.phaseDeg * Math.PI) / 180);
  }
  return { target, chaser };
}

/** Burns the propagator applies: enabled and inside the scenario, sorted by TIG (list order on ties). */
export function activeBurnOrder(s: Scenario, duration: number): number[] {
  return s.burns
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.enabled && b.tigS >= 0 && b.tigS <= duration)
    .sort((p, q) => p.b.tigS - q.b.tigS || p.i - q.i)
    .map(({ i }) => i);
}

export function buildTimeline(s: Scenario): Timeline {
  const duration = scenarioDuration(s);
  const { target: target0, chaser: chaser0 } = initialStates(s);
  const targetEl = elements(target0);
  const targetRadius = Math.hypot(target0.x, target0.y);
  const targetPeriod = targetEl.period;

  // Segments and burn events.
  const segments: Segment[] = [];
  const burns: BurnEvent[] = [];
  let segStart = 0;
  let segState = chaser0;
  let segBurn = -1;
  for (const i of activeBurnOrder(s, duration)) {
    const b = s.burns[i];
    const pre = propagate(segState, b.tigS - segStart);
    const post = applyBurn(pre, b.dv.r, b.dv.s);
    segments.push({ t0: segStart, t1: b.tigS, state0: segState, el: elements(segState), burnIndex: segBurn });
    burns.push({ index: i, tig: b.tigS, pre, post, before: elements(pre), after: elements(post) });
    segStart = b.tigS;
    segState = post;
    segBurn = i;
  }
  segments.push({ t0: segStart, t1: duration, state0: segState, el: elements(segState), burnIndex: segBurn });

  // Sample times: every SAMPLE_DT, plus every TIG and the end.
  const times: number[] = [];
  const tigs = burns.map((b) => b.tig);
  let k = 0;
  for (let i = 0; ; i++) {
    const t = i * SAMPLE_DT;
    while (k < tigs.length && tigs[k] < t) {
      if (times[times.length - 1] !== tigs[k]) times.push(tigs[k]);
      k++;
    }
    if (t > duration) break;
    if (times[times.length - 1] !== t) times.push(t);
  }
  while (k < tigs.length) {
    if (times[times.length - 1] !== tigs[k]) times.push(tigs[k]);
    k++;
  }
  if (times[times.length - 1] < duration) times.push(duration);

  const count = times.length;
  const tl: Timeline = {
    duration,
    targetRadius,
    targetPeriod,
    n: (2 * Math.PI) / targetPeriod,
    target0,
    chaser0,
    targetEl,
    segments,
    burns,
    count,
    t: Float64Array.from(times),
    tx: new Float64Array(count),
    ty: new Float64Array(count),
    cx: new Float64Array(count),
    cy: new Float64Array(count),
    rectV: new Float64Array(count),
    rectR: new Float64Array(count),
    curvV: new Float64Array(count),
    curvR: new Float64Array(count),
    range: new Float64Array(count),
  };

  let seg = 0;
  let prevV: number | undefined;
  for (let i = 0; i < count; i++) {
    const t = times[i];
    while (seg < segments.length - 1 && t >= segments[seg + 1].t0) seg++;
    const T = propagate(target0, t);
    const C = propagate(segments[seg].state0, t - segments[seg].t0);
    const rect = toLvlh(T, C);
    const curv = toCurvilinear(T, C, prevV);
    prevV = curv.v;
    tl.tx[i] = T.x;
    tl.ty[i] = T.y;
    tl.cx[i] = C.x;
    tl.cy[i] = C.y;
    tl.rectV[i] = rect.v;
    tl.rectR[i] = rect.r;
    tl.curvV[i] = curv.v;
    tl.curvR[i] = curv.r;
    tl.range[i] = Math.hypot(C.x - T.x, C.y - T.y);
  }
  return tl;
}

/** Index of the last sample with t[i] ≤ t (clamped). */
export function sampleIndex(tl: Timeline, t: number): number {
  let lo = 0;
  let hi = tl.count - 1;
  if (t <= tl.t[0]) return 0;
  if (t >= tl.t[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tl.t[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function segmentIndexAt(tl: Timeline, t: number): number {
  let i = 0;
  while (i < tl.segments.length - 1 && t >= tl.segments[i + 1].t0) i++;
  return i;
}

export function targetAt(tl: Timeline, t: number): State {
  return propagate(tl.target0, t);
}

export function chaserAt(tl: Timeline, t: number): State {
  const seg = tl.segments[segmentIndexAt(tl, t)];
  return propagate(seg.state0, t - seg.t0);
}

/** Chaser osculating elements at time t. */
export function chaserElementsAt(tl: Timeline, t: number): Elements {
  return tl.segments[segmentIndexAt(tl, t)].el;
}

/** Exact relative state at time t (propagated, not interpolated). */
export function relativeAt(tl: Timeline, t: number): RelState {
  const T = targetAt(tl, t);
  const C = chaserAt(tl, t);
  const rect = toLvlh(T, C);
  const i = sampleIndex(tl, t);
  const curv = toCurvilinear(T, C, tl.curvV[i]);
  const px = C.x - T.x;
  const py = C.y - T.y;
  const range = Math.hypot(px, py);
  const rangeRate = range > 0 ? (px * (C.vx - T.vx) + py * (C.vy - T.vy)) / range : 0;
  return { rect, curv, range, rangeRate };
}

export function altitude(s: State): number {
  return Math.hypot(s.x, s.y) - RE;
}

export { MU, RE };
