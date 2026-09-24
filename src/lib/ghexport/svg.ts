import type { Font } from 'opentype.js';
import type { Mode, ThemeDef, ThemeTokens } from '../../themes/types';
import { tokensFor } from '../../themes/registry';
import { ensureContrast, readableOn } from '../../themes/color';
import { artFor, dividerArt, type Art, type TextLayout } from './art';
import { capHeight, drawLine, esc, fit, num, type FallbackKind } from './shape';

/**
 * The GitHub export's images: a hero header, section headers and a divider,
 * each a self-contained SVG (no fonts, images, scripts or links to load).
 */

export interface GhFonts {
  heading: Font;
  body: Font;
}

export const HERO_W = 1280;
export const HERO_MIN_H = 360;
export const SECTION_W = 1280;
export const SECTION_H = 120;
export const DIVIDER_W = 1280;
export const DIVIDER_H = 36;

/** Theme colours with the reader's accent override applied (same rules as the app). */
export function effectiveTokens(theme: ThemeDef, mode: Mode, accent: string | null): ThemeTokens {
  const t = { ...tokensFor(theme, mode) };
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
    t.accent = accent;
    t.accentText = readableOn(accent);
    t.link = ensureContrast(accent, t.bg, 4.5);
  }
  return t;
}

function fallbackFor(theme: ThemeDef): FallbackKind {
  if (['terminal', 'pixel'].includes(theme.id)) return 'mono';
  if (['editorial', 'midnight', 'zen', 'manuscript'].includes(theme.id)) return 'serif';
  return 'sans';
}

function upper(text: string, art: Art): string {
  return art.upper ? text.toUpperCase() : text;
}

function open(w: number, h: number, label: string, desc: string | null): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="rg-title${desc ? ' rg-desc' : ''}">` +
    `<title id="rg-title">${esc(label)}</title>${desc ? `<desc id="rg-desc">${esc(desc)}</desc>` : ''}`
  );
}

function style(art: Art, animate: boolean): string {
  if (!animate || !art.css) return '';
  // Motion only for readers who have not asked for less; the still frame is complete.
  return `<style>@media (prefers-reduced-motion: no-preference){${art.css}}</style>`;
}

/** Wraps title outlines with the theme's title treatment (gradient, shadow, stroke, glow). */
function titleGroup(art: Art, inner: string, defsOut: string[]): string {
  const t = art.title;
  const stroke = t.stroke ? ` stroke="${t.stroke.color}" stroke-width="${t.stroke.width}" stroke-linejoin="round" paint-order="stroke"` : '';
  const glow = t.glow ? ' filter="url(#rg-glow)"' : '';
  if (!t.shadow) return `<g fill="${t.fill}"${stroke}${glow}>${inner}</g>`;
  defsOut.push(`<g id="rg-t">${inner}</g>`);
  return (
    `<use href="#rg-t" x="${t.shadow.dx}" y="${t.shadow.dy}" fill="${t.shadow.fill}"${stroke}/>` + `<use href="#rg-t" fill="${t.fill}"${stroke}${glow}/>`
  );
}

export interface HeroOptions {
  title: string;
  tagline: string | null;
  theme: ThemeDef;
  tokens: ThemeTokens;
  fonts: GhFonts;
  animate: boolean;
}

export function heroSvg(o: HeroOptions): string {
  const W = HERO_W;
  const seed = `${o.theme.id}:${o.title}`;
  const probe = artFor({ theme: o.theme.id, kind: 'hero', w: W, h: HERO_MIN_H, p: o.tokens, animate: o.animate, seed });
  const fb = fallbackFor(o.theme);
  const titleText = upper(o.title.trim() || 'README', probe);
  const avail = probe.align === 'center' ? W - probe.padX * 2 : W - probe.padX - probe.reserveRight;
  const tf = fit(o.fonts.heading, titleText, {
    maxSize: probe.maxSize,
    minSize: probe.minSize,
    maxWidth: avail,
    maxLines: 2,
    letterSpacing: probe.letterSpacing,
    oneLineMin: probe.maxSize * 0.72,
  });
  const cap = capHeight(o.fonts.heading, tf.size);
  const lineH = tf.size * 1.12;
  const tagline = o.tagline?.replace(/\s+/g, ' ').trim() || null;
  const tg = tagline
    ? fit(o.fonts.body, tagline, { maxSize: 30, minSize: 21, maxWidth: Math.min(avail, 940), maxLines: 2, oneLineMin: 25 })
    : null;
  const tagCap = tg ? capHeight(o.fonts.body, tg.size) : 0;
  const tagLineH = tg ? tg.size * 1.42 : 0;
  const gap = tg ? Math.max(30, tf.size * (0.52 + probe.ornamentGap)) : 0;
  const titleBlock = cap + (tf.lines.length - 1) * lineH;
  const tagBlock = tg ? tagCap + (tg.lines.length - 1) * tagLineH + tg.size * 0.2 : 0;
  const contentH = titleBlock + gap + tagBlock;
  const H = Math.max(HERO_MIN_H, Math.round(contentH + probe.padTop + probe.padBottom + 40));
  const art = artFor({ theme: o.theme.id, kind: 'hero', w: W, h: H, p: o.tokens, animate: o.animate, seed });
  const top = art.padTop + (H - art.padTop - art.padBottom - contentH) / 2;
  const x = art.align === 'center' ? W / 2 : art.padX;
  const anchor = art.align === 'center' ? 'middle' : 'start';

  let titleSvg = '';
  let minX = Infinity;
  let maxX = -Infinity;
  let lastEnd = 0;
  let baseline = top + cap;
  tf.lines.forEach((line, k) => {
    baseline = top + cap + k * lineH;
    const d = drawLine(o.fonts.heading, line, { x, y: baseline, size: tf.size, letterSpacing: art.letterSpacing, fill: '', anchor, fallback: fb, weight: 800 });
    titleSvg += d.svg;
    minX = Math.min(minX, d.x);
    maxX = Math.max(maxX, d.x + d.width);
    lastEnd = d.x + d.width;
  });
  const layout: TextLayout = {
    title: { x: minX, y: top, w: maxX - minX, h: titleBlock },
    content: { x: minX, y: top, w: maxX - minX, h: contentH },
    titleSize: tf.size,
    titleCap: cap,
    lastBaseline: baseline,
    lastLineEnd: lastEnd,
    hasTagline: Boolean(tg),
  };
  let tagSvg = '';
  if (tg) {
    let tMin = Infinity;
    let tMax = -Infinity;
    tg.lines.forEach((line, k) => {
      const y = top + titleBlock + gap + tagCap + k * tagLineH;
      const d = drawLine(o.fonts.body, line, { x, y, size: tg.size, fill: '', anchor, fallback: fb, weight: 400 });
      tagSvg += d.svg;
      tMin = Math.min(tMin, d.x);
      tMax = Math.max(tMax, d.x + d.width);
    });
    layout.content = { x: Math.min(minX, tMin), y: top, w: Math.max(maxX, tMax) - Math.min(minX, tMin), h: contentH };
    const s = art.taglineStroke;
    const stroke = s ? ` stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round" paint-order="stroke"` : '';
    tagSvg = `<g fill="${art.tagline}"${stroke}>${tagSvg}</g>`;
  }
  const extraDefs: string[] = [];
  const title = titleGroup(art, titleSvg, extraDefs);
  const r = art.radius;
  return (
    open(W, H, tagline ? `${o.title} — ${tagline}` : o.title, tagline) +
    style(art, o.animate) +
    `<defs><clipPath id="rg-clip"><rect width="${W}" height="${H}" rx="${r}"/></clipPath>${art.defs}${extraDefs.join('')}</defs>` +
    `<g clip-path="url(#rg-clip)">${art.back}${art.beforeText?.(layout) ?? ''}${title}${art.afterTitle?.(layout) ?? ''}${tagSvg}${art.front}</g>` +
    '</svg>'
  );
}

