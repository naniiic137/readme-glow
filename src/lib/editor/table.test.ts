import { describe, expect, it } from 'vitest';
import { buildTable, displayWidth, emptyCells, parseTable, type TableSpec } from './table';
import { renderMarkdown } from '../markdown/pipeline';

describe('displayWidth', () => {
  it('counts ASCII and accented Latin as 1 per character', () => {
    expect(displayWidth('hello')).toBe(5);
    expect(displayWidth('Café')).toBe(4);
    // "e" + combining acute accent is one column.
    expect(displayWidth('Café')).toBe(4);
  });

  it('counts CJK and fullwidth characters as 2', () => {
    expect(displayWidth('日本語')).toBe(6);
    expect(displayWidth('한국어')).toBe(6);
    expect(displayWidth('ＡＢ')).toBe(4);
  });

  it('counts emoji (including ZWJ sequences, skin tones and flags) as 2', () => {
    expect(displayWidth('🚀')).toBe(2);
    expect(displayWidth('👩‍💻')).toBe(2);
    expect(displayWidth('👍🏽')).toBe(2);
    expect(displayWidth('🇹🇳')).toBe(2);
    expect(displayWidth('❤️')).toBe(2);
    expect(displayWidth('a🚀b')).toBe(4);
  });

  it('keeps text-style symbols narrow and zero-width characters at 0', () => {
    expect(displayWidth('©')).toBe(1);
    expect(displayWidth('a​b')).toBe(2);
    expect(displayWidth('')).toBe(0);
  });
});

describe('emptyCells', () => {
  it('creates independent rows of empty strings', () => {
    const cells = emptyCells(2, 3);
    expect(cells).toEqual([
      ['', '', ''],
      ['', '', ''],
    ]);
    cells[0]![0] = 'x';
    expect(cells[1]![0]).toBe('');
  });
});

describe('buildTable', () => {
  it('builds an aligned table with a delimiter row per alignment', () => {
    const out = buildTable({
      rows: 3,
      cols: 4,
      header: true,
      align: ['left', 'center', 'right', null],
      cells: [
        ['Name', 'Stars', 'Size', 'Notes'],
        ['alpha', '5', '12 kB', 'first'],
        ['beta', '1200', '3 kB', ''],
      ],
    });
    expect(out).toBe(
      [
        '| Name  | Stars |  Size | Notes |',
        '| :---- | :---: | ----: | ----- |',
        '| alpha |   5   | 12 kB | first |',
        '| beta  | 1200  |  3 kB |       |',
      ].join('\n'),
    );
  });

  it('uses at least three dashes per column and has no trailing newline', () => {
    const out = buildTable({ rows: 2, cols: 2, header: true, cells: [['a', 'b'], ['1', '2']] });
    expect(out.split('\n')[1]).toBe('| --- | --- |');
    expect(out.endsWith('\n')).toBe(false);
  });

  it('names empty header cells "Column N"', () => {
    const out = buildTable({ rows: 2, cols: 3, header: true, cells: [['Key', '', ''], ['a', 'b', 'c']] });
    expect(out.split('\n')[0]).toBe('| Key | Column 2 | Column 3 |');
  });

  it('builds an empty table from dimensions only', () => {
    const out = buildTable({ rows: 3, cols: 2, header: true });
    expect(out.split('\n')).toHaveLength(4);
    expect(out.split('\n')[0]).toBe('| Column 1 | Column 2 |');
  });

  it('escapes pipes and turns line breaks into <br>', () => {
    const out = buildTable({ rows: 2, cols: 2, header: true, cells: [['Cmd', 'Info'], ['a | b', 'line one\nline two']] });
    expect(out).toContain('a \\| b');
    expect(out).toContain('line one<br>line two');
  });

  it('does not double-escape an already escaped pipe', () => {
    const out = buildTable({ rows: 2, cols: 1, header: true, cells: [['x'], ['a \\| b']] });
    expect(out).toContain('a \\| b');
    expect(out).not.toContain('\\\\|');
  });

  it('pads by display width so CJK and emoji columns line up', () => {
    const out = buildTable({ rows: 3, cols: 2, header: true, cells: [['Word', 'Note'], ['日本', 'wide'], ['🚀', 'emoji']] });
    const lines = out.split('\n');
    const widths = lines.map((l) => displayWidth(l));
    expect(new Set(widths).size).toBe(1);
  });

  it('writes a blank header line when header is false', () => {
    const out = buildTable({ rows: 2, cols: 2, header: false, cells: [['a', 'b'], ['c', 'd']] });
    const lines = out.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^\|\s+\|\s+\|$/);
    expect(lines[2]).toBe('| a   | b   |');
  });

  it('renders as a real table through the pipeline', async () => {
    const md = buildTable({ rows: 2, cols: 2, header: true, align: ['center', 'right'], cells: [['A', 'B'], ['x | y', '1\n2']] });
    const { html } = await renderMarkdown(md);
    expect(html).toContain('<table');
    expect(html).toMatch(/<th[^>]*align="center"/);
    expect(html).toContain('x | y');
    expect(html).toContain('<br>');
  });
});

