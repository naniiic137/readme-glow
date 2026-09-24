import type { Font, Glyph, PathCommand } from 'opentype.js';

/**
 * Text → SVG outlines. GitHub shows README images through <img>, where web
 * fonts never load, so the theme's fonts are drawn as paths. Characters the
 * font does not have are handled honestly: emoji are drawn with the reader's
 * emoji font (<text>), and a line with any other missing character (Arabic,
 * CJK, rare accents…) falls back to <text> with a system font stack, so it is
 * always readable even if it is not in the theme's typeface.
 */

export type FallbackKind = 'sans' | 'serif' | 'mono';

const FALLBACK_STACKS: Record<FallbackKind, string> = {
  sans: "-apple-system, 'Segoe UI', 'Noto Sans', 'Noto Sans Arabic', Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', 'Noto Serif', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
};
const EMOJI_STACK = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";

/** Emoji are drawn about this wide (in em) by the common emoji fonts. */
export const EMOJI_ADVANCE = 1.18;

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const WIDE = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u;
const IGNORABLE = new Set([0x200d, 0xfe0e, 0xfe0f, 0x200b, 0x200c]);

type Segmenter = { segment(text: string): Iterable<{ segment: string }> };
let segmenter: Segmenter | null | undefined;

/** User-perceived characters (keeps emoji sequences and combining marks together). */
export function graphemes(text: string): string[] {
  if (segmenter === undefined) {
    const I = Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => Segmenter };
    segmenter = I.Segmenter ? new I.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  }
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text);
}

export function isEmoji(cluster: string): boolean {
  return EMOJI.test(cluster);
}

export function hasGlyphs(font: Font, cluster: string): boolean {
  if (/^\s+$/.test(cluster)) return true;
  for (const ch of cluster) {
    if (IGNORABLE.has(ch.codePointAt(0)!)) continue;
    if (font.charToGlyph(ch).index === 0) return false;
  }
  return true;
}

export interface Run {
  kind: 'glyphs' | 'emoji' | 'missing';
  text: string;
}

/** Splits text into runs the font can draw, emoji, and other missing characters. */
export function runs(font: Font, text: string): Run[] {
  const out: Run[] = [];
  for (const g of graphemes(text)) {
    const kind: Run['kind'] = isEmoji(g) ? 'emoji' : hasGlyphs(font, g) ? 'glyphs' : 'missing';
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += g;
    else out.push({ kind, text: g });
  }
  return out;
}

/** True when every character except emoji is in the font. */
export function coversText(font: Font, text: string): boolean {
  return runs(font, text).every((r) => r.kind !== 'missing');
}

export interface TextStyle {
  size: number;
  /** In em, like CSS letter-spacing / font-size. */
  letterSpacing?: number;
}

function estimate(cluster: string, size: number): number {
  return size * (WIDE.test(cluster) ? 1 : 0.58);
}

const kernCache = new WeakMap<Font, unknown>();

