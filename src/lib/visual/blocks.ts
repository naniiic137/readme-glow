/**
 * Source operations behind the visual editor. Every function takes the
 * Markdown and offsets from the rendered blocks' data-src / data-inner
 * attributes, and changes only the bytes it has to.
 */
import { minimalChange } from '../docStore';

export interface Range {
  start: number;
  end: number;
}

export function parseRange(value: string | null | undefined): Range | null {
  if (!value) return null;
  const m = /^(\d+):(\d+)$/.exec(value);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  return end >= start ? { start, end } : null;
}

export function replaceRange(source: string, start: number, end: number, text: string): string {
  return source.slice(0, start) + text + source.slice(end);
}

function lineStart(source: string, offset: number): number {
  return source.lastIndexOf('\n', offset - 1) + 1;
}

/**
 * The prefix to put in front of continuation lines of a block that starts at
 * `innerStart`: blockquote markers are kept, list markers become spaces.
 * "> - [ ] text" → ">   " + "    ".
 */
export function continuationPrefix(source: string, innerStart: number): string {
  const first = source.slice(lineStart(source, innerStart), innerStart);
  return first
    .replace(/\[[ xX]\]\s/g, (m) => ' '.repeat(m.length))
    .replace(/(^|[\s>])([-*+]|\d{1,9}[.)])(\s)/g, (_m, pre: string, marker: string, sp: string) => pre + ' '.repeat(marker.length) + sp)
    .replace(/[^>\s]/g, ' ');
}

/** Re-indents multi-line inline Markdown so it stays inside its container (list item, quote). */
export function indentContinuation(text: string, prefix: string): string {
  if (!text.includes('\n')) return text;
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? line : prefix + line))
    .join('\n');
}

/**
 * Commits an edit of one block's inline content. `before` is what the
 * serializer produced for the block when editing started; when it matched
 * the source exactly, only the characters the user changed are replaced.
 */
export function commitInline(source: string, inner: Range, before: string, after: string): string {
  if (before === after) return source;
  const prefix = continuationPrefix(source, inner.start);
  const current = source.slice(inner.start, inner.end);
  const next = indentContinuation(after, prefix);
  if (indentContinuation(before, prefix) === current) {
    const change = minimalChange(current, next);
    if (!change) return source;
    return replaceRange(source, inner.start + change.from, inner.start + change.to, change.insert);
  }
  return replaceRange(source, inner.start, inner.end, next);
}

