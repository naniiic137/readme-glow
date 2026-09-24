import type { Change, Command, CommandResult, Sel } from './types';

/**
 * Markdown formatting commands for the editor toolbar and keyboard shortcuts.
 * Every command is a pure function of the document and the main selection:
 * it returns the changes (in original-document coordinates, sorted, never
 * overlapping) plus the selection afterwards, or null when it does not apply.
 * Documents are assumed to use LF line endings.
 */

// ------------------------------------------------------------------ text helpers

interface Line {
  from: number;
  to: number;
  text: string;
}

function lineAt(doc: string, pos: number): Line {
  const from = pos <= 0 ? 0 : doc.lastIndexOf('\n', pos - 1) + 1;
  let to = doc.indexOf('\n', pos);
  if (to === -1) to = doc.length;
  return { from, to, text: doc.slice(from, to) };
}

/** Lines touched by a selection; a selection ending at a line start does not touch that line. */
function touchedLines(doc: string, sel: Sel): Line[] {
  const end = sel.to > sel.from && doc[sel.to - 1] === '\n' ? sel.to - 1 : sel.to;
  const lines: Line[] = [];
  let line = lineAt(doc, sel.from);
  for (;;) {
    lines.push(line);
    if (line.to >= end || line.to >= doc.length) break;
    line = lineAt(doc, line.to + 1);
  }
  return lines;
}

function isHigh(doc: string, i: number): boolean {
  const c = doc.charCodeAt(i);
  return c >= 0xd800 && c <= 0xdbff;
}

function isLow(doc: string, i: number): boolean {
  const c = doc.charCodeAt(i);
  return c >= 0xdc00 && c <= 0xdfff;
}

/** Orders and clamps a selection and never lets it split a surrogate pair. */
function normSel(doc: string, sel: Sel): Sel {
  let from = Math.max(0, Math.min(sel.from, sel.to, doc.length));
  let to = Math.min(doc.length, Math.max(sel.from, sel.to, 0));
  if (from > 0 && isLow(doc, from) && isHigh(doc, from - 1)) from--;
  if (to > 0 && to < doc.length && isLow(doc, to) && isHigh(doc, to - 1)) to++;
  return { from, to };
}

function sortChanges(changes: Change[]): Change[] {
  return [...changes].sort((a, b) => a.from - b.from || a.to - b.to);
}

/** Maps a position in the original document through a change list. */
function mapPos(pos: number, changes: readonly Change[], assoc: -1 | 1 = 1): number {
  let delta = 0;
  for (const c of changes) {
    if (c.from > pos) break;
    if (c.to < pos) {
      delta += c.insert.length - (c.to - c.from);
      continue;
    }
    if (c.from === c.to) {
      // Insertion exactly at pos.
      if (assoc < 0) return pos + delta;
      delta += c.insert.length;
      continue;
    }
    if (pos === c.to) return c.from + delta + c.insert.length;
    return assoc < 0 ? c.from + delta : c.from + delta + c.insert.length;
  }
  return pos + delta;
}

function result(changes: Change[], anchor: number, head: number = anchor): CommandResult {
  return { changes, selection: { anchor, head } };
}

function mapped(changes: Change[], sel: Sel): CommandResult {
  const sorted = sortChanges(changes);
  const anchor = mapPos(sel.from, sorted, 1);
  const head = sel.from === sel.to ? anchor : Math.max(anchor, mapPos(sel.to, sorted, -1));
  return result(sorted, anchor, head);
}

function runBefore(doc: string, pos: number, ch: string, limit = 0): number {
  let n = 0;
  while (pos - n - 1 >= limit && doc[pos - n - 1] === ch) n++;
  return n;
}

function runAfter(doc: string, pos: number, ch: string, limit = doc.length): number {
  let n = 0;
  while (pos + n < limit && doc[pos + n] === ch) n++;
  return n;
}

function charBefore(doc: string, pos: number): string {
  if (pos <= 0) return '';
  if (pos >= 2 && isLow(doc, pos - 1) && isHigh(doc, pos - 2)) return doc.slice(pos - 2, pos);
  return doc[pos - 1]!;
}

function charAt(doc: string, pos: number): string {
  if (pos >= doc.length) return '';
  return String.fromCodePoint(doc.codePointAt(pos)!);
}

