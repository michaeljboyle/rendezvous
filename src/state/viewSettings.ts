export type Coords = 'curv' | 'rect';

/** View options shared by more than one view. Writes go through here so the views can't disagree. */
export class ViewSettings {
  /** LVLH coordinates for the LVLH-now view and the rendezvous plot. */
  coords: Coords = 'curv';
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setCoords(c: Coords): void {
    if (c === this.coords) return;
    this.coords = c;
    for (const fn of this.listeners) fn();
  }
}
