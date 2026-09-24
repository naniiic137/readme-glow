import GithubSlugger from 'github-slugger';
import type { Heading, Nodes, PhrasingContent, Root, RootContent } from 'mdast';
import { isBadgeUrl } from '../markdown/badges';
import { endOffset, headingText, parseMarkdown, startOffset, walk } from '../markdown/parse';

const parseCache: Array<[string, Root]> = [];

/**
 * parseMarkdown with a tiny cache. A transform that changes nothing hands the
 * next one the very same string, so its tree is reused (parsing is the slow
 * part of Beautify). Cached trees are shared: treat them as read-only.
 */
export function parse(markdown: string): Root {
  const hit = parseCache.find(([text]) => text === markdown);
  if (hit) return hit[1];
  const tree = parseMarkdown(markdown);
  parseCache.unshift([markdown, tree]);
  if (parseCache.length > 4) parseCache.pop();
  return tree;
}

/** Replace `src.slice(start, end)` with `text`. Offsets always refer to the original string. */
export interface Splice {
  start: number;
  end: number;
  text: string;
}

/**
 * Applies position-based splices to `src`. Offsets refer to the original
 * string, so every splice is computed from one parse and applied in one go
 * (equivalent to applying them from the end backwards). Splices at the same
 * offset keep the order they were given in; a splice that overlaps an earlier
 * one is dropped rather than corrupting the text.
 */
export function applySplices(src: string, splices: readonly Splice[]): string {
  if (splices.length === 0) return src;
  const ordered = splices
    .map((splice, order) => ({ splice, order }))
    .sort((a, b) => a.splice.start - b.splice.start || a.order - b.order)
    .map((entry) => entry.splice);
  const parts: string[] = [];
  let cursor = 0;
  for (const { start, end, text } of ordered) {
    if (start < cursor || end < start) continue;
    parts.push(src.slice(cursor, start), text);
    cursor = end;
  }
  parts.push(src.slice(cursor));
  return parts.join('');
}

/** Offset of the start of the line containing `offset`. */
export function lineStartOf(src: string, offset: number): number {
  return src.lastIndexOf('\n', offset - 1) + 1;
}

/** Offset of the end of the line containing `offset` (the `\n` itself, or the string length). */
export function lineEndOf(src: string, offset: number): number {
  const nl = src.indexOf('\n', offset);
  return nl < 0 ? src.length : nl;
}

/**
 * Start of a top-level block, including any indentation before it on its
 * line. A setext heading's position also covers link definitions right above
 * it, so it starts at its first line of text instead.
 */
export function blockStart(src: string, node: RootContent): number {
  const first = node.type === 'heading' ? node.children[0] : undefined;
  if (first && src[startOffset(node)] !== '#') return lineStartOf(src, startOffset(first));
  return lineStartOf(src, startOffset(node));
}

/**
 * A splice that removes the top-level blocks `kids[from..to]` together with the
 * blank lines after them, so the spacing around the gap stays as it was.
 */
export function removeBlocks(src: string, kids: readonly RootContent[], from: number, to: number): Splice {
  const next = kids[to + 1];
  if (next) return { start: blockStart(src, kids[from]!), end: blockStart(src, next), text: '' };
  const prev = kids[from - 1];
  if (prev) return { start: endOffset(prev), end: endOffset(kids[to]!), text: '' };
  return { start: blockStart(src, kids[from]!), end: endOffset(kids[to]!), text: '' };
}

/**
 * The line break(s) to put after a block that ends at `at`, so that whatever
 * follows starts after a blank line. Without one, a following line would be
 * swallowed by an HTML block (`</div>`) or continue a list lazily.
 */
export function gapAfter(src: string, at: number): string {
  return /^[ \t]*\n[ \t]*\S/.test(src.slice(at, at + 200)) ? '\n' : '';
}

/** A splice inserting `block` after the block that ends at `at`, with blank lines around it. */
export function insertAfter(src: string, at: number, block: string): Splice {
  return { start: at, end: at, text: `\n\n${block}${gapAfter(src, at)}` };
}

/** Sorted, merged offset ranges with a fast overlap test. */
export class RangeSet {
  private ranges: Array<[number, number]> = [];
  private dirty = false;

