import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../markdown/parse';
import { detectLanguage } from './detectLanguage';
import { emojiForSection } from './sectionEmoji';
import { alignTable, displayWidth, splitRow } from './tables';
import { applySplices, collectHeadings, htmlNesting, normaliseName, slugify } from './util';

describe('applySplices', () => {
  it('applies splices by offset in the original string, keeping insert order at the same offset', () => {
    const out = applySplices('abcdef', [
      { start: 4, end: 6, text: 'XY' },
      { start: 0, end: 0, text: '1' },
      { start: 0, end: 0, text: '2' },
      { start: 1, end: 2, text: '' },
    ]);
    expect(out).toBe('12acdXY');
  });

  it('drops a splice that overlaps an earlier one instead of corrupting the text', () => {
    expect(applySplices('abcdef', [{ start: 1, end: 4, text: '-' }, { start: 2, end: 3, text: '!' }])).toBe('a-ef');
    expect(applySplices('same', [])).toBe('same');
  });
});

describe('tables', () => {
  it('measures display width for ASCII, CJK, emoji, combining marks and ZWJ sequences', () => {
    expect(displayWidth('abc')).toBe(3);
    expect(displayWidth('日本語')).toBe(6);
    expect(displayWidth('😀')).toBe(2);
    expect(displayWidth('é')).toBe(1);
    expect(displayWidth('👨‍👩‍👧')).toBe(2);
    expect(displayWidth('❤️')).toBe(2);
    expect(displayWidth('مرحبا')).toBe(5);
  });

  it('splits rows on unescaped pipes only', () => {
    expect(splitRow('| a | b \\| c |')).toEqual(['a', 'b \\| c']);
    expect(splitRow('a|b')).toEqual(['a', 'b']);
    expect(splitRow('| a\\\\| b |')).toEqual(['a\\\\', 'b']);
    expect(splitRow('| a | |')).toEqual(['a', '']);
  });

  it('pads cells, fills short rows and writes the delimiter row with colons', () => {
    expect(alignTable('a|b|c\n:-|:-:|-:\n1|2', ['left', 'center', 'right'])).toBe(
      ['| a   |  b  |   c |', '| :-- | :-: | --: |', '| 1   |  2  |     |'].join('\n'),
    );
  });
});

describe('detectLanguage', () => {
  it.each([
    ['npm install readme-glow', 'bash'],
    ['$ ./configure\n$ make', 'bash'],
    ['# install\ngit clone x\ncd x', 'bash'],
    ['make', 'bash'],
    ['{\n  "name": "glow"\n}', 'json'],
    ['[1, 2, 3]', 'json'],
    ['import os\nprint(os.getcwd())', 'python'],
    ['def main():\n    pass', 'python'],
    ["import { x } from 'y';\nx();", 'js'],
    ['const add = (a, b) => a + b;', 'js'],
    ['const n: number = 1;\nexport interface A { b: string }', 'ts'],
    ['<div class="x">hi</div>', 'html'],
    ['name: glow\nversion: 1.0\nitems:\n  - a', 'yaml'],
  ])('%j → %s', (code, lang) => {
    expect(detectLanguage(code)).toBe(lang);
  });

  it.each([['Hello there, this is just text.'], ['Error: something failed'], ['{ not json'], [''], ['1. one\n2. two']])('leaves %j unlabelled', (code) => {
    expect(detectLanguage(code)).toBeNull();
  });
});

describe('section names and slugs', () => {
  it('normalises section names and maps them to one emoji each', () => {
    expect(normaliseName('📦 Getting  Started:')).toBe('getting started');
    expect(emojiForSection('Installation')).toBe('📦');
    expect(emojiForSection('Getting started')).toBe('🏁');
    expect(emojiForSection('LICENCE')).toBe('📄');
    expect(emojiForSection('License')).toBe('📄');
    expect(emojiForSection('Built With')).toBe('🛠️');
    expect(emojiForSection('Why this exists')).toBeNull();
  });

  it('slugs headings like GitHub (emoji dropped, duplicates numbered, images ignored)', () => {
    const tree = parseMarkdown('# App\n\n## 📦 Install\n\n## Usage\n\n### Usage\n\n## ![icon](i.png) API `v2`\n\n<h2>Usage</h2>\n');
    const refs = collectHeadings(tree);
    expect(slugify(refs.map((r) => r.text))).toEqual(['app', '-install', 'usage', 'usage-1', 'api-v2', 'usage-2']);
  });

  it('tracks centred HTML wrappers across top-level blocks', () => {
    const tree = parseMarkdown('<div align="center">\n\n# App\n\n</div>\n\nText\n\n<div>\n\nInner\n\n</div>\n');
    const { before, after } = htmlNesting(tree);
    expect(before.map((s) => s.centred)).toEqual([false, true, true, false, false, false, false]);
    expect(after[0]).toEqual({ depth: 1, centred: true, outer: 0 });
    expect(before[5]).toEqual({ depth: 1, centred: false, outer: 4 });
  });
});