const WORD_CHAR = /^[\p{L}\p{N}\p{M}_]$/u;
const APOSTROPHE = /^['’]$/;

function isWordChar(ch: string): boolean {
  return ch !== '' && WORD_CHAR.test(ch);
}

/** The word around (or touching) the cursor, apostrophes inside words included. */
function wordAt(doc: string, pos: number): Sel | null {
  let from = pos;
  let to = pos;
  for (let ch = charBefore(doc, from); ch && (isWordChar(ch) || APOSTROPHE.test(ch)); ch = charBefore(doc, from)) from -= ch.length;
  for (let ch = charAt(doc, to); ch && (isWordChar(ch) || APOSTROPHE.test(ch)); ch = charAt(doc, to)) to += ch.length;
  while (from < to && APOSTROPHE.test(doc[from]!)) from++;
  while (to > from && APOSTROPHE.test(doc[to - 1]!)) to--;
  return from < to ? { from, to } : null;
}

/** Quote markers, list markers (with task box) or heading hashes at the start of a line. */
const BLOCK_PREFIX = /^[ \t]*(?:>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/;

/** Per-line pieces of a selection, without block prefixes and surrounding whitespace. */
function segments(doc: string, sel: Sel): Sel[] {
  const out: Sel[] = [];
  for (const line of touchedLines(doc, sel)) {
    let from = Math.max(line.from, sel.from);
    const prefixEnd = line.from + (BLOCK_PREFIX.exec(line.text)?.[0].length ?? 0);
    if (from < prefixEnd) from = prefixEnd;
    let to = Math.min(line.to, sel.to);
    while (from < to && /\s/.test(doc[from]!)) from++;
    while (to > from && /\s/.test(doc[to - 1]!)) to--;
    if (from < to) out.push({ from, to });
  }
  return out;
}

// ------------------------------------------------------------------ inline formatting

interface EmphasisSpec {
  /** Marker characters recognised when unwrapping, preferred first. */
  chars: readonly string[];
  /** Run lengths that mean "this formatting is applied". */
  accept(run: number): boolean;
  /** How many marker characters to remove on each side. */
  remove(before: number, after: number): number;
  /** Marker to add around [from, to). */
  marker(doc: string, from: number, to: number): string;
}

const BOLD: EmphasisSpec = {
  chars: ['*', '_'],
  accept: (n) => n === 2 || n === 3,
  remove: () => 2,
  marker: () => '**',
};

const ITALIC: EmphasisSpec = {
  chars: ['_', '*'],
  accept: (n) => n === 1 || n === 3,
  remove: () => 1,
  // `_` does not work inside words (snake_case), `*` does.
  marker: (doc, from, to) => (isWordChar(charBefore(doc, from)) || isWordChar(charAt(doc, to)) ? '*' : '_'),
};

const STRIKE: EmphasisSpec = {
  chars: ['~'],
  accept: (n) => n === 1 || n === 2,
  remove: (a, b) => Math.min(a, b),
  marker: () => '~~',
};

/**
 * Changes that remove this formatting from [from, to), or null when it is not
 * applied. Each marker may sit just inside the range (`[**x**]`) or just
 * outside it (`**[x]**`), independently on either side.
 */
function findWrap(doc: string, from: number, to: number, spec: EmphasisSpec): Change[] | null {
  for (const ch of spec.chars) {
    const lead = runAfter(doc, from, ch, to);
    const trail = runBefore(doc, to, ch, from);
    // [run length, offset where the text starts / ends]
    const starts: Array<[number, number]> = [
      [lead, from + lead],
      [runBefore(doc, from, ch), from],
    ];
    const ends: Array<[number, number]> = [
      [trail, to - trail],
      [runAfter(doc, to, ch), to],
    ];
    for (const [sRun, sEdge] of starts) {
      if (!spec.accept(sRun)) continue;
      for (const [eRun, eEdge] of ends) {
        if (!spec.accept(eRun) || eEdge <= sEdge) continue;
        const r = spec.remove(sRun, eRun);
        return [
          { from: sEdge - r, to: sEdge, insert: '' },
          { from: eEdge, to: eEdge + r, insert: '' },
        ];
      }
    }
  }
  return null;
}

function insertPair(doc: string, pos: number, spec: EmphasisSpec): CommandResult {
  const m = spec.marker(doc, pos, pos);
  return result([{ from: pos, to: pos, insert: m + m }], pos + m.length);
}

function toggleEmphasis(spec: EmphasisSpec, pairLen: number): Command {
  const run = (doc: string, sel: Sel): CommandResult => {
    const segs = segments(doc, sel);
    if (!segs.length) return insertPair(doc, sel.to, spec);
    const unwraps = segs.map((s) => findWrap(doc, s.from, s.to, spec));
    const changes: Change[] = [];
    if (unwraps.every((u) => u !== null)) {
      for (const u of unwraps) changes.push(...u!);
    } else {
      segs.forEach((s, i) => {
        if (unwraps[i]) return;
        const m = spec.marker(doc, s.from, s.to);
        changes.push({ from: s.from, to: s.from, insert: m }, { from: s.to, to: s.to, insert: m });
      });
    }
    return mapped(changes, sel);
  };
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    if (sel.from !== sel.to) return run(doc, sel);
    const pos = sel.from;
    // Cursor between an empty pair (**|**): remove it.
    for (const ch of spec.chars) {
      if (runBefore(doc, pos, ch) === pairLen && runAfter(doc, pos, ch) === pairLen) {
        return result([{ from: pos - pairLen, to: pos + pairLen, insert: '' }], pos - pairLen);
      }
    }
    const word = wordAt(doc, pos);
    return word ? run(doc, word) : insertPair(doc, pos, spec);
  };
}

/** Bold (`**x**`); also removes `__x__`. Empty selection: the word under the cursor. */
export const toggleBold: Command = toggleEmphasis(BOLD, 2);

/** Italic (`_x_`, or `*x*` inside a word); also removes `*x*`. */
export const toggleItalic: Command = toggleEmphasis(ITALIC, 1);

/** Strikethrough (`~~x~~`). */
export const toggleStrike: Command = toggleEmphasis(STRIKE, 2);

function longestRun(text: string, ch: string): number {
  let best = 0;
  let run = 0;
  for (const c of text) {
    run = c === ch ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** Inline code; a multi-line selection becomes a fenced code block instead. */
export const toggleInlineCode: Command = (doc, raw) => {
  const sel = normSel(doc, raw);
  if (sel.from !== sel.to && doc.slice(sel.from, sel.to).includes('\n')) return insertCodeBlock()(doc, sel);
  if (sel.from === sel.to) {
    const pos = sel.from;
    if (runBefore(doc, pos, '`') === 1 && runAfter(doc, pos, '`') === 1) {
      return result([{ from: pos - 1, to: pos + 1, insert: '' }], pos - 1);
    }
    const word = wordAt(doc, pos);
    if (!word) return result([{ from: pos, to: pos, insert: '``' }], pos + 1);
    return toggleInlineCode(doc, word);
  }
  let from = sel.from;
  let to = sel.to;
  while (from < to && /\s/.test(doc[from]!)) from++;
  while (to > from && /\s/.test(doc[to - 1]!)) to--;
  if (from === to) return result([{ from: sel.to, to: sel.to, insert: '``' }], sel.to + 1);

  // `code` selected with its backticks.
  const lead = runAfter(doc, from, '`', to);
  const trail = runBefore(doc, to, '`', from);
  if (lead > 0 && lead === trail && to - from > 2 * lead) {
    let a = from + lead;
    let b = to - trail;
    if (doc[a] === ' ' && doc[b - 1] === ' ' && b - a > 2) {
      a++;
      b--;
    }
    return result([{ from, to: a, insert: '' }, { from: b, to, insert: '' }], from, from + (b - a));
  }
  // Backticks (and optional padding) right outside the selection.
  for (const pad of [1, 0]) {
    if (pad && !(doc[from - 1] === ' ' && doc[to] === ' ')) continue;
    const before = runBefore(doc, from - pad, '`');
    const after = runAfter(doc, to + pad, '`');
    if (before > 0 && before === after) {
      const start = from - pad - before;
      return result(
        [
          { from: start, to: from, insert: '' },
          { from: to, to: to + pad + after, insert: '' },
        ],
        start,
        start + (to - from),
      );
    }
  }
  const text = doc.slice(from, to);
  const longest = longestRun(text, '`');
  const fence = '`'.repeat(longest + 1);
  const pad = longest > 0 ? ' ' : '';
  const open = fence + pad;
  return result(
    [
      { from, to: from, insert: open },
      { from: to, to, insert: pad + fence },
    ],
    from + open.length,
    to + open.length,
  );
};

// ------------------------------------------------------------------ line formatting

const RE_QUOTE_PREFIX = /^(?:[ \t]*>[ \t]?)*/;
const RE_HEADING_PREFIX = /^ {0,3}(#{1,6})(?:[ \t]+|$)/;
const RE_LIST_ITEM = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+|$)(\[[ xX]\](?:[ \t]+|$))?/;

interface ListItem {
  /** Offset of the item marker within the line (after quote prefix and indent). */
  markerStart: number;
  /** Offset just past the marker and its spaces (before any task box). */
  markerEnd: number;
  /** Offset where the item's text starts (after any task box). */
  contentStart: number;
  indent: string;
  bullet: string | null;
  number: number | null;
  delimiter: string;
  spaces: string;
  task: boolean;
}

function parseListItem(text: string): ListItem | null {
  const q = RE_QUOTE_PREFIX.exec(text)?.[0].length ?? 0;
  const m = RE_LIST_ITEM.exec(text.slice(q));
  if (!m) return null;
  const indent = m[1]!;
  return {
    markerStart: q + indent.length,
    markerEnd: q + m[0].length - (m[6]?.length ?? 0),
    contentStart: q + m[0].length,
    indent,
    bullet: m[2] ?? null,
    number: m[3] !== undefined ? Number(m[3]) : null,
    delimiter: m[4] ?? '',
    spaces: m[5] || ' ',
    task: m[6] !== undefined,
  };
}

type ListKind = 'bullet' | 'numbered' | 'task' | 'none';

function listKind(item: ListItem | null): ListKind {
  if (!item) return 'none';
  if (item.task) return 'task';
  return item.bullet ? 'bullet' : 'numbered';
}

/** Lines a line command applies to: the non-blank touched lines (or the lone blank one). */
function targetLines(doc: string, sel: Sel): Line[] {
  const lines = touchedLines(doc, sel);
  const nonBlank = lines.filter((l) => l.text.trim() !== '');
  return nonBlank.length ? nonBlank : lines;
}

/** Sets (or toggles off) a heading level on every touched line; level 0 removes headings. */
export function setHeading(level: 0 | 1 | 2 | 3 | 4 | 5 | 6): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    const lines = targetLines(doc, sel);
    const parsed = lines.map((l) => {
      const q = RE_QUOTE_PREFIX.exec(l.text)?.[0].length ?? 0;
      const h = RE_HEADING_PREFIX.exec(l.text.slice(q));
      return { l, q, h };
    });
    const same = level > 0 && parsed.every((p) => p.h && p.h[1]!.length === level);
    const next = same ? 0 : level;
    const changes: Change[] = [];
    for (const { l, q, h } of parsed) {
      let end = q + (h ? h[0].length : 0);
      if (!h && next > 0) {
        // Replace a list marker rather than nesting it inside the heading.
        const item = parseListItem(l.text);
        if (item && item.markerStart >= q) end = item.contentStart;
        else end = q + (/^[ \t]*/.exec(l.text.slice(q))?.[0].length ?? 0);
      }
      const insert = next > 0 ? `${'#'.repeat(next)} ` : '';
      if (l.text.slice(q, end) !== insert) changes.push({ from: l.from + q, to: l.from + end, insert });
    }
    return mapped(changes, sel);
  };
}

/** Adds `> ` to every touched line, or removes it when all of them are quoted. */
export const toggleQuote: Command = (doc, raw) => {
  const sel = normSel(doc, raw);
  const lines = touchedLines(doc, sel);
  const nonBlank = lines.filter((l) => l.text.trim() !== '');
  const quoted = (l: Line) => /^ {0,3}>/.test(l.text);
  const changes: Change[] = [];
  if (nonBlank.length && nonBlank.every(quoted)) {
    for (const l of nonBlank) {
      const m = /^ {0,3}> ?/.exec(l.text)!;
      changes.push({ from: l.from, to: l.from + m[0].length, insert: '' });
    }
  } else {
    for (const l of lines) {
      if (quoted(l)) continue;
      const blank = l.text.trim() === '';
      changes.push({ from: l.from, to: l.from, insert: blank && lines.length > 1 ? '>' : '> ' });
    }
  }
  return mapped(changes, sel);
};

function listCommand(kind: Exclude<ListKind, 'none'>): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    const lines = targetLines(doc, sel);
    const items = lines.map((l) => parseListItem(l.text));
    const remove = items.every((it) => listKind(it) === kind);
    const changes: Change[] = [];
    const counters = new Map<number, number>();
    const first = lines[0]!;
    // Continue the numbering of a list right above the selection.
    const above = first.from > 0 ? parseListItem(lineAt(doc, first.from - 1).text) : null;
    lines.forEach((l, i) => {
      const it = items[i] ?? null;
      const q = RE_QUOTE_PREFIX.exec(l.text)?.[0].length ?? 0;
      const indent = it ? it.indent : (/^[ \t]*/.exec(l.text.slice(q))?.[0] ?? '');
      const markerFrom = l.from + q + indent.length;
      const markerTo = it ? l.from + it.contentStart : markerFrom;
      if (remove) {
        changes.push({ from: markerFrom, to: markerTo, insert: '' });
        return;
      }
      let insert: string;
      if (kind === 'bullet') {
        if (listKind(it) === 'bullet') return;
        insert = '- ';
      } else if (kind === 'task') {
        if (listKind(it) === 'task') return;
        insert = it?.bullet ? `${it.bullet} [ ] ` : '- [ ] ';
      } else {
        const width = indent.length;
        for (const key of [...counters.keys()]) if (key > width) counters.delete(key);
        let n = counters.get(width);
        if (n === undefined) {
          n = i === 0 && above && above.number !== null && above.indent.length === width ? above.number + 1 : 1;
        }
        counters.set(width, n + 1);
        insert = `${n}. `;
      }
      if (doc.slice(markerFrom, markerTo) !== insert) changes.push({ from: markerFrom, to: markerTo, insert });
    });
    return mapped(changes, sel);
  };
}

