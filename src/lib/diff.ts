/**
 * Line-based diff for the before/after preview (Myers' O(ND) algorithm with
 * the linear-space "middle snake" refinement, so large, very different files
 * stay fast and small in memory).
 *
 * Lines are compared with their line ending, so "no newline at end of file"
 * shows up as a change to the last line, like git. Texts in the results have
 * the trailing `\n` removed.
 */

export type DiffOp = { type: 'equal' | 'insert' | 'delete'; lines: string[] };

export interface Hunk {
  id: number;
  /** 1-based, inclusive range of old lines in the hunk (context included). Empty when oldEnd = oldStart - 1. */
  oldStart: number;
  oldEnd: number;
  /** 1-based, inclusive range of new lines in the hunk. Empty when newEnd = newStart - 1. */
  newStart: number;
  newEnd: number;
  lines: Array<{ type: 'equal' | 'insert' | 'delete'; text: string; oldLine?: number; newLine?: number }>;
}

type OpType = DiffOp['type'];
interface RawOp {
  type: OpType;
  count: number;
}

/** Splits into lines that keep their `\n`, so joining them gives the text back exactly. */
function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines: string[] = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf('\n', start);
    if (nl < 0) {
      if (start < text.length) lines.push(text.slice(start));
      return lines;
    }
    lines.push(text.slice(start, nl + 1));
    start = nl + 1;
  }
}

function stripEol(line: string): string {
  return line.endsWith('\n') ? line.slice(0, -1) : line;
}

/** Replaces each distinct line with a small integer so comparisons are cheap. */
function intern(a: readonly string[], b: readonly string[]): [Int32Array, Int32Array] {
  const ids = new Map<string, number>();
  const encode = (lines: readonly string[]): Int32Array => {
    const out = new Int32Array(lines.length);
    lines.forEach((line, i) => {
      let id = ids.get(line);
      if (id === undefined) {
        id = ids.size;
        ids.set(line, id);
      }
      out[i] = id;
    });
    return out;
  };
  return [encode(a), encode(b)];
}

/**
 * Myers diff of two integer sequences, as a list of runs. Uses an explicit
 * work stack instead of recursion. Within each changed stretch, deletions are
 * listed before insertions.
 */
function myers(a: Int32Array, b: Int32Array): RawOp[] {
  const ops: RawOp[] = [];
  const emit = (type: OpType, count: number): void => {
    if (count <= 0) return;
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.count += count;
    else ops.push({ type, count });
  };

  type Work = { kind: 'range'; aLo: number; aHi: number; bLo: number; bHi: number } | { kind: 'equal'; count: number };
  const stack: Work[] = [{ kind: 'range', aLo: 0, aHi: a.length, bLo: 0, bHi: b.length }];

  while (stack.length > 0) {
    const work = stack.pop()!;
    if (work.kind === 'equal') {
      emit('equal', work.count);
      continue;
    }
    let { aLo, aHi, bLo, bHi } = work;
    // Common prefix and suffix.
    let prefix = 0;
    while (aLo + prefix < aHi && bLo + prefix < bHi && a[aLo + prefix] === b[bLo + prefix]) prefix++;
    emit('equal', prefix);
    aLo += prefix;
    bLo += prefix;
    let suffix = 0;
    while (aHi - suffix > aLo && bHi - suffix > bLo && a[aHi - suffix - 1] === b[bHi - suffix - 1]) suffix++;
    aHi -= suffix;
    bHi -= suffix;

    if (aLo === aHi || bLo === bHi) {
      emit('delete', aHi - aLo);
      emit('insert', bHi - bLo);
      emit('equal', suffix);
      continue;
    }
    const split = middleSnake(a, aLo, aHi, b, bLo, bHi);
    if (!split) {
      emit('delete', aHi - aLo);
      emit('insert', bHi - bLo);
      emit('equal', suffix);
      continue;
    }
    // Processed in stack order: left half, right half, then the suffix.
    stack.push({ kind: 'equal', count: suffix });
    stack.push({ kind: 'range', aLo: aLo + split[0], aHi, bLo: bLo + split[1], bHi });
    stack.push({ kind: 'range', aLo, aHi: aLo + split[0], bLo, bHi: bLo + split[1] });
  }
  return normalise(ops);
}

