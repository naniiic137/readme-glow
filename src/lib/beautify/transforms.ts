/**
 * The Beautify transforms. Each one is a pure `(markdown) => markdown`
 * function: it parses, works out position-based splices from the syntax tree
 * and applies them in one go. The inside of code blocks, inline code, math and
 * raw HTML is never rewritten unless a rule says so (in-document anchor links
 * in HTML are updated when a heading's anchor changes).
 */
import type { Code, Heading, List, Nodes, Root, RootContent } from 'mdast';
import { endOffset, headingText, mdText, startOffset, walk } from '../markdown/parse';
import { detectLanguage } from './detectLanguage';
import { emojiForSection } from './sectionEmoji';
import { alignTable } from './tables';
import {
  RangeSet,
  type Splice,
  type WrapState,
  applySplices,
  badgeItems,
  blockStart,
  collectHeadings,
  definitions,
  escapeHtml,
  gapAfter,
  hasEmoji,
  htmlNesting,
  insertAfter,
  isCentredOpener,
  isCloser,
  isLogo,
  isTocHeading,
  isTocName,
  lineEndOf,
  lineStartOf,
  normaliseName,
  parse,
  relinkSplices,
  removeBlocks,
  slugify,
  stripEmoji,
} from './util';

export type Transform = (markdown: string) => string;

// ---------------------------------------------------------------------------
// Shared helpers

/** The opening and closing fence of a fenced code block (null for indented code). */
function fenceOf(src: string, node: Code): { fence: string; info: string; openEnd: number; close: { start: number; length: number } | null } | null {
  const start = startOffset(node);
  const end = endOffset(node);
  const open = /^(`{3,}|~{3,})([^\n]*)/.exec(src.slice(start, end));
  if (!open) return null;
  const fence = open[1]!;
  const openEnd = start + open[0].length;
  let close: { start: number; length: number } | null = null;
  const lastNl = src.lastIndexOf('\n', end - 1);
  if (lastNl >= openEnd) {
    const m = /^([ \t>]*)(`{3,}|~{3,})[ \t]*$/.exec(src.slice(lastNl + 1, end));
    if (m && m[2]![0] === fence[0] && m[2]!.length >= fence.length) {
      close = { start: lastNl + 1 + m[1]!.length, length: m[2]!.length };
    }
  }
  return { fence, info: open[2]!, openEnd, close };
}

function containsBreak(node: Nodes): boolean {
  let found = false;
  walk(node, (n) => {
    if (n.type === 'break') found = true;
  });
  return found;
}

/**
 * The ATX form of a heading at `depth` (`## Title`), with closing hashes and
 * extra spaces dropped. Setext headings are joined onto one line. Returns null
 * when a heading cannot be written as ATX (a setext heading with a hard break).
 */
export function atxText(src: string, heading: Heading, depth: number = heading.depth): string | null {
  const first = heading.children[0];
  const last = heading.children[heading.children.length - 1];
  const isAtx = src[startOffset(heading)] === '#';
  if (!first || !last) return isAtx ? '#'.repeat(depth) : null;
  if (containsBreak(heading)) return null;
  let content = src.slice(startOffset(first), endOffset(last));
  if (!isAtx) {
    content = content
      .split('\n')
      .map((line) => line.trim())
      .join(' ');
    // A trailing " ###" would be read as a closing sequence in ATX: escape it.
    content = content.replace(/(^|[ \t])(#+)$/, '$1\\$2');
  }
  return `${'#'.repeat(depth)} ${content}`;
}

/** A splice changing a heading's level (setext headings become ATX). */
function depthSplice(src: string, heading: Heading, depth: number): Splice | null {
  const start = startOffset(heading);
  if (src[start] === '#') {
    let n = 0;
    while (src[start + n] === '#') n++;
    return { start, end: start + n, text: '#'.repeat(depth) };
  }
  const text = atxText(src, heading, depth);
  if (text !== null) return { start: blockStart(src, heading), end: endOffset(heading), text };
  if (depth > 2) return null;
  const end = endOffset(heading);
  const underlineStart = src.lastIndexOf('\n', end - 1) + 1;
  const underline = src.slice(underlineStart, end).replace(/[=-]/g, depth === 1 ? '=' : '-');
  return { start: underlineStart, end, text: underline };
}

/** Top-level H2 sections: the heading's index and the index where the section stops. */
function h2Sections(kids: readonly RootContent[]): Array<{ index: number; end: number }> {
  const out: Array<{ index: number; end: number }> = [];
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i]!;
    if (node.type !== 'heading' || node.depth !== 2) continue;
    let end = i + 1;
    while (end < kids.length) {
      const next = kids[end]!;
      if (next.type === 'heading' && next.depth <= 2) break;
      end++;
    }
    out.push({ index: i, end });
  }
  return out;
}

