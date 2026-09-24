/**
 * GFM table builder and parser for the "Insert table" / "Edit table" dialog.
 *
 * The cell model is the Markdown source of each cell with two conveniences:
 * a literal `|` (escaped as `\|` in the table) and real line breaks (written
 * as `<br>`). `buildTable` and `parseTable` are inverses on that model.
 */

export type Align = 'left' | 'center' | 'right' | null;

export interface TableSpec {
  rows: number;
  cols: number;
  /**
   * GFM tables always have a header line. When `header` is false every row of
   * `cells` is a body row and the header line is written with empty cells.
   */
  header: boolean;
  align?: Align[];
  /** rows × cols, the header row included when `header` is true. */
  cells?: string[][];
}

const MIN_WIDTH = 3;

export function emptyCells(rows: number, cols: number): string[][] {
  const r = Math.max(0, Math.floor(rows));
  const c = Math.max(0, Math.floor(cols));
  return Array.from({ length: r }, () => Array.from({ length: c }, () => ''));
}

// ------------------------------------------------------------------ display width

const segmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}\p{Cc}]+$/u;
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}|\p{Regional_Indicator}/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/** East Asian Wide and Fullwidth ranges (simplified). */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

function isWide(cp: number): boolean {
  for (const [lo, hi] of WIDE_RANGES) {
    if (cp < lo) return false;
    if (cp <= hi) return true;
  }
  return false;
}

function graphemeWidth(g: string): number {
  if (g === '' || ZERO_WIDTH.test(g)) return 0;
  if (EMOJI_PRESENTATION.test(g)) return 2;
  // Text-style pictographs (©, ™, ↔) become emoji with the U+FE0F selector.
  if (PICTOGRAPHIC.test(g) && g.includes('️')) return 2;
  return isWide(g.codePointAt(0) ?? 0) ? 2 : 1;
}

function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  // Fallback: code points, gluing marks, joiners and modifiers to the previous one.
  const out: string[] = [];
  let joinNext = false;
  for (const ch of text) {
    const glue = joinNext || /[\p{Mn}\p{Me}‍️\p{Emoji_Modifier}]/u.test(ch);
    if (glue && out.length > 0) out[out.length - 1] += ch;
    else out.push(ch);
    joinNext = ch === '‍';
  }
  return out;
}

/** Monospace column width: CJK and emoji count as 2, combining marks as 0. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const g of graphemes(text)) width += graphemeWidth(g);
  return width;
}

// ------------------------------------------------------------------ building

/** Escapes unescaped pipes and turns line breaks into `<br>`. */
function escapeCell(value: string): string {
  const text = value.replace(/\r\n?/g, '\n').trim();
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (ch === '\\' && (next === '\\' || next === '|')) {
      out += ch + next;
      i++;
    } else if (ch === '|') out += '\\|';
    else if (ch === '\n') out += '<br>';
    else out += ch;
  }
  return out.replace(/[ \t]*<br>[ \t]*/g, '<br>');
}

function unescapeCell(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    const next = value[i + 1];
    if (ch === '\\' && next === '|') {
      out += '|';
      i++;
    } else if (ch === '\\' && next === '\\') {
      out += '\\\\';
      i++;
    } else out += ch;
  }
  return out.replace(/<br\s*\/?>/gi, '\n');
}

function pad(text: string, width: number, align: Align): string {
  const gap = Math.max(0, width - displayWidth(text));
  if (align === 'right') return ' '.repeat(gap) + text;
  if (align === 'center') {
    const left = Math.floor(gap / 2);
    return ' '.repeat(left) + text + ' '.repeat(gap - left);
  }
  return text + ' '.repeat(gap);
}

function delimiter(width: number, align: Align): string {
  switch (align) {
    case 'left':
      return `:${'-'.repeat(width - 1)}`;
    case 'right':
      return `${'-'.repeat(width - 1)}:`;
    case 'center':
      return `:${'-'.repeat(width - 2)}:`;
    default:
      return '-'.repeat(width);
  }
}

/** An aligned GFM table (no trailing newline). */
export function buildTable(spec: TableSpec): string {
  const cols = Math.max(1, Math.floor(spec.cols));
  const rows = Math.max(spec.header ? 1 : 0, Math.floor(spec.rows));
  const align: Align[] = Array.from({ length: cols }, (_, c) => spec.align?.[c] ?? null);
  const source = spec.cells ?? [];

  const grid: string[][] = [];
  for (let r = 0; r < rows; r++) {
    grid.push(
      Array.from({ length: cols }, (_, c) => {
        const cell = escapeCell(source[r]?.[c] ?? '');
        return spec.header && r === 0 && cell === '' ? `Column ${c + 1}` : cell;
      }),
    );
  }
  const head = spec.header ? grid[0]! : Array.from({ length: cols }, () => '');
  const body = spec.header ? grid.slice(1) : grid;

  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(MIN_WIDTH, displayWidth(head[c]!), ...body.map((row) => displayWidth(row[c]!))),
  );
  const line = (cells: string[]): string => `| ${cells.map((cell, c) => pad(cell, widths[c]!, align[c]!)).join(' | ')} |`;
  return [line(head), `| ${widths.map((w, c) => delimiter(w, align[c]!)).join(' | ')} |`, ...body.map(line)].join('\n');
}

// ------------------------------------------------------------------ parsing

/** Splits a table row on unescaped pipes; the outer pipes are optional. */
function splitRow(line: string): string[] {
  const s = line.trim();
  const cells: string[] = [];
  let current = '';
  let endsWithPipe = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    endsWithPipe = false;
    if (ch === '\\' && i + 1 < s.length) {
      current += ch + s[i + 1]!;
      i++;
    } else if (ch === '|') {
      cells.push(current);
      current = '';
      endsWithPipe = true;
    } else current += ch;
  }
  cells.push(current);
  if (s.startsWith('|')) cells.shift();
  if (endsWithPipe) cells.pop();
  return cells.map((c) => c.trim());
}

const DELIMITER_CELL = /^:?-+:?$/;

/** Reads a GFM table back into a spec, or null when the text is not a table. */
export function parseTable(markdown: string): TableSpec | null {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  const headLine = lines[i];
  const delimLine = lines[i + 1];
  if (headLine === undefined || delimLine === undefined) return null;
  if (!headLine.includes('|') && !delimLine.includes('|')) return null;

  const delims = splitRow(delimLine);
  if (delims.length === 0 || !delims.every((d) => DELIMITER_CELL.test(d.replace(/\s+/g, '')))) return null;
  const head = splitRow(headLine);
  if (head.length !== delims.length) return null;
  const cols = delims.length;

  const align: Align[] = delims.map((d) => {
    const t = d.replace(/\s+/g, '');
    const l = t.startsWith(':');
    const r = t.endsWith(':');
    return l && r ? 'center' : l ? 'left' : r ? 'right' : null;
  });

  const fit = (cells: string[]): string[] => Array.from({ length: cols }, (_, c) => unescapeCell(cells[c] ?? ''));
  const body: string[][] = [];
  for (let j = i + 2; j < lines.length; j++) {
    const line = lines[j]!;
    if (line.trim() === '') break;
    body.push(fit(splitRow(line)));
  }

  const headCells = fit(head);
  const header = !(headCells.every((c) => c === '') && body.length > 0);
  const cells = header ? [headCells, ...body] : body;
  return { rows: cells.length, cols, header, align, cells };
}
