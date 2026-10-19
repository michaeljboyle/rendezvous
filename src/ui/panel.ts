import { h } from './dom';

/** A view panel: title row (name, subtitle, controls), canvas host, telemetry strip. */
export function panel(id: string, title: string, subtitle: string, ariaLabel: string) {
  const controls = h('div', { class: 'panel-controls' });
  const host = h('div', { class: 'canvas-host' });
  const telemetry = h('div', { class: 'telemetry' });
  const telemetryToggle = h('button', { type: 'button', class: 'telemetry-toggle', 'aria-expanded': 'true', 'aria-label': 'Toggle telemetry' }, 'Telemetry');
  telemetryToggle.addEventListener('click', () => {
    const open = el.classList.toggle('telemetry-collapsed');
    telemetryToggle.setAttribute('aria-expanded', String(!open));
  });
  const el = h(
    'section',
    { class: `panel view-panel`, id, 'aria-label': ariaLabel },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, title), h('span', { class: 'panel-sub' }, subtitle), h('span', { class: 'spacer' }), controls),
    host,
    h('div', { class: 'telemetry-wrap' }, telemetryToggle, telemetry),
  );
  return { el, controls, host, telemetry };
}

/** Telemetry item "<dim label> value" with an updatable value span. */
export function telemetryItem(labelText: string, prefix?: Node): { el: HTMLElement; value: HTMLElement } {
  const value = h('span', { class: 'tv' });
  const el = h('span', { class: 'ti' }, prefix ?? null, labelText ? h('span', { class: 'tl' }, labelText) : null, ' ', value);
  return { el, value };
}
