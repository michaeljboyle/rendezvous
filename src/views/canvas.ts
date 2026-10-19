/** A canvas that fills its host element and tracks devicePixelRatio. Drawing uses CSS pixels. */
export class Surface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  private dpr = 1;

  constructor(
    readonly host: HTMLElement,
    onResize: () => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view-canvas';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    const ro = new ResizeObserver(() => {
      this.resize();
      onResize();
    });
    ro.observe(host);
    this.resize();
  }

  get visible(): boolean {
    return this.w > 0 && this.h > 0 && this.host.offsetParent !== null;
  }

  resize(): void {
    const r = this.host.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = Math.floor(r.width);
    this.h = Math.floor(r.height);
    const pw = Math.max(1, Math.round(this.w * this.dpr));
    const ph = Math.max(1, Math.round(this.h * this.dpr));
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  /** Reset the transform to CSS pixels and clear. */
  begin(fill: string): CanvasRenderingContext2D {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1;
    c.setLineDash([]);
    c.fillStyle = fill;
    c.fillRect(0, 0, this.w, this.h);
    return c;
  }

  /** Pointer position in CSS pixels relative to the canvas. */
  local(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
}
