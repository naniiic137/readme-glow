/**
 * A fast, line-based Markdown scanner for the README health check.
 *
 * `parseMarkdown` (remark / micromark) is exact but needs roughly 40–60 ms for
 * a 1000-line README, and the health check runs on every (debounced) edit with
 * a budget of ~15 ms. This scanner is linear and approximate: it knows the
 * block structures the checks care about (ATX and setext headings, fenced and
 * indented code, `$$` math, HTML blocks, GFM tables, list items, blockquotes,
 * link reference definitions) and finds links and images in prose with inline
 * code, escapes and comments masked out. Offsets are UTF-16 indices into the
 * source, lines are 1-based.
 */

export type BlockKind = 'heading' | 'paragraph' | 'code' | 'math' | 'html' | 'table' | 'hr' | 'definition';

export interface Block {
  kind: BlockKind;
  /** Offset of the start of the block's first line. */
  start: number;
  /** Offset just past the block's last line (before its newline). */
  end: number;
  firstLine: number;
  lastLine: number;
  /** Not inside a blockquote or a list item. */
  top: boolean;
  quoted: boolean;
  listItem: boolean;
  /** Headings: level 1–6. */
  depth: number;
  /** Headings: raw inline source of the heading text. */
  text: string;
  setext: boolean;
  /** Headings: offset and length of the `#` run (ATX) or underline (setext). */
  marksStart: number;
  marksLen: number;
  /** Code: fenced (``` / ~~~) rather than indented. */
  fenced: boolean;
  lang: string;
  /** Fenced code: offset just past the opening fence characters. */
  fenceEnd: number;
  /** Visible words in the block. */
  words: number;
  /** Words outside links, images, code and title headings (used to spot a description). */
  proseWords: number;
}

export interface HeadingInfo {
  depth: number;
  /** Rendered text (markup stripped). */
  text: string;
  line: number;
  kind: 'md' | 'html';
  blockIndex: number;
}

export interface ImageInfo {
  kind: 'md' | 'html';
  alt: string;
  hasAlt: boolean;
  url: string;
  line: number;
  /** Whole image (`![..](..)` or the `<img>` tag). */
  start: number;
  end: number;
  /** Markdown images: the alt text range. */
  altStart: number;
  altEnd: number;
}

export interface LinkInfo {
  kind: 'md' | 'ref' | 'html';
  url: string;
  text: string;
  line: number;
  start: number;
  end: number;
  /** Markdown links: the link text range. */
  textStart: number;
  textEnd: number;
  emptyUrl: boolean;
  emptyText: boolean;
}

export interface ProseSegment {
  /** Offset of `text[0]` in the source; `text` has the same length as the source slice. */
  start: number;
  /** Visible prose with code, URLs, tags and image syntax blanked out (same length as the source). */
  text: string;
}

export interface DocScan {
  source: string;
  /** Offsets of line starts; `lineStarts[n - 1]` is line n. */
  lineStarts: number[];
  blocks: Block[];
  headings: HeadingInfo[];
  images: ImageInfo[];
  links: LinkInfo[];
  /** Bare URLs and autolinks in prose. */
  urls: string[];
  /** HTML `id` / `name` attribute values, lower-cased. */
  ids: Set<string>;
  hasVideo: boolean;
  licenceMention: boolean;
  prose: ProseSegment[];
  /** 1 for lines inside code, math, HTML, tables and definitions (index = line number). */
  excluded: Uint8Array;
  words: number;
  lineOf(offset: number): number;
}

// ------------------------------------------------------------------ helpers

