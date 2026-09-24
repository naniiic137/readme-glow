import { parseMarkdown, walk } from '../markdown/parse';

/**
 * Pure planning for "Download as .zip": find every local image the README
 * uses, give each one a unique name under images/ and rewrite the references.
 * Only the URL text of a reference is ever replaced, so the rest of the
 * document stays byte-identical.
 */

export interface AssetRef {
  /** As written in the Markdown, e.g. "./docs/a.png" or "images/paste-1.png". */
  path: string;
  /** Original file name. */
  name: string;
}

export interface RawRef {
  /** URL text exactly as written in the source. */
  raw: string;
  /** The URL as a renderer reads it (escapes and character references decoded). */
  value: string;
  start: number;
  end: number;
  line: number;
}

// ------------------------------------------------------------------ decoding helpers

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Markdown destination text → URL (backslash escapes and character references). */
function decodeMarkdownUrl(raw: string): string {
  return decodeEntities(raw.replace(/\\([!-/:-@[-`{-~])/g, '$1'));
}

function safeDecodeURI(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ------------------------------------------------------------------ scanning

/** Range of a link destination starting at `i` (after optional whitespace), relative to `src`. */
function destinationAt(src: string, from: number): [number, number] | null {
  let i = from;
  while (i < src.length && /[ \t\r\n]/.test(src[i]!)) i++;
  if (src[i] === '<') {
    const start = i + 1;
    let j = start;
    while (j < src.length && src[j] !== '>' && src[j] !== '\n' && src[j] !== '<') j += src[j] === '\\' ? 2 : 1;
    return src[j] === '>' ? [start, j] : null;
  }
  const start = i;
  let depth = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '\\' && i + 1 < src.length) {
      i += 2;
      continue;
    }
    if (ch.charCodeAt(0) <= 0x20) break;
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) break;
      depth--;
    }
    i++;
  }
  return i > start ? [start, i] : null;
}

/** Destination range inside the source of an inline image `![alt](url "title")`. */
function inlineImageDestination(src: string): [number, number] | null {
  if (!src.startsWith('![')) return null;
  let i = 2;
  let depth = 1;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') {
      const run = /^`+/.exec(src.slice(i))![0];
      const close = src.indexOf(run, i + run.length);
      i = close === -1 ? i + run.length : close + run.length;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) break;
    i++;
  }
  if (src[i] !== ']' || src[i + 1] !== '(') return null;
  return destinationAt(src, i + 2);
}

/** Destination range inside the source of a definition `[label]: url "title"`. */
function definitionDestination(src: string): [number, number] | null {
  let i = src.indexOf('[');
  if (i === -1) return null;
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === ']') break;
  }
  if (src[i] !== ']' || src[i + 1] !== ':') return null;
  return destinationAt(src, i + 2);
}

const HTML_TAG = /<(img|source)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const HTML_ATTR = /\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** URL ranges (relative to `value`) of the candidates in a srcset attribute. */
function srcsetUrls(value: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i]!)) i++;
    if (i >= value.length) break;
    const start = i;
    while (i < value.length && !/\s/.test(value[i]!)) i++;
    let end = i;
    const endsCandidate = value[end - 1] === ',';
    while (end > start && value[end - 1] === ',') end--;
    if (end > start) out.push([start, end]);
    if (!endsCandidate) {
      while (i < value.length && value[i] !== ',') i++; // descriptors
    }
  }
  return out;
}

