import { describe, expect, it } from 'vitest';
import { buildTimeline, relativeAt, sampleIndex } from '../src/physics/timeline';
import { presetById } from '../src/scenarios/presets';
import { cloneScenario, validateScenario, ScenarioError } from '../src/scenarios/schema';
import { burnIssues } from '../src/physics/burns';

describe('timeline', () => {
  it('samples every 10 s and includes every TIG exactly', () => {
    const s = presetById('phasing')!.scenario;
    const tl = buildTimeline(s);
    expect(tl.t[1] - tl.t[0]).toBe(10);
    expect(tl.t[tl.count - 1]).toBe(tl.duration);
    for (const b of s.burns) expect(tl.t[sampleIndex(tl, b.tigS)]).toBe(b.tigS);
  });

  it('skips disabled and out-of-range burns', () => {
    const s = cloneScenario(presetById('phasing')!.scenario);
    s.burns[1].enabled = false;
    s.burns.push({ name: 'Late', tigS: 99999, dv: { r: 0, s: 5 }, enabled: true });
    const tl = buildTimeline(s);
    expect(tl.burns.map((b) => b.index)).toEqual([0]);
    const issues = burnIssues(s.burns, tl.duration);
    expect(issues[2].outOfRange).toBe(true);
  });

  it('applies same-TIG burns in list order and flags them', () => {
    const s = cloneScenario(presetById('sandbox')!.scenario);
    s.burns = [
      { name: 'A', tigS: 100, dv: { r: 0, s: 0.1 }, enabled: true },
      { name: 'B', tigS: 100, dv: { r: 0, s: 0.2 }, enabled: true },
    ];
    const tl = buildTimeline(s);
    expect(tl.burns.map((b) => b.index)).toEqual([0, 1]);
    expect(burnIssues(s.burns, tl.duration)[0].sameTig).toBe(true);
  });

  it('interpolated samples agree with exact propagation', () => {
    const tl = buildTimeline(presetById('phasing')!.scenario);
    const i = sampleIndex(tl, 4000);
    const rel = relativeAt(tl, tl.t[i]);
    expect(rel.curv.v).toBeCloseTo(tl.curvV[i], 6);
    expect(rel.rect.r).toBeCloseTo(tl.rectR[i], 6);
  });

  it('rebuilds a 5-orbit scenario quickly', () => {
    const s = cloneScenario(presetById('sandbox')!.scenario);
    s.durationRevs = 5;
    for (let k = 0; k < 10; k++) s.burns.push({ name: `B${k}`, tigS: 1000 + k * 2000, dv: { r: 0.1, s: 0.1 }, enabled: true });
    buildTimeline(s); // warm-up
    const t0 = performance.now();
    const N = 20;
    for (let k = 0; k < N; k++) buildTimeline(s);
    const ms = (performance.now() - t0) / N;
    console.log(`timeline rebuild (5 orbits): ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(25); // spec target is 10 ms in the browser; generous for CI noise
  });
});

describe('schema', () => {
  it('rejects malformed scenarios with a readable error', () => {
    expect(() => validateScenario({})).toThrow(ScenarioError);
    expect(() => validateScenario({ name: 'x', target: { altitudeKm: 420 }, chaser: {}, durationS: 100, burns: [] })).toThrow(/chaser/);
    expect(() =>
      validateScenario({ name: 'x', target: { altitudeKm: 420 }, chaser: { lvlh: { vbarM: 0, rbarM: 0 } }, durationS: 100, burns: [{ tigS: 'a' }] }),
    ).toThrow(ScenarioError);
  });

  it('round-trips through JSON', () => {
    const s = presetById('rbar')!.scenario;
    expect(validateScenario(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
