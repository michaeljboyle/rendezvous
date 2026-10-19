import { describe, expect, it } from 'vitest';
import { circularState, propagate } from '../src/physics/kepler';
import { RE } from '../src/physics/constants';
import { fromCurvilinear, localAxes, toCurvilinear, toLvlh } from '../src/physics/frames';
import { applyBurn } from '../src/physics/burns';

const rt = RE + 420e3;
const T0 = circularState(rt, Math.PI / 2);

describe('ECI → LVLH', () => {
  it('local axes are orthonormal and Ŝ points along the velocity for a circular orbit', () => {
    const a = localAxes(T0);
    expect(a.rx * a.sx + a.ry * a.sy).toBeCloseTo(0, 12);
    expect(Math.hypot(a.sx, a.sy)).toBeCloseTo(1, 12);
    const v = Math.hypot(T0.vx, T0.vy);
    expect((a.sx * T0.vx + a.sy * T0.vy) / v).toBeCloseTo(1, 12);
  });

  it('a chaser 1 km ahead on the same orbit is at +V-bar with zero relative velocity', () => {
    const c = fromCurvilinear(T0, { v: 1000, r: 0, vv: 0, vr: 0 });
    const l = toLvlh(T0, c);
    expect(l.v).toBeCloseTo(1000, 0);
    expect(Math.abs(l.vv)).toBeLessThan(1e-9);
    expect(Math.abs(l.vr)).toBeLessThan(1e-6);
  });

  it('removes the frame rotation: a chaser 2 km below at rest in LVLH has zero LVLH velocity', () => {
    const c = fromCurvilinear(T0, { v: 0, r: -2000, vv: 0, vr: 0 });
    const l = toLvlh(T0, c);
    expect(l.r).toBeCloseTo(-2000, 6);
    expect(Math.hypot(l.vv, l.vr)).toBeLessThan(1e-9);
  });

  it('493 km behind on the same orbit looks ~18 km low in rectilinear but 0 in curvilinear', () => {
    const c = fromCurvilinear(T0, { v: -493e3, r: 0, vv: 0, vr: 0 });
    const rect = toLvlh(T0, c);
    const curv = toCurvilinear(T0, c);
    expect(rect.r / 1e3).toBeCloseTo(-17.9, 0);
    expect(curv.r).toBeCloseTo(0, 6);
    expect(curv.v).toBeCloseTo(-493e3, 3);
  });

  it('a co-circular chaser stays fixed in curvilinear LVLH to within 1 m over 10 orbits', () => {
    const c0 = fromCurvilinear(T0, { v: -5000, r: 0, vv: 0, vr: 0 });
    const P = 2 * Math.PI * Math.sqrt(rt ** 3 / 3.986004418e14);
    let worst = 0;
    for (let t = 0; t <= 10 * P; t += 60) {
      const l = toCurvilinear(propagate(T0, t), propagate(c0, t), -5000);
      worst = Math.max(worst, Math.hypot(l.v + 5000, l.r));
    }
    expect(worst).toBeLessThan(1);
  });

  it('a 0.1 m/s radial burn traces a closed 2:1 loop (≈89 m radial, ≈355 m along-track) and returns within 1 m', () => {
    const c0 = applyBurn(T0, 0.1, 0);
    const P = 2 * Math.PI * Math.sqrt(rt ** 3 / 3.986004418e14);
    let maxR = 0;
    let minV = 0;
    let maxV = 0;
    for (let t = 0; t <= P; t += 10) {
      const l = toLvlh(propagate(T0, t), propagate(c0, t));
      maxR = Math.max(maxR, Math.abs(l.r));
      minV = Math.min(minV, l.v);
      maxV = Math.max(maxV, l.v);
    }
    expect(maxR).toBeGreaterThan(87);
    expect(maxR).toBeLessThan(91);
    expect(maxV - minV).toBeGreaterThan(350);
    expect(maxV - minV).toBeLessThan(360);
    const end = toLvlh(propagate(T0, P), propagate(c0, P));
    expect(Math.hypot(end.v, end.r)).toBeLessThan(1);
  });
});
