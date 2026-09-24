import type { ThemeId, ThemeTokens } from '../../themes/types';
import { isDark, mix } from '../../themes/color';
import { num as n, seeded } from './shape';

/**
 * The signature look of each theme, drawn as plain SVG for the GitHub export:
 * gradients, patterns and simple shapes only (no images, fonts, scripts or
 * external references). Animation is optional, CSS-only, and never needed to
 * read anything: the first frame is the finished picture.
 */

export type ArtKind = 'hero' | 'section';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextLayout {
  /** Box around the title lines (cap-height to baseline). */
  title: Box;
  /** Box around everything that was laid out (title + tagline). */
  content: Box;
  titleSize: number;
  titleCap: number;
  /** Baseline of the last title line. */
  lastBaseline: number;
  /** Right edge of the last title line. */
  lastLineEnd: number;
  hasTagline: boolean;
}

export interface ArtInput {
  theme: ThemeId;
  kind: ArtKind;
  w: number;
  h: number;
  p: ThemeTokens;
  animate: boolean;
  seed: string;
}

export interface TitleStyle {
  fill: string;
  shadow?: { dx: number; dy: number; fill: string };
  stroke?: { color: string; width: number };
  glow?: boolean;
}

export interface Art {
  defs: string;
  back: string;
  front: string;
  /** Animation rules; the caller wraps them in a prefers-reduced-motion: no-preference query. */
  css: string;
  align: 'center' | 'left';
  title: TitleStyle;
  tagline: string;
  taglineStroke?: { color: string; width: number };
  index: string;
  radius: number;
  padX: number;
  padTop: number;
  padBottom: number;
  reserveRight: number;
  upper: boolean;
  letterSpacing: number;
  /** Extra space (in title em) between title and tagline for an ornament drawn there. */
  ornamentGap: number;
  /** Title size range (px) for the hero / section. */
  maxSize: number;
  minSize: number;
  beforeText?: (l: TextLayout) => string;
  afterTitle?: (l: TextLayout) => string;
}

// ------------------------------------------------------------------ helpers

const svgAttr = (color: string) => color;

function radial(id: string, color: string, opacity: number, cx = 0.5, cy = 0.5, r = 0.5): string {
  return (
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">` +
    `<stop offset="0" stop-color="${svgAttr(color)}" stop-opacity="${opacity}"/>` +
    `<stop offset="1" stop-color="${svgAttr(color)}" stop-opacity="0"/></radialGradient>`
  );
}

function linear(id: string, stops: Array<[number, string, number?]>, vertical = false): string {
  const dir = vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"';
  return `<linearGradient id="${id}" ${dir}>${stops
    .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`)
    .join('')}</linearGradient>`;
}

function blob(fill: string, cx: number, cy: number, r: number, cls?: string): string {
  return `<circle${cls ? ` class="${cls}"` : ''} cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${fill})"/>`;
}

function rect(x: number, y: number, w: number, h: number, attrs: string): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${attrs}/>`;
}

function border(w: number, h: number, radius: number, color: string, width: number, opacity = 1): string {
  const i = width / 2;
  return `<rect x="${n(i)}" y="${n(i)}" width="${n(w - width)}" height="${n(h - width)}" rx="${n(Math.max(0, radius - i))}" fill="none" stroke="${color}" stroke-width="${width}"${opacity < 1 ? ` stroke-opacity="${opacity}"` : ''}/>`;
}

function diamond(cx: number, cy: number, r: number, fill: string): string {
  return `<path d="M${n(cx)} ${n(cy - r)}L${n(cx + r)} ${n(cy)}L${n(cx)} ${n(cy + r)}L${n(cx - r)} ${n(cy)}Z" fill="${fill}"/>`;
}

/** Soft ambient drift for glow blobs. */
const DRIFT_CSS =
  '.rg-d1{animation:rg-a 19s ease-in-out infinite alternate}.rg-d2{animation:rg-b 23s ease-in-out infinite alternate}' +
  '.rg-d3{animation:rg-a 27s ease-in-out infinite alternate-reverse}.rg-d4{animation:rg-b 21s ease-in-out infinite alternate-reverse}' +
  '@keyframes rg-a{to{transform:translate(70px,26px)}}@keyframes rg-b{to{transform:translate(-80px,-22px)}}';

function base(input: ArtInput): Art {
  const { p, kind } = input;
  return {
    defs: '',
    back: rect(0, 0, input.w, input.h, `fill="${p.bg}"`),
    front: '',
    css: '',
    align: kind === 'hero' ? 'center' : 'left',
    title: { fill: p.heading },
    tagline: p.muted,
    index: p.accent,
    radius: 16,
    padX: kind === 'hero' ? 110 : 48,
    padTop: kind === 'hero' ? 64 : 0,
    padBottom: kind === 'hero' ? 64 : 0,
    reserveRight: kind === 'hero' ? 0 : 140,
    upper: false,
    letterSpacing: kind === 'hero' ? -0.01 : 0,
    ornamentGap: 0,
    maxSize: kind === 'hero' ? 96 : 50,
    minSize: kind === 'hero' ? 46 : 28,
  };
}

// ------------------------------------------------------------------ themes

function github(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 12;
  a.defs =
    linear('rg-bar', [
      [0, p.accent],
      [0.5, p.link],
      [1, p.important],
    ]) +
    `<pattern id="rg-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="${p.border}"/></pattern>` +
    radial('rg-fade', '#ffffff', 1, 0.5, 0, 0.9) +
    `<mask id="rg-m"><rect width="${w}" height="${h}" fill="url(#rg-fade)"/></mask>` +
    radial('rg-glow', p.accent, isDark(p.bg) ? 0.22 : 0.12, 0.5, 0, 0.7);
  if (i.kind === 'hero') {
    a.back += rect(0, 0, w, h, 'fill="url(#rg-dots)" mask="url(#rg-m)"') + rect(0, 0, w, h, 'fill="url(#rg-glow)"');
    a.front = rect(0, 0, w, 6, 'fill="url(#rg-bar)"') + border(w, h, a.radius, p.border, 2);
  } else {
    a.back += rect(w - 360, 0, 360, h, 'fill="url(#rg-dots)" opacity=".7"');
    a.front = rect(0, 0, 6, h, 'fill="url(#rg-bar)"') + border(w, h, a.radius, p.border, 2);
  }
  return a;
}

