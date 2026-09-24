import type { Blockquote, Heading, Paragraph, PhrasingContent, Root, RootContent } from 'mdast';
import { endOffset, parseMarkdown, startOffset } from '../markdown/parse';
import {
  anchorText,
  applySplices,
  badgeItems,
  blockStart,
  collectHeadings,
  definitions,
  escapeHtml,
  isTocHeading,
  normaliseName,
  slugify,
  type Splice,
} from '../beautify/util';
import { findImageRefs } from '../editor/zip';
import { insertChunk, replaceChunk, unexport } from './markers';
import { stripConfig, writeConfig, type ReadmeConfig } from './config';

/**
 * The GitHub export: turns a README into one that carries its theme onto
 * github.com, using only what GitHub's renderer allows: images (our SVGs),
 * <picture> for light/dark, align="center", <details>, alerts and anchors.
 *
 * Pure: SVG drawing is delegated to a renderer, so this is easy to test.
 */

export type Variant = 'light' | 'dark' | 'only';
export type BadgeStyle = 'keep' | 'flat' | 'flat-square' | 'for-the-badge' | 'plastic';

export interface GhRenderer {
  /** 'light' + 'dark' for themes with both variants, otherwise 'only'. */
  variants: Variant[];
  hero(title: string, tagline: string | null, variant: Variant): string;
  section(text: string, index: number | null, variant: Variant): string;
  divider(variant: Variant): string;
  /** Badge colours (hex) for shields.io; pill: table-of-contents pills (white text reads on it). */
  badgeColors: { accent: string; label: string; pill?: string };
}

export interface GhExportOptions {
  header: 'hero' | 'centered' | 'none';
  /** Title override (null: the README's own). */
  title: string | null;
  /** Tagline override (null: detected, '': none). */
  tagline: string | null;
  sections: boolean;
  numbered: boolean;
  dividers: boolean;
  toc: 'none' | 'list' | 'pills';
  badges: BadgeStyle;
  alerts: boolean;
  fold: boolean;
  /** Folder for the images, relative to the README. */
  assetDir: string;
  /** Written as the invisible config comment (null: none). */
  config: ReadmeConfig | null;
  /** `:shortcode:` → emoji, for text drawn into images. */
  emoji?: ReadonlyMap<string, string>;
}

export const DEFAULT_GH_OPTIONS: GhExportOptions = {
  header: 'hero',
  title: null,
  tagline: null,
  sections: true,
  numbered: false,
  dividers: true,
  toc: 'none',
  badges: 'for-the-badge',
  alerts: true,
  fold: false,
  assetDir: '.github/readmeglow',
  config: null,
};

export interface GhAsset {
  path: string;
  svg: string;
  kind: 'hero' | 'section' | 'divider';
  variant: Variant;
}

export interface GhExportInfo {
  title: string | null;
  tagline: string | null;
  /** Where the title came from. */
  titleSource: 'markdown' | 'html' | 'override' | null;
  sections: number;
  dividers: number;
  badges: number;
  alerts: number;
  folded: number;
  toc: 'added' | 'exists' | 'none';
}

export interface GhExportResult {
  markdown: string;
  assets: GhAsset[];
  info: GhExportInfo;
}

// ------------------------------------------------------------------ helpers

const ALERT_WORDS: Record<string, string> = { note: 'NOTE', tip: 'TIP', important: 'IMPORTANT', warning: 'WARNING', caution: 'CAUTION' };
const FOLD_NAMES = /^(changelog|change log|changes|release notes|releases|history|version history|faq|frequently asked questions|acknowledg(e)?ments|credits|thanks|contributors|sponsors|backers)$/;
const FOLD_LINES = 80;

function attr(value: string): string {
  return escapeHtml(value);
}

function asciiSlug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function withEmoji(text: string, map?: ReadonlyMap<string, string>): string {
  if (!map) return text;
  return text.replace(/:([a-z0-9_+-]+):/gi, (whole, name: string) => map.get(name.toLowerCase()) ?? whole);
}

function cleanHeadingText(text: string, map?: ReadonlyMap<string, string>): string {
  return withEmoji(text, map).replace(/\s+/g, ' ').trim();
}