/**
 * The last root index that belongs to a section's own content: HTML closing
 * tags of wrappers opened before the heading (like a `</div>` ending an RTL
 * wrapper around the whole README) are left out.
 */
function sectionLast(kids: readonly RootContent[], before: readonly WrapState[], after: readonly WrapState[], index: number, end: number): number {
  let last = end - 1;
  const base = before[index]!.depth;
  while (last > index && kids[last]!.type === 'html' && after[last]!.depth < base) last--;
  return last;
}

const BACK_LINK_HREF = /\bhref\s*=\s*["']#readme-top["']/i;

function linksToTop(node: RootContent): boolean {
  let found = false;
  walk(node, (n) => {
    if (n.type === 'html' && BACK_LINK_HREF.test(n.value)) found = true;
    if (n.type === 'link' && n.url === '#readme-top') found = true;
  });
  return found;
}

// ---------------------------------------------------------------------------
// 1. cleanFormatting

/**
 * Tidies formatting without changing how the README renders: LF line endings,
 * no trailing whitespace (hard breaks become `\`), single blank lines, blank
 * lines around top-level headings/fences/tables/lists, ATX headings without
 * closing hashes, `-` bullets, backtick fences with an obvious language added,
 * aligned tables and exactly one final newline.
 */
export function cleanFormatting(markdown: string): string {
  return tidyLines(rewriteBlocks(markdown.replace(/\r\n?/g, '\n')));
}

/** Two trailing spaces before a line break become a backslash (same `<br>`, but visible). */
function breakSplice(src: string, node: Nodes): Splice | null {
  const start = startOffset(node);
  if (src[start] !== ' ') return null;
  const nl = src.indexOf('\n', start);
  if (nl < 0 || !/^[ \t]+$/.test(src.slice(start, nl))) return null;
  // "foo\  ⏎" → "foo\\⏎" would read as an escaped backslash: leave it alone.
  let backslashes = 0;
  for (let i = start - 1; i >= 0 && src[i] === '\\'; i--) backslashes++;
  if (backslashes % 2 === 1) return null;
  return { start, end: nl, text: '\\' };
}

/**
 * `*` and `+` bullets become `-`. A list next to another bullet list is left
 * alone (changing its marker would merge the two lists), and so is any line
 * that would turn into a `- - -` thematic break.
 */
function listMarkerSplices(src: string, list: List, siblings: readonly Nodes[], index: number): Splice[] {
  if (list.ordered) return [];
  const neighbours = [siblings[index - 1], siblings[index + 1]];
  if (neighbours.some((n) => n?.type === 'list' && !n.ordered)) return [];
  const out: Splice[] = [];
  for (const item of list.children) {
    const start = startOffset(item);
    const marker = src[start];
    if (marker === '-') continue;
    if (marker !== '*' && marker !== '+') return [];
    const rest = src.slice(start, lineEndOf(src, start));
    if (/^[-*+ \t]+$/.test(rest) && (rest.match(/[-*+]/g) ?? []).length >= 3) return [];
    out.push({ start, end: start + 1, text: '-' });
  }
  return out;
}

/** `~~~` fences become backticks, and an obvious language is added to unlabelled fences. */
function fenceSplices(src: string, node: Code): Splice[] {
  const fence = fenceOf(src, node);
  if (!fence) return [];
  const out: Splice[] = [];
  let nextFence = fence.fence;
  let nextInfo = fence.info;
  if (fence.fence[0] === '~' && fence.close && !node.value.includes('```') && !fence.info.includes('`')) {
    nextFence = '`'.repeat(fence.fence.length);
  }
  if (!node.lang && fence.info.trim() === '') {
    const lang = detectLanguage(node.value);
    if (lang) nextInfo = lang;
  }
  const start = startOffset(node);
  if (nextFence !== fence.fence || nextInfo !== fence.info) out.push({ start, end: fence.openEnd, text: nextFence + nextInfo });
  if (fence.close && nextFence !== fence.fence) {
    out.push({ start: fence.close.start, end: fence.close.start + fence.close.length, text: '`'.repeat(fence.close.length) });
  }
  return out;
}

/** Block-level rewrites that need the syntax tree (one parse, non-overlapping splices). */
function rewriteBlocks(src: string): string {
  const tree = parse(src);
  const splices: Splice[] = [];
  walk(tree, (node, parent, index) => {
    switch (node.type) {
      case 'break': {
        const splice = breakSplice(src, node);
        if (splice) splices.push(splice);
        return;
      }
      case 'list':
        if (parent && index !== undefined) splices.push(...listMarkerSplices(src, node, parent.children as Nodes[], index));
        return;
      case 'code':
        splices.push(...fenceSplices(src, node));
        return false;
      case 'html':
      case 'math':
      case 'inlineCode':
      case 'inlineMath':
        return false;
      default:
        return;
    }
  });
  for (const child of tree.children) {
    if (child.type === 'heading') {
      const start = blockStart(src, child);
      const end = endOffset(child);
      const text = atxText(src, child);
      if (text !== null && text !== src.slice(start, end)) splices.push({ start, end, text });
    } else if (child.type === 'table') {
      const start = lineStartOf(src, startOffset(child));
      const end = endOffset(child);
      const text = alignTable(src.slice(start, end), child.align ?? []);
      if (text !== src.slice(start, end)) splices.push({ start, end, text });
    }
  }
  return applySplices(src, splices);
}

function needsSpace(src: string, node: RootContent): boolean {
  if (node.type === 'heading' || node.type === 'table' || node.type === 'list') return true;
  if (node.type === 'code') {
    const ch = src[startOffset(node)];
    return ch === '`' || ch === '~';
  }
  return false;
}

const BLOCK_PARENTS = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition']);

/** Line-level clean-up: trailing whitespace, blank lines, final newline. */
function tidyLines(src: string): string {
  const tree = parse(src);
  const body = src.endsWith('\n') ? src.slice(0, -1) : src;
  const lines = body.split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }

  // Whitespace that means something: inside code, math, HTML and unconverted hard breaks.
  const keep = new RangeSet();
  const locked = new Uint8Array(lines.length);
  const lock = (node: Nodes): void => {
    const from = (node.position?.start.line ?? 1) - 1;
    const to = (node.position?.end.line ?? 1) - 1;
    for (let l = from; l <= to && l < locked.length; l++) locked[l] = 1;
  };
  walk(tree, (node, parent) => {
    switch (node.type) {
      case 'code':
      case 'math':
        keep.add(startOffset(node), endOffset(node));
        lock(node);
        return false;
      case 'html':
        keep.add(startOffset(node), endOffset(node));
        if (parent && BLOCK_PARENTS.has(parent.type)) lock(node);
        return false;
      case 'inlineCode':
      case 'inlineMath':
      case 'break':
        keep.add(startOffset(node), endOffset(node));
        return false;
      default:
        return;
    }
  });

  // Top-level headings, fences, tables and lists get a blank line on each side.
  const blankAfter = new Set<number>();
  const kids = tree.children;
  for (let i = 1; i < kids.length; i++) {
    const a = kids[i - 1]!;
    const b = kids[i]!;
    if (!needsSpace(src, a) && !needsSpace(src, b)) continue;
    const gap = src.slice(endOffset(a), startOffset(b));
    if (/\S/.test(gap) || (gap.match(/\n/g) ?? []).length >= 2) continue;
    blankAfter.add((a.position?.end.line ?? 1) - 1);
  }

  const out: string[] = [];
  const outLocked: boolean[] = [];
  let blank = false;
  lines.forEach((raw, i) => {
    let line = raw;
    const trimmed = line.replace(/[ \t]+$/, '');
    if (trimmed.length !== line.length && !keep.overlaps(starts[i]! + trimmed.length, starts[i]! + line.length)) line = trimmed;
    const isLocked = locked[i] === 1;
    if (!isLocked && line.trim() === '') {
      if (out.length === 0 || blank) return;
      out.push('');
      outLocked.push(false);
      blank = true;
      return;
    }
    out.push(line);
    outLocked.push(isLocked);
    blank = false;
    if (blankAfter.has(i)) {
      out.push('');
      outLocked.push(false);
      blank = true;
    }
  });
  while (out.length > 0 && out[out.length - 1] === '' && !outLocked[out.length - 1]) {
    out.pop();
    outLocked.pop();
  }
  return out.length > 0 ? `${out.join('\n')}\n` : '';
}

