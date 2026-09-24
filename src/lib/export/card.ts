import type { Badge } from '../markdown/types';
import type { CardBackground, ThemeTokens } from '../../themes/types';
import { parseShieldsUrl } from '../markdown/badges';
import { mix, withAlpha, readableOn, isDark } from '../../themes/color';

export interface CardInput {
  title: string;
  description: string | null;
  badges: Badge[];
  footer: string;
  tokens: ThemeTokens;
  accent: string;
  background: CardBackground;
  fonts: { heading: string; body: string; mono: string };
  upperTitle?: boolean;
}

export const CARD_W = 1200;
export const CARD_H = 630;

/** Wraps text to at most `maxLines` lines of `width` px, ending with … when cut. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]!;
    if (ctx.measureText(test).width <= width || !line) {
      line = test;
    } else {
      lines.push(line);
      line = words[i]!;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  const used = lines.join(' ').split(' ').length;
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1]!;
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.replace(/\s+$/, '')}…`;
  }
  // Very long single words: hard cut.
  return lines.map((l) => {
    if (ctx.measureText(l).width <= width) return l;
    let cut = l;
    while (cut && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
    return `${cut}…`;
  });
}

function badgeParts(b: Badge): { label: string; message: string; color: string | null } {
  const parsed = parseShieldsUrl(b.src);
  if (parsed) return parsed;
  const alt = b.alt.trim();
  const m = /^(.+?)[:\-–]\s*(.+)$/.exec(alt);
  if (m) return { label: m[1]!, message: m[2]!, color: null };
  return { label: '', message: alt || 'badge', color: null };
}

const NAMED: Record<string, string> = {
  brightgreen: '#44cc11',
  green: '#97ca00',
  yellowgreen: '#a4a61d',
  yellow: '#dfb317',
  orange: '#fe7d37',
  red: '#e05d44',
  blue: '#007ec6',
  lightgrey: '#9f9f9f',
  grey: '#555555',
  gray: '#555555',
  success: '#44cc11',
  important: '#fe7d37',
  critical: '#e05d44',
  informational: '#007ec6',
  inactive: '#9f9f9f',
  blueviolet: '#8a2be2',
  ff69b4: '#ff69b4',
};

function badgeColor(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  const c = raw.toLowerCase();
  if (NAMED[c]) return NAMED[c]!;
  if (/^[0-9a-f]{6}$/.test(c)) return `#${c}`;
  if (/^[0-9a-f]{3}$/.test(c)) return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
  return fallback;
}

function paintBackground(ctx: CanvasRenderingContext2D, kind: CardBackground, t: ThemeTokens, accent: string): void {
  const W = CARD_W;
  const H = CARD_H;
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  const blob = (x: number, y: number, r: number, color: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, a));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  switch (kind) {
    case 'mesh':
    case 'frost':
      blob(160, 80, 520, accent, kind === 'frost' ? 0.35 : 0.55);
      blob(1080, 120, 480, t.link, 0.4);
      blob(760, 640, 520, t.important, 0.35);
      blob(260, 620, 360, t.tip, 0.25);
      break;
    case 'grid': {
      ctx.strokeStyle = withAlpha(t.text, 0.08);
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 24) line(ctx, x, 0, x, H);
      for (let y = 0; y <= H; y += 24) line(ctx, 0, y, W, y);
      ctx.strokeStyle = withAlpha(t.text, 0.18);
      for (let x = 0; x <= W; x += 120) line(ctx, x, 0, x, H);
      for (let y = 0; y <= H; y += 120) line(ctx, 0, y, W, y);
      break;
    }
    case 'lines': {
      ctx.strokeStyle = withAlpha(t.link, 0.22);
      for (let y = 110; y < H; y += 38) line(ctx, 0, y, W, y);
      ctx.strokeStyle = withAlpha('#e0485a', 0.55);
      ctx.lineWidth = 2;
      line(ctx, 86, 0, 86, H);
      ctx.lineWidth = 1;
      break;
    }
    case 'dots':
    case 'halftone': {
      ctx.fillStyle = withAlpha(kind === 'halftone' ? accent : t.text, kind === 'halftone' ? 0.22 : 0.08);
      for (let y = 0; y < H; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < W; x += 18) dot(ctx, x, y, 3.2);
      if (kind === 'halftone') {
        ctx.lineWidth = 10;
        ctx.strokeStyle = t.text;
        ctx.strokeRect(5, 5, W - 10, H - 10);
      }
      break;
    }
    case 'scanlines': {
      blob(W / 2, H / 2, 700, accent, 0.18);
      ctx.fillStyle = withAlpha('#000000', 0.25);
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
      break;
    }
    case 'sun': {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, t.bg);
      sky.addColorStop(1, mix(t.bg, accent, 0.35));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      const horizon = 586;
      const sun = ctx.createLinearGradient(0, 330, 0, horizon);
      sun.addColorStop(0, '#ffd166');
      sun.addColorStop(1, accent);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, horizon);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(985, horizon, 230, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = sun;
      ctx.fillRect(740, 340, 500, 260);
      ctx.fillStyle = mix(t.bg, accent, 0.3);
      for (let i = 0; i < 7; i++) ctx.fillRect(740, 470 + i * 17, 500, 3 + i * 1.6);
      ctx.restore();
      ctx.strokeStyle = withAlpha(t.link, 0.45);
      for (let i = 0; i < 8; i++) {
        const y = horizon + i * i * 1.1;
        line(ctx, 0, y, W, y);
      }
      for (let x = -600; x <= W + 600; x += 90) line(ctx, W / 2 + (x - W / 2) * 0.25, horizon, x, H);
      break;
    }
    case 'paper':
    case 'parchment': {
      blob(W / 2, H / 2, 900, kind === 'parchment' ? '#fff3d6' : '#ffffff', 0.35);
      const v = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 800);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, withAlpha('#5a3a10', kind === 'parchment' ? 0.28 : 0.08));
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'stars': {
      blob(1000, 60, 400, accent, 0.2);
      let seed = 7;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < 140; i++) {
        ctx.fillStyle = withAlpha('#ffffff', 0.25 + rnd() * 0.6);
        dot(ctx, rnd() * W, rnd() * H, rnd() * 1.6 + 0.3);
      }
      break;
    }
    case 'pixels': {
      ctx.fillStyle = withAlpha(t.text, 0.05);
      for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) if ((x + y) % 32 === 0) ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = accent;
      for (let x = 0; x < W; x += 16) {
        ctx.fillRect(x, 0, 8, 8);
        ctx.fillRect(x + 8, H - 8, 8, 8);
      }
      break;
    }
    case 'blocks': {
      ctx.fillStyle = accent;
      ctx.fillRect(900, 60, 240, 240);
      ctx.fillStyle = t.link;
      ctx.fillRect(980, 380, 160, 160);
      ctx.lineWidth = 6;
      ctx.strokeStyle = t.text;
      ctx.strokeRect(900, 60, 240, 240);
      ctx.strokeRect(980, 380, 160, 160);
      break;
    }
    case 'petals': {
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = withAlpha(accent, 0.12 + (i % 3) * 0.05);
        ctx.beginPath();
        ctx.ellipse(700 + ((i * 97) % 480), 40 + ((i * 53) % 540), 14, 8, (i * 0.7) % 3, 0, Math.PI * 2);
        ctx.fill();
      }
      blob(1050, 90, 300, accent, 0.18);
      break;
    }
    default:
      blob(W / 2, -100, 800, accent, 0.18);
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Paints a 1200×630 social preview card in the theme's colours and fonts. */
export function paintCard(canvas: HTMLCanvasElement, input: CardInput): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const t = input.tokens;
  paintBackground(ctx, input.background, t, input.accent);

  const glass = input.background === 'mesh' || input.background === 'frost';
  const padX = 88;
  if (glass) {
    ctx.fillStyle = withAlpha(t.surface, isDark(t.bg) ? 0.55 : 0.7);
    roundRect(ctx, 56, 56, CARD_W - 112, CARD_H - 112, 36);
    ctx.fill();
    ctx.strokeStyle = withAlpha(isDark(t.bg) ? '#ffffff' : t.accent, 0.14);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Accent bar
  ctx.fillStyle = input.accent;
  roundRect(ctx, padX, 118, 72, 8, 4);
  ctx.fill();

  // Title (backgrounds with artwork on the right leave that side free)
  const title = input.upperTitle ? input.title.toUpperCase() : input.title;
  let size = 84;
  let lines: string[] = [];
  const rightArt = input.background === 'sun' || input.background === 'blocks' || input.background === 'petals';
  const maxTitleWidth = rightArt ? 700 : CARD_W - padX * 2;
  // Vertical budget: title, description and badges share the space between
  // the accent bar and the footer, so nothing ever overlaps.
  const top = 150;
  const bottom = CARD_H - 112;
  const badges = input.badges.slice(0, 6).map(badgeParts);
  const badgeBlock = badges.length ? 36 + 26 : 0;
  let desc: string[] = [];
  for (; size >= 40; size -= 4) {
    ctx.font = `700 ${size}px ${input.fonts.heading}`;
    lines = wrapText(ctx, title, maxTitleWidth, 2);
    const fits = !lines.some((l) => l.endsWith('…'));
    ctx.font = `400 28px ${input.fonts.body}`;
    const room = bottom - top - lines.length * size * 1.12 - badgeBlock - 12;
    const maxDesc = Math.max(0, Math.min(3, Math.floor(room / 40)));
    desc = input.description && maxDesc ? wrapText(ctx, input.description, maxTitleWidth, maxDesc) : [];
    if (fits && (maxDesc >= 2 || !input.description || size <= 56)) break;
  }
  if (size < 40) {
    // Nothing fitted: use the smallest size, with the title cut to two lines.
    size = 40;
    ctx.font = `700 ${size}px ${input.fonts.heading}`;
    lines = wrapText(ctx, title, maxTitleWidth, 2);
  }
  ctx.fillStyle = t.heading;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${size}px ${input.fonts.heading}`;
  let y = top + size * 0.9;
  lines.forEach((l, i) => {
    if (i) y += size * 1.1;
    ctx.fillText(l, padX, y);
  });

  // Description
  if (desc.length) {
    ctx.font = `400 28px ${input.fonts.body}`;
    ctx.fillStyle = t.muted;
    y += 30;
    for (const l of desc) {
      y += 38;
      ctx.fillText(l, padX, y);
    }
  }

  // Badges as pills (drawn, so no cross-origin images are needed)
  let x = padX;
  const by = Math.min(bottom - 36, y + 30);
  ctx.font = `600 20px ${input.fonts.body}`;
  for (const b of badges) {
    const labelW = b.label ? ctx.measureText(b.label).width + 24 : 0;
    const msgW = ctx.measureText(b.message).width + 24;
    if (x + labelW + msgW > padX + maxTitleWidth) break;
    const color = badgeColor(b.color, input.accent);
    ctx.save();
    roundRect(ctx, x, by, labelW + msgW, 36, 8);
    ctx.clip();
    if (labelW) {
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(x, by, labelW, 36);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.label, x + 12, by + 25);
    }
    ctx.fillStyle = color;
    ctx.fillRect(x + labelW, by, msgW, 36);
    ctx.fillStyle = readableOn(color);
    ctx.fillText(b.message, x + labelW + 12, by + 25);
    ctx.restore();
    x += labelW + msgW + 12;
  }

  // Footer
  ctx.font = `600 22px ${input.fonts.mono}`;
  ctx.fillStyle = t.muted;
  ctx.fillText(input.footer, padX, CARD_H - 70);
  ctx.font = `600 20px ${input.fonts.body}`;
  const brand = 'ReadmeGlow';
  const bw = ctx.measureText(brand).width;
  ctx.fillStyle = input.accent;
  dot(ctx, CARD_W - padX - bw - 18, CARD_H - 77, 6);
  ctx.fillStyle = t.muted;
  ctx.fillText(brand, CARD_W - padX - bw, CARD_H - 70);
}
