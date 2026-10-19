import { burnIssues, dvMagnitude, LARGE_DV, totalDv } from '../physics/burns';
import { RE } from '../physics/constants';
import { circularPeriod } from '../physics/kepler';
import type { ScenarioBurn } from '../scenarios/schema';
import { burnOrder } from '../state/store';
import type { AppCtx } from './context';
import { h, icon, setText } from './dom';
import { countdown, dv, met, num, parseMet } from './format';

type Tab = 'burns' | 'setup';

/** Burn list + edit form, and the Scenario setup tab. Writes only through the store. */
export class BurnEditor {
  el: HTMLElement;
  tab: Tab = 'burns';
  collapsed = false;
  /** Called when an edit session opens/closes (phone sheet uses it). */
  onEditChange: (editing: boolean) => void = () => {};
  private tabs: HTMLButtonElement[];
  /** Slot in the head row for extra controls (undo / redo on desktop and tablet). */
  extras = h('span', { class: 'editor-extras' });
  private totalEl = h('span', { class: 'tv' });
  private countEl = h('span', { class: 'tv' });
  private list = h('div', { class: 'burn-rows', role: 'list' });
  private formHost = h('div', { class: 'burn-form' });
  private burnsPane: HTMLElement;
  private setupPane = h('div', { class: 'setup-pane', hidden: true });
  private collapseBtn: HTMLButtonElement;
  private formFor: number | null = null;
  private formBuilt = false;
  private form: FormRefs | null = null;
  private listKey = '';

  constructor(private app: AppCtx) {
    const { store } = app;
    this.tabs = (['burns', 'setup'] as Tab[]).map((t) =>
      h(
        'button',
        { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(t === this.tab), onclick: () => this.setTab(t) },
        t === 'burns' ? 'Burns' : 'Scenario setup',
      ),
    );
    this.collapseBtn = h('button', { type: 'button', class: 'icon-btn collapse-btn', 'aria-label': 'Collapse burn drawer', 'aria-expanded': 'true', onclick: () => this.setCollapsed(!this.collapsed) }, icon('chevronDown', 16, 2));
    const addBtn = h('button', { type: 'button', class: 'btn btn-add', title: 'Add a burn at the current time (B)', onclick: () => this.addBurn() }, icon('plus', 14, 2), 'Burn');
    const head = h(
      'div',
      { class: 'editor-head' },
      h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Plan' }, ...this.tabs),
      h('div', { class: 'sheet-title' }, h('strong', null, 'Burns'), ' ', this.countEl),
      h('span', { class: 'spacer' }),
      this.extras,
      h('span', { class: 'total' }, h('span', { class: 'tl' }, 'Total'), ' ', this.totalEl),
      addBtn,
      this.collapseBtn,
    );
    const listHead = h(
      'div',
      { class: 'burn-row burn-row-head', 'aria-hidden': 'true' },
      h('span', null, '#'),
      h('span', null, 'Name'),
      h('span', null, 'TIG'),
      h('span', null, '|Δv|'),
      h('span', null, 'On'),
      h('span', null, ''),
    );
    this.burnsPane = h('div', { class: 'burns-pane', role: 'tabpanel' }, h('div', { class: 'burn-list' }, listHead, this.list), this.formHost);
    this.el = h('section', { class: 'panel editor', 'aria-label': 'Burns and scenario setup' }, head, h('div', { class: 'editor-body' }, this.burnsPane, this.setupPane));

    store.subscribe(() => this.sync());
    app.clock.subscribe(() => this.syncPast());
    this.buildSetup();
    this.sync();
  }

  addBurn(): void {
    this.setTab('burns');
    this.setCollapsed(false);
    this.app.store.addBurn(this.app.clock.t);
  }

  setTab(t: Tab): void {
    this.tab = t;
    this.tabs.forEach((b, i) => b.setAttribute('aria-selected', String((i === 0 ? 'burns' : 'setup') === t)));
    this.burnsPane.hidden = t !== 'burns';
    this.setupPane.hidden = t !== 'setup';
    if (t === 'setup') this.syncSetup();
  }