/** `- ` bullets; converts numbered and task items; removes when all lines are bullets. */
export const toggleBulletList: Command = listCommand('bullet');

/** `1. `, `2. ` … renumbered; removes when all lines are numbered. */
export const toggleNumberedList: Command = listCommand('numbered');

/** `- [ ] ` tasks; converts bullets; removes when all lines are tasks. */
export const toggleTaskList: Command = listCommand('task');

// ------------------------------------------------------------------ inserts

const URL_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)\S+$/i;

function isUrl(text: string): boolean {
  return URL_RE.test(text.trim());
}

/** A link destination, wrapped in <> when it contains spaces or brackets. */
function destination(url: string): string {
  const u = url.trim();
  return /[\s()<>]/.test(u) ? `<${u.replace(/</g, '%3C').replace(/>/g, '%3E')}>` : u;
}

/**
 * Inserts `insert` as its own block in place of [from, to): exactly one blank
 * line before (unless at the start) and after, splitting the line if needed.
 */
function blockInsertion(doc: string, from: number, to: number, block: string): { change: Change; blockStart: number; after: number } {
  let b = from;
  while (b > 0 && /[ \t\n]/.test(doc[b - 1]!)) b--;
  let a = to;
  let nextLineStart = -1;
  while (a < doc.length && /[ \t\n]/.test(doc[a]!)) {
    if (doc[a] === '\n') nextLineStart = a + 1;
    a++;
  }
  // Keep the indentation of the following line.
  if (a < doc.length && nextLineStart !== -1) a = nextLineStart;
  const before = b > 0 ? '\n\n' : '';
  const insert = `${before}${block}\n\n`;
  return { change: { from: b, to: a, insert }, blockStart: b + before.length, after: b + insert.length };
}