// ---------------------------------------------------------------------------
// 2. fixHeadings

/**
 * One H1 and no skipped levels. The first H1 is the title (an HTML `<h1>` at
 * the top counts); later H1s become H2 and the headings under them move down
 * one level with them. Any heading deeper than its parent + 1 is clamped.
 * Only levels change, so heading anchors stay the same.
 */
export function fixHeadings(markdown: string): string {
  const tree = parse(markdown);
  const splices: Splice[] = [];
  let titleSeen = false;
  let headingSeen = false;
  let shift = 0;
  let stack: Array<{ level: number; depth: number }> = [{ level: 1, depth: 1 }];
  for (const child of tree.children) {
    if (child.type === 'html' && !headingSeen && /<h1[\s>]/i.test(child.value)) {
      titleSeen = true;
      continue;
    }
    if (child.type !== 'heading') continue;
    headingSeen = true;
    if (child.depth === 1 && !titleSeen) {
      titleSeen = true;
      shift = 0;
      stack = [{ level: 1, depth: 1 }];
      continue;
    }
    if (child.depth === 1) shift = 1;
    const level = Math.min(6, child.depth + shift);
    while (stack.length > 1 && stack[stack.length - 1]!.level >= level) stack.pop();
    const depth = Math.min(level, stack[stack.length - 1]!.depth + 1);
    stack.push({ level, depth });
    if (depth !== child.depth) {
      const splice = depthSplice(markdown, child, depth);
      if (splice) splices.push(splice);
    }
  }
  return applySplices(markdown, splices);
}

