import { describe, expect, it } from 'vitest';
import { applyHunks, computeHunks, diffLines, diffStats } from './diff';

/** Deterministic pseudo-random numbers (mulberry32). */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Length of the longest common subsequence of two line lists (plain DP). */
function lcs(a: readonly string[], b: readonly string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(row[j]!, row[j - 1]!);
      prev = temp;
    }
  }
  return row[b.length]!;
}

const lines = (text: string): string[] => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));
const allIds = (a: string, b: string) => computeHunks(a, b).map((h) => h.id);

describe('diffLines', () => {
  it('returns one equal run for identical texts and nothing for two empty ones', () => {
    expect(diffLines('a\nb\n', 'a\nb\n')).toEqual([{ type: 'equal', lines: ['a', 'b'] }]);
    expect(diffLines('', '')).toEqual([]);
  });

  it('handles empty inputs on either side', () => {
    expect(diffLines('', 'x\ny\n')).toEqual([{ type: 'insert', lines: ['x', 'y'] }]);
    expect(diffLines('x\ny\n', '')).toEqual([{ type: 'delete', lines: ['x', 'y'] }]);
  });

  it('finds inserts, deletes and replacements with deletions listed first', () => {
    expect(diffLines('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual([
      { type: 'equal', lines: ['a'] },
      { type: 'delete', lines: ['b'] },
      { type: 'insert', lines: ['B'] },
      { type: 'equal', lines: ['c'] },
      { type: 'insert', lines: ['d'] },
    ]);
  });

  it('shows a missing final newline as a change to the last line', () => {
    expect(diffLines('a\nb', 'a\nb\n')).toEqual([
      { type: 'equal', lines: ['a'] },
      { type: 'delete', lines: ['b'] },
      { type: 'insert', lines: ['b'] },
    ]);
    expect(diffStats('a\nb', 'a\nb\n')).toEqual({ added: 1, removed: 1 });
  });

  it('produces a minimal edit script that rebuilds both sides (fuzzed against LCS)', () => {
    const rand = random(42);
    for (let round = 0; round < 300; round++) {
      const make = () => Array.from({ length: Math.floor(rand() * 14) }, () => 'abcde'[Math.floor(rand() * 5)]!);
      const a = make();
      const b = make();
      const ops = diffLines(a.map((l) => `${l}\n`).join(''), b.map((l) => `${l}\n`).join(''));
      const oldSide = ops.filter((o) => o.type !== 'insert').flatMap((o) => o.lines);
      const newSide = ops.filter((o) => o.type !== 'delete').flatMap((o) => o.lines);
      expect(oldSide).toEqual(a);
      expect(newSide).toEqual(b);
      const edits = ops.filter((o) => o.type !== 'equal').reduce((n, o) => n + o.lines.length, 0);
      expect(edits).toBe(a.length + b.length - 2 * lcs(a, b));
    }
  });
});

describe('computeHunks', () => {
  const a = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
  const b = a.replace('line 2\n', 'LINE 2\n').replace('line 18\n', 'line 18\nextra\n');

  it('groups changes with context and 1-based line numbers', () => {
    const hunks = computeHunks(a, b);
    expect(hunks.map((h) => [h.id, h.oldStart, h.oldEnd, h.newStart, h.newEnd])).toEqual([
      [0, 1, 5, 1, 5],
      [1, 16, 20, 16, 21],
    ]);
    expect(hunks[0]!.lines.slice(0, 3)).toEqual([
      { type: 'equal', text: 'line 1', oldLine: 1, newLine: 1 },
      { type: 'delete', text: 'line 2', oldLine: 2 },
      { type: 'insert', text: 'LINE 2', newLine: 2 },
    ]);
    expect(hunks[1]!.lines.find((l) => l.type === 'insert')).toEqual({ type: 'insert', text: 'extra', newLine: 19 });
  });

  it('merges hunks whose context would touch, and supports a custom context', () => {
    expect(computeHunks(a, b, 10)).toHaveLength(1);
    const tight = computeHunks(a, b, 0);
    expect(tight.map((h) => [h.oldStart, h.oldEnd, h.newStart, h.newEnd])).toEqual([
      [2, 2, 2, 2],
      [19, 18, 19, 19],
    ]);
  });

  it('returns no hunks for identical texts', () => {
    expect(computeHunks(a, a)).toEqual([]);
  });
});

