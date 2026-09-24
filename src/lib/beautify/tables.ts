/**
 * GFM table alignment: pads cells so the pipes line up in a monospaced editor.
 * Cell contents are kept verbatim (escaped pipes included); only the spacing
 * around them and the delimiter row change, so the table renders the same.
 */

export type Align = 'left' | 'right' | 'center' | null;

const ZERO_WIDTH = /[\p{Mn}\p{Me}\p{Cf}]/u;
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;

function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/**
 * Approximate monospace display width: East Asian wide characters and emoji
 * count 2, combining marks and joiners 0, everything else 1. Emoji joined with
 * ZWJ count once; a variation selector turns a text symbol (❤) into a wide emoji.
 */
export function displayWidth(text: string): number {
  let width = 0;
  let afterJoiner = false;
  let last = { cp: 0, width: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x200d) {
      afterJoiner = true;
      continue;
    }
    if (cp === 0xfe0f) {
      if (last.width === 1 && last.cp >= 0x2000) {
        width += 1;
        last = { cp, width: 2 };
      }
      continue;
    }
    if (afterJoiner) {
      afterJoiner = false;
      if (EMOJI_PRESENTATION.test(ch) || cp >= 0x2000) continue;
    }
    if (cp >= 0x1f3fb && cp <= 0x1f3ff) continue; // skin tone modifiers
    if (ZERO_WIDTH.test(ch)) continue;
    let w = 1;
    if (cp >= 0x1f1e6 && cp <= 0x1f1ff) w = 1; // a flag is two regional indicators
    else if (isWideCodePoint(cp) || EMOJI_PRESENTATION.test(ch)) w = 2;
    width += w;
    last = { cp, width: w };
  }
  return width;
}

/** Splits a table row into trimmed cells. `\|` stays inside its cell, as in GFM. */
export function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  const cells: string[] = [];
  let current = '';
  let endedWithPipe = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\\' && (text[i + 1] === '|' || text[i + 1] === '\\')) {
      current += ch + text[i + 1]!;
      i++;
      endedWithPipe = false;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      endedWithPipe = true;
      continue;
    }
    current += ch;
    if (ch !== ' ' && ch !== '\t') endedWithPipe = false;
  }
  if (!endedWithPipe || current.trim() !== '') cells.push(current.trim());
  return cells;
}

function delimiter(align: Align, width: number): string {
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

/** Pads a cell to `width`, on the side(s) that match the column's alignment. */
function pad(text: string, width: number, align: Align): string {
  const room = Math.max(0, width - displayWidth(text));
  if (align === 'right') return ' '.repeat(room) + text;
  if (align === 'center') return ' '.repeat(Math.floor(room / 2)) + text + ' '.repeat(Math.ceil(room / 2));
  return text + ' '.repeat(room);
}

/**
 * Re-formats the source of a GFM table (header, delimiter row, body rows).
 * `align` comes from the parsed table node. Rows with fewer cells than the
 * header get empty cells (GFM does the same when rendering); extra cells are
 * kept as they are.
 */
export function alignTable(source: string, align: readonly Align[]): string {
  const lines = source.split('\n');
  if (lines.length < 2) return source;
  const header = splitRow(lines[0]!);
  const columns = header.length;
  const rows = [header, ...lines.slice(2).map(splitRow)].map((cells) => {
    const filled = cells.slice();
    while (filled.length < columns) filled.push('');
    return filled;
  });
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 3, displayWidth(cell), 3);
    });
  }
  const format = (cells: readonly string[]): string => `| ${cells.map((c, i) => pad(c, widths[i]!, align[i] ?? null)).join(' | ')} |`;
  const delimiterRow = `| ${header.map((_, i) => delimiter(align[i] ?? null, widths[i]!)).join(' | ')} |`;
  const [head, ...body] = rows;
  return [format(head!), delimiterRow, ...body.map(format)].join('\n');
}
