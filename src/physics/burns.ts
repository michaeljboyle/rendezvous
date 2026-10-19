import type { State } from './kepler';
import { localToInertial } from './frames';
import type { ScenarioBurn } from '../scenarios/schema';

/** Apply an impulsive Δv given in the vehicle's local (R, S) frame. */
export function applyBurn(s: State, dvR: number, dvS: number): State {
  const d = localToInertial(s, dvR, dvS);
  return { x: s.x, y: s.y, vx: s.vx + d.x, vy: s.vy + d.y };
}

export function dvMagnitude(b: ScenarioBurn): number {
  return Math.hypot(b.dv.r, b.dv.s);
}

export const LARGE_DV = 50;

export interface BurnIssues {
  /** TIG outside [0, duration]: flagged red and skipped. */
  outOfRange: boolean;
  /** Another enabled burn shares this TIG (applied in list order). */
  sameTig: boolean;
  /** |Δv| above 50 m/s (warning only). */
  large: boolean;
}

export function burnIssues(burns: ScenarioBurn[], durationS: number): BurnIssues[] {
  return burns.map((b, i) => ({
    outOfRange: !(b.tigS >= 0 && b.tigS <= durationS),
    sameTig: burns.some((o, j) => j !== i && o.enabled && b.enabled && Math.abs(o.tigS - b.tigS) < 1e-6),
    large: dvMagnitude(b) > LARGE_DV,
  }));
}

/** Total Δv of the enabled, in-range burns. */
export function totalDv(burns: ScenarioBurn[], durationS: number): number {
  return burns.reduce((sum, b) => (b.enabled && b.tigS >= 0 && b.tigS <= durationS ? sum + dvMagnitude(b) : sum), 0);
}