// ---------------------------------------------------------------------------
// 3. groupBadges

/**
 * Badge-only paragraphs before the first section are merged into one centred
 * row right after the title (or where the first badges were, if there is no
 * title). A wrapper left empty by the move is removed. Badges already in one
 * centred wrapper are left alone.
 */
export function groupBadges(markdown: string): string {
  const tree = parse(markdown);
  const kids = tree.children;
  const defs = definitions(tree);
  const { before, after } = htmlNesting(tree);

  let title = -1;
  let limit = kids.length;
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i]!;
    if (node.type !== 'heading') continue;
    if (node.depth === 1 && title < 0) {
      title = i;
      continue;
    }
    limit = i;
    break;
  }
  if (title < 0) title = kids.findIndex((n, i) => i < limit && n.type === 'html' && /<h1[\s>]/i.test(n.value));

  const found: Array<{ index: number; items: string[] }> = [];
  for (let i = 0; i < limit; i++) {
    const items = badgeItems(markdown, kids[i], defs);
    if (items) found.push({ index: i, items });
  }
  if (found.length === 0) return markdown;
  if (found.length === 1 && before[found[0]!.index]!.centred) return markdown;

  const remove = new Set(found.map((f) => f.index));
  for (let i = 0; i < kids.length; i++) {
    if (!isCentredOpener(kids[i])) continue;
    let j = i + 1;
    while (j < kids.length && remove.has(j)) j++;
    if (j > i + 1 && isCloser(kids[j])) {
      remove.add(i);
      remove.add(j);
    }
  }
  const runs: Array<[number, number]> = [];
  for (const index of [...remove].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && last[1] === index - 1) last[1] = index;
    else runs.push([index, index]);
  }

  const row = found.map((f) => f.items.join(' ')).join('\n');
  const splices: Splice[] = [];
  if (title >= 0) {
    const block = after[title]!.centred ? row : `<div align="center">\n\n${row}\n\n</div>`;
    const at = endOffset(kids[title]!);
    splices.push(insertAfter(markdown, at, block));
  } else {
    const at = blockStart(markdown, kids[runs[0]![0]]!);
    splices.push({ start: at, end: at, text: `<div align="center">\n\n${row}\n\n</div>\n\n` });
  }
  for (const [from, to] of runs) splices.push(removeBlocks(markdown, kids, from, to));
  return applySplices(markdown, splices);
}

// ---------------------------------------------------------------------------
// 4. centerHeader

function isTagline(node: RootContent | undefined): boolean {
  if (node?.type !== 'paragraph') return false;
  const text = mdText(node).trim();
  return text.length > 0 && text.length <= 300;
}

