import { MU } from './constants';

/** Position (m) and velocity (m/s) in the shared orbit plane, Earth-centred inertial. */
export interface State {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Elements {
  /** Semi-major axis, m (negative for hyperbolic). */
  a: number;
  e: number;
  /** Specific angular momentum (z component), m^2/s. Positive = counter-clockwise. */
  h: number;
  /** Specific orbital energy, J/kg. */
  energy: number;
  /** Periapsis radius, m. */
  rp: number;
  /** Apoapsis radius, m (Infinity if unbound). */
  ra: number;
  /** Orbital period, s (Infinity if unbound). */
  period: number;
  /** Inertial angle of periapsis, rad. */
  argp: number;
  /** Semi-latus rectum, m. */
  p: number;
}

/** Stumpff functions C(z), S(z). */
export function stumpff(z: number): [number, number] {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return [(1 - Math.cos(s)) / z, (s - Math.sin(s)) / (s * s * s)];
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return [(Math.cosh(s) - 1) / -z, (Math.sinh(s) - s) / (s * s * s)];
  }
  // Series about z = 0.
  return [1 / 2 - z / 24 + (z * z) / 720, 1 / 6 - z / 120 + (z * z) / 5040];
}

export function elements(s: State, mu = MU): Elements {
  const r = Math.hypot(s.x, s.y);
  const v2 = s.vx * s.vx + s.vy * s.vy;
  const h = s.x * s.vy - s.y * s.vx;
  const energy = v2 / 2 - mu / r;
  const a = -mu / (2 * energy);
  // Eccentricity vector: e = ((v^2 - mu/r) r - (r.v) v) / mu
  const rv = s.x * s.vx + s.y * s.vy;
  const ex = ((v2 - mu / r) * s.x - rv * s.vx) / mu;
  const ey = ((v2 - mu / r) * s.y - rv * s.vy) / mu;
  const e = Math.hypot(ex, ey);
  const p = (h * h) / mu;
  const rp = p / (1 + e);
  const bound = e < 1;
  const ra = bound ? p / (1 - e) : Infinity;
  const period = bound ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;
  // For a circular orbit the periapsis direction is undefined; use the current position.
  const argp = e > 1e-12 ? Math.atan2(ey, ex) : Math.atan2(s.y, s.x);
  return { a, e, h, energy, rp, ra, period, argp, p };
}

/**
 * Exact two-body propagation by universal variables.
 * Elliptic orbits are reduced modulo one period first, so long spans stay accurate.
 */
export function propagate(s0: State, dt: number, mu = MU): State {
  if (dt === 0) return { ...s0 };
  const r0 = Math.hypot(s0.x, s0.y);
  const v02 = s0.vx * s0.vx + s0.vy * s0.vy;
  const vr0 = (s0.x * s0.vx + s0.y * s0.vy) / r0;
  const alpha = 2 / r0 - v02 / mu; // 1/a
  if (alpha > 1e-12) {
    const period = 2 * Math.PI * Math.sqrt(1 / (alpha * alpha * alpha * mu));
    dt = dt - period * Math.round(dt / period);
    if (dt === 0) return { ...s0 };
  }
  const sqmu = Math.sqrt(mu);

  let chi: number;
  if (alpha > 1e-12) {
    chi = sqmu * alpha * dt;
  } else if (alpha < -1e-12) {
    const a = 1 / alpha;
    const sgn = Math.sign(dt);
    chi =
      sgn *
      Math.sqrt(-a) *
      Math.log(
        (-2 * mu * alpha * dt) / (r0 * vr0 + sgn * Math.sqrt(-mu * a) * (1 - r0 * alpha)),
      );
    if (!Number.isFinite(chi)) chi = sqmu * Math.abs(alpha) * dt;
  } else {
    chi = (sqmu * dt) / r0;
  }

  const k1 = (r0 * vr0) / sqmu;
  const k2 = 1 - alpha * r0;
  for (let i = 0; i < 60; i++) {
    const chi2 = chi * chi;
    const z = alpha * chi2;
    const [C, S] = stumpff(z);
    const F = k1 * chi2 * C + k2 * chi2 * chi * S + r0 * chi - sqmu * dt;
    const dF = k1 * chi * (1 - z * S) + k2 * chi2 * C + r0;
    const step = F / dF;
    chi -= step;
    if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(chi))) break;
  }

  const chi2 = chi * chi;
  const z = alpha * chi2;
  const [C, S] = stumpff(z);
  const f = 1 - (chi2 / r0) * C;
  const g = dt - ((chi2 * chi) / sqmu) * S;
  const x = f * s0.x + g * s0.vx;
  const y = f * s0.y + g * s0.vy;
  const r = Math.hypot(x, y);
  const fd = (sqmu / (r * r0)) * (z * S - 1) * chi;
  const gd = 1 - (chi2 / r) * C;
  return { x, y, vx: fd * s0.x + gd * s0.vx, vy: fd * s0.y + gd * s0.vy };
}

/** Circular orbit state at radius r, inertial angle theta, counter-clockwise. */
export function circularState(r: number, theta: number, mu = MU): State {
  const v = Math.sqrt(mu / r);
  return {
    x: r * Math.cos(theta),
    y: r * Math.sin(theta),
    vx: -v * Math.sin(theta),
    vy: v * Math.cos(theta),
  };
}

export function circularPeriod(r: number, mu = MU): number {
  return 2 * Math.PI * Math.sqrt((r * r * r) / mu);
}
