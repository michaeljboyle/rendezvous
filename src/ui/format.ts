/** Display formatting. SI internally; these turn numbers into strings for the UI. */

export const MINUS = '−';

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** Replace ASCII hyphen-minus with a true minus sign. */
export function signed(s: string): string {
  return s.replace(/^-/, MINUS);
}

/** Number with fixed decimals and a real minus sign; optional explicit plus. */
export function num(v: number, decimals: number, plus = false): string {
  const r = Number(v.toFixed(decimals));
  const s = (Object.is(r, -0) ? 0 : r).toFixed(decimals);
  if (plus && r > 0) return `+${s}`;
  return signed(s);
}

/** Mission elapsed time, "T+01:31:08". */
export function met(t: number): string {
  const s = Math.max(0, Math.round(t));
  return `T+${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Short MET for plot labels, "T+1:05". */
export function metShort(t: number): string {
  const m = Math.max(0, Math.round(t / 60));
  return `T+${Math.floor(m / 60)}:${pad(m % 60)}`;
}

/** Countdown, "26:08" or "1:02:08". */
export function countdown(t: number): string {
  const s = Math.max(0, Math.round(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Parse "T+01:31:08", "1:31:08", "31:08" or plain seconds. Returns null if invalid. */
export function parseMet(text: string): number | null {
  const s = text.trim().replace(/^T\s*\+\s*/i, '');
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if (min >= 60 || sec >= 60) return null;
  return h * 3600 + min * 60 + sec;
}

/** Distance value and unit: m below 10 km, km above. */
export function distParts(m: number): [string, string] {
  const a = Math.abs(m);
  if (a >= 10000) return [num(m / 1000, 2), 'km'];
  if (a >= 1000) return [num(m / 1000, 3), 'km'];
  if (a >= 100) return [num(m, 0), 'm'];
  return [num(m, 1), 'm'];
}

export function dist(m: number): string {
  const [v, u] = distParts(m);
  return `${v} ${u}`;
}

/** Pair of LVLH offsets sharing one unit, e.g. ["−29.19", "−42.14", "km"]. */
export function distPair(a: number, b: number): [string, string, string] {
  const big = Math.max(Math.abs(a), Math.abs(b));
  if (big >= 10000) return [num(a / 1000, 2), num(b / 1000, 2), 'km'];
  if (big >= 1000) return [num(a / 1000, 3), num(b / 1000, 3), 'km'];
  if (big >= 100) return [num(a, 0), num(b, 0), 'm'];
  return [num(a, 1), num(b, 1), 'm'];
}

export function speed(v: number, plus = false): string {
  const a = Math.abs(v);
  return `${num(v, a >= 10 ? 1 : a >= 0.01 || a === 0 ? 2 : 3, plus)} m/s`;
}

/** Δv or rate with 2 decimals (3 for small values), "19.89 m/s". */
export function dv(v: number, plus = false): string {
  return `${num(v, Math.abs(v) < 0.1 && v !== 0 ? 3 : 2, plus)} m/s`;
}

/** Compact span label for scale chips, "100 km", "200 m". */
export function span(m: number): string {
  const a = Math.abs(m);
  if (a >= 1000) {
    const km = a / 1000;
    return `${km >= 10 ? Math.round(km) : Number(km.toFixed(1))} km`;
  }
  return `${a >= 10 ? Math.round(a) : Number(a.toFixed(1))} m`;
}

/** Axis tick label in a fixed unit. */
export function tick(v: number, unit: 'm' | 'km'): string {
  const x = unit === 'km' ? v / 1000 : v;
  const r = Number(x.toPrecision(6));
  return signed(String(Object.is(r, -0) ? 0 : r));
}