function aurora(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 22;
  a.defs =
    radial('rg-b1', p.accent, 0.62) +
    radial('rg-b2', p.link, 0.48) +
    radial('rg-b3', p.important, 0.42) +
    radial('rg-b4', p.tip, 0.3) +
    linear(
      'rg-tg',
      [
        [0, p.heading],
        [1, mix(p.heading, p.accent, isDark(p.bg) ? 0.35 : 0.5)],
      ],
      true,
    );
  const d = (k: number) => (i.animate ? `rg-d${k}` : undefined);
  if (i.kind === 'hero') {
    a.back +=
      blob('rg-b1', w * 0.12, h * 0.05, w * 0.42, d(1)) +
      blob('rg-b2', w * 0.9, h * 0.15, w * 0.38, d(2)) +
      blob('rg-b3', w * 0.62, h * 1.15, w * 0.42, d(3)) +
      blob('rg-b4', w * 0.2, h * 1.08, w * 0.28, d(4));
  } else {
    a.back += blob('rg-b1', w * 0.92, h * 0.4, w * 0.24, d(1)) + blob('rg-b2', w * 0.74, h * 1.3, w * 0.2, d(2)) + blob('rg-b3', -40, h * 1.2, w * 0.14);
  }
  a.front = border(w, h, a.radius, p.border, 1.5, 0.9);
  a.title = { fill: 'url(#rg-tg)' };
  if (i.animate) a.css = DRIFT_CSS;
  return a;
}

function frost(i: ArtInput): Art {
  const a = aurora(i);
  const { p, w, h } = i;
  const dark = isDark(p.bg);
  a.radius = 24;
  a.defs =
    radial('rg-b1', p.accent, dark ? 0.4 : 0.34) +
    radial('rg-b2', p.link, dark ? 0.3 : 0.28) +
    radial('rg-b3', p.important, 0.22) +
    radial('rg-b4', p.tip, 0.18);
  a.title = { fill: p.heading };
  const glass = dark ? p.surface : '#ffffff';
  a.beforeText = (l) => {
    const pad = i.kind === 'hero' ? 44 : 0;
    if (i.kind !== 'hero') return '';
    const x = Math.max(28, l.content.x - pad);
    const width = Math.min(w - 56, l.content.w + pad * 2);
    return rect(x, l.content.y - pad * 0.8, width, l.content.h + pad * 1.6, `rx="20" fill="${glass}" fill-opacity="${dark ? 0.45 : 0.55}" stroke="#ffffff" stroke-opacity="${dark ? 0.18 : 0.8}" stroke-width="1.5"`);
  };
  a.front = border(w, h, a.radius, p.border, 1.5);
  return a;
}

function editorial(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 6;
  a.defs = `<radialGradient id="rg-v" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#5a3a10" stop-opacity="0"/><stop offset="1" stop-color="#5a3a10" stop-opacity="${isDark(p.bg) ? 0.25 : 0.1}"/></radialGradient>`;
  a.back += rect(0, 0, w, h, 'fill="url(#rg-v)"');
  const rule = (y: number, flip: boolean) =>
    rect(64, flip ? y + 5 : y, w - 128, 3, `fill="${p.heading}"`) + rect(64, flip ? y : y + 7, w - 128, 1, `fill="${p.heading}"`);
  if (i.kind === 'hero') {
    a.front = rule(34, false) + rule(h - 42, true) + border(w, h, a.radius, p.border, 1.5);
    a.afterTitle = (l) => (l.hasTagline ? diamond(w / 2, l.lastBaseline + l.titleSize * 0.4, 6, p.accent) : '');
    a.ornamentGap = 0.28;
  } else {
    a.front = rect(40, h - 18, w - 80, 3, `fill="${p.heading}"`) + rect(40, h - 24, w - 80, 1, `fill="${p.heading}"`) + border(w, h, a.radius, p.border, 1.5);
    a.reserveRight = 40;
  }
  a.letterSpacing = -0.015;
  return a;
}