function kerning(font: Font, left: Glyph, right: Glyph): number {
  try {
    if (!kernCache.has(font)) {
      const pos = font.position;
      kernCache.set(font, pos ? (pos.getKerningTables(pos.getDefaultScriptName()) ?? null) : null);
    }
    const tables = kernCache.get(font);
    const value = tables && font.position ? font.position.getKerningValue(tables, left.index, right.index) : font.getKerningValue(left, right);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

interface Placed {
  glyph: Glyph;
  x: number;
}

/**
 * Simple horizontal layout: one glyph per character, pair kerning and letter
 * spacing. (No OpenType substitutions: they are not needed for headings in
 * Latin scripts, and some fonts' lookup types crash the shaping engine.)
 */
function layout(font: Font, text: string, size: number, letterSpacing: number): { placed: Placed[]; width: number } {
  const scale = size / font.unitsPerEm;
  const placed: Placed[] = [];
  let x = 0;
  let prev: Glyph | null = null;
  for (const ch of text) {
    if (IGNORABLE.has(ch.codePointAt(0)!)) continue;
    const glyph = font.charToGlyph(ch);
    if (prev) x += kerning(font, prev, glyph) * scale + letterSpacing * size;
    placed.push({ glyph, x });
    x += (glyph.advanceWidth ?? 0) * scale;
    prev = glyph;
  }
  return { placed, width: x };
}

/** Width of one line in px. */
export function measure(font: Font, text: string, style: TextStyle): number {
  let width = 0;
  for (const run of runs(font, text)) {
    if (run.kind === 'glyphs') width += layout(font, run.text, style.size, style.letterSpacing ?? 0).width;
    else if (run.kind === 'emoji') width += graphemes(run.text).length * style.size * EMOJI_ADVANCE;
    else for (const g of graphemes(run.text)) width += estimate(g, style.size);
  }
  return width;
}

const ELLIPSIS = String.fromCharCode(0x2026);

function cut(font: Font, text: string, style: TextStyle, maxWidth: number): string {
  let chars = graphemes(text.trimEnd());
  while (chars.length && measure(font, `${chars.join('').trimEnd()}${ELLIPSIS}`, style) > maxWidth) chars = chars.slice(0, -1);
  return `${chars.join('').trimEnd()}${ELLIPSIS}`;
}

/**
 * Greedy word wrap into at most `maxLines` lines; the last line gets an
 * ellipsis when text is left over. Returns `fits: false` when anything was cut.
 */
export function wrap(font: Font, text: string, style: TextStyle, maxWidth: number, maxLines: number): { lines: string[]; fits: boolean } {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let fits = true;
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++]!;
    if (measure(font, line, style) > maxWidth) {
      // One word wider than the line.
      lines.push(cut(font, line, style, maxWidth));
      fits = false;
      continue;
    }
    while (i < words.length && measure(font, `${line} ${words[i]}`, style) <= maxWidth) line += ` ${words[i++]}`;
    lines.push(line);
  }
  if (i < words.length) {
    fits = false;
    const rest = [lines.pop() ?? '', ...words.slice(i)].filter(Boolean).join(' ');
    lines.push(cut(font, rest, style, maxWidth));
  }
  return { lines, fits };
}

export interface FitOptions {
  maxSize: number;
  minSize: number;
  maxWidth: number;
  maxLines: number;
  letterSpacing?: number;
  /** One line is preferred down to this size before wrapping. */
  oneLineMin?: number;
}

/** Largest size (and its lines) that fits, preferring a single line. */
export function fit(font: Font, text: string, o: FitOptions): { size: number; lines: string[]; fits: boolean } {
  const step = Math.max(1, Math.round(o.maxSize / 24));
  for (let lines = 1; lines <= o.maxLines; lines++) {
    const floor = lines === 1 && o.maxLines > 1 ? Math.max(o.minSize, o.oneLineMin ?? o.maxSize * 0.7) : o.minSize;
    for (let size = o.maxSize; size >= floor; size -= step) {
      const r = wrap(font, text, { size, letterSpacing: o.letterSpacing }, o.maxWidth, lines);
      if (r.fits) return { size, lines: r.lines, fits: true };
    }
  }
  const r = wrap(font, text, { size: o.minSize, letterSpacing: o.letterSpacing }, o.maxWidth, o.maxLines);
  return { size: o.minSize, lines: r.lines, fits: r.fits };
}