const RE_QUOTE = /^(?: {0,3}>[ \t]?)+/;
const RE_ATX = /^(#{1,6})(?=[ \t]|$)(.*)$/;
const RE_SETEXT = /^(=+|-+)[ \t]*$/;
const RE_HR = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const RE_FENCE = /^(`{3,}|~{3,})(.*)$/;
const RE_LIST = /^([-*+]|\d{1,9}[.)])(?:([ \t]+)|$)/;
const RE_DEF = /^\[((?:[^\\\]]|\\.){1,999})\]:[ \t]*(<[^>\n]*>|[^\s<]\S*)[ \t]*(?:(?:"[^"]*"|'[^']*'|\([^)]*\))[ \t]*)?$/;
const RE_TABLE_DELIM = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const RE_HTML_OPEN = /^<(?:(!--)|(\?)|(![A-Za-z])|(!\[CDATA\[)|\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$))/;
const RE_COMPLETE_TAG =
  /^(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)\s*$/;
const HTML_BLOCK_TAGS = new Set(
  (
    'address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt ' +
    'fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link ' +
    'main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead ' +
    'title tr track ul'
  ).split(' '),
);
const RE_TAG = /<([A-Za-z][A-Za-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const RE_ANY_TAG = /<\/?[A-Za-z][^>]*>/g;
const RE_BARE_URL = /\b(?:https?:\/\/|www\.)[^\s<>()[\]]+/g;
const RE_LIST_MARKER_LINE = /^([ \t>]*)((?:[-*+]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?)(?=[ \t]|$)/gm;
export const LICENCE_RE = /licen[cs]|©|&copy;|\(c\)\s*\d{4}|all rights reserved|copyright/i;
const WORD_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿]|[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const RE_AUTOLINK = /<((?:https?|ftp|mailto):[^\s<>]*)>/gi;

/** Counts words; CJK characters count as half a word each. */
export function countWords(text: string): number {
  let words = 0;
  let cjk = 0;
  WORD_RE.lastIndex = 0;
  for (let m = WORD_RE.exec(text); m; m = WORD_RE.exec(text)) {
    const w = m[0];
    const code = w.charCodeAt(0);
    if (w.length === 1 && code >= 0x3040 && code <= 0xfaff) cjk++;
    else words++;
  }
  return words + Math.ceil(cjk / 2);
}

/** Visual indent width (tabs to multiples of 4) and the number of characters it spans. */
function indentOf(s: string): { width: number; chars: number } {
  let width = 0;
  let i = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === ' ') width++;
    else if (c === '\t') width += 4 - (width % 4);
    else break;
  }
  return { width, chars: i };
}

/** Characters to drop from `s` to remove `cols` columns of indentation. */
function charsForColumns(s: string, cols: number): number {
  let width = 0;
  let i = 0;
  while (i < s.length && width < cols) {
    const c = s[i];
    if (c === ' ') width++;
    else if (c === '\t') width += 4 - (width % 4);
    else break;
    i++;
  }
  return i;
}

export function normaliseLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function unescapeMd(s: string): string {
  return s.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function blankRange(chars: string[], from: number, to: number): void {
  for (let i = Math.max(0, from); i < to && i < chars.length; i++) if (chars[i] !== '\n') chars[i] = ' ';
}

/** Masks backslash escapes, code spans and HTML comments with spaces (same length). */
export function maskInline(s: string): string {
  const out = s.split('');
  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '\\' && i + 1 < n && /[!-/:-@[-`{-~]/.test(s[i + 1]!)) {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
    } else if (c === '`') {
      let run = 1;
      while (s[i + run] === '`') run++;
      let j = i + run;
      let close = -1;
      while (j < n) {
        const k = s.indexOf('`', j);
        if (k === -1) break;
        let r = 1;
        while (s[k + r] === '`') r++;
        if (r === run) {
          close = k;
          break;
        }
        j = k + r;
      }
      if (close === -1) i += run;
      else {
        blankRange(out, i, close + run);
        i = close + run;
      }
    } else if (c === '<' && s.startsWith('<!--', i)) {
      const k = s.indexOf('-->', i + 4);
      const stop = k === -1 ? n : k + 3;
      blankRange(out, i, stop);
      i = stop;
    } else i++;
  }
  return out.join('');
}

/** Replaces HTML comments with spaces (same length). */
export function maskComments(s: string): string {
  return s.replace(/<!--[\s\S]*?(?:-->|$)/g, (m) => m.replace(/[^\n]/g, ' '));
}

export interface AttrMatch {
  value: string;
  /** Start and end of the attribute name inside the tag string. */
  nameStart: number;
  nameEnd: number;
  /** Start and end of the value inside the tag string, or -1 for a bare attribute. */
  valueStart: number;
  valueEnd: number;
}