function terminal(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 12;
  a.defs =
    `<pattern id="rg-scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000000" fill-opacity=".22"/></pattern>` +
    radial('rg-glow', p.accent, 0.16, 0.5, 0.55, 0.7);
  a.back += rect(0, 0, w, h, 'fill="url(#rg-glow)"');
  a.title = { fill: p.heading };
  a.tagline = p.muted;
  a.letterSpacing = 0;
  a.maxSize = i.kind === 'hero' ? 118 : 62;
  a.minSize = i.kind === 'hero' ? 56 : 34;
  if (i.kind === 'hero') {
    const bar = mix(p.bg, p.text, 0.1);
    a.back +=
      rect(0, 0, w, 44, `fill="${bar}"`) +
      `<circle cx="28" cy="22" r="7" fill="#ff5f56"/><circle cx="52" cy="22" r="7" fill="#ffbd2e"/><circle cx="76" cy="22" r="7" fill="#27c93f"/>`;
    a.padTop = 44 + 48;
    a.padBottom = 56;
  } else {
    a.back += rect(0, 0, 6, h, `fill="${p.accent}"`);
  }
  a.afterTitle = (l) =>
    rect(l.lastLineEnd + l.titleSize * 0.12, l.lastBaseline - l.titleCap, l.titleSize * 0.46, l.titleCap, `fill="${p.accent}"${i.animate ? ' class="rg-blink"' : ''}`);
  a.front = rect(0, 0, w, h, 'fill="url(#rg-scan)"') + border(w, h, a.radius, p.border, 2);
  if (i.animate) a.css = '.rg-blink{animation:rg-blink 1.1s steps(1) infinite}@keyframes rg-blink{50%{opacity:0}}';
  return a;
}

function pixel(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 0;
  a.upper = true;
  a.letterSpacing = 0.02;
  a.maxSize = i.kind === 'hero' ? 60 : 32;
  // Wide pixel type: keep the words clear of the sparkles in the margins.
  if (i.kind === 'hero') a.padX = 200;
  a.minSize = i.kind === 'hero' ? 28 : 18;
  a.defs =
    `<pattern id="rg-chk" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${p.text}" fill-opacity=".05"/><rect x="16" y="16" width="16" height="16" fill="${p.text}" fill-opacity=".05"/></pattern>` +
    `<pattern id="rg-row" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${p.accent}"/></pattern>`;
  a.back += rect(0, 0, w, h, 'fill="url(#rg-chk)"');
  const rnd = seeded(`${i.seed}:px`);
  let sparks = '';
  const count = i.kind === 'hero' ? 9 : 4;
  for (let k = 0; k < count; k++) {
    // Sparkles live in the margins, never on top of the words.
    const side = rnd() < 0.5 ? rnd() * 150 + 24 : w - 24 - rnd() * 150;
    const x = Math.round((i.kind === 'hero' ? side : w - 300 + rnd() * 260) / 4) * 4;
    const y = Math.round((rnd() * (h - 40) + 20) / 4) * 4;
    const c = [p.link, p.mark, p.tip, p.accent][k % 4]!;
    const cls = i.animate ? ` class="rg-s${k % 3}"` : '';
    sparks += `<g${cls} fill="${c}">${rect(x, y - 4, 4, 12, '')}${rect(x - 4, y, 12, 4, '')}</g>`;
  }
  a.back += sparks;
  a.title = { fill: p.heading, shadow: { dx: i.kind === 'hero' ? 6 : 3, dy: i.kind === 'hero' ? 6 : 3, fill: mix(p.accent, p.bg, 0.25) } };
  a.front = rect(0, 0, w, 8, 'fill="url(#rg-row)"') + `<rect x="8" y="${h - 8}" width="${w - 8}" height="8" fill="url(#rg-row)"/>` + border(w, h, 0, p.border, 4);
  if (i.animate)
    a.css =
      '.rg-s0{animation:rg-bl 1.6s steps(1) infinite}.rg-s1{animation:rg-bl 2.2s steps(1) infinite .5s}.rg-s2{animation:rg-bl 2.8s steps(1) infinite 1s}@keyframes rg-bl{50%{opacity:.15}}';
  return a;
}

