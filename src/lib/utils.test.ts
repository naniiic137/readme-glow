// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanAnchors, lineToOffset, offsetToLine, blockAtLine } from './scrollSync';
import { fuzzyFilter, fuzzyScore } from './fuzzy';
import { findRanges } from './find';

describe('scroll sync mapping', () => {
  const anchors = cleanAnchors([
    { line: 1, top: 0 },
    { line: 5, top: 200 },
    { line: 9, top: 600 },
    { line: 7, top: 100 }, // out of order position: dropped
    { line: 5, top: 250 }, // duplicate line: dropped
  ]);

  it('cleans anchors', () => {
    expect(anchors).toEqual([
      { line: 1, top: 0 },
      { line: 5, top: 200 },
      { line: 9, top: 600 },
    ]);
  });

  it('maps lines to offsets and back', () => {
    expect(lineToOffset(anchors, 1)).toBe(0);
    expect(lineToOffset(anchors, 3)).toBe(100);
    expect(lineToOffset(anchors, 7)).toBe(400);
    expect(lineToOffset(anchors, 50)).toBe(600);
    expect(offsetToLine(anchors, 100)).toBe(3);
    expect(offsetToLine(anchors, 400)).toBe(7);
    expect(offsetToLine(anchors, 5000)).toBe(9);
  });

  it('is monotonic', () => {
    let last = -1;
    for (let l = 1; l <= 12; l += 0.5) {
      const y = lineToOffset(anchors, l);
      expect(y).toBeGreaterThanOrEqual(last);
      last = y;
    }
  });

  it('handles empty anchors', () => {
    expect(lineToOffset([], 10)).toBe(0);
    expect(offsetToLine([], 10)).toBe(1);
  });

  it('finds the block that contains a line', () => {
    const blocks = [{ line: 1 }, { line: 4 }, { line: 10 }];
    expect(blockAtLine(blocks, 5)).toEqual({ line: 4 });
    expect(blockAtLine(blocks, 10)).toEqual({ line: 10 });
    expect(blockAtLine([{ line: 3 }], 1)).toBeNull();
  });
});

describe('fuzzy matching', () => {
  it('prefers direct and word-start matches', () => {
    expect(fuzzyScore('theme', 'Theme: Aurora')).toBeGreaterThan(fuzzyScore('theme', 'Change the theme'));
    expect(fuzzyScore('tal', 'Theme: Aurora Light')).toBeGreaterThan(0);
    expect(fuzzyScore('xyz', 'Theme: Aurora')).toBe(-1);
  });

  it('filters and ranks commands', () => {
    const items = ['Export HTML', 'Export PNG card', 'Theme: Synthwave', 'Layout: Slides', 'Toggle editor'];
    expect(fuzzyFilter(items, 'exp png', (s) => s)[0]).toBe('Export PNG card');
    expect(fuzzyFilter(items, 'synth', (s) => s)).toEqual(['Theme: Synthwave']);
    expect(fuzzyFilter(items, '', (s) => s)).toHaveLength(5);
  });
});

describe('find in document', () => {
  it('finds matches across element boundaries, ignoring UI chrome', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Hello <strong>wor</strong>ld, hello again</p><button>hello</button><h2>Hello<a class="rg-anchor">hello</a></h2>';
    const ranges = findRanges(root, 'hello');
    expect(ranges.map((r) => r.toString())).toEqual(['Hello', 'hello', 'Hello']);
    const cross = findRanges(root, 'world');
    expect(cross).toHaveLength(1);
    expect(cross[0]!.toString()).toBe('world');
  });

  it('never matches across two blocks', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h1>Alpha project</h1><p>alpha release</p>';
    expect(findRanges(root, 'alpha', { wholeWord: true })).toHaveLength(2);
    expect(findRanges(root, 'projectalpha')).toHaveLength(0);
  });

  it('supports case-sensitive and whole-word search', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Cat catalog cat.</p>';
    expect(findRanges(root, 'cat', { caseSensitive: true })).toHaveLength(2);
    expect(findRanges(root, 'cat', { wholeWord: true })).toHaveLength(2);
    expect(findRanges(root, 'cat')).toHaveLength(3);
    expect(findRanges(root, '')).toHaveLength(0);
    expect(findRanges(root, '(')).toHaveLength(0);
  });
});