export interface SectionOptions {
  text: string;
  /** 1-based number shown before the heading, or null. */
  index: number | null;
  theme: ThemeDef;
  tokens: ThemeTokens;
  fonts: GhFonts;
}

export function sectionSvg(o: SectionOptions): string {
  const W = SECTION_W;
  const H = SECTION_H;
  const art = artFor({ theme: o.theme.id, kind: 'section', w: W, h: H, p: o.tokens, animate: false, seed: `${o.theme.id}:${o.text}` });
  const fb = fallbackFor(o.theme);
  const text = upper(o.text.trim() || 'Section', art);
  let x = art.padX;
  let indexSvg = '';
  const mid = (art.padTop + (H - art.padBottom)) / 2;
  if (o.index !== null) {
    const label = String(o.index).padStart(2, '0');
    const size = Math.round(art.maxSize * 0.7);
    const cap = capHeight(o.fonts.heading, size);
    const d = drawLine(o.fonts.heading, label, { x, y: mid + cap / 2, size, fill: art.index, fallback: fb, letterSpacing: 0.02 });
    indexSvg = d.svg + `<rect x="${num(x + d.width + 18)}" y="${num(mid - cap * 0.62)}" width="2" height="${num(cap * 1.24)}" fill="${art.index}" fill-opacity=".55"/>`;
    x += d.width + 40;
  }
  const avail = W - x - art.reserveRight;
  const tf = fit(o.fonts.heading, text, { maxSize: art.maxSize, minSize: art.minSize, maxWidth: avail, maxLines: 1, letterSpacing: art.letterSpacing });
  const cap = capHeight(o.fonts.heading, tf.size);
  const baseline = mid + cap / 2;
  const d = drawLine(o.fonts.heading, tf.lines[0] ?? text, { x, y: baseline, size: tf.size, letterSpacing: art.letterSpacing, fill: '', fallback: fb, weight: 800 });
  const layout: TextLayout = {
    title: { x: d.x, y: baseline - cap, w: d.width, h: cap },
    content: { x: d.x, y: baseline - cap, w: d.width, h: cap },
    titleSize: tf.size,
    titleCap: cap,
    lastBaseline: baseline,
    lastLineEnd: d.x + d.width,
    hasTagline: false,
  };
  const extraDefs: string[] = [];
  const title = titleGroup(art, d.svg, extraDefs);
  return (
    open(W, H, o.text, null) +
    `<defs><clipPath id="rg-clip"><rect width="${W}" height="${H}" rx="${art.radius}"/></clipPath>${art.defs}${extraDefs.join('')}</defs>` +
    `<g clip-path="url(#rg-clip)">${art.back}${art.beforeText?.(layout) ?? ''}${indexSvg}${title}${art.front}</g>` +
    '</svg>'
  );
}

export function dividerSvg(theme: ThemeDef, tokens: ThemeTokens): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${DIVIDER_W}" height="${DIVIDER_H}" viewBox="0 0 ${DIVIDER_W} ${DIVIDER_H}" role="img" aria-label="Divider">` +
    dividerArt(theme.id, tokens, DIVIDER_W, DIVIDER_H) +
    '</svg>'
  );
}