/**
 * Finds the middle snake of the shortest edit script between a[aLo..aHi) and
 * b[bLo..bHi) by running the greedy search from both ends until they meet.
 * Returns the split point (relative x, y) or null when nothing is in common.
 */
function middleSnake(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number): [number, number] | null {
  const n = aHi - aLo;
  const m = bHi - bLo;
  const maxD = Math.ceil((n + m) / 2);
  const offset = maxD + 1;
  const size = 2 * maxD + 3;
  const v1 = new Int32Array(size).fill(-1);
  const v2 = new Int32Array(size).fill(-1);
  v1[offset + 1] = 0;
  v2[offset + 1] = 0;
  const delta = n - m;
  const front = (delta & 1) !== 0;
  let k1start = 0;
  let k1end = 0;
  let k2start = 0;
  let k2end = 0;
  for (let d = 0; d < maxD; d++) {
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      const i1 = offset + k1;
      let x1 = k1 === -d || (k1 !== d && v1[i1 - 1]! < v1[i1 + 1]!) ? v1[i1 + 1]! : v1[i1 - 1]! + 1;
      let y1 = x1 - k1;
      while (x1 < n && y1 < m && a[aLo + x1] === b[bLo + y1]) {
        x1++;
        y1++;
      }
      v1[i1] = x1;
      if (x1 > n) k1end += 2;
      else if (y1 > m) k1start += 2;
      else if (front) {
        const i2 = offset + delta - k1;
        if (i2 >= 0 && i2 < size && v2[i2] !== -1 && x1 >= n - v2[i2]!) return [x1, y1];
      }
    }
    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      const i2 = offset + k2;
      let x2 = k2 === -d || (k2 !== d && v2[i2 - 1]! < v2[i2 + 1]!) ? v2[i2 + 1]! : v2[i2 - 1]! + 1;
      let y2 = x2 - k2;
      while (x2 < n && y2 < m && a[aLo + n - x2 - 1] === b[bLo + m - y2 - 1]) {
        x2++;
        y2++;
      }
      v2[i2] = x2;
      if (x2 > n) k2end += 2;
      else if (y2 > m) k2start += 2;
      else if (!front) {
        const i1 = offset + delta - k2;
        if (i1 >= 0 && i1 < size && v1[i1] !== -1) {
          const x1 = v1[i1]!;
          const y1 = x1 - (i1 - offset);
          if (x1 >= n - x2) return [x1, y1];
        }
      }
    }
  }
  return null;
}

/** Merges runs and puts deletions before insertions inside each changed stretch. */
function normalise(ops: RawOp[]): RawOp[] {
  const out: RawOp[] = [];
  let del = 0;
  let ins = 0;
  const flush = (): void => {
    if (del) out.push({ type: 'delete', count: del });
    if (ins) out.push({ type: 'insert', count: ins });
    del = 0;
    ins = 0;
  };
  for (const op of ops) {
    if (op.type === 'delete') del += op.count;
    else if (op.type === 'insert') ins += op.count;
    else {
      flush();
      const last = out[out.length - 1];
      if (last?.type === 'equal') last.count += op.count;
      else out.push({ type: 'equal', count: op.count });
    }
  }
  flush();
  return out;
}

interface Entry {
  type: OpType;
  line: string;
  oldLine?: number;
  newLine?: number;
}

/** The diff as one entry per line, with the raw lines (line endings included). */
function entries(a: string, b: string): Entry[] {
  const oldLines = splitLines(a);
  const newLines = splitLines(b);
  const [ia, ib] = intern(oldLines, newLines);
  const out: Entry[] = [];
  let i = 0;
  let j = 0;
  for (const op of myers(ia, ib)) {
    for (let n = 0; n < op.count; n++) {
      if (op.type === 'equal') out.push({ type: 'equal', line: oldLines[i]!, oldLine: ++i, newLine: ++j });
      else if (op.type === 'delete') out.push({ type: 'delete', line: oldLines[i]!, oldLine: ++i });
      else out.push({ type: 'insert', line: newLines[j]!, newLine: ++j });
    }
  }
  return out;
}

