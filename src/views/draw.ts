import { theme } from './theme';

export const DASH = [5, 4];

/** Target: small square ("station"), with a ring in the background color. */
export function drawTarget(c: CanvasRenderingContext2D, x: number, y: number, size = 10, ring?: string): void {
  const t = theme();
  c.save();
  c.setLineDash([]);
  c.globalAlpha = 1;
  c.fillStyle = t.target;
  c.strokeStyle = ring ?? t.bg;
  c.lineWidth = 2;
  c.beginPath();
  c.rect(x - size / 2, y - size / 2, size, size);
  c.stroke();
  c.fill();
  c.restore();
}

/** Chaser: filled circle with a 2 px ring in --bg so it reads over the line. */
export function drawChaser(c: CanvasRenderingContext2D, x: number, y: number, r = 5.5): void {
  const t = theme();
  c.save();
  c.setLineDash([]);
  c.globalAlpha = 1;
  c.beginPath();
  c.arc(x, y, r + 2, 0, Math.PI * 2);
  c.fillStyle = t.bg;
  c.fill();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = t.chaser;
  c.fill();
  c.restore();
}

/** Burn marker: triangle; filled for past burns, hollow for future ones. */
export function drawBurnMarker(c: CanvasRenderingContext2D, x: number, y: number, filled: boolean, size = 7, selected = false): void {
  const t = theme();
  c.save();
  c.setLineDash([]);
  c.globalAlpha = 1;
  if (selected) {
    c.beginPath();
    c.setLineDash([3, 3]);
    c.strokeStyle = t.textDim;
    c.lineWidth = 1.2;
    c.arc(x, y - 1, size + 7, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  }
  c.beginPath();
  c.moveTo(x, y - size - 1);
  c.lineTo(x + size, y + size * 0.75);
  c.lineTo(x - size, y + size * 0.75);
  c.closePath();
  c.lineWidth = 1.6;
  c.strokeStyle = t.burn;
  if (filled) {
    c.fillStyle = t.burn;
    c.fill();
  } else {
    c.fillStyle = t.surface;
    c.fill();
  }
  c.stroke();
  c.restore();
}

export function arrow(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 1.5, head = 6): void {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  c.save();
  c.setLineDash([]);
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1 - Math.cos(ang) * head * 0.6, y1 - Math.sin(ang) * head * 0.6);
  c.stroke();
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x1 - head * Math.cos(ang - 0.45), y1 - head * Math.sin(ang - 0.45));
  c.lineTo(x1 - head * Math.cos(ang + 0.45), y1 - head * Math.sin(ang + 0.45));
  c.closePath();
  c.fill();
  c.restore();
}

export function mono(c: CanvasRenderingContext2D, size = 11, weight = 400): void {
  c.font = `${weight} ${size}px ${theme().mono}`;
}

export function sans(c: CanvasRenderingContext2D, size = 12, weight = 400): void {
  c.font = `${weight} ${size}px ${theme().sans}`;
}

/** Text with a halo in the surface color so labels stay legible over lines. */
export function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, halo?: string): void {
  c.save();
  c.setLineDash([]);
  c.lineJoin = 'round';
  c.lineWidth = 3;
  c.strokeStyle = halo ?? theme().surface;
  c.strokeText(text, x, y);
  c.fillStyle = color;
  c.fillText(text, x, y);
  c.restore();
}

/** "Nice" tick step (1, 2, 5 × 10^k) for roughly `count` ticks over `range`. */
export function niceStep(range: number, count: number): number {
  const raw = Math.abs(range) / Math.max(1, count);
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + step * 1e-9 && out.length < 200; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