/** Image URL ranges inside a piece of raw HTML (comments ignored). Offsets relative to `html`. */
function htmlImageUrls(html: string): Array<[number, number]> {
  const masked = html.replace(/<!--[\s\S]*?(?:-->|$)/g, (c) => ' '.repeat(c.length));
  const out: Array<[number, number]> = [];
  for (const tag of masked.matchAll(HTML_TAG)) {
    const tagStart = tag.index ?? 0;
    const isImg = tag[1]!.toLowerCase() === 'img';
    for (const attr of tag[0].matchAll(HTML_ATTR)) {
      const name = attr[1]!.toLowerCase();
      const value = attr[2] ?? attr[3] ?? attr[4];
      if (value === undefined) continue;
      if (!(name === 'srcset' || (name === 'src' && isImg))) continue;
      const valueStart = tagStart + (attr.index ?? 0) + attr[0].length - value.length - (attr[4] === undefined ? 1 : 0);
      if (name === 'src') {
        const lead = value.length - value.trimStart().length;
        const trimmed = value.trim();
        if (trimmed) out.push([valueStart + lead, valueStart + lead + trimmed.length]);
      } else {
        for (const [s, e] of srcsetUrls(value)) out.push([valueStart + s, valueStart + e]);
      }
    }
  }
  return out;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function findImageRefs(markdown: string): RawRef[] {
  const tree = parseMarkdown(markdown);
  const starts = lineStarts(markdown);
  const found = new Map<number, RawRef>();
  const usedLabels = new Set<string>();
  const definitions = new Map<string, [number, number]>();

  const add = (start: number, end: number, kind: 'md' | 'html'): void => {
    if (end <= start || found.has(start)) return;
    const raw = markdown.slice(start, end);
    const value = kind === 'md' ? decodeMarkdownUrl(raw) : decodeEntities(raw);
    found.set(start, { raw, value, start, end, line: lineAt(starts, start) });
  };
  const addWithin = (nodeStart: number, range: [number, number] | null, kind: 'md' | 'html'): void => {
    if (range) add(nodeStart + range[0], nodeStart + range[1], kind);
  };

  walk(tree, (node) => {
    const s = node.position?.start.offset;
    const e = node.position?.end.offset;
    if (s === undefined || e === undefined) return;
    const src = markdown.slice(s, e);
    switch (node.type) {
      case 'image':
        addWithin(s, inlineImageDestination(src), 'md');
        break;
      case 'imageReference':
        usedLabels.add(node.identifier);
        break;
      case 'definition':
        if (!definitions.has(node.identifier)) {
          const range = definitionDestination(src);
          if (range) definitions.set(node.identifier, [s + range[0], s + range[1]]);
        }
        break;
      case 'html':
        for (const range of htmlImageUrls(src)) addWithin(s, range, 'html');
        break;
      default:
        break;
    }
  });

  for (const label of usedLabels) {
    const range = definitions.get(label);
    if (range) add(range[0], range[1], 'md');
  }
  return [...found.values()].sort((a, b) => a.start - b.start);
}

/**
 * Every image URL in the document, as written: Markdown images, definitions
 * used by reference-style images, `<img src>`, `<img srcset>` and
 * `<source srcset>`. Code blocks, inline code and HTML comments are skipped.
 */
export function collectImageRefs(markdown: string): Array<{ url: string; line: number }> {
  return findImageRefs(markdown).map((r) => ({ url: r.raw, line: r.line }));
}

// ------------------------------------------------------------------ paths

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Resolves `.` and `..` segments (against `base`, a directory relative to the
 * root, when given). Returns null for remote or absolute paths and for paths
 * that climb out of the root.
 */
export function normalisePath(path: string, base?: string): string | null {
  const p = path.trim().replace(/\\/g, '/');
  if (!p || SCHEME.test(p) || p.startsWith('/')) return null;
  let prefix = '';
  if (base !== undefined && base.trim() !== '') {
    const b = normalisePath(base);
    if (b === null) return null;
    prefix = b ? `${b}/` : '';
  }
  const out: string[] = [];
  for (const segment of `${prefix}${p}`.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(segment);
  }
  return out.join('/');
}

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

/** Keeps a file name readable while removing what would break a Markdown or HTML reference. */
function safeName(name: string): string {
  const clean = (part: string): string =>
    part
      .replace(/[\s()<>"'`#?%&\\[\],;]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  const [stem, ext] = splitExt(name);
  return `${clean(stem) || 'image'}${ext ? `.${clean(ext.slice(1))}` : ''}`.replace(/\.$/, '');
}

// ------------------------------------------------------------------ planning

export function planZip(
  markdown: string,
  localPaths: string[],
): { markdown: string; files: Array<{ from: string; to: string }> } {
  const exact = new Map<string, string>();
  const folded = new Map<string, string>();
  for (const original of localPaths) {
    const key = normalisePath(original) ?? original;
    if (!exact.has(key)) exact.set(key, original);
    if (!folded.has(key.toLowerCase())) folded.set(key.toLowerCase(), original);
  }

  const lookup = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed || SCHEME.test(trimmed) || trimmed.startsWith('//')) return null;
    const path = trimmed.replace(/[?#].*$/s, '');
    for (const candidate of new Set([safeDecodeURI(path), path])) {
      const norm = normalisePath(candidate);
      if (!norm) continue;
      const hit = exact.get(norm) ?? folded.get(norm.toLowerCase());
      if (hit !== undefined) return hit;
    }
    return null;
  };

  const refs = findImageRefs(markdown)
    .map((ref) => ({ ref, source: lookup(ref.value) }))
    .filter((r): r is { ref: RawRef; source: string } => r.source !== null);

  // Sources already at images/<safe name> keep their name, so planning twice changes nothing.
  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const { source } of refs) {
    const norm = normalisePath(source) ?? source;
    const m = /^images\/([^/]+)$/.exec(norm);
    if (m && safeName(m[1]!) === m[1] && !names.has(source) && !taken.has(m[1]!.toLowerCase())) {
      names.set(source, m[1]!);
      taken.add(m[1]!.toLowerCase());
    }
  }

  const files: Array<{ from: string; to: string }> = [];
  const seen = new Set<string>();
  for (const { source } of refs) {
    if (!names.has(source)) {
      const [stem, ext] = splitExt(safeName(basename(normalisePath(source) ?? source)));
      let name = `${stem}${ext}`;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem}-${n}${ext}`;
      names.set(source, name);
      taken.add(name.toLowerCase());
    }
    if (!seen.has(source)) {
      seen.add(source);
      files.push({ from: source, to: `images/${names.get(source)!}` });
    }
  }

  let out = '';
  let pos = 0;
  for (const { ref, source } of refs) {
    // Keep ?query and #fragment (e.g. #gh-dark-mode-only); "&#39;" is a character reference, not a fragment.
    const cut = ref.raw.search(/\?|(?<!&)#/);
    const suffix = cut === -1 ? '' : ref.raw.slice(cut);
    out += markdown.slice(pos, ref.start) + `images/${names.get(source)!}${suffix}`;
    pos = ref.end;
  }
  return { markdown: out + markdown.slice(pos), files };
}
