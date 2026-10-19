export interface Pt {
  x: number;
  y: number;
}

export interface DragMode {
  move(p: Pt, dx: number, dy: number): void;
  end?(): void;
  /** Start dragging immediately on press (no movement threshold), e.g. grabbing the "now" dot. */
  immediate?: boolean;
}

export interface GestureHandlers {
  /** Pointer pressed: return how a drag starting here behaves (or nothing for no drag). */
  onPress?(p: Pt, e: PointerEvent): DragMode | void;
  onTap?(p: Pt, e: PointerEvent): void;
  onDoubleTap?(p: Pt): void;
  /** Long-press (touch) or right-click (mouse). */
  onLongPress?(p: Pt, client: Pt): void;
  /** Two-finger pinch: factor > 1 zooms in. axis says whether the pinch is mainly horizontal or vertical. */
  onPinch?(factor: number, axis: 'x' | 'y' | 'both', center: Pt, pan: Pt): void;
  onWheel?(e: WheelEvent, p: Pt): void;
  onHover?(p: Pt | null): void;
  /** Horizontal swipe that started at a canvas edge (phone view switching). */
  onEdgeSwipe?(dir: 1 | -1): void;
}

const MOVE_THRESHOLD = 5;
const LONG_PRESS_MS = 550;
const EDGE = 24;

export function attachGestures(el: HTMLElement, local: (e: { clientX: number; clientY: number }) => Pt, h: GestureHandlers): void {
  const pointers = new Map<number, Pt>();
  let start: Pt | null = null;
  let startTime = 0;
  let last: Pt | null = null;
  let drag: DragMode | null = null;
  let dragActive = false;
  let moved = false;
  let longTimer = 0;
  let longFired = false;
  let lastTap = { t: 0, p: { x: 0, y: 0 } };
  let pinch: { d: number; axis: 'x' | 'y' | 'both'; c: Pt } | null = null;
  let edgeStart = false;

  const clearLong = () => {
    if (longTimer) window.clearTimeout(longTimer);
    longTimer = 0;
  };

  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, a, b };
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      clearLong();
      if (drag && dragActive) drag.end?.();
      drag = null;
      dragActive = false;
      const s = pinchState();
      const ang = Math.abs(Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x));
      const deg = ((ang > Math.PI / 2 ? Math.PI - ang : ang) * 180) / Math.PI;
      pinch = { d: s.d, c: s.c, axis: deg < 25 ? 'x' : deg > 65 ? 'y' : 'both' };
      return;
    }
    if (pointers.size > 2) return;
    start = p;
    last = p;
    startTime = performance.now();
    moved = false;
    longFired = false;
    edgeStart = p.x < EDGE || p.x > el.clientWidth - EDGE;
    drag = h.onPress?.(p, e) ?? null;
    dragActive = !!drag?.immediate;
    if (h.onLongPress && e.pointerType !== 'mouse') {
      longTimer = window.setTimeout(() => {
        if (!moved && start) {
          longFired = true;
          h.onLongPress!(start, { x: e.clientX, y: e.clientY });
        }
      }, LONG_PRESS_MS);
    }
  });

  el.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') h.onHover?.(p);
      return;
    }
    pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const s = pinchState();
      if (pinch.d > 10 && s.d > 10) h.onPinch?.(s.d / pinch.d, pinch.axis, s.c, { x: s.c.x - pinch.c.x, y: s.c.y - pinch.c.y });
      pinch.d = s.d;
      pinch.c = s.c;
      return;
    }
    if (!start || !last) return;
    if (!moved && Math.hypot(p.x - start.x, p.y - start.y) > MOVE_THRESHOLD) {
      moved = true;
      clearLong();
      if (edgeStart && h.onEdgeSwipe && !drag?.immediate) {
        drag = null;
      } else if (drag && !dragActive) {
        dragActive = true;
      }
    }
    if (drag && dragActive) drag.move(p, p.x - last.x, p.y - last.y);
    last = p;
  });

  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    clearLong();
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      start = null;
      return;
    }
    const p = local(e);
    if (drag && dragActive) drag.end?.();
    if (!cancelled && start) {
      const dt = performance.now() - startTime;
      if (edgeStart && moved && h.onEdgeSwipe && Math.abs(p.x - start.x) > 50 && Math.abs(p.x - start.x) > 2 * Math.abs(p.y - start.y) && dt < 700) {
        h.onEdgeSwipe(p.x < start.x ? 1 : -1);
      } else if (!moved && !longFired) {
        const now = performance.now();
        if (now - lastTap.t < 320 && Math.hypot(p.x - lastTap.p.x, p.y - lastTap.p.y) < 24) {
          h.onDoubleTap?.(p);
          lastTap.t = 0;
        } else {
          h.onTap?.(p, e);
          lastTap = { t: now, p };
        }
      }
    }
    drag = null;
    dragActive = false;
    start = null;
  };
  el.addEventListener('pointerup', (e) => finish(e, false));
  el.addEventListener('pointercancel', (e) => finish(e, true));
  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pointers.size) h.onHover?.(null);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (h.onLongPress && !longFired) h.onLongPress(local(e), { x: e.clientX, y: e.clientY });
  });
  el.addEventListener(
    'wheel',
    (e) => {
      if (!h.onWheel) return;
      e.preventDefault();
      h.onWheel(e, local(e));
    },
    { passive: false },
  );
}
