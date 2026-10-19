import { describe, expect, it } from 'vitest';
import { PRESETS, presetById } from '../src/scenarios/presets';
import { buildTimeline, chaserAt, chaserElementsAt, relativeAt, targetAt, altitude } from '../src/physics/timeline';
import { phaseAngle } from '../src/physics/frames';
import { RE } from '../src/physics/constants';
import { totalDv } from '../src/physics/burns';

const tl = (id: string) => buildTimeline(presetById(id)!.scenario);

describe('presets', () => {
  it('all five presets load and pass the schema', () => {
    expect(PRESETS).toHaveLength(5);
    for (const p of PRESETS) expect(buildTimeline(p.scenario).count).toBeGreaterThan(100);
  });

  it('cross-check: preset 1 at T+01:05:00 matches the mockup values', () => {
    const t = tl('phasing');
    const T = 3900;
    const rel = relativeAt(t, T);
    const c = chaserAt(t, T);
    const el = chaserElementsAt(t, T);
    expect(rel.range / 1e3).toBeCloseTo(51.26, 2);
    expect(rel.rangeRate).toBeCloseTo(-74.96, 2);
    expect(altitude(c) / 1e3).toBeCloseTo(377.9, 1);
    expect((el.ra - RE) / 1e3).toBeCloseTo(420.0, 1);
    expect((el.rp - RE) / 1e3).toBeCloseTo(350.0, 1);
    expect((phaseAngle(targetAt(t, T), c) * 180) / Math.PI).toBeCloseTo(-0.25, 2);
    expect(rel.rect.v / 1e3).toBeCloseTo(-29.19, 2);
    expect(rel.rect.r / 1e3).toBeCloseTo(-42.14, 2);
    expect(totalDv(presetById('phasing')!.scenario.burns, t.duration)).toBeCloseTo(39.73, 2);
  });

  it('preset 1 ends 5 km behind on V-bar, co-circular', () => {
    const t = tl('phasing');
    const atCirc = relativeAt(t, presetById('phasing')!.scenario.burns[1].tigS);
    expect(Math.abs(atCirc.curv.v + 5000)).toBeLessThan(50);
    expect(Math.abs(atCirc.curv.r)).toBeLessThan(25);
    const end = relativeAt(t, t.duration);
    expect(Math.abs(end.curv.v + 5000)).toBeLessThan(100); // 2% of 5 km
    expect(Math.abs(end.curv.r)).toBeLessThan(25);
    expect(Math.abs(end.rangeRate)).toBeLessThan(0.1);
  });

  it('preset 1 is an exact Hohmann transfer: apoapsis 420 km, then circular at 420 km', () => {
    const t = tl('phasing');
    const xfer = chaserElementsAt(t, 3000);
    expect(Math.abs(xfer.ra - xfer.rp)).toBeGreaterThan(60e3);
    expect(Math.abs((xfer.ra - RE) / 1e3 - 420)).toBeLessThan(0.01);
    const end = chaserElementsAt(t, t.duration);
    expect(end.ra - end.rp).toBeLessThan(10); // circular to within metres
    expect(Math.abs((end.a - RE) / 1e3 - 420)).toBeLessThan(0.01);
  });

  it('preset 2 ends ahead of and below the Target, range > 10 km', () => {
    const t = tl('undock');
    expect(t.duration).toBeCloseTo(3 * t.targetPeriod, 6);
    // Undock alone: a radial push gives a closed loop that would return in one orbit.
    const end = relativeAt(t, t.duration);
    expect(end.curv.v).toBeGreaterThan(0);
    expect(end.curv.r).toBeLessThan(0);
    expect(end.range).toBeGreaterThan(10e3);
  });

  it('preset 3 hops each arrive within 1% of the CW hop distance 4·Δv/n', () => {
    const p = presetById('vbar')!.scenario;
    const t = tl('vbar');
    for (let k = 0; k < 3; k++) {
      const start = p.burns[2 * k];
      const stop = p.burns[2 * k + 1];
      const d = (4 * Math.abs(start.dv.r)) / t.n;
      const v0 = relativeAt(t, start.tigS).curv.v;
      const v1 = relativeAt(t, stop.tigS).curv.v;
      expect(Math.abs(v1 - v0 - d)).toBeLessThan(0.01 * d);
      expect(Math.abs(relativeAt(t, stop.tigS).curv.r)).toBeLessThan(0.01 * d);
    }
    const end = relativeAt(t, t.duration);
    expect(end.curv.v).toBeGreaterThan(-36);
    expect(end.curv.v).toBeLessThan(-28);
    expect(Math.abs(end.rect.vv) + Math.abs(end.rect.vr)).toBeLessThan(0.01); // holding
  });

  it('preset 4 reaches each R-bar waypoint within 2% of its leg length, then stops at −20 m', () => {
    const t = tl('rbar');
    const wp = [-2000, -800, -250, -60, -20];
    for (let k = 1; k < wp.length; k++) {
      const rel = relativeAt(t, k * 1200);
      const leg = Math.abs(wp[k] - wp[k - 1]);
      expect(Math.hypot(rel.rect.v, rel.rect.r - wp[k])).toBeLessThan(0.02 * leg);
    }
    // Just after the stop burn the Chaser is momentarily at rest.
    const after = relativeAt(t, 4800);
    expect(Math.hypot(after.rect.vv, after.rect.vr)).toBeLessThan(0.002);
  });

  it('sandbox starts 1 km behind, co-circular, no burns', () => {
    const t = tl('sandbox');
    expect(t.burns).toHaveLength(0);
    const end = relativeAt(t, t.duration);
    expect(Math.abs(end.curv.v + 1000)).toBeLessThan(1);
  });
});