describe('parseTable', () => {
  it('round-trips build → parse', () => {
    const spec: TableSpec = {
      rows: 4,
      cols: 3,
      header: true,
      align: ['left', null, 'right'],
      cells: [
        ['Feature', 'Status', 'Notes'],
        ['Pipes', 'a | b', 'escaped'],
        ['Breaks', 'one\ntwo', ''],
        ['Wide', '日本語 🚀', 'ok'],
      ],
    };
    expect(parseTable(buildTable(spec))).toEqual(spec);
  });

  it('round-trips a headerless table', () => {
    const spec: TableSpec = { rows: 2, cols: 2, header: false, align: [null, 'center'], cells: [['a', 'b'], ['c', 'd']] };
    expect(parseTable(buildTable(spec))).toEqual(spec);
  });

  it('reads hand-written tables without outer pipes or padding', () => {
    const spec = parseTable('a|b\n:-:|--:\n1|2\n3\n');
    expect(spec).toEqual({
      rows: 3,
      cols: 2,
      header: true,
      align: ['center', 'right'],
      cells: [
        ['a', 'b'],
        ['1', '2'],
        ['3', ''],
      ],
    });
  });

  it('unescapes pipes and <br> variants, keeps other escapes', () => {
    const spec = parseTable('| A | B |\n|---|---|\n| x \\| y | 1<br/>2<BR>3 |\n| \\*star\\* | `c` |\n');
    expect(spec?.cells?.[1]).toEqual(['x | y', '1\n2\n3']);
    expect(spec?.cells?.[2]).toEqual(['\\*star\\*', '`c`']);
  });

  it('keeps an escaped backslash before a pipe delimiter intact', () => {
    const spec: TableSpec = { rows: 2, cols: 2, header: true, align: [null, null], cells: [['a', 'b'], ['path\\\\|x', 'y']] };
    const md = buildTable(spec);
    expect(parseTable(md)).toEqual(spec);
  });

  it('truncates extra cells and stops at a blank line', () => {
    const spec = parseTable('| a | b |\n| - | - |\n| 1 | 2 | 3 |\n\n| not | part |\n');
    expect(spec?.rows).toBe(2);
    expect(spec?.cells?.[1]).toEqual(['1', '2']);
  });

  it('handles CRLF line endings and leading blank lines', () => {
    const spec = parseTable('\r\n| a | b |\r\n| --- | --- |\r\n| 1 | 2 |\r\n');
    expect(spec?.cells).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('returns null for text that is not a table', () => {
    expect(parseTable('just a paragraph')).toBeNull();
    expect(parseTable('Title\n-----\n')).toBeNull();
    expect(parseTable('| a | b |\n| --- |\n')).toBeNull();
    expect(parseTable('| a | b |\n| x | y |\n')).toBeNull();
    expect(parseTable('')).toBeNull();
  });
});