function synthwave(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 18;
  a.upper = true;
  a.letterSpacing = 0.04;
  a.maxSize = i.kind === 'hero' ? 84 : 44;
  // The text stays in the middle of the sky; the sun sits to its right.
  if (i.kind === 'hero') a.padX = 250;
  a.minSize = i.kind === 'hero' ? 40 : 26;
  const horizon = i.kind === 'hero' ? h * 0.76 : h;
  // Text is centred in the sky, above the horizon.
  if (i.kind === 'hero') a.padBottom = h * 0.24 + 16;
  const sky = mix(p.bg, p.accent, 0.35);
  a.defs =
    linear(
      'rg-sky',
      [
        [0, p.bg],
        [1, sky],
      ],
      true,
    ) +
    linear(
      'rg-sun',
      [
        [0, '#ffd166'],
        [1, p.accent],
      ],
      true,
    ) +
    linear(
      'rg-tg',
      [
        [0, '#ffffff'],
        [0.55, p.link],
        [1, mix(p.link, p.important, 0.6)],
      ],
      true,
    ) +
    `<clipPath id="rg-hz"><rect width="${w}" height="${n(horizon)}"/></clipPath>` +
    `<clipPath id="rg-fl"><rect y="${n(horizon)}" width="${w}" height="${n(h - horizon)}"/></clipPath>` +
    `<filter id="rg-glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  a.back = rect(0, 0, w, h, 'fill="url(#rg-sky)"');
  // The sun sits to the right so it never runs behind the words.
  const sunR = i.kind === 'hero' ? h * 0.3 : h * 0.62;
  const sunX = i.kind === 'hero' ? w - 140 : w - 150;
  let stripes = '';
  for (let k = 0; k < 7; k++) {
    const y = horizon - sunR * 0.62 + k * (sunR * 0.1);
    stripes += rect(sunX - sunR, y, sunR * 2, 2 + k * 1.6, `fill="${mix(p.bg, sky, 0.75)}"`);
  }
  a.back += `<g clip-path="url(#rg-hz)"><circle cx="${n(sunX)}" cy="${n(horizon)}" r="${n(sunR)}" fill="url(#rg-sun)"/>${stripes}</g>`;
  if (i.kind === 'hero') {
    let floor = rect(0, horizon, w, h - horizon, `fill="${p.bg}"`);
    let hlines = '';
    for (let y = horizon; y < h + 24; y += 16) hlines += `M0 ${n(y)}H${w}`;
    let vlines = '';
    for (let x = -700; x <= w + 700; x += 80) vlines += `M${n(w / 2 + (x - w / 2) * 0.12)} ${n(horizon)}L${n(x)} ${h}`;
    floor += `<path${i.animate ? ' class="rg-grid"' : ''} d="${hlines}" stroke="${p.link}" stroke-opacity=".5" stroke-width="1.5"/>`;
    floor += `<path d="${vlines}" stroke="${p.link}" stroke-opacity=".5" stroke-width="1.5"/>`;
    a.back += `<g clip-path="url(#rg-fl)">${floor}</g>` + rect(0, horizon - 1, w, 2, `fill="${p.accent}"`);
  } else {
    a.back += rect(0, h - 2, w, 2, `fill="${p.accent}"`);
    a.reserveRight = 320;
  }
  a.title = { fill: 'url(#rg-tg)', glow: true, stroke: { color: mix(p.bg, '#000000', 0.3), width: i.kind === 'hero' ? 6 : 4 } };
  a.tagline = p.text;
  a.taglineStroke = { color: mix(p.bg, '#000000', 0.3), width: 5 };
  a.front = border(w, h, a.radius, p.border, 2);
  if (i.animate) a.css = '.rg-grid{animation:rg-run 1.4s linear infinite}@keyframes rg-run{to{transform:translateY(16px)}}';
  return a;
}

function blueprint(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 4;
  a.upper = true;
  a.letterSpacing = 0.03;
  a.defs =
    `<pattern id="rg-grid" width="120" height="120" patternUnits="userSpaceOnUse">` +
    `<path d="M24 0V120M48 0V120M72 0V120M96 0V120M0 24H120M0 48H120M0 72H120M0 96H120" stroke="${p.text}" stroke-opacity=".08" fill="none"/>` +
    `<path d="M0 0V120M0 0H120" stroke="${p.text}" stroke-opacity=".2" fill="none"/></pattern>`;
  a.back += rect(0, 0, w, h, 'fill="url(#rg-grid)"');
  const m = 18;
  const L = 22;
  const corner = `M${m} ${m + L}V${m}H${m + L}M${w - m - L} ${m}H${w - m}V${m + L}M${w - m} ${h - m - L}V${h - m}H${w - m - L}M${m + L} ${h - m}H${m}V${h - m - L}`;
  a.front = `<path d="${corner}" stroke="${p.accent}" stroke-width="2" fill="none"/>` + border(w, h, a.radius, p.border, 2);
  if (i.kind === 'hero') {
    a.afterTitle = (l) => {
      const y = l.lastBaseline + l.titleSize * 0.3;
      const x1 = l.title.x;
      const x2 = l.title.x + l.title.w;
      return (
        `<path d="M${n(x1)} ${n(y)}H${n(x2)}M${n(x1)} ${n(y - 9)}V${n(y + 9)}M${n(x2)} ${n(y - 9)}V${n(y + 9)}` +
        `M${n(x1 + 12)} ${n(y - 5)}L${n(x1)} ${n(y)}L${n(x1 + 12)} ${n(y + 5)}M${n(x2 - 12)} ${n(y - 5)}L${n(x2)} ${n(y)}L${n(x2 - 12)} ${n(y + 5)}" ` +
        `stroke="${p.accent}" stroke-width="1.5" fill="none"/>`
      );
    };
    a.ornamentGap = 0.3;
    if (i.animate) {
      a.front = rect(0, 0, 2, h, `fill="${p.accent}" fill-opacity=".45" class="rg-scanx"`) + a.front;
      a.css = `.rg-scanx{animation:rg-sx 7s linear infinite}@keyframes rg-sx{from{transform:translateX(-10px)}to{transform:translateX(${w + 10}px)}}`;
    }
  }
  return a;
}