// ------------------------------------------------------------------ drawing

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function num(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** An empty fill means "inherit" (e.g. from a <use> that re-colours the text). */
function fillAttr(fill: string): string {
  return fill ? ` fill="${fill}"` : '';
}

export interface DrawOptions extends TextStyle {
  x: number;
  /** Baseline. */
  y: number;
  fill: string;
  anchor?: 'start' | 'middle' | 'end';
  fallback?: FallbackKind;
  /** CSS weight for the <text> fallback. */
  weight?: number;
  /** Extra attributes for the outline <path> (e.g. a class or filter). */
  attrs?: string;
  /** Decimal places in the path data. */
  precision?: number;
}

export interface Drawn {
  svg: string;
  width: number;
  /** Left edge actually used. */
  x: number;
  /** True when the theme font drew every character (no <text> fallback). */
  outlined: boolean;
}

/** One line of text as SVG: outlines where possible, honest <text> otherwise. */
export function drawLine(font: Font, text: string, o: DrawOptions): Drawn {
  const anchor = o.anchor ?? 'start';
  const parts = runs(font, text);
  const width = measure(font, text, o);
  const left = anchor === 'middle' ? o.x - width / 2 : anchor === 'end' ? o.x - width : o.x;
  if (!text.trim()) return { svg: '', width: 0, x: left, outlined: true };
  const extra = o.attrs ? ` ${o.attrs}` : '';
  if (parts.some((r) => r.kind === 'missing')) {
    const ls = o.letterSpacing ? ` letter-spacing="${num(o.letterSpacing * o.size)}"` : '';
    const svg =
      `<text x="${num(o.x)}" y="${num(o.y)}" font-family="${esc(FALLBACK_STACKS[o.fallback ?? 'sans'])}, ${esc(EMOJI_STACK)}" ` +
      `font-size="${num(o.size)}" font-weight="${o.weight ?? 700}"${fillAttr(o.fill)} text-anchor="${anchor}"${ls}${extra}>${esc(text)}</text>`;
    return { svg, width, x: left, outlined: false };
  }
  let cursor = left;
  const commands: PathCommand[] = [];
  const emoji: string[] = [];
  for (const run of parts) {
    if (run.kind === 'glyphs') {
      const laid = layout(font, run.text, o.size, o.letterSpacing ?? 0);
      for (const { glyph, x } of laid.placed) {
        commands.push(...glyph.getPath(cursor + x, o.y, o.size, { drawSVG: false, drawLayers: false }, font).commands);
      }
      cursor += laid.width;
    } else {
      for (const g of graphemes(run.text)) {
        const size = o.size * 0.92;
        emoji.push(`<text x="${num(cursor + o.size * 0.05)}" y="${num(o.y)}" font-family="${esc(EMOJI_STACK)}" font-size="${num(size)}">${esc(g)}</text>`);
        cursor += o.size * EMOJI_ADVANCE;
      }
    }
  }
  const data = compactPath(commands, o.precision ?? 1);
  const path = data ? `<path${fillAttr(o.fill)}${extra} d="${data}"/>` : '';
  return { svg: path + emoji.join(''), width, x: left, outlined: true };
}

/**
 * Compact SVG path data: relative commands on a fixed grid (so rounding never
 * accumulates), h/v shortcuts, no leading zeros and no redundant separators.
 * Roughly half the size of opentype.js's absolute output.
 */
export function compactPath(commands: readonly PathCommand[], precision = 1): string {
  const f = 10 ** precision;
  const q = (v: number | undefined) => Math.round((v ?? 0) * f);
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let out = '';
  let last = '';
  let token = '';
  const fmt = (g: number): string => {
    let s = String(g / f);
    if (s.startsWith('0.')) s = s.slice(1);
    else if (s.startsWith('-0.')) s = `-${s.slice(2)}`;
    return s;
  };
  const emit = (cmd: string, values: number[]) => {
    // A repeated command letter can be left out (never after a moveto: that would mean lineto).
    const repeat = cmd === last && cmd !== 'm' && cmd !== 'z';
    if (!repeat) {
      out += cmd;
      token = cmd;
    }
    for (const v of values) {
      const s = fmt(v);
      const afterNumber = /[0-9.]$/.test(token);
      // "1.5.5" reads as 1.5 then .5, and "1-2" as 1 then -2: no space needed there.
      const glued = s.startsWith('-') || (s.startsWith('.') && token.includes('.'));
      if (afterNumber && !glued) out += ' ';
      out += s;
      token = s;
    }
    last = cmd;
  };
  for (const c of commands) {
    switch (c.type) {
      case 'M': {
        const x = q(c.x);
        const y = q(c.y);
        emit('m', [x - cx, y - cy]);
        cx = sx = x;
        cy = sy = y;
        break;
      }
      case 'L': {
        const x = q(c.x);
        const y = q(c.y);
        if (x === cx && y === cy) break;
        if (y === cy) emit('h', [x - cx]);
        else if (x === cx) emit('v', [y - cy]);
        else emit('l', [x - cx, y - cy]);
        cx = x;
        cy = y;
        break;
      }
      case 'Q': {
        const x = q(c.x);
        const y = q(c.y);
        emit('q', [q(c.x1) - cx, q(c.y1) - cy, x - cx, y - cy]);
        cx = x;
        cy = y;
        break;
      }
      case 'C': {
        const x = q(c.x);
        const y = q(c.y);
        emit('c', [q(c.x1) - cx, q(c.y1) - cy, q(c.x2) - cx, q(c.y2) - cy, x - cx, y - cy]);
        cx = x;
        cy = y;
        break;
      }
      case 'Z':
        if (last !== 'z') emit('z', []);
        cx = sx;
        cy = sy;
        break;
      default:
        break;
    }
  }
  return out;
}

/** Cap height in px (for optical vertical centring). */
export function capHeight(font: Font, size: number): number {
  const cap = font.tables.os2?.sCapHeight || font.ascender * 0.72;
  return (cap / font.unitsPerEm) * size;
}

/** Deterministic pseudo-random numbers (so exports are stable between runs). */
export function seeded(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