  add(start: number, end: number): void {
    if (end > start) {
      this.ranges.push([start, end]);
      this.dirty = true;
    }
  }

  /** True when [start, end) overlaps any stored range. */
  overlaps(start: number, end: number): boolean {
    if (this.dirty) this.normalise();
    const r = this.ranges;
    let lo = 0;
    let hi = r.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r[mid]![1] <= start) lo = mid + 1;
      else hi = mid;
    }
    return lo < r.length && r[lo]![0] < end;
  }

  private normalise(): void {
    this.ranges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const range of this.ranges) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([range[0], range[1]]);
    }
    this.ranges = merged;
    this.dirty = false;
  }
}

// ---------------------------------------------------------------------------
// Text helpers

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const EMOJI_ALL = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u{FE0F}\u{200D}\u{20E3}]/gu;
const SHORTCODE = /:[a-z0-9_+-]+:/gi;

/** True when the text contains an emoji or a `:shortcode:`. */
export function hasEmoji(text: string): boolean {
  return EMOJI.test(text) || /:[a-z0-9_+-]+:/i.test(text);
}

/** Removes emoji and `:shortcodes:`. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_ALL, '').replace(SHORTCODE, '');
}

/**
 * A section name for matching: emoji and punctuation removed, lower case,
 * single spaces. "📦 Getting Started:" → "getting started".
 */
export function normaliseName(text: string): string {
  return stripEmoji(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Headings and anchors

const TOC_NAMES = new Set(['table of contents', 'table of content', 'contents', 'toc']);

/** True for "Table of contents", "Contents", "TOC" (any case, any emoji). */
export function isTocName(text: string): boolean {
  return TOC_NAMES.has(normaliseName(text));
}

export function isTocHeading(node: RootContent): node is Heading {
  return node.type === 'heading' && isTocName(headingText(node));
}

/**
 * The text a heading's anchor is made from: what the rendered heading would
 * contain as plain text (images and HTML tags contribute nothing), whitespace
 * collapsed. This matches the renderer (hast-util-to-string + github-slugger).
 */
export function anchorText(node: Nodes): string {
  return rawAnchorText(node).replace(/\s+/g, ' ').trim();
}

function rawAnchorText(node: Nodes): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'inlineMath':
      return node.value;
    case 'html':
      return node.value.replace(/<[^>]*>/g, '');
    case 'image':
    case 'imageReference':
    case 'footnoteReference':
      return '';
    case 'break':
      return '\n';
    default:
      return 'children' in node ? (node.children as Nodes[]).map(rawAnchorText).join('') : '';
  }
}

/** One heading in document order: a Markdown heading, or an HTML `<hN>` tag inside an HTML node. */
export interface HeadingRef {
  node: Heading | null;
  text: string;
  offset: number;
}

/** Every heading in document order (Markdown headings at any depth plus HTML `<h1>`…`<h6>`). */
export function collectHeadings(tree: Root): HeadingRef[] {
  const out: HeadingRef[] = [];
  walk(tree, (node) => {
    if (node.type === 'heading') {
      out.push({ node, text: anchorText(node), offset: startOffset(node) });
      return false;
    }
    if (node.type === 'html') {
      const re = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi;
      for (const m of node.value.matchAll(re)) {
        const text = m[1]!.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        out.push({ node: null, text, offset: startOffset(node) });
      }
      return false;
    }
    if (node.type === 'code' || node.type === 'math') return false;
  });
  return out;
}

