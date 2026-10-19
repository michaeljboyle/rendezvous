import { buildTimeline, scenarioDuration, type Timeline } from '../physics/timeline';
import { cloneScenario, type Scenario, type ScenarioBurn } from '../scenarios/schema';
import { presetById } from '../scenarios/presets';

interface Snapshot {
  scenario: Scenario;
  presetId: string | null;
  edited: boolean;
}

export interface EditSession {
  /** Index into scenario.burns of the burn being edited. */
  index: number;
  /** Scenario before the edit started; Cancel restores it. */
  snapshot: Scenario;
  isNew: boolean;
  /** Value of `edited` before the session, restored on Cancel. */
  wasEdited: boolean;
}

type Listener = (reason: 'scenario' | 'selection' | 'load') => void;

/** Stable sort of burn indices by TIG (list order on ties). */
export function burnOrder(burns: ScenarioBurn[]): number[] {
  return burns
    .map((b, i) => ({ t: b.tigS, i }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.i);
}

/** Display number (1-based rank by TIG) for each burn index. */
export function burnNumbers(burns: ScenarioBurn[]): number[] {
  const out = new Array<number>(burns.length);
  burnOrder(burns).forEach((idx, rank) => (out[idx] = rank + 1));
  return out;
}

function sortBurns(s: Scenario, keep: number | null): number | null {
  const order = burnOrder(s.burns);
  s.burns = order.map((i) => s.burns[i]);
  return keep === null ? null : order.indexOf(keep);
}

const UNDO_LIMIT = 200;

/** Single source of truth for the working scenario, selection, edit session and undo/redo. */
export class Store {
  scenario: Scenario;
  presetId: string | null;
  edited = false;
  editing: EditSession | null = null;
  timeline: Timeline;
  /** Timeline of the scenario before the current edit (the what-if ghost), or null. */
  ghost: Timeline | null = null;
  numbers: number[];
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners = new Set<Listener>();

  constructor(initial: Scenario, presetId: string | null, edited = false) {
    this.scenario = cloneScenario(initial);
    this.presetId = presetId;
    this.edited = edited;
    sortBurns(this.scenario, null);
    this.timeline = buildTimeline(this.scenario);
    this.numbers = burnNumbers(this.scenario.burns);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(reason: Parameters<Listener>[0]): void {
    for (const fn of this.listeners) fn(reason);
  }

  get duration(): number {
    return this.timeline.duration;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 || this.editing !== null;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private snapshot(): Snapshot {
    return { scenario: cloneScenario(this.scenario), presetId: this.presetId, edited: this.edited };
  }

  private pushUndo(s: Snapshot): void {
    this.undoStack.push(s);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private rebuild(): void {
    this.timeline = buildTimeline(this.scenario);
    this.numbers = burnNumbers(this.scenario.burns);
  }

  /** Apply an undoable change to the scenario (outside an edit session). */
  private change(fn: (s: Scenario) => void): void {
    this.commitEdit();
    const before = this.snapshot();
    fn(this.scenario);
    sortBurns(this.scenario, null);
    this.pushUndo(before);
    this.edited = true;
    this.rebuild();
    this.emit('scenario');
  }

  loadPreset(id: string): void {
    const p = presetById(id);
    if (!p) return;
    this.load(p.scenario, id, false);
  }

  load(s: Scenario, presetId: string | null, edited: boolean): void {
    this.cancelEdit(true);
    this.pushUndo(this.snapshot());
    this.scenario = cloneScenario(s);
    sortBurns(this.scenario, null);
    this.presetId = presetId;
    this.edited = edited;
    this.rebuild();
    this.emit('load');
  }

  // ----- burns -----

  addBurn(tigS: number): void {
    this.commitEdit();
    const snapshot = cloneScenario(this.scenario);
    const t = Math.max(0, Math.min(this.duration, Math.round(tigS)));
    this.scenario.burns.push({ name: `Burn ${this.scenario.burns.length + 1}`, tigS: t, dv: { r: 0, s: 0 }, enabled: true });
    const idx = sortBurns(this.scenario, this.scenario.burns.length - 1)!;
    this.editing = { index: idx, snapshot, isNew: true, wasEdited: this.edited };
    this.ghost = buildTimeline(snapshot);
    this.edited = true;
    this.rebuild();
    this.emit('scenario');
  }

  beginEdit(index: number): void {
    if (this.editing?.index === index) return;
    this.commitEdit();
    if (index < 0 || index >= this.scenario.burns.length) return;
    const snapshot = cloneScenario(this.scenario);
    this.editing = { index, snapshot, isNew: false, wasEdited: this.edited };
    this.ghost = buildTimeline(snapshot);
    this.emit('selection');
  }

  /** Live edit of the burn being edited: re-propagates immediately, no undo entry until Done. */
  updateDraft(fn: (b: ScenarioBurn) => void): void {
    if (!this.editing) return;
    fn(this.scenario.burns[this.editing.index]);
    this.edited = true;
    this.rebuild();
    this.emit('scenario');
  }

  get draft(): ScenarioBurn | null {
    return this.editing ? this.scenario.burns[this.editing.index] : null;
  }

  /** The burn as it was before the current edit (for "was" hints), if it existed. */
  get draftOriginal(): ScenarioBurn | null {
    if (!this.editing || this.editing.isNew) return null;
    return this.editing.snapshot.burns[this.editing.index] ?? null;
  }

  commitEdit(): void {
    const e = this.editing;
    if (!e) return;
    this.editing = null;
    this.ghost = null;
    const changed = JSON.stringify(e.snapshot) !== JSON.stringify(this.scenario);
    if (changed || e.isNew) {
      this.pushUndo({ scenario: e.snapshot, presetId: this.presetId, edited: e.wasEdited });
      this.edited = true;
    } else {
      this.edited = e.wasEdited;
    }
    sortBurns(this.scenario, null);
    this.rebuild();
    this.emit('scenario');
  }

  cancelEdit(silent = false): void {
    const e = this.editing;
    if (!e) return;
    this.editing = null;
    this.ghost = null;
    this.scenario = e.snapshot;
    this.edited = e.wasEdited;
    this.rebuild();
    if (!silent) this.emit('scenario');
  }

  toggleBurn(i: number): void {
    this.change((s) => (s.burns[i].enabled = !s.burns[i].enabled));
  }

  deleteBurn(i: number): void {
    if (this.editing && this.editing.index === i) {
      // Delete from inside the editor: one undo step back to the pre-edit scenario.
      const { snapshot: snap, wasEdited } = this.editing;
      this.editing = null;
      this.ghost = null;
      this.scenario.burns.splice(i, 1);
      if (snap.burns.length !== this.scenario.burns.length) this.pushUndo({ scenario: snap, presetId: this.presetId, edited: wasEdited });
      this.edited = true;
      this.rebuild();
      this.emit('scenario');
      return;
    }
    this.change((s) => s.burns.splice(i, 1));
  }

  duplicateBurn(i: number): void {
    this.change((s) => {
      const b = s.burns[i];
      s.burns.splice(i + 1, 0, { ...b, dv: { ...b.dv }, name: `${b.name} copy` });
    });
  }

  /** Undoable scenario-setup change. */
  updateSetup(fn: (s: Scenario) => void): void {
    this.change(fn);
  }

  undo(): void {
    if (this.editing) {
      this.cancelEdit();
      return;
    }
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snapshot());
    this.restore(prev);
  }

  redo(): void {
    this.commitEdit();
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.restore(next);
  }

  private restore(s: Snapshot): void {
    this.scenario = cloneScenario(s.scenario);
    this.presetId = s.presetId;
    this.edited = s.edited;
    this.rebuild();
    this.emit('load');
  }

  /** Duration if the scenario were rebuilt (used by setup UI previews). */
  static durationOf(s: Scenario): number {
    return scenarioDuration(s);
  }
}