const RE_TAG_NAME = /^<\/?[A-Za-z][A-Za-z0-9-]*/;
const RE_ATTR = /\s*([^\s"'=<>/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/dy;

/** Reads an attribute from a tag string like `<img src="x" alt="">` (null when absent). */
export function getAttr(tag: string, name: string): AttrMatch | null {
  let i = RE_TAG_NAME.exec(tag)?.[0].length ?? 0;
  while (i < tag.length) {
    RE_ATTR.lastIndex = i;
    const m = RE_ATTR.exec(tag);
    if (!m || RE_ATTR.lastIndex === i) {
      i++;
      continue;
    }
    i = RE_ATTR.lastIndex;
    if (m[1]!.toLowerCase() !== name) continue;
    const nameRange = m.indices?.[1] ?? [i, i];
    for (const g of [2, 3, 4]) {
      const v = m[g];
      const range = m.indices?.[g];
      if (v !== undefined && range) {
        return { value: v, nameStart: nameRange[0], nameEnd: nameRange[1], valueStart: range[0], valueEnd: range[1] };
      }
    }
    return { value: '', nameStart: nameRange[0], nameEnd: nameRange[1], valueStart: -1, valueEnd: -1 };
  }
  return null;
}

interface RawLink {
  image: boolean;
  ref: boolean;
  start: number;
  end: number;
  textStart: number;
  textEnd: number;
  url: string;
  destStart: number;
  destEnd: number;
}

function isSpace(c: string | undefined): boolean {
  return c === ' ' || c === '\t' || c === '\n';
}

function parseInlineTail(m: string, open: number): { end: number; destStart: number; destEnd: number } | null {
  const n = m.length;
  let j = open + 1;
  while (j < n && isSpace(m[j])) j++;
  let destStart = j;
  let destEnd = j;
  if (m[j] === '<') {
    const close = m.indexOf('>', j + 1);
    const nl = m.indexOf('\n', j + 1);
    if (close === -1 || (nl !== -1 && nl < close)) return null;
    destStart = j + 1;
    destEnd = close;
    j = close + 1;
  } else {
    let depth = 0;
    while (j < n) {
      const c = m[j];
      if (isSpace(c)) break;
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) break;
        depth--;
      }
      j++;
    }
    destEnd = j;
  }
  while (j < n && isSpace(m[j])) j++;
  const q = m[j];
  if ((q === '"' || q === "'" || q === '(') && j > destEnd) {
    const closeCh = q === '(' ? ')' : q;
    const k = m.indexOf(closeCh, j + 1);
    if (k === -1) return null;
    j = k + 1;
    while (j < n && isSpace(m[j])) j++;
  }
  if (m[j] !== ')') return null;
  return { end: j + 1, destStart, destEnd };
}

/** Finds inline links, images and reference links in masked text. */
function findLinks(m: string, s: string, defs: Map<string, string>): RawLink[] {
  const items: RawLink[] = [];
  const stack: Array<{ pos: number; image: boolean }> = [];
  const dropLinkOpeners = () => {
    for (let k = stack.length - 1; k >= 0; k--) if (!stack[k]!.image) stack.splice(k, 1);
  };
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === '!' && m[i + 1] === '[') {
      stack.push({ pos: i, image: true });
      i++;
      continue;
    }
    if (c === '[') {
      stack.push({ pos: i, image: false });
      continue;
    }
    if (c !== ']') continue;
    const op = stack.pop();
    if (!op) continue;
    const textStart = op.pos + (op.image ? 2 : 1);
    const textEnd = i;
    if (m[i + 1] === '(') {
      const tail = parseInlineTail(m, i + 1);
      if (tail) {
        items.push({
          image: op.image,
          ref: false,
          start: op.pos,
          end: tail.end,
          textStart,
          textEnd,
          url: unescapeMd(s.slice(tail.destStart, tail.destEnd)),
          destStart: tail.destStart,
          destEnd: tail.destEnd,
        });
        if (!op.image) dropLinkOpeners();
        i = tail.end - 1;
        continue;
      }
    }
    let label = s.slice(textStart, textEnd);
    let end = i + 1;
    if (m[i + 1] === '[') {
      const close = m.indexOf(']', i + 2);
      if (close !== -1 && !m.slice(i + 2, close).includes('[')) {
        const explicit = s.slice(i + 2, close);
        if (explicit.trim()) label = explicit;
        end = close + 1;
      }
    }
    if (label.startsWith('^') || !label.trim()) continue;
    const url = defs.get(normaliseLabel(label));
    if (url === undefined) continue;
    items.push({ image: op.image, ref: true, start: op.pos, end, textStart, textEnd, url, destStart: -1, destEnd: -1 });
    if (!op.image) dropLinkOpeners();
    i = end - 1;
  }
  return items;
}

