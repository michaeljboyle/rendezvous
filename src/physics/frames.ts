import type { State } from './kepler';

/**
 * Target-centred LVLH coordinates. V-bar = along-track (+ ahead), R-bar = radial (+ up).
 * Rates are measured in the rotating frame.
 */
export interface Lvlh {
  v: number;
  r: number;
  vv: number;
  vr: number;
}

/** Local frame unit vectors of a state: R̂ (radial) and Ŝ (along-track, toward motion). */
export function localAxes(s: State): { rx: number; ry: number; sx: number; sy: number } {
  const r = Math.hypot(s.x, s.y);
  const rx = s.x / r;
  const ry = s.y / r;
  const h = s.x * s.vy - s.y * s.vx;
  const w = h >= 0 ? 1 : -1; // Ŵ = ±ẑ
  // Ŝ = Ŵ × R̂
  return { rx, ry, sx: -w * ry, sy: w * rx };
}

/** ECI → Target LVLH (rectilinear), removing the frame's rotation from the relative velocity. */
export function toLvlh(target: State, chaser: State): Lvlh {
  const { rx, ry, sx, sy } = localAxes(target);
  const px = chaser.x - target.x;
  const py = chaser.y - target.y;
  const rt2 = target.x * target.x + target.y * target.y;
  const omega = (target.x * target.vy - target.y * target.vx) / rt2; // z component
  // ω × ρ = ω ẑ × (px, py) = ω (−py, px)
  const dvx = chaser.vx - target.vx + omega * py;
  const dvy = chaser.vy - target.vy - omega * px;
  return {
    v: px * sx + py * sy,
    r: px * rx + py * ry,
    vv: dvx * sx + dvy * sy,
    vr: dvx * rx + dvy * ry,
  };
}

/**
 * Signed phase angle of the Chaser relative to the Target, rad, in (−π, π].
 * Positive = ahead (in the Target's direction of motion).
 */
export function phaseAngle(target: State, chaser: State): number {
  const cross = target.x * chaser.y - target.y * chaser.x;
  const dot = target.x * chaser.x + target.y * chaser.y;
  const h = target.x * target.vy - target.y * target.vx;
  return (h >= 0 ? 1 : -1) * Math.atan2(cross, dot);
}

/**
 * Curvilinear LVLH: V-bar = Target radius × phase angle (arc length), R-bar = |r_c| − |r_t|.
 * `refV` (optional) picks the 2π branch of the phase angle closest to a reference value,
 * so long-range trajectories stay continuous.
 */
export function toCurvilinear(target: State, chaser: State, refV?: number): Lvlh {
  const rt = Math.hypot(target.x, target.y);
  const rc = Math.hypot(chaser.x, chaser.y);
  let phase = phaseAngle(target, chaser);
  if (refV !== undefined) {
    const k = Math.round((refV / rt - phase) / (2 * Math.PI));
    phase += 2 * Math.PI * k;
  }
  const h = target.x * target.vy - target.y * target.vx;
  const sgn = h >= 0 ? 1 : -1;
  const rtDot = (target.x * target.vx + target.y * target.vy) / rt;
  const rcDot = (chaser.x * chaser.vx + chaser.y * chaser.vy) / rc;
  const thtDot = h / (rt * rt);
  const thcDot = (chaser.x * chaser.vy - chaser.y * chaser.vx) / (rc * rc);
  return {
    v: rt * phase,
    r: rc - rt,
    vv: rt * sgn * (thcDot - thtDot) + rtDot * phase,
    vr: rcDot - rtDot,
  };
}

/** Rotate a local (R, S) vector of `s` into the inertial frame. */
export function localToInertial(s: State, r: number, sComp: number): { x: number; y: number } {
  const ax = localAxes(s);
  return { x: r * ax.rx + sComp * ax.sx, y: r * ax.ry + sComp * ax.sy };
}

/**
 * Build a Chaser state from a curvilinear LVLH offset relative to a circular Target.
 * With zero LVLH velocity the Chaser is at rest in the rotating frame; with rbar = 0 that is
 * exactly co-circular.
 */
export function fromCurvilinear(target: State, off: Lvlh): State {
  const rt = Math.hypot(target.x, target.y);
  const h = target.x * target.vy - target.y * target.vx;
  const sgn = h >= 0 ? 1 : -1;
  const thetaT = Math.atan2(target.y, target.x);
  const omega = h / (rt * rt);
  const rc = rt + off.r;
  const thetaC = thetaT + (sgn * off.v) / rt;
  const thcDot = omega + (sgn * off.vv) / rt;
  const cx = Math.cos(thetaC);
  const cy = Math.sin(thetaC);
  // velocity = ṙ R̂ + r θ̇ (ẑ × R̂)
  return {
    x: rc * cx,
    y: rc * cy,
    vx: off.vr * cx - rc * thcDot * cy,
    vy: off.vr * cy + rc * thcDot * cx,
  };
}
