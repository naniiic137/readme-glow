import { parseMarkdown, walk } from '../markdown/parse';

/**
 * Reversible edits. Everything the GitHub export adds or replaces is wrapped
 * in a pair of invisible comments; the begin comment keeps the Markdown it
 * replaced. `unexport` puts that Markdown back, so an exported README can be
 * opened, edited and exported again without stacking a second banner.
 *
 *   <!-- readmeglow:begin h2
 *   ## Installation
 *   -->
 *   ## <a id="installation"></a><picture>…</picture>
 *   <!-- readmeglow:end h2 -->
 *
 * Text that cannot sit inside a comment (it contains "--", or a blank line
 * inside an HTML block) is stored as base64 instead: `begin h2 b64:…`.
 */

export type ChunkKind = 'hero' | 'h2' | 'divider' | 'toc' | 'fold' | 'fold-end';

const BEGIN = 'readmeglow:begin';
const END = 'readmeglow:end';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(data: string): string | null {
  try {
    const bin = atob(data);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function needsBase64(original: string, inHtml: boolean): boolean {
  return original.includes('--') || /^[>-]/.test(original) || original.endsWith('-') || (inHtml && /\n[ \t]*\r?\n/.test(original));
}

function endTag(kind: ChunkKind): string {
  return `<!-- ${END} ${kind} -->`;
}

/** Generated content that replaces `original` (a range of the source). */
export function replaceChunk(kind: ChunkKind, original: string, generated: string, eol: string, inHtml = false): string {
  const head = needsBase64(original, inHtml) ? `<!-- ${BEGIN} ${kind} b64:${toBase64(original)} -->` : `<!-- ${BEGIN} ${kind}${eol}${original}${eol}-->`;
  return `${head}${eol}${generated}${eol}${endTag(kind)}`;
}

/** Generated content inserted at the start of a line (removed again, with the blank line after it). */
export function insertChunk(kind: ChunkKind, generated: string, eol: string): string {
  return `<!-- ${BEGIN} ${kind} -->${eol}${generated}${eol}${endTag(kind)}${eol}${eol}`;
}

const BEGIN_RE = /<!-- readmeglow:begin ([a-z0-9-]+)(?: b64:([A-Za-z0-9+/=]*) -->| -->|\r?\n([\s\S]*?)\r?\n-->)/g;

/** Source ranges of code (fenced, indented and inline) where marker-like text is just text. */
function codeRanges(markdown: string): Array<[number, number]> {
  if (!markdown.includes('readmeglow:begin')) return [];
  const out: Array<[number, number]> = [];
  walk(parseMarkdown(markdown), (node) => {
    if ((node.type === 'code' || node.type === 'inlineCode') && node.position) {
      out.push([node.position.start.offset ?? 0, node.position.end.offset ?? 0]);
      return false;
    }
  });
  return out;
}

export function isExported(markdown: string): boolean {
  BEGIN_RE.lastIndex = 0;
  const code = codeRanges(markdown);
  for (let m = BEGIN_RE.exec(markdown); m; m = BEGIN_RE.exec(markdown)) {
    const at = m.index;
    if (!code.some(([s, e]) => at >= s && at < e)) return true;
  }
  return false;
}

/** Restores the Markdown the export replaced. Damaged or unmatched markers are left alone. */
export function unexport(markdown: string): string {
  const code = codeRanges(markdown);
  let out = '';
  let cursor = 0;
  BEGIN_RE.lastIndex = 0;
  for (let m = BEGIN_RE.exec(markdown); m; m = BEGIN_RE.exec(markdown)) {
    const at = m.index;
    if (code.some(([s, e]) => at >= s && at < e)) continue;
    const kind = m[1] as ChunkKind;
    const tag = endTag(kind);
    const endAt = markdown.indexOf(tag, at + m[0].length);
    if (endAt === -1) continue;
    const inserted = m[2] === undefined && m[3] === undefined;
    const original = m[2] !== undefined ? fromBase64(m[2]) : (m[3] ?? '');
    if (original === null) continue;
    let stop = endAt + tag.length;
    if (inserted) stop += /^(?:\r?\n){0,2}/.exec(markdown.slice(stop))![0].length;
    out += markdown.slice(cursor, at) + original;
    cursor = stop;
    BEGIN_RE.lastIndex = stop;
  }
  return out + markdown.slice(cursor);
}
