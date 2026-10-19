type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

/** Tiny hyperscript helper: h('button', { class: 'btn', onclick: fn, 'aria-label': 'Play' }, 'Play'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (k === 'class') {
        el.className = String(v);
      } else if (k === 'style') {
        el.setAttribute('style', String(v));
      } else if (k in el && !k.includes('-') && k !== 'list' && k !== 'form') {
        (el as unknown as Record<string, unknown>)[k] = v;
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** Set text only when it changed (cheap per-frame telemetry updates). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

const ICONS: Record<string, string> = {
  logo: '<ellipse cx="12" cy="12" rx="10" ry="5.5" transform="rotate(-25 12 12)"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  prev: '<path d="M6 5v14"/><path d="M18 5 9 12l9 7z"/>',
  next: '<path d="M18 5v14"/><path d="M6 5l9 7-9 7z"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  loop: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M5 3h14"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  more: '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  warn: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h0M10 10h0M14 10h0M18 10h0M7 14h10"/>',
};

export function icon(name: keyof typeof ICONS | string, size = 18, stroke = 1.8): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(stroke));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}

export interface Segmented<T extends string> {
  el: HTMLElement;
  set(v: T): void;
}

/** Segmented control (group of toggle buttons with aria-pressed). */
export function segmented<T extends string>(label: string, options: { value: T; label: string; title?: string }[], value: T, onChange: (v: T) => void, cls = ''): Segmented<T> {
  const buttons = options.map((o) =>
    h('button', { type: 'button', class: 'seg-btn', title: o.title, 'aria-pressed': String(o.value === value), onclick: () => onChange(o.value) }, o.label),
  );
  const el = h('div', { class: `seg ${cls}`, role: 'group', 'aria-label': label }, ...buttons);
  return {
    el,
    set(v: T) {
      options.forEach((o, i) => buttons[i].setAttribute('aria-pressed', String(o.value === v)));
    },
  };
}

let openPop: { el: HTMLElement; close: () => void } | null = null;

export function closePopover(): void {
  openPop?.close();
}

/** Open a popover anchored under `anchor`. Closes on outside click, Escape, or closePopover(). */
export function popover(anchor: HTMLElement, content: HTMLElement, opts: { align?: 'left' | 'right'; onClose?: () => void; up?: boolean } = {}): () => void {
  closePopover();
  const el = h('div', { class: 'popover', role: 'dialog' }, content);
  document.body.appendChild(el);
  const place = () => {
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    let left = opts.align === 'left' ? r.left : r.right - w;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    let top = opts.up ? r.top - hgt - 6 : r.bottom + 6;
    if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - 6);
    if (top < 8) top = 8;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };
  place();
  anchor.setAttribute('aria-expanded', 'true');
  const onDown = (e: Event) => {
    if (!el.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      anchor.focus();
    }
  };
  const close = () => {
    if (!el.isConnected) return;
    el.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    if (openPop?.el === el) openPop = null;
    opts.onClose?.();
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
  });
  openPop = { el, close };
  const first = el.querySelector<HTMLElement>('input, button, select, [tabindex]');
  first?.focus();
  return close;
}

/** Popover at a screen point (used for "Add burn here"). */
export function menuAt(x: number, y: number, items: { label: string; action: () => void }[]): void {
  const anchor = h('div', { style: `position:fixed;left:${x}px;top:${y}px;width:1px;height:1px` });
  document.body.appendChild(anchor);
  const list = h(
    'div',
    { class: 'menu', role: 'menu' },
    ...items.map((it) =>
      h('button', { type: 'button', class: 'menu-item', role: 'menuitem', onclick: () => (close(), it.action()) }, it.label),
    ),
  );
  const close = popover(anchor, list, { align: 'left', onClose: () => anchor.remove() });
}

let toastTimer = 0;
export function toast(msg: string, kind: 'info' | 'error' = 'info'): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2600);
}
