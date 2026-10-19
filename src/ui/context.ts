import type { Store } from '../state/store';
import type { Clock } from '../state/clock';
import type { ViewSettings } from '../state/viewSettings';

export interface AppCtx {
  store: Store;
  clock: Clock;
  settings: ViewSettings;
  /** Ask for a redraw on the next animation frame. */
  invalidate(): void;
}

/** Common surface every view implements. */
export interface View {
  el: HTMLElement;
  render(t: number, now: number): void;
  /** True while the view needs continuous frames (e.g. easing). */
  animating?(): boolean;
}
