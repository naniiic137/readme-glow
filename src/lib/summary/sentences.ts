import type { DocModel, SectionKind, TextUnit } from './sections';
import { BREAK, F_CODE, F_HEADING, F_LINK, countWords, type Flat } from './text';

/**
 * Sentence splitting for README prose. Works on flattened text (see text.ts),
 * so code blocks, tables, badges and images never reach it, and every
 * sentence keeps the source line it starts on.
 */
export interface Sentence {
  text: string;
  /** 1-based source line the sentence starts on. */
  line: number;
  /** Position in document order. */
  index: number;
  /** Index of the top-level block it came from. */
  block: number;
  kind: 'paragraph' | 'list' | 'quote' | 'html';
  /** 0 = intro (before the first section heading). */
  section: number;
  heading: string | null;
  kinds: SectionKind[];
  words: number;
  /** Share of characters inside links. */
  linkRatio: number;
  /** Share of characters inside inline code. */
  codeRatio: number;
  /** First sentence of its paragraph or list item. */
  firstInBlock: boolean;
}

export interface Span {
  start: number;
  end: number;
}

const TERMINALS = new Set(['.', '!', '?', '…', '。', '！', '？', '؟', '۔']);
const CJK_TERMINALS = new Set(['。', '！', '？']);
const CLOSERS = new Set(['"', "'", '”', '’', '»', ')', ']', '›', '」', '』', '*', '_']);

/** Abbreviations after which a full stop never ends a sentence. */
const ABBREVIATIONS = new Set([
  'eg', 'ie', 'vs', 'cf', 'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'fig', 'figs', 'approx', 'incl', 'al',
  'ca', 'viz', 'resp', 'esp', 'dept', 'env', 'mme', 'mlle', 'pp', 'vol', 'ch', 'sec', 'ref', 'refs', 'eq', 'ex',
  'nos', 'op', 'ed', 'eds', 'rev', 'gen', 'sgt', 'lt', 'col', 'capt', 'mt', 'ft', 'aka', 'avg', 'est', 'pron', 'abbr',
  'sq', 'univ', 'assn', 'bros', 'cca', 'vgl', 'bzw', 'usw',
]);