/** `[selection](url)`; with no selection `[link text](https://)` with "link text" selected. */
export function insertLink(url?: string): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    const text = doc.slice(sel.from, sel.to);
    if (!text.trim()) {
      const insert = `[link text](${url ? destination(url) : 'https://'})`;
      return result([{ from: sel.from, to: sel.to, insert }], sel.from + 1, sel.from + 1 + 'link text'.length);
    }
    const existing = /^\[([^\]]*)\]\([^)]*\)$/.exec(text);
    if (existing) {
      const inner = existing[1]!;
      return result([{ from: sel.from, to: sel.to, insert: inner }], sel.from, sel.from + inner.length);
    }
    const lead = text.length - text.trimStart().length;
    const from = sel.from + lead;
    const to = sel.from + text.trimEnd().length;
    const label = doc.slice(from, to);
    if (isUrl(label)) {
      return result([{ from, to, insert: `[](${destination(label)})` }], from + 1);
    }
    const dest = url ? destination(url) : 'https://';
    const insert = `[${label}](${dest})`;
    const destStart = from + label.length + 3;
    return url
      ? result([{ from, to, insert }], from + insert.length)
      : result([{ from, to, insert }], destStart, destStart + dest.length);
  };
}

const ALT_PLACEHOLDER = 'Describe this image';