function notebook(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  const dark = isDark(p.bg);
  a.radius = 10;
  a.align = 'left';
  a.padX = i.kind === 'hero' ? 132 : 112;
  a.reserveRight = i.kind === 'hero' ? 60 : 60;
  a.maxSize = i.kind === 'hero' ? 118 : 60;
  a.minSize = i.kind === 'hero' ? 56 : 34;
  a.letterSpacing = 0;
  let lines = '';
  const top = i.kind === 'hero' ? 70 : 24;
  for (let y = top; y < h; y += 38) lines += `M0 ${y}H${w}`;
  a.back += `<path d="${lines}" stroke="${p.link}" stroke-opacity="${dark ? 0.18 : 0.22}"/>`;
  a.back += `<path d="M86 0V${h}" stroke="#e0485a" stroke-opacity=".6" stroke-width="2"/>`;
  const hole = mix(p.bg, dark ? '#000000' : '#8a7a5a', dark ? 0.45 : 0.28);
  if (i.kind === 'hero') for (const y of [h * 0.2, h * 0.5, h * 0.8]) a.back += `<circle cx="40" cy="${n(y)}" r="11" fill="${hole}"/>`;
  else a.back += `<circle cx="40" cy="${n(h / 2)}" r="9" fill="${hole}"/>`;
  a.afterTitle = (l) => {
    if (i.kind !== 'hero') return '';
    const y = l.lastBaseline + l.titleSize * 0.2;
    const x1 = l.title.x;
    const x2 = l.lastLineEnd;
    const step = 22;
    let d = `M${n(x1)} ${n(y)}`;
    let up = true;
    for (let x = x1; x < x2; x += step) {
      d += `Q${n(x + step / 2)} ${n(y + (up ? -7 : 7))} ${n(Math.min(x + step, x2))} ${n(y)}`;
      up = !up;
    }
    const len = Math.round((x2 - x1) * 1.12);
    return `<path d="${d}" stroke="${p.accent}" stroke-width="5" stroke-linecap="round" fill="none"${i.animate ? ` class="rg-draw" style="--l:${len}"` : ''}/>`;
  };
  a.front = border(w, h, a.radius, p.border, 1.5);
  // Draws itself in once; the resting state (and the no-animation state) is the full line.
  if (i.animate) a.css = '.rg-draw{stroke-dasharray:var(--l);animation:rg-dr 1.6s ease-out}@keyframes rg-dr{from{stroke-dashoffset:var(--l)}to{stroke-dashoffset:0}}';
  a.ornamentGap = i.kind === 'hero' ? 0.22 : 0;
  return a;
}

function swiss(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 0;
  a.align = 'left';
  a.letterSpacing = -0.03;
  a.padX = i.kind === 'hero' ? 72 : 48;
  if (i.kind === 'hero') {
    a.reserveRight = 430;
    let cols = '';
    for (let x = 72; x < w; x += 96) cols += `M${x} 0V${h}`;
    a.back += `<path d="${cols}" stroke="${p.text}" stroke-opacity=".06"/>`;
    a.back += rect(w - 300, 0, 300, h * 0.62, `fill="${p.accent}"`) + `<circle cx="${w - 300}" cy="${n(h * 0.62)}" r="70" fill="${p.heading}"/>`;
    a.front = rect(72, 42, 120, 10, `fill="${p.heading}"`);
  } else {
    a.back += rect(w - 96, 0, 96, h, `fill="${p.accent}"`);
    a.front = rect(0, h - 3, w - 96, 3, `fill="${p.heading}"`);
    a.reserveRight = 130;
  }
  a.index = p.accent;
  return a;
}

