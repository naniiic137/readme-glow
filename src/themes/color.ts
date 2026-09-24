/** Small colour toolkit: parsing, WCAG contrast, mixing and contrast repair. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const hex = m[1]!;
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = hex.split('').map((c) => parseInt(c + c, 16));
      return { r: r!, g: g!, b: b!, a: hex.length === 4 ? a! / 255 : 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  m = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:[\s,/]+(\d*\.?\d+)(%?))?\s*\)$/.exec(s);
  if (m) {
    const alpha = m[4] === undefined ? 1 : m[5] === '%' ? Number(m[4]) / 100 : Number(m[4]);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
  }
  return null;
}

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function luminance(color: string | Rgb): number {
  const c = typeof color === 'string' ? parseColor(color) : color;
  if (!c) return 0;
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** Alpha-composites `fg` over an opaque `bg`. */
export function composite(fg: string, bg: string): string {
  const f = parseColor(fg);
  const b = parseColor(bg);
  if (!f || !b) return fg;
  return toHex({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
}

/** WCAG 2.x contrast ratio (1–21). Translucent foregrounds are composited over the background. */
export function contrast(fg: string, bg: string): number {
  const l1 = luminance(composite(fg, bg));
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a: string, b: string, amount: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return a;
  return toHex({ r: x.r + (y.r - x.r) * amount, g: x.g + (y.g - x.g) * amount, b: x.b + (y.b - x.b) * amount, a: 1 });
}

export function isDark(color: string): boolean {
  return luminance(color) < 0.2;
}

/**
 * Nudges `color` towards white or black (whichever direction increases contrast
 * with `bg`) until it reaches `ratio`. Keeps the hue as much as possible.
 */
export function ensureContrast(color: string, bg: string, ratio = 4.5): string {
  if (contrast(color, bg) >= ratio) return toHex(parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 });
  const target = isDark(bg) ? '#ffffff' : '#000000';
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (contrast(mix(color, target, mid), bg) >= ratio) hi = mid;
    else lo = mid;
  }
  return mix(color, target, hi);
}

/** Black or white text, whichever reads better on `bg`. */
export function readableOn(bg: string, light = '#ffffff', dark = '#0b0b0f'): string {
  return contrast(light, bg) >= contrast(dark, bg) ? light : dark;
}

export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}