/** `![alt](url)`, on its own paragraph when the line has other text. */
export function insertImage(url?: string, alt?: string): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    const text = doc.slice(sel.from, sel.to).trim();
    let src = url;
    let altText = alt;
    if (!src && text && isUrl(text)) src = text;
    else if (altText === undefined && text) altText = text;
    const dest = src ? destination(src) : 'https://';
    const image = `![${altText ?? ALT_PLACEHOLDER}](${dest})`;
    const altStart = 2;
    const destStart = altStart + (altText ?? ALT_PLACEHOLDER).length + 2;
    const pick = (start: number): { anchor: number; head: number } =>
      !src
        ? { anchor: start + destStart, head: start + destStart + dest.length }
        : altText === undefined
          ? { anchor: start + altStart, head: start + altStart + ALT_PLACEHOLDER.length }
          : { anchor: start + image.length, head: start + image.length };
    const first = lineAt(doc, sel.from);
    const last = lineAt(doc, sel.to);
    const others = doc.slice(first.from, sel.from).trim() !== '' || doc.slice(sel.to, last.to).trim() !== '';
    if (!others) {
      const s = pick(sel.from);
      return result([{ from: sel.from, to: sel.to, insert: image }], s.anchor, s.head);
    }
    const ins = blockInsertion(doc, sel.from, sel.to, image);
    const s = src && altText !== undefined ? { anchor: ins.after, head: ins.after } : pick(ins.blockStart);
    return result([ins.change], s.anchor, s.head);
  };
}