function midnight(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 18;
  a.letterSpacing = 0.01;
  a.maxSize = i.kind === 'hero' ? 104 : 54;
  a.defs = radial('rg-moon', p.accent, 0.24);
  const rnd = seeded(`${i.seed}:stars`);
  const count = i.kind === 'hero' ? 110 : 40;
  let stars = '';
  for (let k = 0; k < count; k++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = rnd() * 1.5 + 0.35;
    const o = 0.25 + rnd() * 0.6;
    const cls = i.animate && k % 9 === 0 ? ` class="rg-tw${k % 3}"` : '';
    stars += `<circle${cls} cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#ffffff" fill-opacity="${n(o)}"/>`;
  }
  a.back += stars;
  if (i.kind === 'hero') {
    const mx = w - 150;
    const my = 96;
    a.back += blob('rg-moon', mx, my, 200) + `<circle cx="${mx}" cy="${my}" r="34" fill="${mix(p.accent, '#ffffff', 0.55)}"/><circle cx="${mx + 14}" cy="${my - 8}" r="30" fill="${p.bg}"/>`;
    a.afterTitle = (l) => {
      if (!l.hasTagline) return '';
      const y = l.lastBaseline + l.titleSize * 0.32;
      const cx = w / 2;
      return `<path d="M${n(cx - 110)} ${n(y)}H${n(cx - 16)}M${n(cx + 16)} ${n(y)}H${n(cx + 110)}" stroke="${p.accent}" stroke-opacity=".8"/>` + diamond(cx, y, 5, p.accent);
    };
    a.ornamentGap = 0.3;
  } else {
    a.back += blob('rg-moon', w - 90, h / 2, 140);
  }
  a.front = border(w, h, a.radius, p.border, 1.5);
  if (i.animate)
    a.css =
      '.rg-tw0{animation:rg-tw 3.2s ease-in-out infinite}.rg-tw1{animation:rg-tw 4.1s ease-in-out infinite 1s}.rg-tw2{animation:rg-tw 5s ease-in-out infinite 2s}@keyframes rg-tw{50%{opacity:.1}}';
  return a;
}

function brutalist(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  const off = i.kind === 'hero' ? 14 : 8;
  a.radius = 0;
  a.align = 'left';
  a.upper = true;
  a.letterSpacing = 0;
  a.padX = i.kind === 'hero' ? 64 : 40;
  a.reserveRight = i.kind === 'hero' ? 330 : 130;
  a.maxSize = i.kind === 'hero' ? 88 : 46;
  a.back =
    rect(off, off, w - off, h - off, `fill="${p.border}"`) +
    rect(0, 0, w - off, h - off, `fill="${p.bg}" stroke="${p.border}" stroke-width="${i.kind === 'hero' ? 6 : 4}"`);
  if (i.kind === 'hero') {
    a.back += rect(w - 280, 48, 180, 180, `fill="${p.accent}" stroke="${p.border}" stroke-width="6"`) + rect(w - 190, 170, 120, 120, `fill="${p.link}" stroke="${p.border}" stroke-width="6"`);
  } else {
    a.back += rect(w - 110, 20, 60, h - off - 40, `fill="${p.accent}" stroke="${p.border}" stroke-width="4"`);
  }
  a.padBottom += off;
  a.title = { fill: p.heading };
  a.index = p.link;
  return a;
}