/** GitHub-style unique slugs for a list of heading texts, in order. */
export function slugify(texts: readonly string[]): string[] {
  const slugger = new GithubSlugger();
  return texts.map((text) => slugger.slug(text));
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Splices that point in-document links (`](#old)`, `[ref]: #old` and
 * `href="#old"` in raw HTML) at renamed anchors.
 */
export function anchorSplices(src: string, tree: Root, rename: ReadonlyMap<string, string>): Splice[] {
  const splices: Splice[] = [];
  if (rename.size === 0) return splices;
  const lookup = (fragment: string): string | undefined => {
    const decoded = safeDecode(fragment);
    return rename.get(decoded) ?? rename.get(decoded.toLowerCase());
  };
  walk(tree, (node) => {
    if ((node.type === 'link' || node.type === 'definition') && node.url.startsWith('#')) {
      const target = lookup(node.url.slice(1));
      if (target === undefined) return;
      const start = startOffset(node);
      const text = src.slice(start, endOffset(node));
      const from = node.type === 'link' ? text.lastIndexOf('](') : text.indexOf(']:');
      if (from < 0) return;
      const at = text.indexOf(node.url, from);
      if (at < 0) return;
      splices.push({ start: start + at, end: start + at + node.url.length, text: `#${target}` });
      return;
    }
    if (node.type === 'html') {
      const start = startOffset(node);
      const text = src.slice(start, endOffset(node));
      for (const m of text.matchAll(/\bhref\s*=\s*(["'])#([^"'\s>]*)\1/gi)) {
        const target = lookup(m[2]!);
        if (target === undefined) continue;
        const at = start + m.index + m[0].indexOf('#');
        splices.push({ start: at, end: at + 1 + m[2]!.length, text: `#${target}` });
      }
      return false;
    }
    if (node.type === 'code' || node.type === 'math' || node.type === 'inlineCode') return false;
  });
  return splices;
}

/**
 * Splices updating every in-document link after heading texts change.
 * `nextTexts` holds the new anchor text for each entry of `collectHeadings(tree)`.
 */
export function relinkSplices(src: string, tree: Root, before: readonly HeadingRef[], nextTexts: readonly string[]): Splice[] {
  const oldSlugs = slugify(before.map((h) => h.text));
  const newSlugs = slugify(nextTexts);
  const rename = new Map<string, string>();
  oldSlugs.forEach((slug, i) => {
    const next = newSlugs[i];
    if (next !== undefined && next !== slug && !rename.has(slug)) rename.set(slug, next);
  });
  return anchorSplices(src, tree, rename);
}

// ---------------------------------------------------------------------------
// HTML wrappers (<div align="center"> … </div> around Markdown)

const CONTAINER_TAGS = new Set([
  'div', 'p', 'center', 'details', 'section', 'article', 'header', 'footer', 'aside', 'nav', 'main', 'figure', 'table', 'blockquote',
]);

interface OpenTag {
  tag: string;
  centred: boolean;
  index: number;
}

export interface WrapState {
  /** Number of open HTML container tags. */
  depth: number;
  /** True when any open container is centred (`align="center"` or `<center>`). */
  centred: boolean;
  /** Root index of the HTML node that opened the outermost open container, or -1. */
  outer: number;
}

/**
 * Tracks HTML container tags opened in one top-level HTML block and closed in
 * a later one, which is how READMEs centre Markdown content. `before[i]` is the
 * state just before root child `i`, `after[i]` the state just after it.
 */
export function htmlNesting(tree: Root): { before: WrapState[]; after: WrapState[] } {
  const stack: OpenTag[] = [];
  const snapshot = (): WrapState => ({
    depth: stack.length,
    centred: stack.some((t) => t.centred),
    outer: stack[0]?.index ?? -1,
  });
  const before: WrapState[] = [];
  const after: WrapState[] = [];
  tree.children.forEach((child, index) => {
    before.push(snapshot());
    if (child.type === 'html') {
      const value = child.value.replace(/<!--[\s\S]*?-->/g, '');
      for (const m of value.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g)) {
        const tag = m[2]!.toLowerCase();
        if (!CONTAINER_TAGS.has(tag)) continue;
        const attrs = m[3] ?? '';
        if (m[1]) {
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i]!.tag === tag) {
              stack.length = i;
              break;
            }
          }
        } else if (!attrs.trimEnd().endsWith('/')) {
          stack.push({ tag, index, centred: tag === 'center' || /\balign\s*=\s*["']?center\b/i.test(attrs) });
        }
      }
    }
    after.push(snapshot());
  });
  return { before, after };
}

/** An HTML block that is just `<div align="center">` (or `<p align="center">`, `<center>`). */
export function isCentredOpener(node: RootContent | undefined): boolean {
  if (node?.type !== 'html') return false;
  const v = node.value.trim();
  return /^<(div|p)\b[^>]*\balign\s*=\s*["']?center\b[^>]*>$/i.test(v) || /^<center>$/i.test(v);
}

/** An HTML block that is just `</div>`, `</p>` or `</center>`. */
export function isCloser(node: RootContent | undefined): boolean {
  return node?.type === 'html' && /^<\/(div|p|center)\s*>$/i.test(node.value.trim());
}

// ---------------------------------------------------------------------------
// Badges and logos

/** Link reference definitions: identifier → URL. */
export function definitions(tree: Root): Map<string, string> {
  const defs = new Map<string, string>();
  walk(tree, (node) => {
    if (node.type === 'definition' && !defs.has(node.identifier)) defs.set(node.identifier, node.url);
  });
  return defs;
}

type BadgeKind = 'badge' | 'image' | 'tag' | null;

function imageSrc(html: string): string | null {
  const m = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html);
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

function classify(node: PhrasingContent, defs: ReadonlyMap<string, string>): BadgeKind {
  switch (node.type) {
    case 'image':
      return isBadgeUrl(node.url) ? 'badge' : 'image';
    case 'imageReference': {
      const url = defs.get(node.identifier);
      if (url === undefined) return null;
      return isBadgeUrl(url) ? 'badge' : 'image';
    }
    case 'link':
    case 'linkReference': {
      let kind: BadgeKind = null;
      for (const child of node.children) {
        if (child.type === 'text' && child.value.trim() === '') continue;
        const inner = classify(child, defs);
        if (inner !== 'badge' && inner !== 'image') return null;
        if (kind && kind !== inner) return null;
        kind = inner;
      }
      return kind;
    }
    case 'html': {
      const v = node.value.trim();
      if (/^<img\b[^>]*>$/i.test(v)) {
        const src = imageSrc(v);
        if (!src) return null;
        return isBadgeUrl(src) ? 'badge' : 'image';
      }
      if (/^<a\b[^>]*>$/i.test(v) || /^<\/a\s*>$/i.test(v)) return 'tag';
      return null;
    }
    default:
      return null;
  }
}

/**
 * If `node` is a paragraph made only of badges (badge images, optionally
 * wrapped in links, Markdown or inline HTML), returns each badge's source
 * text. Otherwise null.
 */
export function badgeItems(src: string, node: RootContent | undefined, defs: ReadonlyMap<string, string>): string[] | null {
  if (node?.type !== 'paragraph') return null;
  const items: string[] = [];
  let run: PhrasingContent[] = [];
  let badges = 0;
  let insideAnchor = false;
  const flush = (): void => {
    const first = run[0];
    const last = run[run.length - 1];
    if (first && last) items.push(src.slice(startOffset(first), endOffset(last)));
    run = [];
  };
  for (const child of node.children) {
    const blank = child.type === 'text' && child.value.trim() === '';
    if (blank && insideAnchor) {
      run.push(child);
      continue;
    }
    if (blank || child.type === 'break' || (child.type === 'html' && /^<br\s*\/?>$/i.test(child.value.trim()))) {
      flush();
      continue;
    }
    const kind = classify(child, defs);
    if (kind === 'badge') badges++;
    else if (kind === 'tag') insideAnchor = !/^<\//.test((child as { value: string }).value.trim());
    else return null;
    run.push(child);
  }
  flush();
  return badges > 0 ? items : null;
}

/**
 * A logo: a paragraph holding exactly one non-badge image (optionally linked),
 * or an HTML block made only of image markup (`<p align="center"><img …></p>`).
 */
export function isLogo(node: RootContent | undefined, defs: ReadonlyMap<string, string>): boolean {
  if (!node) return false;
  if (node.type === 'paragraph') {
    const parts = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
    return parts.length === 1 && classify(parts[0]!, defs) === 'image';
  }
  if (node.type === 'html') {
    const v = node.value;
    const images = [...v.matchAll(/<img\b[^>]*>/gi)].map((m) => imageSrc(m[0]));
    if (images.length === 0 || images.some((s) => !s || isBadgeUrl(s))) return false;
    const rest = v
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?(p|div|a|img|picture|source|br)\b[^>]*>/gi, '')
      .trim();
    // Self-contained only: every <p>/<div> it opens, it also closes.
    const opens = (v.match(/<(p|div)\b/gi) ?? []).length;
    const closes = (v.match(/<\/(p|div)\s*>/gi) ?? []).length;
    return rest === '' && opens === closes;
  }
  return false;
}
