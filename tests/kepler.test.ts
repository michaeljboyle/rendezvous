import { describe, expect, it } from 'vitest';
import { circularPeriod, circularState, elements, propagate, type State } from '../src/physics/kepler';
import { MU, RE } from '../src/physics/constants';
import { applyBurn } from '../src/physics/burns';

const r420 = RE + 420e3;

describe('Kepler propagation', () => {
  it('Target at 420 km has the reference period and mean motion', () => {
    const P = circularPeriod(r420);
    expect(P / 60).toBeCloseTo(92.97, 2);
    expect((2 * Math.PI) / P).toBeCloseTo(1.12638e-3, 7);
  });

  it('returns to the start after one period (circular and elliptic)', () => {
    const s0 = applyBurn(circularState(r420, 0.3), 5, 30);
    const P = elements(s0).period;
    const s1 = propagate(s0, P);
    expect(Math.hypot(s1.x - s0.x, s1.y - s0.y)).toBeLessThan(1e-3);
  });

  it('forward then backward propagation is the identity (elliptic and hyperbolic)', () => {
    for (const dv of [20, 4000]) {
      const s0 = applyBurn(circularState(r420, 1), 0, dv);
      const s1 = propagate(propagate(s0, 3000), -3000);
      expect(Math.hypot(s1.x - s0.x, s1.y - s0.y)).toBeLessThan(1e-3);
      expect(Math.hypot(s1.vx - s0.vx, s1.vy - s0.vy)).toBeLessThan(1e-6);
    }
  });

  it('energy and angular momentum are constant between burns to 1 part in 1e9', () => {
    const cases: State[] = [circularState(r420, 0), applyBurn(circularState(RE + 350e3, 2), 3, 19.89), applyBurn(circularState(r420, 0), 50, -80)];
    for (const s0 of cases) {
      const e0 = elements(s0);
      for (let t = 0; t <= 10 * e0.period; t += 137) {
        const s = propagate(s0, t);
        const e = elements(s);
        expect(Math.abs((e.energy - e0.energy) / e0.energy)).toBeLessThan(1e-9);
        expect(Math.abs((e.h - e0.h) / e0.h)).toBeLessThan(1e-9);
      }
    }
  });

  it('Hohmann-like burn from 350 km raises apoapsis to about 420 km', () => {
    const s = applyBurn(circularState(RE + 350e3, 0), 0, 19.89);
    const el = elements(s);
    expect((el.ra - RE) / 1e3).toBeCloseTo(420, 0);
    expect((el.rp - RE) / 1e3).toBeCloseTo(350, 3);
    expect(MU).toBe(3.986004418e14);
  });
});