function zen(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 20;
  a.letterSpacing = 0.02;
  a.maxSize = i.kind === 'hero' ? 92 : 48;
  if (i.kind === 'hero') a.padX = 200;
  const cx = i.kind === 'hero' ? w / 2 : w - 110;
  const cy = h / 2;
  const r = i.kind === 'hero' ? h * 0.4 : h * 0.34;
  const arc = (rr: number, from: number, to: number) => {
    const s = (from * Math.PI) / 180;
    const e = (to * Math.PI) / 180;
    return `M${n(cx + rr * Math.cos(s))} ${n(cy + rr * Math.sin(s))}A${n(rr)} ${n(rr)} 0 1 1 ${n(cx + rr * Math.cos(e))} ${n(cy + rr * Math.sin(e))}`;
  };
  a.back += `<path d="${arc(r, 110, 70)}" stroke="${p.accent}" stroke-opacity=".13" stroke-width="${i.kind === 'hero' ? 20 : 10}" stroke-linecap="round" fill="none"/>`;
  a.back += `<path d="${arc(r * 0.94, 130, 80)}" stroke="${p.accent}" stroke-opacity=".1" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  const rnd = seeded(`${i.seed}:petals`);
  const count = i.kind === 'hero' ? 16 : 5;
  let petals = '';
  for (let k = 0; k < count; k++) {
    // Petals drift in the margins, clear of the text.
    const side = k % 2 === 0 ? rnd() * 160 + 16 : w - 16 - rnd() * 160;
    const x = i.kind === 'hero' ? side : w - 260 + rnd() * 240;
    const y = rnd() * h;
    const rot = Math.round(rnd() * 180);
    const o = 0.14 + (k % 3) * 0.06;
    const cls = i.animate ? ` class="rg-p${k % 3}"` : '';
    petals += `<g${cls}><ellipse cx="${n(x)}" cy="${n(y)}" rx="11" ry="6.5" transform="rotate(${rot} ${n(x)} ${n(y)})" fill="${p.accent}" fill-opacity="${n(o)}"/></g>`;
  }
  a.back += petals;
  a.front = border(w, h, a.radius, p.border, 1.5);
  if (i.animate)
    a.css =
      '.rg-p0{animation:rg-f 9s ease-in-out infinite alternate}.rg-p1{animation:rg-f 12s ease-in-out infinite alternate-reverse}.rg-p2{animation:rg-g 10s ease-in-out infinite alternate}' +
      '@keyframes rg-f{to{transform:translate(-26px,30px)}}@keyframes rg-g{to{transform:translate(22px,24px)}}';
  return a;
}

function manuscript(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 6;
  a.upper = true;
  a.letterSpacing = 0.06;
  a.maxSize = i.kind === 'hero' ? 80 : 42;
  a.padX = i.kind === 'hero' ? 110 : 60;
  a.defs =
    `<radialGradient id="rg-v" cx=".5" cy=".5" r=".75"><stop offset=".5" stop-color="#5a3a10" stop-opacity="0"/><stop offset="1" stop-color="#5a3a10" stop-opacity=".26"/></radialGradient>` +
    radial('rg-warm', '#fff3d6', 0.5);
  a.back += blob('rg-warm', w / 2, h / 2, w * 0.5) + rect(0, 0, w, h, 'fill="url(#rg-v)"');
  const i1 = i.kind === 'hero' ? 16 : 10;
  const i2 = i.kind === 'hero' ? 26 : 16;
  a.front =
    rect(i1, i1, w - i1 * 2, h - i1 * 2, `fill="none" stroke="${p.accent}" stroke-width="2"`) +
    rect(i2, i2, w - i2 * 2, h - i2 * 2, `fill="none" stroke="${p.accent}" stroke-width="1"`) +
    [
      [i2, i2],
      [w - i2, i2],
      [w - i2, h - i2],
      [i2, h - i2],
    ]
      .map(([x, y]) => diamond(x!, y!, i.kind === 'hero' ? 7 : 5, p.accent))
      .join('');
  if (i.kind === 'hero') {
    a.afterTitle = (l) => {
      if (!l.hasTagline) return '';
      const y = l.lastBaseline + l.titleSize * 0.34;
      const cx = w / 2;
      return (
        `<path d="M${n(cx - 150)} ${n(y)}H${n(cx - 18)}M${n(cx + 18)} ${n(y)}H${n(cx + 150)}" stroke="${p.accent}" stroke-width="1.5"/>` +
        diamond(cx, y, 7, p.accent) +
        diamond(cx - 158, y, 3, p.accent) +
        diamond(cx + 158, y, 3, p.accent)
      );
    };
    a.ornamentGap = 0.36;
  }
  return a;
}

function comic(i: ArtInput): Art {
  const a = base(i);
  const { p, w, h } = i;
  a.radius = 14;
  a.upper = true;
  a.letterSpacing = 0.02;
  a.maxSize = i.kind === 'hero' ? 104 : 52;
  a.defs = `<pattern id="rg-ht" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="3.2" fill="${p.accent}" fill-opacity=".22"/><circle cx="13.5" cy="13.5" r="3.2" fill="${p.accent}" fill-opacity=".22"/></pattern>`;
  if (i.kind === 'hero') {
    a.back += rect(0, 0, w, h, 'fill="url(#rg-ht)"');
    a.beforeText = (l) => {
      const cx = l.content.x + l.content.w / 2;
      const cy = l.title.y + l.title.h / 2;
      const rx = Math.min(w / 2 - 30, l.title.w / 2 + 90);
      const ry = Math.min(h / 2 - 20, l.title.h / 2 + 44);
      const spikes = 22;
      let d = '';
      for (let k = 0; k < spikes * 2; k++) {
        const ang = (Math.PI * k) / spikes;
        const f = k % 2 === 0 ? 1 : 0.8;
        d += `${k ? 'L' : 'M'}${n(cx + Math.cos(ang) * rx * f)} ${n(cy + Math.sin(ang) * ry * f)}`;
      }
      return `<path${i.animate ? ' class="rg-burst"' : ''} d="${d}Z" fill="${p.mark}" stroke="${p.border}" stroke-width="5" stroke-linejoin="round"/>`;
    };
    a.ornamentGap = 0.25;
  } else {
    a.back += rect(w - 420, 0, 420, h, 'fill="url(#rg-ht)"') + rect(0, 0, 14, h, `fill="${p.accent}"`);
  }
  a.title = { fill: p.heading, shadow: { dx: i.kind === 'hero' ? 5 : 3, dy: i.kind === 'hero' ? 5 : 3, fill: p.accent } };
  a.tagline = p.text;
  a.front = border(w, h, a.radius, p.border, i.kind === 'hero' ? 8 : 5);
  if (i.animate) a.css = '.rg-burst{transform-box:fill-box;transform-origin:center;animation:rg-pulse 1.8s ease-in-out infinite alternate}@keyframes rg-pulse{to{transform:scale(1.035) rotate(1deg)}}';
  return a;
}

const ARTS: Record<ThemeId, (i: ArtInput) => Art> = {
  github,
  aurora,
  editorial,
  terminal,
  pixel,
  synthwave,
  blueprint,
  notebook,
  swiss,
  midnight,
  brutalist,
  zen,
  manuscript,
  frost,
  comic,
};

export function artFor(input: ArtInput): Art {
  return (ARTS[input.theme] ?? github)(input);
}

// ------------------------------------------------------------------ dividers

/** A thin ornament between sections (transparent background). */
export function dividerArt(theme: ThemeId, p: ThemeTokens, w: number, h: number): string {
  const cy = h / 2;
  const fade = linear('rg-dv', [
    [0, p.accent, 0],
    [0.2, p.accent, 1],
    [0.5, p.link, 1],
    [0.8, p.important, 1],
    [1, p.important, 0],
  ]);
  const mono = linear('rg-dm', [
    [0, p.accent, 0],
    [0.15, p.accent, 1],
    [0.85, p.accent, 1],
    [1, p.accent, 0],
  ]);
  switch (theme) {
    case 'aurora':
    case 'frost':
      return `<defs>${fade}</defs>${rect(0, cy - 1.5, w, 3, 'rx="1.5" fill="url(#rg-dv)"')}`;
    case 'synthwave':
      return `<defs>${fade}<filter id="rg-g" x="-5%" y="-200%" width="110%" height="500%"><feGaussianBlur stdDeviation="3"/></filter></defs>${rect(0, cy - 2, w, 4, 'fill="url(#rg-dv)" filter="url(#rg-g)"')}${rect(0, cy - 1, w, 2, 'fill="url(#rg-dv)"')}`;
    case 'terminal':
      return `<path d="M0 ${n(cy)}H${n(w / 2 - 24)}M${n(w / 2 + 24)} ${n(cy)}H${w}" stroke="${p.accent}" stroke-width="2" stroke-dasharray="10 6"/>${diamond(w / 2, cy, 7, p.accent)}`;
    case 'pixel': {
      let s = '';
      for (let x = 0; x < w; x += 24) s += rect(x, cy - 4, 8, 8, `fill="${[p.accent, p.link, p.mark][(x / 24) % 3]}"`);
      return s;
    }
    case 'blueprint':
      return `<path d="M0 ${n(cy)}H${w}" stroke="${p.accent}" stroke-width="1.5"/><path d="${Array.from({ length: Math.floor(w / 40) + 1 }, (_, k) => `M${k * 40} ${n(cy - (k % 5 === 0 ? 9 : 5))}V${n(cy + (k % 5 === 0 ? 9 : 5))}`).join('')}" stroke="${p.accent}" stroke-width="1.5"/>`;
    case 'notebook': {
      let d = `M8 ${n(cy)}`;
      let up = true;
      for (let x = 8; x < w - 8; x += 26) {
        d += `Q${n(x + 13)} ${n(cy + (up ? -6 : 6))} ${n(Math.min(x + 26, w - 8))} ${n(cy)}`;
        up = !up;
      }
      return `<path d="${d}" stroke="${p.accent}" stroke-width="3.5" stroke-linecap="round" fill="none"/>`;
    }
    case 'swiss':
      return rect(0, cy - 4, 160, 8, `fill="${p.accent}"`) + rect(176, cy - 1, w - 176, 2, `fill="${p.heading}"`);
    case 'brutalist':
      return rect(0, cy - 6, w, 12, `fill="${p.border}"`) + rect(0, cy - 6, 220, 12, `fill="${p.accent}"`);
    case 'comic': {
      let d = `M4 ${n(cy)}`;
      for (let x = 4, k = 0; x < w - 4; x += 18, k++) d += `L${n(Math.min(x + 18, w - 4))} ${n(cy + (k % 2 ? -7 : 7))}`;
      return `<path d="${d}" stroke="${p.border}" stroke-width="4" stroke-linejoin="round" fill="none"/>`;
    }
    case 'editorial':
    case 'manuscript':
    case 'midnight':
      return (
        `<path d="M${n(w * 0.12)} ${n(cy)}H${n(w / 2 - 46)}M${n(w / 2 + 46)} ${n(cy)}H${n(w * 0.88)}" stroke="${p.accent}" stroke-width="1.5"/>` +
        diamond(w / 2, cy, 7, p.accent) +
        diamond(w / 2 - 28, cy, 3.5, p.accent) +
        diamond(w / 2 + 28, cy, 3.5, p.accent)
      );
    case 'zen':
      return `<path d="M${n(w * 0.2)} ${n(cy)}H${n(w / 2 - 20)}M${n(w / 2 + 20)} ${n(cy)}H${n(w * 0.8)}" stroke="${p.accent}" stroke-opacity=".7" stroke-width="1.5" stroke-linecap="round"/><circle cx="${n(w / 2)}" cy="${n(cy)}" r="7" fill="none" stroke="${p.accent}" stroke-width="2"/>`;
    default:
      return `<defs>${mono}</defs>${rect(0, cy - 1, w, 2, 'fill="url(#rg-dm)"')}`;
  }
}
