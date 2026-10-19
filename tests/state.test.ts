import { describe, expect, it } from 'vitest';
import { Store, burnNumbers } from '../src/state/store';
import { Clock } from '../src/state/clock';
import { decodeShareHash, encodeShareHash, parseScenarioJson, scenarioToJson } from '../src/state/persist';
import { presetById } from '../src/scenarios/presets';

const phasing = () => new Store(presetById('phasing')!.scenario, 'phasing');

describe('store', () => {
  it('edits re-propagate immediately, keep a ghost, and Cancel restores', () => {
    const st = phasing();
    const endBefore = st.timeline.curvV[st.timeline.count - 1];
    st.beginEdit(1);
    expect(st.ghost).not.toBeNull();
    st.updateDraft((b) => (b.dv.s = 18.8));
    const endDraft = st.timeline.curvV[st.timeline.count - 1];
    expect(endDraft).not.toBeCloseTo(endBefore, 0);
    expect(st.ghost!.curvV[st.ghost!.count - 1]).toBeCloseTo(endBefore, 6);
    st.cancelEdit();
    expect(st.scenario.burns[1].dv.s).toBe(presetById('phasing')!.scenario.burns[1].dv.s);
    expect(st.ghost).toBeNull();
    expect(st.edited).toBe(false);
  });

  it('Done commits as one undo step; undo/redo round-trip', () => {
    const st = phasing();
    st.beginEdit(1);
    st.updateDraft((b) => (b.dv.s = 18.8));
    st.updateDraft((b) => (b.dv.s = 18.9));
    st.commitEdit();
    expect(st.edited).toBe(true);
    st.undo();
    expect(st.scenario.burns[1].dv.s).toBe(presetById('phasing')!.scenario.burns[1].dv.s);
    expect(st.edited).toBe(false);
    st.redo();
    expect(st.scenario.burns[1].dv.s).toBe(18.9);
  });

  it('adds a burn at a time, keeps the list sorted by TIG, and numbers by TIG', () => {
    const st = phasing();
    st.addBurn(1000);
    expect(st.editing!.isNew).toBe(true);
    expect(st.draft!.tigS).toBe(1000);
    st.commitEdit();
    expect(st.scenario.burns.map((b) => b.tigS)).toEqual([1000, 2700, 5467.6]);
    expect(burnNumbers(st.scenario.burns)).toEqual([1, 2, 3]);
    st.undo();
    expect(st.scenario.burns).toHaveLength(2);
  });

  it('toggle, duplicate, delete are undoable; the preset itself is never modified', () => {
    const st = phasing();
    st.toggleBurn(0);
    expect(st.timeline.burns).toHaveLength(1);
    st.duplicateBurn(1);
    expect(st.scenario.burns).toHaveLength(3);
    st.deleteBurn(0);
    expect(st.scenario.burns).toHaveLength(2);
    st.undo();
    st.undo();
    st.undo();
    expect(st.scenario).toEqual(presetById('phasing')!.scenario);
    expect(presetById('phasing')!.scenario.burns[0].enabled).toBe(true);
  });
});

describe('clock', () => {
  it('drops to 10× within ±60 s of a burn and never skips the slow window', () => {
    const c = new Clock();
    c.setTimeline(9000, [2700]);
    c.setSpeed(600);
    c.setTime(2600);
    c.play();
    c.tick(0.1); // 600× would jump 60 s; it stops at 2640 and spends the rest of the frame at 10×
    expect(c.t).toBeCloseTo(2640 + (0.1 - 40 / 600) * 10, 6);
    expect(c.effectiveSpeed()).toBe(10);
    const t0 = c.t;
    c.tick(0.2);
    expect(c.t).toBeCloseTo(t0 + 2, 6);
  });

  it('stops at the end unless looping', () => {
    const c = new Clock();
    c.setTimeline(100, []);
    c.setSpeed(600);
    c.play();
    c.tick(1);
    expect(c.t).toBe(100);
    expect(c.playing).toBe(false);
    c.setLoop(true);
    c.play();
    c.setTime(99);
    c.tick(0.1);
    expect(c.t).toBe(0);
  });

  it('jumps to next and previous burns', () => {
    const c = new Clock();
    c.setTimeline(9000, [2700, 5468]);
    c.setTime(3900);
    c.jumpNext();
    expect(c.t).toBe(5468);
    c.jumpPrev();
    expect(c.t).toBe(2700);
  });
});

describe('persistence', () => {
  it('round-trips through the share link and JSON export', () => {
    const s = presetById('vbar')!.scenario;
    expect(decodeShareHash(encodeShareHash(s))).toEqual(s);
    expect(parseScenarioJson(scenarioToJson(s))).toEqual(s);
    const named = { ...s, name: 'Rendez-vous ✓ ünïcode' };
    expect(decodeShareHash(encodeShareHash(named))!.name).toBe(named.name);
    expect(decodeShareHash('#nothing')).toBeNull();
  });
});