/** Replaces the code between the fences, lengthening the fence if the new code contains one. */
export function commitCode(source: string, block: Range, inner: Range, code: string): string {
  const current = source.slice(inner.start, inner.end);
  const text = code.replace(/\n$/, '');
  if (current === text) return source;
  const blockText = source.slice(block.start, block.end);
  const open = /^([ \t]*)(`{3,}|~{3,})([^\n]*)/.exec(blockText);
  if (open) {
    const fence = open[2]!;
    const clash = new RegExp(`^[ \\t]*${fence[0] === '`' ? '`' : '~'}{${fence.length},}`, 'm');
    if (clash.test(text)) {
      const longer = fence[0]!.repeat(Math.max(fence.length, longestRun(text, fence[0]!)) + 1);
      const rebuilt = `${open[1]}${longer}${open[3]}\n${text}\n${open[1]}${longer}`;
      return replaceRange(source, block.start, block.end, rebuilt);
    }
  }
  const change = minimalChange(current, text);
  return change ? replaceRange(source, inner.start + change.from, inner.start + change.to, change.insert) : source;
}

function longestRun(text: string, ch: string): number {
  const re = new RegExp(`${ch === '`' ? '`' : '~'}+`, 'g');
  return (text.match(re) ?? []).reduce((m, r) => Math.max(m, r.length), 0);
}

/** Inserts a new top-level block after `after` (or at the top when null), separated by one blank line. */
export function insertBlockAfter(source: string, after: Range | null, markdown: string): { text: string; range: Range } {
  const block = markdown.replace(/^\n+|\n+$/g, '');
  if (!after) {
    const rest = source.replace(/^\n+/, '');
    const text = `${block}\n\n${rest}`;
    return { text: rest ? text : `${block}\n`, range: { start: 0, end: block.length } };
  }
  const head = source.slice(0, after.end);
  let tail = source.slice(after.end);
  // Keep whatever followed the block on its line (normally nothing), then one blank line.
  const nl = /^[^\n]*/.exec(tail)![0];
  tail = tail.slice(nl.length).replace(/^\n+/, '');
  const sep = '\n\n';
  const start = head.length + nl.length + sep.length;
  const text = `${head}${nl}${sep}${block}${tail ? `\n\n${tail}` : '\n'}`;
  return { text, range: { start, end: start + block.length } };
}

/** Removes a top-level block and the blank lines after it. */
export function deleteBlock(source: string, block: Range): string {
  let start = block.start;
  let end = block.end;
  // Swallow the rest of the line and following blank lines.
  const after = /^[ \t]*\n*/.exec(source.slice(end))![0];
  end += after.length;
  if (end >= source.length) {
    // Last block: remove the blank lines before it instead, keep one final newline.
    const before = /\n*$/.exec(source.slice(0, start))![0];
    start -= before.length;
    const out = source.slice(0, start);
    return out ? `${out}\n` : '';
  }
  return source.slice(0, start) + source.slice(end);
}

/**
 * Moves block `from` to index `to` among ordered, non-overlapping top-level
 * ranges. The text between blocks stays where it is; only the moved blocks'
 * text changes places.
 */
export function moveBlock(source: string, blocks: Range[], from: number, to: number): string {
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return source;
  const texts = blocks.map((b) => source.slice(b.start, b.end));
  const order = blocks.map((_, i) => i);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved!);
  let out = source.slice(0, blocks[0]!.start);
  blocks.forEach((b, i) => {
    out += texts[order[i]!];
    const next = blocks[i + 1];
    out += next ? source.slice(b.end, next.start) : source.slice(b.end);
  });
  return out;
}

/** Splits a paragraph/heading/item at the caret (Enter in the visual editor). */
export function splitBlock(
  source: string,
  block: Range,
  inner: Range,
  kind: string,
  left: string,
  right: string,
): { text: string; caret: number } {
  const prefix = source.slice(block.start, inner.start);
  const suffix = source.slice(inner.end, block.end);
  const cont = continuationPrefix(source, inner.start);
  let newPrefix = '';
  if (kind === 'item') {
    const marker = /^(\s*(?:>\s*)*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\]\s+)?/.exec(prefix);
    if (marker) {
      const num = /^\d+/.exec(marker[2]!);
      const nextMarker = num ? `${Number(num[0]) + 1}${marker[2]!.slice(num[0].length)}` : marker[2]!;
      newPrefix = `${marker[1]}${nextMarker}${marker[3]}${marker[4] ? '[ ] ' : ''}`;
    }
  } else if (kind === 'paragraph') {
    newPrefix = cont.trim() ? cont : '';
  }
  const leftText = indentContinuation(left, cont);
  const rightText = indentContinuation(right, cont);
  const between = kind === 'item' ? '\n' : `\n${cont.replace(/\s+$/, '')}\n`;
  const replacement = `${prefix}${leftText}${suffix}${between}${newPrefix}${rightText}`;
  const caret = block.start + prefix.length + leftText.length + suffix.length + between.length + newPrefix.length;
  return { text: replaceRange(source, block.start, block.end, replacement), caret };
}

/** Joins a block onto the previous one (Backspace at the start of a block). */
export function mergeWithPrevious(source: string, prevInner: Range, current: Range, currentInner: Range): { text: string; caret: number } {
  const text = source.slice(currentInner.start, currentInner.end);
  const out = source.slice(0, prevInner.end) + text + source.slice(current.end);
  return { text: out, caret: prevInner.end };
}

/** Top-level sections: each H2 (with everything until the next H2) as one range. */
export function sectionRanges(blocks: Array<Range & { heading?: number }>): Range[] {
  const out: Range[] = [];
  for (const b of blocks) {
    if (b.heading !== undefined && b.heading <= 2) out.push({ start: b.start, end: b.end });
    else if (out.length) out[out.length - 1]!.end = b.end;
  }
  return out;
}