function stripTags(s: string): string {
  return s.replace(RE_ANY_TAG, (t) => ' '.repeat(t.length));
}

/** Rendered text of a Markdown heading, close to what GitHub slugs. */
export function headingPlainText(raw: string): string {
  const masked = maskInline(raw);
  const chars = raw.split('');
  // Code spans keep their content (minus backticks); escapes keep the escaped char.
  for (let i = 0; i < raw.length; i++) {
    if (masked[i] === ' ' && raw[i] !== ' ') {
      if (raw[i] === '`' || (raw[i] === '\\' && /[!-/:-@[-`{-~]/.test(raw[i + 1] ?? ''))) chars[i] = '';
    }
  }
  for (const item of findLinks(masked, raw, new Map())) {
    if (item.image) for (let k = item.start; k < item.end; k++) chars[k] = '';
    else {
      chars[item.start] = '';
      for (let k = item.textEnd; k < item.end; k++) chars[k] = '';
    }
  }
  // Emphasis underscores at word edges (outside code spans); snake_case stays.
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '_' || masked[i] !== '_') continue;
    let j = i;
    while (raw[j] === '_' && masked[j] === '_') j++;
    const intraword = WORD_CHAR.test(raw[i - 1] ?? ' ') && WORD_CHAR.test(raw[j] ?? ' ');
    if (!intraword) for (let k = i; k < j; k++) chars[k] = '';
    i = j - 1;
  }
  return decodeEntities(
    chars
      .join('')
      .replace(/<[^>]*>/g, '')
      .replace(/:[a-z0-9_+-]+:/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------------ scanner

function newBlock(kind: BlockKind, start: number, end: number, line: number, quoted: boolean, listItem: boolean): Block {
  return {
    kind,
    start,
    end,
    firstLine: line,
    lastLine: line,
    top: !quoted && !listItem,
    quoted,
    listItem,
    depth: 0,
    text: '',
    setext: false,
    marksStart: -1,
    marksLen: 0,
    fenced: false,
    lang: '',
    fenceEnd: -1,
    words: 0,
    proseWords: 0,
  };
}

function extend(b: Block, line: number, end: number): void {
  b.lastLine = line;
  b.end = end;
}

function htmlBlockStart(t: string, paraOpen: boolean): { end: RegExp | null; openLen: number } | null {
  const m = RE_HTML_OPEN.exec(t);
  if (!m) return null;
  const openLen = m[0].length;
  if (m[1]) return { end: /-->/, openLen };
  if (m[2]) return { end: /\?>/, openLen };
  if (m[3]) return { end: />/, openLen };
  if (m[4]) return { end: /\]\]>/, openLen };
  const tag = (m[5] ?? '').toLowerCase();
  const closing = t[1] === '/';
  if (!closing && /^(?:script|pre|style|textarea)$/.test(tag)) return { end: /<\/(?:script|pre|style|textarea)>/i, openLen };
  if (HTML_BLOCK_TAGS.has(tag)) return { end: null, openLen };
  if (!paraOpen && RE_COMPLETE_TAG.test(t)) return { end: null, openLen };
  return null;
}

function startsBlock(t: string): boolean {
  return (
    RE_ATX.test(t) ||
    RE_FENCE.test(t) ||
    RE_HR.test(t) ||
    t.startsWith('>') ||
    t.startsWith('$$') ||
    htmlBlockStart(t, true) !== null
  );
}

function splitLines(source: string): number[] {
  const starts = [0];
  for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

/** Scans a README into blocks, headings, links and images. */
export function scanMarkdown(source: string): DocScan {
  const lineStarts = splitLines(source);
  const lineCount = lineStarts.length;
  const lineEnd = (li: number): number => (li + 1 < lineCount ? lineStarts[li + 1]! - 1 : source.length);
  const lineOf = (offset: number): number => {
    let lo = 0;
    let hi = lineCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const blocks: Block[] = [];
  const defs = new Map<string, string>();
  let fence: { block: Block; ch: string; len: number; quote: number } | null = null;
  let math: { block: Block; quote: number } | null = null;
  let html: { block: Block; end: RegExp | null } | null = null;
  let icode: Block | null = null;
  let para: Block | null = null;
  let table: Block | null = null;
  let listIndent: number | null = null;
  let prevBlank = true;

  const push = (b: Block): Block => {
    blocks.push(b);
    return b;
  };

  for (let li = 0; li < lineCount; li++) {
    const start = lineStarts[li]!;
    const end = lineEnd(li);
    const lineNo = li + 1;
    const raw = source.slice(start, end);
    const qm = RE_QUOTE.exec(raw);
    const qDepth = qm ? (qm[0].match(/>/g) ?? []).length : 0;
    const qLen = qm ? qm[0].length : 0;
    const content = raw.slice(qLen);
    const blank = content.trim() === '';

    if (fence) {
      if (fence.quote > 0 && qDepth < fence.quote) fence = null;
      else {
        extend(fence.block, lineNo, end);
        const t = content.trimStart();
        if (t[0] === fence.ch) {
          let run = 0;
          while (t[run] === fence.ch) run++;
          if (run >= fence.len && t.slice(run).trim() === '') fence = null;
        }
        continue;
      }
    }
    if (math) {
      if (math.quote > 0 && qDepth < math.quote) math = null;
      else {
        extend(math.block, lineNo, end);
        if (content.trimEnd().endsWith('$$')) math = null;
        continue;
      }
    }
    if (html) {
      if (html.end) {
        extend(html.block, lineNo, end);
        if (html.end.test(content)) html = null;
        continue;
      }
      if (blank) html = null;
      else {
        extend(html.block, lineNo, end);
        continue;
      }
    }
    if (icode) {
      if (!blank && indentOf(content).width >= 4 + (listIndent ?? 0)) {
        extend(icode, lineNo, end);
        continue;
      }
      if (!blank) icode = null;
    }
    const wasBlank = prevBlank;
    if (blank) {
      para = null;
      table = null;
      prevBlank = true;
      continue;
    }
    prevBlank = false;
    const quoted = qDepth > 0;

    if (table) {
      const t = content.trimStart();
      if (!startsBlock(t)) {
        extend(table, lineNo, end);
        continue;
      }
      table = null;
    }

    // List continuation: content indented to the open item's content column.
    const ind = indentOf(content);
    let rel = content;
    let relStart = start + qLen;
    let inList = false;
    let relIndent = ind.width;
    if (listIndent !== null) {
      const trimmed = content.slice(ind.chars);
      if (ind.width >= listIndent) {
        const drop = charsForColumns(content, listIndent);
        rel = content.slice(drop);
        relStart += drop;
        relIndent = ind.width - listIndent;
        inList = true;
      } else if (!RE_LIST.test(trimmed) || RE_HR.test(trimmed)) {
        if (!wasBlank && para && !startsBlock(trimmed)) {
          extend(para, lineNo, end);
          continue;
        }
        listIndent = null;
      }
    }
    const relInd = indentOf(rel);
    const t = rel.slice(relInd.chars);
    const tStart = relStart + relInd.chars;

    if (relIndent >= 4) {
      if (para) {
        extend(para, lineNo, end);
        continue;
      }
      icode = push(newBlock('code', start, end, lineNo, quoted, inList));
      continue;
    }

    const fm = RE_FENCE.exec(t);
    if (fm && !(fm[1]![0] === '`' && fm[2]!.includes('`'))) {
      para = null;
      const b = push(newBlock('code', start, end, lineNo, quoted, inList));
      b.fenced = true;
      b.lang = fm[2]!.trim().split(/\s+/)[0] ?? '';
      b.fenceEnd = tStart + fm[1]!.length;
      fence = { block: b, ch: fm[1]![0]!, len: fm[1]!.length, quote: qDepth };
      continue;
    }

    if (t.startsWith('$$') && !t.slice(2).includes('$$')) {
      para = null;
      const b = push(newBlock('math', start, end, lineNo, quoted, inList));
      math = { block: b, quote: qDepth };
      continue;
    }

    const hm = RE_ATX.exec(t);
    if (hm) {
      para = null;
      const b = push(newBlock('heading', start, end, lineNo, quoted, inList));
      b.depth = hm[1]!.length;
      b.text = hm[2]!.replace(/[ \t]+#+[ \t]*$/, '').replace(/^[ \t]*#+[ \t]*$/, '').trim();
      b.marksStart = tStart;
      b.marksLen = b.depth;
      continue;
    }

    if (para && para.quoted === quoted && para.listItem === inList && RE_SETEXT.test(t)) {
      const b = para;
      b.kind = 'heading';
      b.setext = true;
      b.depth = t[0] === '=' ? 1 : 2;
      b.text = source
        .slice(b.start, b.end)
        .split('\n')
        .map((l, i) => {
          const s = l.replace(RE_QUOTE, '').trim();
          return i === 0 && b.listItem ? s.replace(/^(?:[-*+]|\d{1,9}[.)])[ \t]+/, '') : s;
        })
        .join(' ')
        .trim();
      b.marksStart = tStart;
      b.marksLen = t.trimEnd().length;
      extend(b, lineNo, end);
      para = null;
      continue;
    }

    if (RE_HR.test(t)) {
      para = null;
      push(newBlock('hr', start, end, lineNo, quoted, inList));
      continue;
    }

    const hb = htmlBlockStart(t, para !== null && !wasBlank);
    if (hb) {
      para = null;
      const b = push(newBlock('html', start, end, lineNo, quoted, inList));
      if (!hb.end || !hb.end.test(t.slice(hb.openLen))) html = { block: b, end: hb.end };
      continue;
    }

    const lm = RE_LIST.exec(t);
    if (lm && !(para && /^\d/.test(lm[1]!) && !/^1[.)]$/.test(lm[1]!))) {
      para = null;
      const spaces = lm[2] ?? '';
      const spaceW = indentOf(spaces).width;
      const base: number = inList && listIndent !== null ? listIndent : 0;
      const markerCol = base + relInd.width;
      listIndent = markerCol + lm[1]!.length + (spaceW === 0 || spaceW > 4 ? 1 : spaceW);
      const itemText = t.slice(lm[0].length);
      const itemStart = tStart + lm[0].length;
      const ih = RE_ATX.exec(itemText);
      const ifm = RE_FENCE.exec(itemText);
      if (ih) {
        const b = push(newBlock('heading', start, end, lineNo, quoted, true));
        b.depth = ih[1]!.length;
        b.text = ih[2]!.replace(/[ \t]+#+[ \t]*$/, '').trim();
        b.marksStart = itemStart;
        b.marksLen = b.depth;
      } else if (ifm && !(ifm[1]![0] === '`' && ifm[2]!.includes('`'))) {
        const b = push(newBlock('code', start, end, lineNo, quoted, true));
        b.fenced = true;
        b.lang = ifm[2]!.trim().split(/\s+/)[0] ?? '';
        b.fenceEnd = itemStart + ifm[1]!.length;
        fence = { block: b, ch: ifm[1]![0]!, len: ifm[1]!.length, quote: qDepth };
      } else if (itemText.trim()) {
        para = push(newBlock('paragraph', start, end, lineNo, quoted, true));
      }
      continue;
    }

    if (!para || wasBlank) {
      const dm = RE_DEF.exec(t);
      if (dm && !dm[1]!.startsWith('^')) {
        para = null;
        push(newBlock('definition', start, end, lineNo, quoted, inList));
        const url = dm[2]!.startsWith('<') ? dm[2]!.slice(1, -1) : dm[2]!;
        const key = normaliseLabel(dm[1]!);
        if (!defs.has(key)) defs.set(key, unescapeMd(url));
        continue;
      }
    }

    if (t.includes('|') && li + 1 < lineCount) {
      const next = source.slice(lineStarts[li + 1]!, lineEnd(li + 1)).replace(RE_QUOTE, '').trim();
      if (RE_TABLE_DELIM.test(next) && next.includes('-') && next.includes('|')) {
        para = null;
        const b = push(newBlock('table', start, lineEnd(li + 1), lineNo, quoted, inList));
        b.lastLine = lineNo + 1;
        li++;
        table = b;
        continue;
      }
    }

    if (para && !wasBlank && !(quoted && !para.quoted)) extend(para, lineNo, end);
    else para = push(newBlock('paragraph', start, end, lineNo, quoted, inList));
  }

  // ---------------------------------------------------------------- content pass
  const excluded = new Uint8Array(lineCount + 2);
  const scan: DocScan = {
    source,
    lineStarts,
    blocks,
    headings: [],
    images: [],
    links: [],
    urls: [],
    ids: new Set(),
    hasVideo: false,
    licenceMention: false,
    prose: [],
    excluded,
    words: 0,
    lineOf,
  };

  blocks.forEach((b, bi) => {
    const raw = source.slice(b.start, b.end);
    switch (b.kind) {
      case 'code':
      case 'math':
        for (let l = b.firstLine; l <= b.lastLine; l++) excluded[l] = 1;
        return;
      case 'hr':
        return;
      case 'definition':
        excluded[b.firstLine] = 1;
        if (LICENCE_RE.test(raw)) scan.licenceMention = true;
        return;
      case 'html':
        for (let l = b.firstLine; l <= b.lastLine; l++) excluded[l] = 1;
        scanHtml(scan, b, bi, raw, true);
        return;
      case 'table':
        for (let l = b.firstLine; l <= b.lastLine; l++) excluded[l] = 1;
        break;
      default:
        break;
    }
    if (LICENCE_RE.test(raw)) scan.licenceMention = true;
    if (b.kind === 'heading') {
      scan.headings.push({ depth: b.depth, text: headingPlainText(b.text), line: b.firstLine, kind: 'md', blockIndex: bi });
    }
    scanProse(scan, b, raw, defs);
  });
  return scan;
}

function scanProse(scan: DocScan, b: Block, raw: string, defs: Map<string, string>): void {
  const masked = maskInline(raw);
  const plain = masked.split('');
  if (b.kind === 'heading') {
    // Drop the # run / setext underline.
    blankRange(plain, b.marksStart - b.start, b.marksStart - b.start + b.marksLen);
  }
  if (b.kind === 'paragraph' || b.kind === 'heading') {
    RE_LIST_MARKER_LINE.lastIndex = 0;
    for (let m = RE_LIST_MARKER_LINE.exec(masked); m; m = RE_LIST_MARKER_LINE.exec(masked)) {
      blankRange(plain, m.index + m[1]!.length, m.index + m[0].length);
    }
  }
  const linkText: Array<[number, number]> = [];
  for (const item of findLinks(masked, raw, defs)) {
    const abs = b.start + item.start;
    const line = scan.lineOf(abs);
    if (item.image) {
      const alt = raw.slice(item.textStart, item.textEnd);
      scan.images.push({
        kind: 'md',
        alt,
        hasAlt: alt.trim() !== '',
        url: item.url,
        line,
        start: abs,
        end: b.start + item.end,
        altStart: b.start + item.textStart,
        altEnd: b.start + item.textEnd,
      });
      blankRange(plain, item.start, item.end);
    } else {
      const text = raw.slice(item.textStart, item.textEnd);
      scan.links.push({
        kind: item.ref ? 'ref' : 'md',
        url: item.url,
        text,
        line,
        start: abs,
        end: b.start + item.end,
        textStart: b.start + item.textStart,
        textEnd: b.start + item.textEnd,
        emptyUrl: item.url.trim() === '',
        emptyText: text.trim() === '',
      });
      blankRange(plain, item.start, item.start + 1);
      blankRange(plain, item.textEnd, item.end);
      linkText.push([item.textStart, item.textEnd]);
    }
  }
  // Autolinks, inline HTML tags and bare URLs.
  RE_AUTOLINK.lastIndex = 0;
  for (let m = RE_AUTOLINK.exec(masked); m; m = RE_AUTOLINK.exec(masked)) {
    scan.urls.push(m[1]!);
    blankRange(plain, m.index, m.index + m[0].length);
  }
  scanTags(scan, masked, b.start, false, -1);
  RE_ANY_TAG.lastIndex = 0;
  for (let m = RE_ANY_TAG.exec(masked); m; m = RE_ANY_TAG.exec(masked)) blankRange(plain, m.index, m.index + m[0].length);
  RE_BARE_URL.lastIndex = 0;
  const plainStr0 = plain.join('');
  for (let m = RE_BARE_URL.exec(plainStr0); m; m = RE_BARE_URL.exec(plainStr0)) {
    scan.urls.push(m[0]);
    blankRange(plain, m.index, m.index + m[0].length);
  }
  const text = plain.join('');
  b.words = countWords(text);
  if (linkText.length) {
    const noLinks = text.split('');
    for (const [s, e] of linkText) blankRange(noLinks, s, e);
    b.proseWords = countWords(noLinks.join(''));
  } else b.proseWords = b.words;
  scan.words += b.words;
  scan.prose.push({ start: b.start, text });
}

function scanHtml(scan: DocScan, b: Block, bi: number, raw: string, block: boolean): void {
  const masked = maskComments(raw);
  if (LICENCE_RE.test(masked)) scan.licenceMention = true;
  scanTags(scan, masked, b.start, block, bi);
  const visible = stripTags(masked);
  b.words = countWords(decodeEntities(visible));
  // Description words: skip links and title/section headings.
  const noNav = masked
    .replace(/<a\b[\s\S]*?<\/a\s*>/gi, (m) => ' '.repeat(m.length))
    .replace(/<h[12]\b[\s\S]*?(?:<\/h[12]\s*>|$)/gi, (m) => ' '.repeat(m.length));
  b.proseWords = countWords(decodeEntities(stripTags(noNav)));
  scan.words += b.words;
  scan.prose.push({ start: b.start, text: visible });
}

function scanTags(scan: DocScan, masked: string, base: number, block: boolean, bi: number): void {
  if (!masked.includes('<')) return;
  const lower = block ? masked.toLowerCase() : '';
  RE_TAG.lastIndex = 0;
  for (let m = RE_TAG.exec(masked); m; m = RE_TAG.exec(masked)) {
    const name = m[1]!.toLowerCase();
    const tag = m[0];
    const abs = base + m.index;
    const id = getAttr(tag, 'id') ?? getAttr(tag, 'name');
    if (id && id.value) scan.ids.add(id.value.toLowerCase());
    if (name === 'img') {
      const alt = getAttr(tag, 'alt');
      const src = getAttr(tag, 'src');
      scan.images.push({
        kind: 'html',
        alt: alt?.value ?? '',
        hasAlt: alt !== null && alt.value.trim() !== '',
        url: src?.value ?? '',
        line: scan.lineOf(abs),
        start: abs,
        end: abs + tag.length,
        altStart: -1,
        altEnd: -1,
      });
    } else if (name === 'a') {
      const href = getAttr(tag, 'href');
      if (href) {
        scan.links.push({
          kind: 'html',
          url: href.value,
          text: '',
          line: scan.lineOf(abs),
          start: abs,
          end: abs + tag.length,
          textStart: -1,
          textEnd: -1,
          emptyUrl: href.value.trim() === '',
          emptyText: false,
        });
      }
    } else if (name === 'video' || (name === 'iframe' && /youtube|vimeo|loom/i.test(tag))) {
      scan.hasVideo = true;
    } else if (block && /^h[1-6]$/.test(name)) {
      const depth = Number(name[1]);
      const after = m.index + tag.length;
      const close = lower.indexOf(`</h${depth}`, after);
      const text = decodeEntities(stripTags(masked.slice(after, close === -1 ? masked.length : close)))
        .replace(/\s+/g, ' ')
        .trim();
      scan.headings.push({ depth, text, line: scan.lineOf(abs), kind: 'html', blockIndex: bi });
    }
  }
}