/** `<picture>` switching light/dark files (or a plain <img> for a single file). */
export function picture(files: Partial<Record<Variant, string>>, alt: string): string {
  const only = files.only;
  if (only) return `<img alt="${attr(alt)}" src="${attr(only)}">`;
  const light = files.light!;
  const dark = files.dark ?? light;
  return (
    `<picture><source media="(prefers-color-scheme: dark)" srcset="${attr(dark)}">` +
    `<source media="(prefers-color-scheme: light)" srcset="${attr(light)}">` +
    `<img alt="${attr(alt)}" src="${attr(light)}"></picture>`
  );
}

/** shields.io text segment: dashes and underscores doubled, then URL-encoded. */
export function shieldsText(text: string): string {
  return encodeURIComponent(text.replace(/-/g, '--').replace(/_/g, '__'));
}

const GENERIC_COLORS = new Set(['', 'blue', 'informational', '007ec6', 'lightgrey', 'lightgray', 'inactive', 'grey', 'gray']);

/**
 * Restyles a shields.io badge URL: style and label colour always; the message
 * colour only for static badges that use a generic colour (a green "passing"
 * keeps its meaning). Other URLs are returned unchanged.
 */
export function restyleBadge(url: string, style: BadgeStyle, colors: { accent: string; label: string }): string {
  if (style === 'keep') return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!/(^|\.)shields\.io$/i.test(parsed.hostname)) return url;
  const q = url.indexOf('?');
  const hashAt = url.indexOf('#');
  const head = q === -1 ? (hashAt === -1 ? url : url.slice(0, hashAt)) : url.slice(0, q);
  const query = q === -1 ? '' : url.slice(q + 1, hashAt > q ? hashAt : undefined);
  const params = new URLSearchParams(query);
  params.set('style', style);
  params.set('labelColor', colors.label.replace('#', ''));
  const path = parsed.pathname;
  if (/^\/badge\//i.test(path)) {
    const parts = decodeURIComponent(path.slice('/badge/'.length)).split(/(?<!-)-(?!-)/);
    const color = parts.length >= 2 ? parts[parts.length - 1]!.toLowerCase() : '';
    if (GENERIC_COLORS.has(color) && !params.has('color')) params.set('color', colors.accent.replace('#', ''));
  }
  return `${head}?${params.toString()}`;
}

function imageUrlOf(node: PhrasingContent, defs: ReadonlyMap<string, string>): { src: string; alt: string } | null {
  if (node.type === 'image') return { src: node.url, alt: node.alt ?? '' };
  if (node.type === 'imageReference') {
    const src = defs.get(node.identifier);
    return src === undefined ? null : { src, alt: node.alt ?? '' };
  }
  return null;
}