/** Fenced code block around the touched lines, or an empty one with the cursor inside. */
export function insertCodeBlock(lang = ''): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    if (sel.from === sel.to) {
      const ins = blockInsertion(doc, sel.from, sel.to, `\`\`\`${lang}\n\n\`\`\``);
      return result([ins.change], ins.blockStart + 4 + lang.length);
    }
    const lines = touchedLines(doc, sel);
    const first = lines[0]!;
    const last = lines[lines.length - 1]!;
    const content = doc.slice(first.from, last.to);
    const longest = longestRun(content, '`');
    const fence = '`'.repeat(Math.max(3, longest + 1));
    const nonBlank = lines.filter((l) => l.text.trim() !== '');
    const indent = nonBlank.length
      ? nonBlank.map((l) => /^[ \t]*/.exec(l.text)![0]).reduce((a, b) => (b.length < a.length ? b : a))
      : '';
    const open = `${indent}${fence}${lang}\n`;
    const ins = blockInsertion(doc, first.from, last.to, `${open}${content}\n${indent}${fence}`);
    const start = ins.blockStart + open.length;
    return result([ins.change], start, start + content.length);
  };
}

/** `---` as its own block. */
export const insertHorizontalRule: Command = (doc, raw) => insertBlock('---')(doc, raw);

const ALERT_PLACEHOLDERS: Record<'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION', string> = {
  NOTE: 'Useful information that readers should know, even when skimming.',
  TIP: 'Helpful advice for doing things better or more easily.',
  IMPORTANT: 'Key information readers need to know to succeed.',
  WARNING: 'Urgent information that needs attention to avoid problems.',
  CAUTION: 'Advice about risks or negative outcomes of certain actions.',
};

function selectedBody(doc: string, sel: Sel): string {
  return doc
    .slice(sel.from, sel.to)
    .replace(/^(?:[ \t]*\n)+/, '')
    .trimEnd();
}

/** GitHub alert (`> [!NOTE]`) around the selection, or with placeholder text selected. */
export function insertAlert(type: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    const body = selectedBody(doc, sel);
    const text = body.trim() ? body : ALERT_PLACEHOLDERS[type];
    const head = `> [!${type}]\n`;
    const block = head + text.split('\n').map((l) => (l.trim() ? `> ${l}` : '>')).join('\n');
    const ins = blockInsertion(doc, sel.from, sel.to, block);
    if (body.trim()) return result([ins.change], ins.after);
    const start = ins.blockStart + head.length + 2;
    return result([ins.change], start, start + text.length);
  };
}

/** Collapsible `<details>` block around the selection (or placeholder text). */
export function insertDetails(summary?: string): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    const body = selectedBody(doc, sel);
    const sum = summary ?? 'Click to expand';
    const content = body.trim() ? body : 'Hidden content goes here.';
    const open = `<details>\n<summary>${sum}</summary>\n\n`;
    const ins = blockInsertion(doc, sel.from, sel.to, `${open}${content}\n\n</details>`);
    if (!body.trim()) {
      const start = ins.blockStart + open.length;
      return result([ins.change], start, start + content.length);
    }
    if (summary === undefined) {
      const start = ins.blockStart + '<details>\n<summary>'.length;
      return result([ins.change], start, start + sum.length);
    }
    return result([ins.change], ins.after);
  };
}

/** `[^n]` at the cursor plus a `[^n]: ` definition at the end, with the cursor in it. */
export function insertFootnote(): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    let max = 0;
    for (const m of doc.matchAll(/\[\^(\d+)\]/g)) max = Math.max(max, Number(m[1]));
    const n = max + 1;
    const ref = `[^${n}]`;
    const def = `[^${n}]: `;
    const pos = sel.to;
    let end = doc.length;
    while (end > 0 && /\s/.test(doc[end - 1]!)) end--;
    const trailingNewline = doc.endsWith('\n') ? '\n' : '';
    if (pos >= end) {
      const insert = `${ref}\n\n${def}${trailingNewline}`;
      return result([{ from: pos, to: doc.length, insert }], pos + ref.length + 2 + def.length);
    }
    const lastLine = lineAt(doc, end);
    const sep = /^\[\^[^\]]+\]:/.test(lastLine.text) ? '\n' : '\n\n';
    const tail = `${sep}${def}${trailingNewline}`;
    return result(
      [
        { from: pos, to: pos, insert: ref },
        { from: end, to: doc.length, insert: tail },
      ],
      end + ref.length + sep.length + def.length,
    );
  };
}