/**
 * Wraps the header (a logo directly above or below the title, the H1, the
 * tagline and the badge row) in `<div align="center">`. A header that is
 * already inside an HTML wrapper is left alone.
 */
export function centerHeader(markdown: string): string {
  const tree = parse(markdown);
  const kids = tree.children;
  const defs = definitions(tree);
  const { before } = htmlNesting(tree);
  const title = kids.findIndex((n) => n.type === 'heading' && n.depth === 1);
  if (title < 0 || before[title]!.depth > 0) return markdown;

  const source = (node: RootContent): string => markdown.slice(blockStart(markdown, node), endOffset(node)).trimEnd();
  const used = new Set<'logo' | 'badges' | 'tagline'>();
  let first = title;
  if (title > 0 && before[title - 1]!.depth === 0 && isLogo(kids[title - 1], defs)) {
    first = title - 1;
    used.add('logo');
  }
  const parts: string[] = [];
  for (let i = first; i <= title; i++) parts.push(source(kids[i]!));

  let last = title;
  let i = title + 1;
  while (i < kids.length && before[i]!.depth === 0) {
    const node = kids[i]!;
    if (!used.has('badges') && badgeItems(markdown, node, defs)) {
      used.add('badges');
      parts.push(source(node));
      last = i++;
    } else if (!used.has('badges') && isCentredOpener(node) && badgeItems(markdown, kids[i + 1], defs) && isCloser(kids[i + 2])) {
      used.add('badges');
      parts.push(source(kids[i + 1]!));
      last = i + 2;
      i += 3;
    } else if (!used.has('logo') && isLogo(node, defs)) {
      used.add('logo');
      parts.push(source(node));
      last = i++;
    } else if (!used.has('tagline') && isTagline(node)) {
      used.add('tagline');
      parts.push(source(node));
      last = i++;
    } else {
      break;
    }
  }
  const text = `<div align="center">\n\n${parts.join('\n\n')}\n\n</div>`;
  const end = endOffset(kids[last]!);
  return applySplices(markdown, [{ start: blockStart(markdown, kids[first]!), end, text: text + gapAfter(markdown, end) }]);
}

// ---------------------------------------------------------------------------
// 5. addToc

const TOC_TITLE = 'Table of contents';

function wordCount(tree: Root): number {
  let words = 0;
  walk(tree, (node) => {
    if (node.type === 'code' || node.type === 'html' || node.type === 'math') return false;
    if (node.type === 'text') words += (node.value.match(/\S+/g) ?? []).length;
  });
  return words;
}

function codeSpan(value: string): string {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((r) => r.length));
  const ticks = '`'.repeat(longest + 1);
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${value}${pad}${ticks}`;
}

function escapeLabel(text: string): string {
  return text
    .replace(/[\\[\]*`<]/g, '\\$&')
    .replace(/_/g, (m, at: number, all: string) => (/[\p{L}\p{N}]/u.test(all[at - 1] ?? '') && /[\p{L}\p{N}]/u.test(all[at + 1] ?? '') ? m : '\\_'));
}

/** A heading as link text: formatting, links and images dropped, code kept. */
function tocLabel(node: Nodes): string {
  switch (node.type) {
    case 'text':
      return escapeLabel(node.value);
    case 'inlineCode':
      return codeSpan(node.value);
    case 'inlineMath':
      return `$${node.value}$`;
    case 'break':
      return ' ';
    case 'image':
    case 'imageReference':
    case 'html':
    case 'footnoteReference':
      return '';
    default:
      return 'children' in node ? (node.children as Nodes[]).map(tocLabel).join('') : '';
  }
}

function hasAnchorLink(node: Nodes): boolean {
  let found = false;
  walk(node, (n) => {
    if (n.type === 'link' && n.url.startsWith('#')) found = true;
  });
  return found;
}

/**
 * A list that is purely a table of contents: every item is a single `#` link,
 * optionally with a nested list of the same shape. Only such a list is ever
 * replaced, so no other content can be lost.
 */
function isTocList(list: List): boolean {
  return list.children.every((item) =>
    item.children.every((child, i) => {
      if (i > 0) return child.type === 'list' && isTocList(child);
      if (child.type !== 'paragraph') return false;
      const parts = child.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
      return parts.length === 1 && parts[0]!.type === 'link' && parts[0]!.url.startsWith('#');
    }),
  );
}

type TocSpot = { heading: Heading | null; list: List | null; anchor: number };