  setCollapsed(c: boolean): void {
    this.collapsed = c;
    this.el.classList.toggle('collapsed', c);
    this.collapseBtn.setAttribute('aria-expanded', String(!c));
    this.collapseBtn.setAttribute('aria-label', c ? 'Expand burn drawer' : 'Collapse burn drawer');
    this.collapseBtn.replaceChildren(icon(c ? 'chevronUp' : 'chevronDown', 16, 2));
    this.app.invalidate();
  }

  // ----- list -----

  private sync(): void {
    const { store } = this.app;
    const s = store.scenario;
    const D = store.duration;
    setText(this.totalEl, dv(totalDv(s.burns, D)));
    setText(this.countEl, `${s.burns.length} · ${num(totalDv(s.burns, D), 2)} m/s`);
    this.listKey = '';
    this.syncPast();
    const ed = store.editing;
    const editingIdx = ed ? ed.index : null;
    if (!this.formBuilt || editingIdx !== this.formFor) {
      this.formBuilt = true;
      this.formFor = editingIdx;
      this.buildForm();
      this.onEditChange(editingIdx !== null);
    } else {
      this.syncForm();
    }
    this.el.classList.toggle('editing', editingIdx !== null);
    if (this.tab === 'setup') this.syncSetup();
  }

  /** Re-render the list when anything it shows changes (including which burns are past). */
  private syncPast(): void {
    const { store, clock } = this.app;
    const s = store.scenario;
    const key = JSON.stringify([s.burns, store.editing?.index, s.burns.map((b) => b.tigS <= clock.t)]);
    if (key === this.listKey) return;
    this.listKey = key;
    const issues = burnIssues(s.burns, store.duration);
    const rows = burnOrder(s.burns).map((i) => {
      const b = s.burns[i];
      const iss = issues[i];
      const past = b.enabled && b.tigS <= clock.t && !iss.outOfRange;
      const warn = [iss.outOfRange ? 'TIG is outside the scenario: skipped' : '', iss.sameTig ? 'Another burn has the same TIG: applied in list order' : '', iss.large ? `|Δv| above ${LARGE_DV} m/s` : '']
        .filter(Boolean)
        .join('. ');
      const toggle = h('input', { type: 'checkbox', checked: b.enabled, 'aria-label': `Enable burn ${store.numbers[i]} ${b.name}` });
      toggle.addEventListener('click', (e) => e.stopPropagation());
      toggle.addEventListener('change', () => store.toggleBurn(i));
      const actBtn = (ic: string, label: string, fn: () => void) =>
        h('button', { type: 'button', class: 'icon-btn row-act', 'aria-label': label, title: label, onclick: (e: Event) => (e.stopPropagation(), fn()) }, icon(ic, 15));
      const row = h(
        'div',
        {
          class: `burn-row${store.editing?.index === i ? ' selected' : ''}${b.enabled ? '' : ' disabled'}${iss.outOfRange ? ' bad' : ''}`,
          role: 'listitem',
          tabindex: '0',
          title: warn || undefined,
          'aria-label': `Burn ${store.numbers[i]}, ${b.name}, ${met(b.tigS)}, ${dv(dvMagnitude(b))}${b.enabled ? '' : ', disabled'}${warn ? `. ${warn}` : ''}. Press Enter to edit.`,
          onclick: () => store.beginEdit(i),
          onkeydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' && e.target === row) store.beginEdit(i);
          },
        },
        h('span', { class: `badge${past ? ' badge-past' : ''}` }, String(store.numbers[i])),
        h('span', { class: 'bn' }, h('span', { class: 'bn-name' }, b.name), past ? h('span', { class: 'bn-done' }, ' · done') : null, warn ? h('span', { class: 'warn-ic', 'aria-hidden': 'true' }, icon('warn', 14)) : null),
        h('span', { class: 'mono bt' }, met(b.tigS)),
        h('span', { class: 'mono bdv' }, dv(dvMagnitude(b))),
        h('span', { class: 'bon' }, toggle),
        h('span', { class: 'bact' }, actBtn('copy', `Duplicate burn ${store.numbers[i]}`, () => store.duplicateBurn(i)), actBtn('trash', `Delete burn ${store.numbers[i]}`, () => store.deleteBurn(i))),
      );
      return row;
    });
    if (!rows.length) rows.push(h('div', { class: 'empty' }, 'No burns yet. Press + Burn (or B) to add one at the current time, or right-click / long-press the rendezvous plot.'));
    this.list.replaceChildren(...rows);
  }

  // ----- edit form -----

  private buildForm(): void {
    const { store } = this.app;
    const idx = this.formFor;
    if (idx === null) {
      this.form = null;
      this.formHost.replaceChildren(
        h('div', { class: 'form-empty' }, h('p', null, 'Select a burn to edit it, or add one with ', h('strong', null, '+ Burn'), ' (B).'), h('p', { class: 'hint' }, 'Every change re-propagates immediately; the old trajectory stays as a faint what-if line until you press Done or Cancel.')),
      );
      return;
    }
    const b = store.scenario.burns[idx];
    const nameIn = h('input', { type: 'text', class: 'input', value: b.name, maxLength: 60, 'aria-label': 'Burn name' });
    nameIn.addEventListener('input', () => store.updateDraft((d) => (d.name = nameIn.value || `Burn ${store.numbers[idx]}`)));
    const tigIn = h('input', { type: 'text', class: 'input mono', value: met(b.tigS), inputMode: 'numeric', spellcheck: false, 'aria-label': 'Time of ignition (MET)' });
    const applyTig = () => {
      const t = parseMet(tigIn.value);
      tigIn.classList.toggle('invalid', t === null);
      if (t !== null) store.updateDraft((d) => (d.tigS = Math.round(t)));
    };
    tigIn.addEventListener('change', applyTig);
    tigIn.addEventListener('keydown', (e) => e.key === 'Enter' && applyTig());
    tigIn.addEventListener('input', () => tigIn.classList.toggle('invalid', parseMet(tigIn.value) === null));
    const nudges = h(
      'div',
      { class: 'nudges' },
      ...[-60, -10, 10, 60].map((d) =>
        h('button', { type: 'button', class: 'btn btn-nudge mono', 'aria-label': `TIG ${d > 0 ? 'plus' : 'minus'} ${Math.abs(d)} seconds`, onclick: () => store.updateDraft((x) => (x.tigS = Math.max(0, x.tigS + d))) }, `${d > 0 ? '+' : '−'}${Math.abs(d)}s`),
      ),
    );
    const radial = this.dvField('r', 'Radial', '+ up');
    const along = this.dvField('s', 'Along-track', '+ fwd');
    const result = h('div', { class: 'result mono' });
    const warn = h('div', { class: 'result-warn' });
    const badge = h('span', { class: 'badge badge-edit' });
    const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Delete burn', title: 'Delete burn', onclick: () => store.deleteBurn(idx) }, icon('trash', 18));
    const dup = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Duplicate burn', title: 'Duplicate burn', onclick: () => (store.commitEdit(), store.duplicateBurn(idx)) }, icon('copy', 17));
    const form = h(
      'div',
      {
        class: 'form',
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            store.cancelEdit();
          }
        },
      },
      h('div', { class: 'form-title' }, badge, h('h3', null, 'Edit burn'), h('span', { class: 'spacer' }), dup, del),
      h(
        'div',
        { class: 'form-grid' },
        h(
          'div',
          { class: 'form-col' },
          h('div', { class: 'name-tig' }, h('label', { class: 'field f-name' }, h('span', null, 'Name'), nameIn), h('label', { class: 'field f-tig' }, h('span', null, 'TIG (MET)'), tigIn)),
          nudges,
        ),
        h('div', { class: 'form-col' }, radial.el, along.el, h('div', { class: 'result-box' }, result, warn)),
      ),
      h(
        'div',
        { class: 'form-actions' },
        h('button', { type: 'button', class: 'btn btn-cancel', onclick: () => store.cancelEdit() }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-primary btn-done', onclick: () => store.commitEdit() }, 'Done'),
      ),
    );
    this.form = { nameIn, tigIn, radial, along, result, warn, badge };
    this.formHost.replaceChildren(form);
    this.syncForm();
    if (window.matchMedia('(min-width: 768px)').matches) nameIn.focus({ preventScroll: true });
  }

  private dvField(comp: 'r' | 's', title: string, hint: string): DvField {
    const { store } = this.app;
    const slider = h('input', { type: 'range', class: 'slider', min: '-2', max: '2', step: '0.01', 'aria-label': `${title} Δv slider` });
    const input = h('input', { type: 'number', class: 'input mono dv-input', step: '0.01', inputMode: 'decimal', 'aria-label': `${title} Δv, m/s` });
    const was = h('span', { class: 'was mono' });
    const set = (v: number) => store.updateDraft((d) => (d.dv[comp] = Math.round(v * 1e5) / 1e5));
    slider.addEventListener('input', () => set(Number(slider.value)));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (input.value.trim() !== '' && Number.isFinite(v)) set(v);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const step = (e.shiftKey ? 0.1 : 0.01) * (e.key === 'ArrowUp' ? 1 : -1);
      const cur = store.draft?.dv[comp] ?? 0;
      set(Math.round((cur + step) * 100) / 100);
    });
    const el = h(
      'div',
      { class: 'dv-field' },
      h('div', { class: 'dv-label' }, h('span', null, title, ' ', h('span', { class: 'dim' }, hint)), was),
      h('div', { class: 'dv-controls' }, slider, input),
    );
    return { el, slider, input, was, comp };
  }

  private syncForm(): void {
    const f = this.form;
    const { store } = this.app;
    const b = store.draft;
    if (!f || !b || this.formFor === null) return;
    const active = document.activeElement;
    if (active !== f.nameIn) f.nameIn.value = b.name;
    if (active !== f.tigIn) {
      f.tigIn.value = met(b.tigS);
      f.tigIn.classList.remove('invalid');
    }
    setText(f.badge, String(store.numbers[this.formFor]));
    const orig = store.draftOriginal;
    for (const fld of [f.radial, f.along]) {
      const v = b.dv[fld.comp];
      const lim = Math.abs(v) <= 2 ? 2 : Math.ceil(Math.abs(v) * 1.25);
      fld.slider.min = String(-lim);
      fld.slider.max = String(lim);
      fld.slider.step = lim > 20 ? '0.1' : '0.01';
      if (active !== fld.slider) fld.slider.value = String(v);
      fld.slider.style.setProperty('--fill', `${((v + lim) / (2 * lim)) * 100}%`);
      if (active !== fld.input) fld.input.value = v.toFixed(2);
      const w = orig ? orig.dv[fld.comp] : null;
      setText(fld.was, w !== null && Math.abs(w - v) > 1e-9 ? `was ${num(w, 2, true)}` : '');
      fld.input.classList.toggle('changed', w !== null && Math.abs(w - v) > 1e-9);
    }
    // Result row: |Δv| and where the burn leaves the Chaser
    const ev = store.timeline.burns.find((e) => e.index === this.formFor);
    const mag = dv(dvMagnitude(b));
    if (ev) {
      const a = ev.after;
      const where = a.e < 1 ? `Ap/Pe ${num((a.ra - RE) / 1000, 1)}/${num((a.rp - RE) / 1000, 1)} km` : `escape (Pe ${num((a.rp - RE) / 1000, 1)} km)`;
      setText(f.result, `|Δv| ${mag} · leaves Chaser at ${where}`);
    } else {
      setText(f.result, `|Δv| ${mag} · not applied (${b.enabled ? 'outside the scenario' : 'disabled'})`);
    }
    const iss = burnIssues(store.scenario.burns, store.duration)[this.formFor];
    const msgs: string[] = [];
    if (iss.outOfRange) msgs.push(`TIG must be between T+0 and ${met(store.duration)}; this burn is skipped.`);
    if (iss.sameTig) msgs.push('Another burn has the same TIG; they are applied in list order.');
    if (iss.large) msgs.push(`|Δv| is above ${LARGE_DV} m/s, far more than rendezvous needs.`);
    setText(f.warn, msgs.join(' '));
    f.warn.classList.toggle('bad', iss.outOfRange);
  }

  // ----- scenario setup -----

  private setupRefs!: SetupRefs;

  private buildSetup(): void {
    const { store } = this.app;
    const nameIn = h('input', { type: 'text', class: 'input', maxLength: 120, 'aria-label': 'Scenario name' });
    nameIn.addEventListener('change', () => store.updateSetup((s) => (s.name = nameIn.value.trim() || 'My scenario')));
    const tAlt = h('input', { type: 'number', class: 'input mono', min: '150', max: '2000', step: '1', 'aria-label': 'Target altitude, km' });
    tAlt.addEventListener('change', () => {
      const v = Number(tAlt.value);
      if (v >= 150 && v <= 2000) store.updateSetup((s) => (s.target.altitudeKm = v));
    });
    const modeLvlh = h('input', { type: 'radio', name: 'chaser-mode', value: 'lvlh' });
    const modeCirc = h('input', { type: 'radio', name: 'chaser-mode', value: 'circular' });
    const vbar = h('input', { type: 'number', class: 'input mono', step: 'any', 'aria-label': 'Chaser V-bar offset' });
    const rbar = h('input', { type: 'number', class: 'input mono', step: 'any', 'aria-label': 'Chaser R-bar offset' });
    const unit = h('select', { class: 'input', 'aria-label': 'Offset unit' }, h('option', { value: 'm' }, 'm'), h('option', { value: 'km' }, 'km'));
    const cAlt = h('input', { type: 'number', class: 'input mono', min: '150', max: '2000', step: '0.1', 'aria-label': 'Chaser altitude, km' });
    const cPhase = h('input', { type: 'number', class: 'input mono', min: '-180', max: '180', step: '0.01', 'aria-label': 'Chaser phase angle, degrees' });
    const revs = h('input', { type: 'number', class: 'input mono', min: '0.1', max: '20', step: '0.1', 'aria-label': 'Duration in Target revolutions' });
    const durHint = h('span', { class: 'hint mono' });
    const k = () => (unit.value === 'km' ? 1000 : 1);
    const applyChaser = () => {
      if (modeLvlh.checked) {
        const v = Number(vbar.value) * k();
        const r = Number(rbar.value) * k();
        if (!Number.isFinite(v) || !Number.isFinite(r)) return;
        store.updateSetup((s) => {
          const old = 'lvlh' in s.chaser ? s.chaser.lvlh : null;
          const minR = -(s.target.altitudeKm - 150) * 1000;
          s.chaser = { lvlh: { vbarM: v, rbarM: Math.max(minR, r), vVbarMps: old?.vVbarMps ?? 0, vRbarMps: old?.vRbarMps ?? 0 } };
        });
      } else {
        const a = Number(cAlt.value);
        const p = Number(cPhase.value);
        if (!(a >= 150 && a <= 2000) || !(p >= -180 && p <= 180)) return;
        store.updateSetup((s) => (s.chaser = { circular: { altitudeKm: a, phaseDeg: p } }));
      }
    };
    const switchMode = () => {
      const s = store.scenario;
      if (modeLvlh.checked && !('lvlh' in s.chaser)) {
        const c = s.chaser.circular;
        const rt = RE + s.target.altitudeKm * 1000;
        store.updateSetup((x) => (x.chaser = { lvlh: { vbarM: Math.round((rt * c.phaseDeg * Math.PI) / 180), rbarM: Math.round((c.altitudeKm - s.target.altitudeKm) * 1000), vVbarMps: 0, vRbarMps: 0 } }));
      } else if (modeCirc.checked && !('circular' in s.chaser)) {
        const l = s.chaser.lvlh;
        const rt = RE + s.target.altitudeKm * 1000;
        store.updateSetup((x) => (x.chaser = { circular: { altitudeKm: s.target.altitudeKm + l.rbarM / 1000, phaseDeg: Math.max(-180, Math.min(180, (l.vbarM / rt) * (180 / Math.PI))) } }));
      }
    };
    modeLvlh.addEventListener('change', switchMode);
    modeCirc.addEventListener('change', switchMode);
    for (const i of [vbar, rbar, cAlt, cPhase]) i.addEventListener('change', applyChaser);
    unit.addEventListener('change', () => this.syncSetup(true));
    revs.addEventListener('change', () => {
      const v = Number(revs.value);
      if (v >= 0.1 && v <= 20) store.updateSetup((s) => (s.durationRevs = Math.round(v * 100) / 100));
    });
    const lvlhBox = h('div', { class: 'field-row' }, h('label', { class: 'field' }, h('span', null, 'V-bar (+ ahead)'), vbar), h('label', { class: 'field' }, h('span', null, 'R-bar (+ up)'), rbar), h('label', { class: 'field f-unit' }, h('span', null, 'Unit'), unit));
    const circBox = h('div', { class: 'field-row' }, h('label', { class: 'field' }, h('span', null, 'Altitude (km)'), cAlt), h('label', { class: 'field' }, h('span', null, 'Phase (°, − behind)'), cPhase));
    this.setupPane.append(
      h(
        'div',
        { class: 'setup-grid' },
        h('label', { class: 'field' }, h('span', null, 'Scenario name'), nameIn),
        h('label', { class: 'field' }, h('span', null, 'Target circular altitude (km)'), tAlt),
        h('label', { class: 'field' }, h('span', null, 'Duration (Target revolutions)'), revs, durHint),
        h(
          'fieldset',
          { class: 'field chaser-set' },
          h('legend', null, 'Chaser initial state'),
          h('div', { class: 'radios' }, h('label', { class: 'check' }, modeLvlh, h('span', null, 'LVLH offset (at rest in LVLH)')), h('label', { class: 'check' }, modeCirc, h('span', null, 'Own circular orbit + phase'))),
          lvlhBox,
          circBox,
        ),
      ),
      h('p', { class: 'hint' }, 'Setup changes are undoable (Z). Editing a preset makes it your scenario; the preset itself is never changed.'),
    );
    this.setupRefs = { nameIn, tAlt, modeLvlh, modeCirc, vbar, rbar, unit, cAlt, cPhase, revs, durHint, lvlhBox, circBox };
  }

  private syncSetup(force = false): void {
    const r = this.setupRefs;
    const s = this.app.store.scenario;
    const a = document.activeElement;
    const put = (el: HTMLInputElement, v: string) => {
      if (force || a !== el) el.value = v;
    };
    put(r.nameIn, s.name);
    put(r.tAlt, String(s.target.altitudeKm));
    const isL = 'lvlh' in s.chaser;
    r.modeLvlh.checked = isL;
    r.modeCirc.checked = !isL;
    r.lvlhBox.hidden = !isL;
    r.circBox.hidden = isL;
    if ('lvlh' in s.chaser) {
      const l = s.chaser.lvlh;
      if (!force && a !== r.unit && a !== r.vbar && a !== r.rbar) r.unit.value = Math.max(Math.abs(l.vbarM), Math.abs(l.rbarM)) >= 10000 ? 'km' : 'm';
      const k = r.unit.value === 'km' ? 1000 : 1;
      put(r.vbar, String(Number((l.vbarM / k).toPrecision(8))));
      put(r.rbar, String(Number((l.rbarM / k).toPrecision(8))));
    } else {
      put(r.cAlt, String(s.chaser.circular.altitudeKm));
      put(r.cPhase, String(s.chaser.circular.phaseDeg));
    }
    const P = circularPeriod(RE + s.target.altitudeKm * 1000);
    const D = this.app.store.duration;
    put(r.revs, String(Number((D / P).toFixed(2))));
    setText(r.durHint, `= ${countdown(D)} (h:mm:ss) · 1 rev = ${num(P / 60, 2)} min`);
  }
}

interface DvField {
  el: HTMLElement;
  slider: HTMLInputElement;
  input: HTMLInputElement;
  was: HTMLElement;
  comp: keyof ScenarioBurn['dv'];
}

interface FormRefs {
  nameIn: HTMLInputElement;
  tigIn: HTMLInputElement;
  radial: DvField;
  along: DvField;
  result: HTMLElement;
  warn: HTMLElement;
  badge: HTMLElement;
}

interface SetupRefs {
  nameIn: HTMLInputElement;
  tAlt: HTMLInputElement;
  modeLvlh: HTMLInputElement;
  modeCirc: HTMLInputElement;
  vbar: HTMLInputElement;
  rbar: HTMLInputElement;
  unit: HTMLSelectElement;
  cAlt: HTMLInputElement;
  cPhase: HTMLInputElement;
  revs: HTMLInputElement;
  durHint: HTMLElement;
  lvlhBox: HTMLElement;
  circBox: HTMLElement;
}