function isAbbreviation(token: string, next: string): boolean {
  const t = token.replace(/^[("'“‘«[{]+/, '');
  if (!t) return false;
  // Dotted initialisms: e.g, i.e, U.S, a.k.a
  if (/^(?:\p{L}\.)+\p{L}$/u.test(t)) return true;
  // Single initials: "J. R. R. Tolkien"
  if (/^\p{Lu}$/u.test(t)) return true;
  const lower = t.toLowerCase();
  if (lower === 'no' || lower === 'nr' || lower === 'p') return /\d/.test(next);
  return ABBREVIATIONS.has(lower);
}

function startsSentence(ch: string): boolean {
  return /[\p{Lu}\p{Lt}\p{Lo}\p{N}\p{Pi}\p{Ps}"'¿¡@#\p{Extended_Pictographic}]/u.test(ch);
}

/**
 * Splits plain text into sentence spans. Handles abbreviations ("e.g.",
 * "i.e.", "Dr."), version numbers and file names ("v1.2", "Node.js"), URLs,
 * ellipses, French spacing ("Génial !"), Arabic (؟) and CJK punctuation.
 * `BREAK` characters (line breaks / block edges) always end a sentence.
 */
export function splitSentences(text: string): Span[] {
  const spans: Span[] = [];
  const n = text.length;
  let start = 0;
  const emit = (end: number) => {
    let s = start;
    let e = end;
    while (s < e && (text[s] === ' ' || text[s] === BREAK)) s++;
    while (e > s && (text[e - 1] === ' ' || text[e - 1] === BREAK)) e--;
    if (e > s) spans.push({ start: s, end: e });
  };
  for (let i = 0; i < n; i++) {
    const ch = text[i]!;
    if (ch === BREAK) {
      emit(i);
      start = i + 1;
      continue;
    }
    if (!TERMINALS.has(ch)) continue;
    let j = i + 1;
    while (j < n && (TERMINALS.has(text[j]!) || CLOSERS.has(text[j]!))) j++;
    if (CJK_TERMINALS.has(ch)) {
      emit(j);
      start = j;
      i = j - 1;
      continue;
    }
    if (j >= n) break;
    if (text[j] === BREAK) continue; // the BREAK itself ends the sentence
    if (text[j] !== ' ') {
      i = j - 1;
      continue; // "v1.2", "Node.js", "example.com/x", "e.g.x"
    }
    let k = j;
    while (k < n && text[k] === ' ') k++;
    if (k >= n) break;
    const next = text[k]!;
    const run = text.slice(i, j);
    if (ch === '.' && !run.startsWith('...')) {
      let b = i;
      while (b > start && text[b - 1] !== ' ' && text[b - 1] !== BREAK) b--;
      const token = text.slice(b, i);
      if (isAbbreviation(token, next)) {
        i = j - 1;
        continue;
      }
      // Inside an unclosed parenthesis ("fCoSE (pron. "f-cosay", ...)") a full stop is an abbreviation.
      const sofar = text.slice(start, i);
      if ((sofar.match(/\(/g)?.length ?? 0) > (sofar.match(/\)/g)?.length ?? 0) && !/\)/.test(run)) {
        i = j - 1;
        continue;
      }
    }
    if (!startsSentence(next)) {
      i = j - 1;
      continue;
    }
    emit(j);
    start = j;
    i = j - 1;
  }
  emit(n);
  return spans;
}

/** Convenience: the sentences of a plain string. */
export function sentencesOf(text: string): string[] {
  const normalised = text.replace(/\r?\n\s*\r?\n/g, BREAK).replace(/\s+/g, ' ');
  return splitSentences(normalised).map((s) => normalised.slice(s.start, s.end).trim());
}

const ALERT = /^\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;
const SEPARATORS = /^[\s|·•—–-]+|[\s|·•—–-]+$/g;

function ratioOf(flat: Flat, start: number, end: number, flag: number): number {
  let total = 0;
  let hit = 0;
  for (let i = start; i < end; i++) {
    const c = flat.text[i]!;
    if (c === ' ' || c === BREAK) continue;
    total++;
    if ((flat.flags[i]! & flag) !== 0) hit++;
  }
  return total ? hit / total : 0;
}

function sentencesFromUnit(unit: TextUnit, kind: Sentence['kind'], out: Sentence[]): void {
  const flat = unit.flat;
  const spans = splitSentences(flat.text);
  let first = true;
  for (const span of spans) {
    // Headings inside raw HTML (`<h1>`, `<h2>`) are titles, not sentences.
    if (kind === 'html' && ratioOf(flat, span.start, span.end, F_HEADING) > 0.5) {
      const line = flat.lines[span.start] ?? 1;
      const heading = unit.flat.headings.find((h) => h.line === line);
      if (!heading || heading.depth <= 2) continue;
    }
    let text = flat.text.slice(span.start, span.end);
    if (first) text = text.replace(ALERT, '');
    text = text.replace(SEPARATORS, '').replace(/\s+/g, ' ').trim();
    if (!/[\p{L}]/u.test(text)) continue;
    out.push({
      text,
      line: flat.lines[span.start] ?? unit.node.position?.start.line ?? 1,
      index: out.length,
      block: unit.block.index,
      kind,
      section: unit.block.section,
      heading: unit.block.heading?.text ?? null,
      kinds: [...unit.block.kinds],
      words: countWords(text),
      linkRatio: ratioOf(flat, span.start, span.end, F_LINK),
      codeRatio: ratioOf(flat, span.start, span.end, F_CODE),
      firstInBlock: first,
    });
    first = false;
  }
}

/**
 * All sentences of a document in order: paragraphs, list items and block
 * quotes; raw HTML text only when `includeHtml` is set (it is a fallback for
 * READMEs written mostly in HTML). Code, tables, headings and images are skipped.
 */
export function extractSentences(model: DocModel, opts: { includeHtml?: boolean } = {}): Sentence[] {
  const out: Sentence[] = [];
  for (const unit of model.units) {
    if (unit.kind === 'paragraph' || unit.kind === 'list' || unit.kind === 'quote') sentencesFromUnit(unit, unit.kind, out);
    else if (unit.kind === 'html' && opts.includeHtml) sentencesFromUnit(unit, 'html', out);
  }
  return out;
}