/**
 * Finds an existing contents section: a "Table of contents" / "Contents" /
 * "TOC" heading (or HTML such as `<summary>Table of contents</summary>`)
 * followed by a list of anchor links. Returns 'keep' for a contents list that
 * must be left alone (written in HTML, or with more than links in it).
 */
function findToc(src: string, kids: readonly RootContent[]): TocSpot | 'keep' | null {
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i]!;
    const heading = isTocHeading(node) ? node : null;
    if (!heading) {
      if (node.type !== 'html') continue;
      const texts = node.value.split(/<[^>]*>/).map((t) => t.trim());
      if (!texts.some((t) => t !== '' && isTocName(t))) continue;
      if (/\bhref\s*=\s*["']#/i.test(node.value)) return 'keep';
    }
    let list: List | null = null;
    let htmlLinks = false;
    let other = false;
    for (let j = i + 1; j < kids.length; j++) {
      const next = kids[j]!;
      if (next.type === 'heading') break;
      if (next.type === 'list') {
        list = next;
        break;
      }
      if (next.type === 'html' && /\bhref\s*=\s*["']#/i.test(next.value)) htmlLinks = true;
      else if (next.type !== 'html') other = true;
    }
    if (list && hasAnchorLink(list)) return isTocList(list) ? { heading, list, anchor: i } : 'keep';
    if (htmlLinks) return 'keep';
    if (heading && !list) {
      const strict = ['table of contents', 'toc'].includes(normaliseName(headingText(heading)));
      if (!other || strict) {
        // A list added here would swallow an indented block that follows it.
        const next = kids[i + 1];
        if (next && /^[ \t]/.test(src.slice(blockStart(src, next)))) return 'keep';
        return { heading, list: null, anchor: i };
      }
    }
  }
  return null;
}

/**
 * Adds (or refreshes) a table of contents: H2 sections with their H3s as a
 * nested list of anchor links (a changelog's version headings are not listed).
 * A new one is only added to longer READMEs (4+ sections or 700+ words, and
 * at least 2 sections) and goes just before the first section.
 */
export function addToc(markdown: string): string {
  const tree = parse(markdown);
  const kids = tree.children;
  const existing = findToc(markdown, kids);
  if (existing === 'keep') return markdown;

  const headings = collectHeadings(tree);
  const texts = headings.map((h) => h.text);
  let insertAt = -1;
  if (!existing) {
    const sections = kids.filter((n) => n.type === 'heading' && n.depth === 2).length;
    if (sections < 2 || (sections < 4 && wordCount(tree) < 700)) return markdown;
    const firstSection = kids.findIndex((n) => n.type === 'heading' && n.depth === 2);
    const { before } = htmlNesting(tree);
    const state = before[firstSection]!;
    insertAt = state.depth > 0 && state.outer >= 0 ? state.outer : firstSection;
    const offset = startOffset(kids[insertAt]!);
    const position = headings.filter((h) => h.offset < offset).length;
    texts.splice(position, 0, TOC_TITLE);
    headings.splice(position, 0, { node: null, text: TOC_TITLE, offset });
  }
  const slugs = slugify(texts);
  const slugOf = new Map<Heading, string>();
  headings.forEach((h, i) => {
    if (h.node) slugOf.set(h.node, slugs[i]!);
  });

  const lines: string[] = [];
  // H3s are listed under their H2, except the version headings of a changelog.
  let listChildren = false;
  for (const node of kids) {
    if (node.type !== 'heading' || node === existing?.heading) continue;
    if (node.depth === 2) listChildren = !COLLAPSE_NAMES.has(normaliseName(headingText(node)));
    else if (node.depth !== 3 || !listChildren) {
      if (node.depth === 1) listChildren = false;
      continue;
    }
    const label = tocLabel(node).replace(/\s+/g, ' ').trim();
    if (!label) continue;
    lines.push(`${node.depth === 3 ? '  ' : ''}- [${label}](#${slugOf.get(node) ?? ''})`);
  }
  if (lines.length === 0) return markdown;
  const list = lines.join('\n');

  if (existing?.list) {
    return applySplices(markdown, [{ start: startOffset(existing.list), end: endOffset(existing.list), text: list }]);
  }
  if (existing) {
    const at = endOffset(kids[existing.anchor]!);
    return applySplices(markdown, [insertAfter(markdown, at, list)]);
  }
  // Any indentation before the next block goes, so it cannot become part of the list.
  const at = blockStart(markdown, kids[insertAt]!);
  const indent = /^[ \t]*/.exec(markdown.slice(at))![0].length;
  return applySplices(markdown, [{ start: at, end: at + indent, text: `## ${TOC_TITLE}\n\n${list}\n\n` }]);
}

// ---------------------------------------------------------------------------
// 6. backToTop

const TOP_ANCHOR = '<a id="readme-top"></a>';
const BACK_LINK = '<p align="right">(<a href="#readme-top">back to top</a>)</p>';

/**
 * Adds `<a id="readme-top"></a>` as the first line and a right-aligned
 * "back to top" link at the end of each H2 section (not the contents section).
 */
export function backToTop(markdown: string): string {
  const tree = parse(markdown);
  const kids = tree.children;
  const { before, after } = htmlNesting(tree);
  const splices: Splice[] = [];
  let linked = false;
  for (const { index, end } of h2Sections(kids)) {
    const section = kids.slice(index + 1, end);
    if (section.some(linksToTop)) {
      linked = true;
      continue;
    }
    if (isTocHeading(kids[index]!)) continue;
    const last = sectionLast(kids, before, after, index, end);
    if (last <= index) continue;
    const at = endOffset(kids[last]!);
    splices.push(insertAfter(markdown, at, BACK_LINK));
  }
  let hasAnchor = false;
  walk(tree, (node) => {
    if (node.type === 'html' && /\b(?:id|name)\s*=\s*["']?readme-top\b/i.test(node.value)) hasAnchor = true;
    if (node.type === 'code') return false;
  });
  if (!hasAnchor && (linked || splices.length > 0)) splices.unshift({ start: 0, end: 0, text: `${TOP_ANCHOR}\n\n` });
  return applySplices(markdown, splices);
}

// ---------------------------------------------------------------------------
// 7. sectionEmoji

/**
 * Prefixes well-known H2 section names with an emoji ("Features" →
 * "✨ Features"), skipping headings that already have one. Links to those
 * sections are updated, since the anchor changes ("#features" → "#-features").
 */
export function sectionEmoji(markdown: string): string {
  const tree = parse(markdown);
  const headings = collectHeadings(tree);
  const added = new Map<Heading, string>();
  const splices: Splice[] = [];
  for (const node of tree.children) {
    if (node.type !== 'heading' || node.depth !== 2) continue;
    const first = node.children[0];
    const last = node.children[node.children.length - 1];
    if (!first || !last) continue;
    if (first.type === 'image' || first.type === 'imageReference' || (first.type === 'html' && /^<img\b/i.test(first.value))) continue;
    if (hasEmoji(markdown.slice(startOffset(first), endOffset(last)))) continue;
    const emoji = emojiForSection(headingText(node));
    if (!emoji) continue;
    added.set(node, emoji);
    splices.push({ start: startOffset(first), end: startOffset(first), text: `${emoji} ` });
  }
  if (splices.length === 0) return markdown;
  const nextTexts = headings.map((h) => {
    const emoji = h.node ? added.get(h.node) : undefined;
    return emoji ? `${emoji} ${h.text}` : h.text;
  });
  splices.push(...relinkSplices(markdown, tree, headings, nextTexts));
  return applySplices(markdown, splices);
}

// ---------------------------------------------------------------------------
// 8. collapseLong

const COLLAPSE_NAMES = new Set(['changelog', 'change log', 'changes', 'history', 'release notes', 'release history', 'releases', 'version history']);
const LONG_SECTION_LINES = 80;

/**
 * Folds the body of changelog-style H2 sections, and of any H2 section longer
 * than 80 lines, into `<details>`. The heading stays visible, and a trailing
 * "back to top" link stays outside.
 */
export function collapseLong(markdown: string): string {
  const tree = parse(markdown);
  const kids = tree.children;
  const { before, after } = htmlNesting(tree);
  const splices: Splice[] = [];
  for (const { index, end } of h2Sections(kids)) {
    const heading = kids[index] as Heading;
    if (isTocHeading(heading)) continue;
    let last = sectionLast(kids, before, after, index, end);
    if (last > index && linksToTop(kids[last]!)) last--;
    const first = index + 1;
    if (last < first) continue;
    const body = kids.slice(first, last + 1);
    if (body.some((n) => n.type === 'html' && /^\s*<details\b/i.test(n.value))) continue;
    if (before[first]!.depth !== after[last]!.depth) continue;
    const lines = (kids[last]!.position?.end.line ?? 0) - (kids[first]!.position?.start.line ?? 0) + 1;
    if (!COLLAPSE_NAMES.has(normaliseName(headingText(heading))) && lines <= LONG_SECTION_LINES) continue;
    const title = stripEmoji(headingText(heading)).replace(/\s+/g, ' ').trim().toLowerCase() || 'more';
    const start = blockStart(markdown, kids[first]!);
    const stop = endOffset(kids[last]!);
    const text = `<details>\n<summary>Show ${escapeHtml(title)}</summary>\n\n${markdown.slice(start, stop)}\n\n</details>`;
    splices.push({ start, end: stop, text: text + gapAfter(markdown, stop) });
  }
  return applySplices(markdown, splices);
}

// ---------------------------------------------------------------------------
// 9. addEssentials

const GETTING_STARTED = ['getting started', 'get started', 'quick start', 'quickstart'];
const INSTALL_NAMES = new Set(['installation', 'install', 'installing', 'setup', 'set up', ...GETTING_STARTED]);
const USAGE_NAMES = new Set(['usage', 'how to use', 'basic usage', 'examples', 'example', ...GETTING_STARTED]);
const LICENCE_NAMES = new Set(['license', 'licence', 'licensing', 'copyright']);
const CLOSING_NAMES = new Set([
  'contributing', 'contribute', 'contribution', 'contributions', 'how to contribute', 'contributors',
  'license', 'licence', 'licensing', 'acknowledgements', 'acknowledgments', 'credits', 'thanks',
  'contact', 'support', 'authors', 'author', 'maintainers', 'sponsors',
]);

const INSTALL_BLOCK = [
  '## Installation',
  '',
  '```bash',
  'git clone https://github.com/your-username/your-repo.git',
  'cd your-repo',
  'npm install',
  '```',
].join('\n');
const USAGE_BLOCK = ['## Usage', '', 'Explain how to use the project here, with a short example.', '', '```bash', 'npm start', '```'].join('\n');
const LICENCE_BLOCK = ['## Licence', '', 'Add your licence here, for example MIT, or © 2026 Your Name. All rights reserved.'].join('\n');

/**
 * Appends placeholder Installation, Usage and Licence sections when missing:
 * Installation before Usage, both before Contributing/Licence-style closing
 * sections, and Licence last.
 */
export function addEssentials(markdown: string): string {
  const tree = parse(markdown);
  const kids = tree.children;
  const headings = kids.flatMap((node, i) => (node.type === 'heading' ? [{ node, i, name: normaliseName(headingText(node)) }] : []));
  const find = (names: Set<string>) => headings.find((h) => names.has(h.name));
  const install = find(INSTALL_NAMES);
  const usage = find(USAGE_NAMES);
  const licence = find(LICENCE_NAMES);
  if (install && usage && licence) return markdown;

  // New sections only ever go right before an H1/H2 or at the end, so no heading level gets skipped.
  const top = headings.filter((h) => h.node.depth <= 2);
  const usageTop = top.find((h) => USAGE_NAMES.has(h.name));
  const closing = top.find((h) => h.node.depth === 2 && CLOSING_NAMES.has(h.name));
  const lastKid = kids[kids.length - 1];
  const insideFence = lastKid?.type === 'code' && fenceOf(markdown, lastKid)?.close === null;
  const splices: Splice[] = [];
  const beforeNode = (index: number, block: string): void => {
    const at = blockStart(markdown, kids[index]!);
    splices.push({ start: at, end: at, text: `${block}\n\n` });
  };
  const atEnd = (block: string): void => {
    if (insideFence) return;
    if (!lastKid) splices.push({ start: 0, end: 0, text: `${block}\n\n` });
    else splices.push(insertAfter(markdown, endOffset(lastKid), block));
  };

  if (!install) {
    const anchor = usageTop ?? closing;
    if (anchor) beforeNode(anchor.i, INSTALL_BLOCK);
    else atEnd(INSTALL_BLOCK);
  }
  if (!usage) {
    const next = install ? top.find((h) => h.i > install.i) : closing;
    if (next) beforeNode(next.i, USAGE_BLOCK);
    else atEnd(USAGE_BLOCK);
  }
  if (!licence) atEnd(LICENCE_BLOCK);
  return applySplices(markdown, splices);
}

