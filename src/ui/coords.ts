import type { AppCtx } from './context';
import { h } from './dom';

const LABEL = { curv: 'Curvilinear', rect: 'Rectilinear' } as const;
const TITLE =
  'Curvilinear: V-bar is arc length along the Target orbit, R-bar is altitude difference. Rectilinear: straight-line offsets from the Target.';

/** Title-row chip that flips the shared LVLH coordinates; its label follows the setting. */
export function coordsChip(app: AppCtx): HTMLButtonElement {
  const s = app.settings;
  const btn = h('button', { type: 'button', class: 'chip hide-phone hide-compact', title: TITLE, onclick: () => s.setCoords(s.coords === 'curv' ? 'rect' : 'curv') }, LABEL[s.coords]);
  s.subscribe(() => (btn.textContent = LABEL[s.coords]));
  return btn;
}

/** Checkbox for axis popovers (the title-row chip is hidden on phone). */
export function coordsCheck(app: AppCtx): HTMLLabelElement {
  const s = app.settings;
  const box = h('input', { type: 'checkbox', checked: s.coords === 'curv' });
  box.addEventListener('change', () => s.setCoords(box.checked ? 'curv' : 'rect'));
  return h('label', { class: 'check', title: TITLE }, box, h('span', null, 'Curvilinear coordinates (arc length, altitude)'));
}
