import { propagate, type State } from './kepler';
import { applyBurn } from './burns';
import { localAxes, toLvlh } from './frames';

/**
 * Two-body shooting: find the local-frame Δv (R, S) that, applied to `chaser` at time t0,
 * puts it at the rectilinear LVLH position (v, r) of the Target after `dt` seconds.
 * Newton iteration with a finite-difference Jacobian, starting from `guess`.
 */
export function solveTransfer(
  target: State,
  chaser: State,
  dt: number,
  goal: { v: number; r: number },
  guess: { r: number; s: number } = { r: 0, s: 0 },
): { r: number; s: number } {
  const tEnd = propagate(target, dt);
  const miss = (dv: { r: number; s: number }) => {
    const c = propagate(applyBurn(chaser, dv.r, dv.s), dt);
    const l = toLvlh(tEnd, c);
    return [l.v - goal.v, l.r - goal.r];
  };
  let dv = { ...guess };
  for (let it = 0; it < 20; it++) {
    const f = miss(dv);
    if (Math.hypot(f[0], f[1]) < 1e-6) break;
    const h = 1e-4;
    const fr = miss({ r: dv.r + h, s: dv.s });
    const fs = miss({ r: dv.r, s: dv.s + h });
    const j00 = (fr[0] - f[0]) / h;
    const j10 = (fr[1] - f[1]) / h;
    const j01 = (fs[0] - f[0]) / h;
    const j11 = (fs[1] - f[1]) / h;
    const det = j00 * j11 - j01 * j10;
    dv = {
      r: dv.r - (j11 * f[0] - j01 * f[1]) / det,
      s: dv.s - (-j10 * f[0] + j00 * f[1]) / det,
    };
  }
  return dv;
}

/** Local-frame Δv that brings the Chaser to rest in the Target's LVLH frame. */
export function nullRelativeVelocity(target: State, chaser: State): { r: number; s: number } {
  const rt2 = target.x * target.x + target.y * target.y;
  const omega = (target.x * target.vy - target.y * target.vx) / rt2;
  // Required inertial velocity: v_t + ω × ρ
  const px = chaser.x - target.x;
  const py = chaser.y - target.y;
  const wantX = target.vx - omega * py;
  const wantY = target.vy + omega * px;
  const dx = wantX - chaser.vx;
  const dy = wantY - chaser.vy;
  const ax = localAxes(chaser);
  return { r: dx * ax.rx + dy * ax.ry, s: dx * ax.sx + dy * ax.sy };
}

export { toLvlh };