/** Inserts Markdown (table, badge row, section…) as its own block at the cursor. */
export function insertBlock(markdown: string): Command {
  return (doc, raw) => {
    const block = markdown.replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
    if (!block) return null;
    const sel = normSel(doc, raw);
    const ins = blockInsertion(doc, sel.from, sel.to, block);
    return result([ins.change], ins.after);
  };
}

/** Inserts text at the cursor, replacing the selection (emoji, badge Markdown…). */
export function insertInline(text: string): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    return result([{ from: sel.from, to: sel.to, insert: text }], sel.from + text.length);
  };
}

// ------------------------------------------------------------------ list editing

interface ItemLine {
  line: Line;
  item: ListItem;
}

/** Nearest list item above `line` whose indent satisfies `test`, stopping at non-list text. */
function findItemAbove(doc: string, line: Line, test: (indent: number) => 'match' | 'skip' | 'stop'): ItemLine | null {
  let pos = line.from - 1;
  while (pos >= 0) {
    const l = lineAt(doc, pos);
    pos = l.from - 1;
    if (l.text.trim() === '') continue;
    const item = parseListItem(l.text);
    const indent = item ? item.indent.length : (/^[ \t]*/.exec(l.text)?.[0].length ?? 0);
    if (!item) {
      if (indent === 0) return null;
      continue;
    }
    const verdict = test(item.indent.length);
    if (verdict === 'match') return { line: l, item };
    if (verdict === 'stop') return null;
  }
  return null;
}

/** Tab / Shift-Tab in a list: nest under the previous item, or move out to the parent's level. */
export function indentList(dir: 1 | -1): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    const lines = touchedLines(doc, sel);
    const first = lines[0]!;
    const item = parseListItem(first.text);
    if (!item) return null;
    const width = item.indent.length;
    const changes: Change[] = [];
    if (dir === 1) {
      const sibling = findItemAbove(doc, first, (w) => (w === width ? 'match' : w < width ? 'stop' : 'skip'));
      const amount = sibling ? sibling.item.markerEnd - sibling.item.markerStart : item.markerEnd - item.markerStart;
      const pad = ' '.repeat(Math.max(1, amount));
      for (const l of lines) {
        if (l.text.trim() === '') continue;
        const lq = RE_QUOTE_PREFIX.exec(l.text)?.[0].length ?? 0;
        changes.push({ from: l.from + lq, to: l.from + lq, insert: pad });
      }
      if (item.number !== null) {
        // Number the item within its new sub-list.
        const newWidth = width + pad.length;
        const prev = findItemAbove(doc, first, (w) => (w === newWidth ? 'match' : w <= width ? 'stop' : 'skip'));
        const n = prev && prev.item.number !== null ? prev.item.number + 1 : 1;
        const numFrom = first.from + item.markerStart;
        changes.push({ from: numFrom, to: numFrom + String(item.number).length, insert: String(n) });
      }
    } else {
      if (width === 0) return result([], sel.from, sel.to);
      const parent = findItemAbove(doc, first, (w) => (w < width ? 'match' : 'skip'));
      const target = parent ? parent.item.indent.length : 0;
      const amount = width - target;
      for (const l of lines) {
        if (l.text.trim() === '') continue;
        const lq = RE_QUOTE_PREFIX.exec(l.text)?.[0].length ?? 0;
        const ws = /^[ \t]*/.exec(l.text.slice(lq))![0].length;
        const cut = Math.min(ws, amount);
        if (cut > 0) changes.push({ from: l.from + lq, to: l.from + lq + cut, insert: '' });
      }
      if (item.number !== null && parent && parent.item.number !== null) {
        const numFrom = first.from + item.markerStart;
        changes.push({ from: numFrom, to: numFrom + String(item.number).length, insert: String(parent.item.number + 1) });
      }
    }
    return mapped(changes, sel);
  };
}