/** A badge paragraph as centred HTML (restyled). */
function badgeParagraphHtml(p: Paragraph, defs: ReadonlyMap<string, string>, fix: (url: string) => string, eol: string): string {
  const items: string[] = [];
  let pendingOpen = '';
  for (const child of p.children) {
    if (child.type === 'text' || child.type === 'break') continue;
    if (child.type === 'html') {
      const v = child.value.trim();
      if (/^<br\s*\/?>$/i.test(v)) continue;
      const html = v.replace(/(\bsrc\s*=\s*")([^"]*)(")/i, (_, a: string, u: string, b: string) => `${a}${attr(fix(u.replace(/&amp;/g, '&')))}${b}`);
      if (/^<a\b/i.test(v)) pendingOpen += html;
      else if (/^<\/a/i.test(v)) {
        if (items.length) items[items.length - 1] += html;
      } else {
        items.push(pendingOpen + html);
        pendingOpen = '';
      }
      continue;
    }
    const img = imageUrlOf(child, defs);
    if (img) {
      items.push(`<img alt="${attr(img.alt)}" src="${attr(fix(img.src))}">`);
      continue;
    }
    if (child.type === 'link' || child.type === 'linkReference') {
      const href = child.type === 'link' ? child.url : (defs.get(child.identifier) ?? '');
      const inner = child.children
        .map((c) => imageUrlOf(c, defs))
        .filter((x): x is { src: string; alt: string } => x !== null)
        .map((i) => `<img alt="${attr(i.alt)}" src="${attr(fix(i.src))}">`)
        .join('');
      items.push(href ? `<a href="${attr(href)}">${inner}</a>` : inner);
    }
  }
  return `<p align="center">${eol}  ${items.join(`${eol}  `)}${eol}</p>`;
}

/** Plain text of a short paragraph (no links, images or HTML), else null. */
function plainParagraph(node: RootContent | undefined): string | null {
  if (!node) return null;
  let p: Paragraph | null = null;
  if (node.type === 'paragraph') p = node;
  else if (node.type === 'blockquote') {
    const bq = node as Blockquote;
    if (bq.children.length === 1 && bq.children[0]!.type === 'paragraph') p = bq.children[0] as Paragraph;
  }
  if (!p) return null;
  const ok = (n: PhrasingContent): boolean =>
    n.type === 'text' || n.type === 'inlineCode' || n.type === 'break' || ((n.type === 'emphasis' || n.type === 'strong' || n.type === 'delete') && n.children.every(ok));
  if (!p.children.every(ok)) return null;
  const text = anchorText(p).replace(/\s+/g, ' ').trim();
  if (!text || text.length > 220 || /^\[!/.test(text)) return null;
  return text;
}

function htmlTitle(value: string): { start: number; end: number; text: string } | null {
  const masked = value.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(masked);
  if (!m) return null;
  const text = m[1]!
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return { start: m.index, end: m.index + m[0].length, text };
}

// ------------------------------------------------------------------ main

export function exportForGitHub(input: string, options: GhExportOptions, r: GhRenderer): GhExportResult {
  const o = options;
  let src = stripConfig(unexport(input));
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  if (src && !src.endsWith('\n')) src += eol;
  const tree: Root = parseMarkdown(src);
  const kids = tree.children;
  const defs = definitions(tree);
  const dir = o.assetDir.replace(/^\.?\/+|\/+$/g, '') || '.github/readmeglow';
  const assets: GhAsset[] = [];
  const splices: Splice[] = [];
  const replaced: Array<[number, number]> = [];
  const info: GhExportInfo = { title: null, tagline: null, titleSource: null, sections: 0, dividers: 0, badges: 0, alerts: 0, folded: 0, toc: 'none' };
  const fixBadge = (url: string) => restyleBadge(url, o.badges, r.badgeColors);

  const addAssets = (kind: GhAsset['kind'], base: string, draw: (v: Variant) => string): Partial<Record<Variant, string>> => {
    const files: Partial<Record<Variant, string>> = {};
    for (const variant of r.variants) {
      const path = `${dir}/${base}${variant === 'only' ? '' : `-${variant}`}.svg`;
      if (!assets.some((a) => a.path === path)) assets.push({ path, svg: draw(variant), kind, variant });
      files[variant] = path;
    }
    return files;
  };
  const replace = (kind: Parameters<typeof replaceChunk>[0], start: number, end: number, generated: string, inHtml = false) => {
    splices.push({ start, end, text: replaceChunk(kind, src.slice(start, end), generated, eol, inHtml) });
    replaced.push([start, end]);
  };
  const insert = (kind: Parameters<typeof insertChunk>[0], at: number, generated: string) => {
    splices.push({ start: at, end: at, text: insertChunk(kind, generated, eol) });
  };
  const isReplaced = (s: number, e: number) => replaced.some(([a, b]) => s < b && e > a);

  // ---------------------------------------------------------------- header
  const firstHeadingIndex = kids.findIndex((k) => k.type === 'heading');
  const h1Index = firstHeadingIndex !== -1 && (kids[firstHeadingIndex] as Heading).depth === 1 ? firstHeadingIndex : -1;
  let htmlH1: { node: RootContent; start: number; end: number; text: string } | null = null;
  if (h1Index === -1) {
    for (let i = 0; i < (firstHeadingIndex === -1 ? kids.length : firstHeadingIndex); i++) {
      const k = kids[i]!;
      if (k.type !== 'html') continue;
      const t = htmlTitle(k.value);
      if (t) {
        htmlH1 = { node: k, start: startOffset(k) + t.start, end: startOffset(k) + t.end, text: t.text };
        break;
      }
    }
  }

  const detectedTitle = h1Index !== -1 ? cleanHeadingText(anchorText(kids[h1Index]!), o.emoji) : (htmlH1?.text ?? null);
  const title = o.title?.trim() || detectedTitle;
  info.title = title;
  info.titleSource = o.title?.trim() ? 'override' : h1Index !== -1 ? 'markdown' : htmlH1 ? 'html' : null;

  // Nodes right after a Markdown title: badge paragraphs and one short tagline.
  let consumedEnd = -1;
  let detectedTagline: string | null = null;
  const headerBadges: Paragraph[] = [];
  if (h1Index !== -1) {
    let i = h1Index + 1;
    for (; i < kids.length && i <= h1Index + 4; i++) {
      const k = kids[i]!;
      if (k.type === 'heading' || k.type === 'thematicBreak') break;
      if (o.header !== 'none' && badgeItems(src, k, defs)) {
        headerBadges.push(k as Paragraph);
        consumedEnd = i;
        continue;
      }
      const text = detectedTagline === null ? plainParagraph(k) : null;
      if (text !== null) {
        detectedTagline = cleanHeadingText(text, o.emoji);
        consumedEnd = i;
        continue;
      }
      break;
    }
  }
  const tagline = o.tagline === null ? detectedTagline : o.tagline.trim() || null;
  info.tagline = tagline;
  // A custom tagline does not replace the README's own first paragraph.
  const keepDetectedParagraph = detectedTagline !== null && tagline !== detectedTagline;

  if (o.header !== 'none' && title) {
    const heroLine = () => {
      if (o.header === 'hero') {
        const files = addAssets('hero', 'hero', (v) => r.hero(title, tagline, v));
        return picture(files, tagline ? `${title} — ${tagline}` : title);
      }
      return escapeHtml(title);
    };
    if (h1Index !== -1) {
      const h1 = kids[h1Index]!;
      // The header block replaces the title plus the badge rows and tagline right after it.
      // A paragraph that stays (custom tagline) ends the run: what follows it stays too.
      let end = endOffset(h1);
      const parts: string[] = [`<h1 align="center">${heroLine()}</h1>`];
      if (o.header === 'centered' && tagline) parts.push(`<p align="center">${escapeHtml(tagline)}</p>`);
      for (let i = h1Index + 1; i <= consumedEnd; i++) {
        const k = kids[i]!;
        const isBadges = headerBadges.includes(k as Paragraph);
        if (!isBadges && keepDetectedParagraph) break;
        if (isBadges) {
          parts.push(badgeParagraphHtml(k as Paragraph, defs, fixBadge, eol));
          info.badges += badgeItems(src, k, defs)?.length ?? 0;
        }
        end = endOffset(k);
      }
      replace('hero', blockStart(src, h1), end, parts.join(eol));
    } else if (htmlH1) {
      replace('hero', htmlH1.start, htmlH1.end, `<h1 align="center">${heroLine()}</h1>`, true);
    } else {
      insert('hero', 0, `<h1 align="center">${heroLine()}</h1>${tagline && o.header === 'centered' ? `${eol}<p align="center">${escapeHtml(tagline)}</p>` : ''}`);
    }
  }

  // ---------------------------------------------------------------- sections
  const headingRefs = collectHeadings(tree);
  const slugs = slugify(headingRefs.map((h) => h.text));
  const slugAt = new Map<number, string>();
  headingRefs.forEach((h, i) => {
    if (h.node) slugAt.set(startOffset(h.node), slugs[i]!);
  });
  const h2s = kids.map((k, i) => ({ k, i })).filter(({ k }) => k.type === 'heading' && (k as Heading).depth === 2) as Array<{ k: Heading; i: number }>;
  const hasToc = kids.some((k) => isTocHeading(k));
  const sectionText = (k: Heading) => cleanHeadingText(anchorText(k), o.emoji);
  const tocEntries = h2s
    .filter(({ k }) => sectionText(k) && !isTocHeading(k))
    .map(({ k }) => ({ text: sectionText(k), slug: slugAt.get(startOffset(k)) ?? '' }));

  // Table of contents: inserted before the first section (so it is spliced in before that heading).
  if (o.toc !== 'none' && tocEntries.length >= 2) {
    if (hasToc) info.toc = 'exists';
    else {
      const at = blockStart(src, h2s[0]!.k);
      let block: string;
      if (o.toc === 'list') {
        const items = tocEntries.map((e) => `- [${e.text.replace(/([[\]\\])/g, '\\$1')}](#${e.slug})`).join(eol);
        block = `<details open>${eol}<summary><b>Contents</b></summary>${eol}${eol}${items}${eol}${eol}</details>`;
      } else {
        const style = o.badges === 'keep' ? 'flat-square' : o.badges;
        const pills = tocEntries.map(
          (e) =>
            `<a href="#${attr(e.slug)}"><img alt="${attr(e.text)}" src="https://img.shields.io/badge/${shieldsText(e.text)}-${(r.badgeColors.pill ?? r.badgeColors.accent).replace('#', '')}?style=${style}&amp;labelColor=${r.badgeColors.label.replace('#', '')}"></a>`,
        );
        block = `<p align="center">${eol}  ${pills.join(`${eol}  `)}${eol}</p>`;
      }
      insert('toc', at, block);
      info.toc = 'added';
    }
  }

  h2s.forEach(({ k, i }, n) => {
    const text = sectionText(k);
    const slug = slugAt.get(startOffset(k)) ?? '';
    if (!text) return;
    const start = blockStart(src, k);
    const end = endOffset(k);
    if (o.sections) {
      const index = o.numbered ? n + 1 : null;
      const base = `section-${String(n + 1).padStart(2, '0')}${asciiSlug(text) ? `-${asciiSlug(text)}` : ''}`;
      const files = addAssets('section', base, (v) => r.section(text, index, v));
      const anchor = slug ? `<a id="${attr(slug)}"></a>` : '';
      replace('h2', start, end, `## ${anchor}${picture(files, text)}`);
      info.sections++;
    }
    // Fold long or reference sections into <details>.
    if (o.fold) {
      const next = h2s[n + 1];
      const bodyNodes = kids.slice(i + 1, next ? next.i : kids.length);
      if (bodyNodes.length) {
        const bodyStart = blockStart(src, bodyNodes[0]!);
        const bodyEnd = next ? blockStart(src, next.k) : src.length;
        const lines = src.slice(bodyStart, bodyEnd).split('\n').length;
        if (FOLD_NAMES.test(normaliseName(text)) || lines > FOLD_LINES) {
          insert('fold', bodyStart, `<details>${eol}<summary><b>Show ${escapeHtml(text)}</b></summary>`);
          insert('fold-end', bodyEnd, '</details>');
          info.folded++;
        }
      }
    }
  });

  // ---------------------------------------------------------------- dividers
  if (o.dividers) {
    let files: Partial<Record<Variant, string>> | null = null;
    for (const k of kids) {
      if (k.type !== 'thematicBreak') continue;
      const s = startOffset(k);
      const e = endOffset(k);
      if (isReplaced(s, e)) continue;
      files ??= addAssets('divider', 'divider', (v) => r.divider(v));
      replace('divider', s, e, `<p align="center">${picture(files, '')}</p>`);
      info.dividers++;
    }
  }

  // ---------------------------------------------------------------- alerts (in place)
  if (o.alerts) {
    for (const k of kids) {
      if (k.type !== 'blockquote') continue;
      const s = startOffset(k);
      const lineEnd = src.indexOf('\n', s);
      const line = src.slice(s, lineEnd === -1 ? src.length : lineEnd).replace(/\r$/, '');
      const m = /^([ \t]*>[ \t]?)(?:\*\*|__)(note|tip|important|warning|caution)(:?)(?:\*\*|__)(:?)[ \t]*(.*)$/i.exec(line);
      if (!m) continue;
      const word = ALERT_WORDS[m[2]!.toLowerCase()]!;
      const rest = m[5]!.trim();
      splices.push({ start: s, end: s + line.length, text: `${m[1]}[!${word}]${rest ? `${eol}${m[1]}${rest}` : ''}` });
      replaced.push([s, s + line.length]);
      info.alerts++;
    }
  }

  // ---------------------------------------------------------------- badges elsewhere (in place)
  if (o.badges !== 'keep') {
    for (const ref of findImageRefs(src)) {
      if (isReplaced(ref.start, ref.end)) continue;
      const next = restyleBadge(ref.value, o.badges, r.badgeColors);
      if (next === ref.value) continue;
      // Inside raw HTML the ampersands are written as entities.
      const inHtml = src[ref.start - 1] === '"' || src[ref.start - 1] === "'";
      splices.push({ start: ref.start, end: ref.end, text: inHtml ? next.replace(/&/g, '&amp;') : next });
      info.badges++;
    }
  }

  let markdown = applySplices(src, splices);
  if (o.config) markdown = writeConfig(markdown, o.config);
  return { markdown, assets, info };
}