/** Line diff of `a` → `b` as runs of equal, deleted and inserted lines. */
export function diffLines(a: string, b: string): DiffOp[] {
  const oldLines = splitLines(a);
  const newLines = splitLines(b);
  const [ia, ib] = intern(oldLines, newLines);
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  for (const op of myers(ia, ib)) {
    const source = op.type === 'insert' ? newLines.slice(j, j + op.count) : oldLines.slice(i, i + op.count);
    if (op.type !== 'insert') i += op.count;
    if (op.type !== 'delete') j += op.count;
    out.push({ type: op.type, lines: source.map(stripEol) });
  }
  return out;
}

interface RawHunk {
  id: number;
  start: number;
  end: number;
}

/** Groups changed lines with `context` lines around them; nearby changes share a hunk. */
function group(list: readonly Entry[], context: number): RawHunk[] {
  const ctx = Math.max(0, Math.floor(context));
  const hunks: RawHunk[] = [];
  let i = 0;
  while (i < list.length) {
    if (list[i]!.type === 'equal') {
      i++;
      continue;
    }
    let j = i;
    while (j < list.length && list[j]!.type !== 'equal') j++;
    const start = Math.max(0, i - ctx);
    const end = Math.min(list.length, j + ctx);
    const last = hunks[hunks.length - 1];
    if (last && last.end >= start) last.end = end;
    else hunks.push({ id: hunks.length, start, end });
    i = j;
  }
  return hunks;
}

/**
 * The diff as hunks: each run of changes with `context` unchanged lines
 * around it (default 3). Hunks whose context would touch are merged.
 * Ids run 0..n-1 in order; line numbers are 1-based.
 */
export function computeHunks(a: string, b: string, context = 3): Hunk[] {
  const list = entries(a, b);
  let oldBefore = 0;
  let newBefore = 0;
  let cursor = 0;
  return group(list, context).map((raw) => {
    for (; cursor < raw.start; cursor++) {
      oldBefore++;
      newBefore++;
    }
    const lines = list.slice(raw.start, raw.end).map((e) => {
      const line: Hunk['lines'][number] = { type: e.type, text: stripEol(e.line) };
      if (e.oldLine !== undefined) line.oldLine = e.oldLine;
      if (e.newLine !== undefined) line.newLine = e.newLine;
      return line;
    });
    const oldCount = lines.filter((l) => l.type !== 'insert').length;
    const newCount = lines.filter((l) => l.type !== 'delete').length;
    const hunk: Hunk = {
      id: raw.id,
      oldStart: oldBefore + 1,
      oldEnd: oldBefore + oldCount,
      newStart: newBefore + 1,
      newEnd: newBefore + newCount,
      lines,
    };
    // Lines between hunks are all unchanged, so both counters move together.
    oldBefore += oldCount;
    newBefore += newCount;
    cursor = raw.end;
    return hunk;
  });
}

/**
 * `a` with only the selected hunks of `diff(a, b)` applied. Selecting every
 * id gives `b`, selecting none gives `a`. Pass the same `context` that was
 * given to computeHunks (default 3) so the ids match.
 */
export function applyHunks(a: string, b: string, selected: Iterable<number>, context = 3): string {
  const chosen = new Set(selected);
  const list = entries(a, b);
  const out: string[] = [];
  let cursor = 0;
  const copyEqual = (until: number): void => {
    for (; cursor < until; cursor++) out.push(list[cursor]!.line);
  };
  for (const hunk of group(list, context)) {
    copyEqual(hunk.start);
    const take = chosen.has(hunk.id);
    for (; cursor < hunk.end; cursor++) {
      const e = list[cursor]!;
      if (e.type === 'equal' || (e.type === 'insert') === take) out.push(e.line);
    }
  }
  copyEqual(list.length);
  return out.join('');
}

/** Number of added and removed lines. */
export function diffStats(a: string, b: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const op of diffLines(a, b)) {
    if (op.type === 'insert') added += op.lines.length;
    else if (op.type === 'delete') removed += op.lines.length;
  }
  return { added, removed };
}