describe('applyHunks', () => {
  const cases: Array<[string, string]> = [
    ['', ''],
    ['', 'new\nfile\n'],
    ['old\nfile\n', ''],
    ['a\nb', 'a\nb\n'],
    ['a\nb\n', 'a\nb'],
    ['one\ntwo\nthree\n', 'zero\none\n2\nthree\nfour'],
    ['\n\n\n', '\n'],
  ];

  it('gives b with every hunk and a with none', () => {
    for (const [a, b] of cases) {
      expect(applyHunks(a, b, allIds(a, b))).toBe(b);
      expect(applyHunks(a, b, [])).toBe(a);
    }
  });

  it('applies only the selected hunks', () => {
    const a = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') + '\n';
    const b = a.replace('l1\n', 'L1\n').replace('l15\n', '').replace('l28\n', 'l28\nnew\n');
    const hunks = computeHunks(a, b);
    expect(hunks).toHaveLength(3);
    expect(applyHunks(a, b, [1])).toBe(a.replace('l15\n', ''));
    expect(applyHunks(a, b, new Set([0, 2]))).toBe(a.replace('l1\n', 'L1\n').replace('l28\n', 'l28\nnew\n'));
    expect(applyHunks(a, b, [0, 1, 2])).toBe(b);
  });

  it('agrees with computeHunks when given the same context', () => {
    const a = 'a\nb\nc\nd\ne\nf\n';
    const b = 'A\nb\nc\nd\ne\nF\n';
    expect(computeHunks(a, b, 1)).toHaveLength(2);
    expect(applyHunks(a, b, [1], 1)).toBe('a\nb\nc\nd\ne\nF\n');
  });

  it('rebuilds every subset of hunks consistently (fuzzed)', () => {
    const rand = random(7);
    for (let round = 0; round < 100; round++) {
      const base = Array.from({ length: 40 }, (_, i) => `row ${i}`);
      const next = base.flatMap((row) => {
        const r = rand();
        if (r < 0.06) return [];
        if (r < 0.12) return [`${row} changed`];
        if (r < 0.16) return [row, `${row} added`];
        return [row];
      });
      const a = `${base.join('\n')}\n`;
      const b = `${next.join('\n')}\n`;
      const ids = allIds(a, b);
      expect(applyHunks(a, b, ids)).toBe(b);
      const subset = ids.filter(() => rand() < 0.5);
      const partial = applyHunks(a, b, subset);
      // Applying the rest on top of the partial result finishes the job.
      const rest = computeHunks(partial, b).map((h) => h.id);
      expect(applyHunks(partial, b, rest)).toBe(b);
      expect(diffStats(partial, b).added + diffStats(a, partial).added).toBeGreaterThanOrEqual(diffStats(a, b).added);
    }
  });
});

describe('diffStats', () => {
  it('counts added and removed lines', () => {
    expect(diffStats('a\nb\nc\n', 'a\nc\nd\ne\n')).toEqual({ added: 2, removed: 1 });
    expect(diffStats('', '')).toEqual({ added: 0, removed: 0 });
    expect(diffStats('', 'x')).toEqual({ added: 1, removed: 0 });
  });
});

describe('performance', () => {
  const big = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag} line ${i} ${'x'.repeat(i % 40)}`);

  it('diffs 3000-line files with scattered edits well under a second', () => {
    const a = big(3000, 'same');
    const b = a.flatMap((line, i) => (i % 25 === 0 ? [`${line} edited`] : i % 97 === 0 ? [] : i % 61 === 0 ? [line, 'inserted'] : [line]));
    const t0 = performance.now();
    const hunks = computeHunks(a.join('\n'), b.join('\n'));
    const rebuilt = applyHunks(a.join('\n'), b.join('\n'), hunks.map((h) => h.id));
    const ms = performance.now() - t0;
    expect(rebuilt).toBe(b.join('\n'));
    expect(ms).toBeLessThan(1000);
  });

  it('diffs two completely different 3000-line files quickly', () => {
    const a = big(3000, 'old').join('\n');
    const b = big(3000, 'new').join('\n');
    const t0 = performance.now();
    const stats = diffStats(a, b);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(stats).toEqual({ added: 3000, removed: 3000 });
  });

  it('diffs 3000-line files with interleaved differences quickly', () => {
    const a = Array.from({ length: 3000 }, (_, i) => (i % 2 === 0 ? `even ${i}` : `a ${i}`)).join('\n');
    const b = Array.from({ length: 3000 }, (_, i) => (i % 2 === 0 ? `even ${i}` : `b ${i}`)).join('\n');
    const t0 = performance.now();
    const ops = diffLines(a, b);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(ops.filter((o) => o.type === 'equal').reduce((n, o) => n + o.lines.length, 0)).toBe(1500);
    expect(lines(a)).toHaveLength(3000);
  });
});
