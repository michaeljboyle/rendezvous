import { PRESETS, presetById } from '../scenarios/presets';
import { encodeShareHash, parseScenarioJson, scenarioToJson } from '../state/persist';
import type { AppCtx } from './context';
import { closePopover, h, icon, popover, setText, toast } from './dom';

/** Scenario picker, share/export/import actions and the settings menu. */
export class Header {
  picker: HTMLButtonElement;
  actions: HTMLElement;
  more: HTMLButtonElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  private pickNum = h('span', { class: 'pick-num' });
  private pickName = h('span', { class: 'pick-name' });
  private pickShort = h('span', { class: 'pick-short' });
  private pickEdited = h('span', { class: 'pick-edited' }, 'edited');
  private fileInput: HTMLInputElement;

  constructor(private app: AppCtx) {
    this.picker = h(
      'button',
      { type: 'button', class: 'picker', 'aria-haspopup': 'menu', 'aria-label': 'Choose scenario', onclick: () => this.openPicker() },
      h('span', { class: 'pick-label' }, 'Scenario'),
      this.pickNum,
      this.pickName,
      this.pickShort,
      this.pickEdited,
      icon('chevronDown', 14, 2),
    );
    this.fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
    this.fileInput.addEventListener('change', () => this.importFile());
    this.undoBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Undo (Z)', title: 'Undo (Z)', onclick: () => app.store.undo() }, icon('undo', 18));
    this.redoBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Redo (Shift+Z)', title: 'Redo (Shift+Z)', onclick: () => app.store.redo() }, icon('redo', 18));
    const copyBtn = h('button', { type: 'button', class: 'btn btn-outline', onclick: () => this.copyLink() }, icon('link', 15), 'Copy link');
    const exportBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Export scenario as JSON', title: 'Export JSON', onclick: () => this.exportJson() }, icon('download', 18));
    const settingsBtn: HTMLButtonElement = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Settings and import', title: 'Settings', 'aria-haspopup': 'dialog', onclick: () => this.openSettings(settingsBtn) }, icon('settings', 18));
    this.actions = h('div', { class: 'header-actions' }, copyBtn, exportBtn, settingsBtn, this.fileInput);
    this.more = h('button', { type: 'button', class: 'icon-btn more-btn', 'aria-label': 'More: share, export, import, settings', 'aria-haspopup': 'dialog', onclick: () => this.openSettings(this.more, true) }, icon('more', 20));
    app.store.subscribe(() => this.sync());
    this.sync();
  }

  sync(): void {
    const { store } = this.app;
    const p = store.presetId ? presetById(store.presetId) : undefined;
    setText(this.pickNum, p ? `${p.number} ·` : 'My ·');
    setText(this.pickName, p ? p.scenario.name : store.scenario.name);
    setText(this.pickShort, p ? p.short : store.scenario.name);
    this.pickEdited.hidden = !store.edited;
    this.undoBtn.disabled = !store.canUndo;
    this.redoBtn.disabled = !store.canRedo;
  }

  private openPicker(): void {
    const { store } = this.app;
    const items = PRESETS.map((p) =>
      h(
        'button',
        {
          type: 'button',
          class: 'menu-item preset-item',
          role: 'menuitemradio',
          'aria-checked': String(store.presetId === p.id && !store.edited),
          onclick: () => {
            closePopover();
            store.loadPreset(p.id);
            this.app.clock.pause();
            this.app.clock.setTime(0);
            if (store.edited === false) toast(`Loaded preset ${p.number} · ${p.scenario.name}`);
          },
        },
        h('span', { class: 'pi-title' }, `${p.number} · ${p.scenario.name}`),
        h('span', { class: 'pi-desc' }, p.scenario.description ?? ''),
      ),
    );
    const body = h(
      'div',
      { class: 'menu picker-menu', role: 'menu', 'aria-label': 'Scenarios' },
      ...items,
      h('div', { class: 'menu-sep' }),
      h('button', { type: 'button', class: 'menu-item', role: 'menuitem', onclick: () => (closePopover(), this.fileInput.click()) }, 'Import JSON…'),
      store.edited ? h('p', { class: 'hint menu-hint' }, 'Loading a preset replaces your edits (Undo brings them back).') : null,
    );
    popover(this.picker, body, { align: 'left' });
  }

  private openSettings(anchor: HTMLElement, phone = false): void {
    const { clock, store } = this.app;
    const slow = h('input', { type: 'checkbox', checked: clock.slowNearBurns });
    slow.addEventListener('change', () => clock.setSlowNearBurns(slow.checked));
    const loop = h('input', { type: 'checkbox', checked: clock.loop });
    loop.addEventListener('change', () => clock.setLoop(loop.checked));
    const row = (label: string, ic: string, fn: () => void, disabled = false) =>
      h('button', { type: 'button', class: 'menu-item with-icon', disabled, onclick: () => (closePopover(), fn()) }, icon(ic, 16), label);
    const body = h(
      'div',
      { class: 'menu settings-menu' },
      phone ? row('Copy link', 'link', () => this.copyLink()) : null,
      phone ? row('Export JSON', 'download', () => this.exportJson()) : null,
      row('Import JSON…', 'upload', () => this.fileInput.click()),
      phone ? row('Undo', 'undo', () => store.undo(), !store.canUndo) : null,
      phone ? row('Redo', 'redo', () => store.redo(), !store.canRedo) : null,
      h('div', { class: 'menu-sep' }),
      h('label', { class: 'check' }, slow, h('span', null, 'Slow to 10× within ±60 s of a burn')),
      h('label', { class: 'check' }, loop, h('span', null, 'Loop playback')),
      h('div', { class: 'menu-sep' }),
      h(
        'div',
        { class: 'shortcuts' },
        h('div', { class: 'pop-title' }, 'Keyboard'),
        ...(
          [
            ['Space', 'Play / pause'],
            ['← / →', 'Previous / next burn'],
            ['[ / ]', 'Slower / faster'],
            ['B', 'Add burn at current time'],
            ['Z / Shift+Z', 'Undo / redo'],
            ['Esc', 'Cancel edit / close'],
          ] as const
        ).map(([k, v]) => h('div', { class: 'sc' }, h('kbd', null, k), h('span', null, v))),
      ),
    );
    popover(anchor, body);
  }

  async copyLink(): Promise<void> {
    const url = `${location.origin}${location.pathname}${encodeShareHash(this.app.store.scenario)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied: anyone with it opens this scenario');
    } catch {
      history.replaceState(null, '', url);
      toast('Link is in the address bar: copy it from there');
    }
  }

  exportJson(): void {
    const s = this.app.store.scenario;
    const blob = new Blob([scenarioToJson(s)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${s.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'scenario'}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private async importFile(): Promise<void> {
    const f = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!f) return;
    try {
      const s = parseScenarioJson(await f.text());
      this.app.store.load(s, null, true);
      this.app.clock.pause();
      this.app.clock.setTime(0);
      toast(`Imported “${s.name}”`);
    } catch (e) {
      toast(`Could not import: ${(e as Error).message}`, 'error');
    }
  }
}