/** Enter in a list item: a new item with the same marker, or ends the list on an empty item. */
export function continueList(): Command {
  return (doc, raw) => {
    const sel = normSel(doc, raw);
    const line = lineAt(doc, sel.from);
    const item = parseListItem(line.text);
    if (!item) return null;
    const contentStart = line.from + item.contentStart;
    if (sel.from < contentStart) return null;
    const endLine = lineAt(doc, sel.to);
    if (sel.from === sel.to && doc.slice(contentStart, line.to).trim() === '') {
      const q = RE_QUOTE_PREFIX.exec(line.text)?.[0].length ?? 0;
      return result([{ from: line.from + q, to: line.to, insert: '' }], line.from + q);
    }
    const quote = line.text.slice(0, item.markerStart - item.indent.length);
    let number = item.number;
    const changes: Change[] = [];
    if (item.number !== null) {
      // Lazy numbering (1. 1. 1.) stays lazy; otherwise renumber the items below.
      const nextSibling = findItemBelow(doc, endLine, item.indent.length);
      const lazy = nextSibling?.item.number === item.number;
      number = lazy ? item.number : item.number + 1;
      if (!lazy) {
        let expected = number + 1;
        let pos = endLine.to + 1;
        while (pos <= doc.length && pos > 0) {
          const l = lineAt(doc, pos);
          pos = l.to + 1;
          if (l.text.trim() === '') {
            if (pos > doc.length) break;
            continue;
          }
          const it = parseListItem(l.text);
          const w = it ? it.indent.length : (/^[ \t]*/.exec(l.text)?.[0].length ?? 0);
          if (it && w === item.indent.length && it.number !== null) {
            if (it.number !== expected) {
              const from = l.from + it.markerStart;
              changes.push({ from, to: from + String(it.number).length, insert: String(expected) });
            }
            expected++;
          } else if (w <= item.indent.length) break;
          if (pos > doc.length) break;
        }
      }
    }
    const marker =
      item.bullet !== null ? `${item.bullet}${item.spaces}` : `${number}${item.delimiter}${item.spaces}`;
    const prefix = `${quote}${item.indent}${marker}${item.task ? '[ ] ' : ''}`;
    const rest = doc.slice(sel.to, endLine.to);
    const skip = rest.length - rest.trimStart().length;
    changes.unshift({ from: sel.from, to: sel.to + skip, insert: `\n${prefix}` });
    return result(sortChanges(changes), sel.from + 1 + prefix.length);
  };
}

function findItemBelow(doc: string, line: Line, width: number): ItemLine | null {
  let pos = line.to + 1;
  while (pos > 0 && pos <= doc.length) {
    const l = lineAt(doc, pos);
    pos = l.to + 1;
    if (l.text.trim() === '') {
      if (pos > doc.length) break;
      continue;
    }
    const item = parseListItem(l.text);
    if (item && item.indent.length === width) return { line: l, item };
    const w = item ? item.indent.length : (/^[ \t]*/.exec(l.text)?.[0].length ?? 0);
    if (w <= width) return null;
    if (pos > doc.length) break;
  }
  return null;
}

// ------------------------------------------------------------------ shortcuts

/** Shortcut labels for toolbar tooltips (CodeMirror key names; Mod = Cmd on macOS, Ctrl elsewhere). */
export const COMMAND_SHORTCUTS: Record<string, string> = {
  bold: 'Mod-B',
  italic: 'Mod-I',
  strike: 'Mod-Shift-X',
  code: 'Mod-E',
  link: 'Mod-Shift-L',
  paragraph: 'Mod-Alt-0',
  h1: 'Mod-Alt-1',
  h2: 'Mod-Alt-2',
  h3: 'Mod-Alt-3',
  h4: 'Mod-Alt-4',
  h5: 'Mod-Alt-5',
  h6: 'Mod-Alt-6',
  quote: 'Mod-Shift-.',
  bullet: 'Mod-Shift-8',
  numbered: 'Mod-Shift-7',
  task: 'Mod-Shift-9',
  codeBlock: 'Mod-Alt-C',
  indent: 'Tab',
  outdent: 'Shift-Tab',
};

/** Human label for a CodeMirror key name: `Mod-Shift-X` → `⇧⌘X` on macOS, `Ctrl+Shift+X` elsewhere. */
export function shortcutLabel(shortcut: string, mac: boolean): string {
  const parts = shortcut.split(/-(?!$)/);
  const key = parts.pop() ?? '';
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const keyLabel = key.length === 1 ? key.toUpperCase() : key;
  if (mac) {
    const order: Array<[string, string]> = [
      ['ctrl', '⌃'],
      ['alt', '⌥'],
      ['shift', '⇧'],
      ['mod', '⌘'],
      ['cmd', '⌘'],
    ];
    return order.filter(([m]) => mods.has(m)).map(([, s]) => s).join('') + keyLabel;
  }
  const names: Array<[string, string]> = [
    ['mod', 'Ctrl'],
    ['ctrl', 'Ctrl'],
    ['alt', 'Alt'],
    ['shift', 'Shift'],
  ];
  const labels = [...new Set(names.filter(([m]) => mods.has(m)).map(([, s]) => s))];
  return [...labels, keyLabel].join('+');
}
