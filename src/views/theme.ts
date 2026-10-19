/** Canvas colors and fonts, read from the CSS design tokens so there is one source of truth. */
export interface Theme {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  grid: string;
  axis: string;
  text: string;
  textDim: string;
  target: string;
  chaser: string;
  burn: string;
  earth: string;
  earthLimb: string;
  accent: string;
  mono: string;
  sans: string;
}

let cached: Theme | null = null;

export function theme(): Theme {
  if (cached) return cached;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  cached = {
    bg: v('--bg'),
    surface: v('--surface'),
    surface2: v('--surface-2'),
    border: v('--border'),
    grid: v('--grid'),
    axis: v('--axis'),
    text: v('--text'),
    textDim: v('--text-dim'),
    target: v('--target'),
    chaser: v('--chaser'),
    burn: v('--burn'),
    earth: v('--earth'),
    earthLimb: v('--earth-limb'),
    accent: v('--accent'),
    mono: v('--font-mono'),
    sans: v('--font-sans'),
  };
  return cached;
}

/** "#rrggbb" + alpha → rgba(). */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
