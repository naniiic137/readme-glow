/**
 * Scroll sync between the Markdown editor and the preview. Rendered blocks
 * carry data-line (their first source line); these pure helpers interpolate
 * between those anchors in both directions.
 */

export interface Anchor {
  line: number;
  top: number;
}

/** Sorts by line and drops anchors whose position goes backwards (e.g. floated or hidden blocks). */
export function cleanAnchors(anchors: Anchor[]): Anchor[] {
  const sorted = [...anchors].sort((a, b) => a.line - b.line || a.top - b.top);
  const out: Anchor[] = [];
  for (const a of sorted) {
    const last = out[out.length - 1];
    if (last && a.line === last.line) continue;
    if (last && a.top < last.top) continue;
    out.push(a);
  }
  return out;
}

/** Pixel offset in the preview for a (fractional) source line. */
export function lineToOffset(anchors: Anchor[], line: number): number {
  if (!anchors.length) return 0;
  const first = anchors[0]!;
  if (line <= first.line) return first.top * (line / Math.max(1, first.line));
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]!;
    const b = anchors[i + 1]!;
    if (line >= a.line && line < b.line) {
      const t = (line - a.line) / (b.line - a.line);
      return a.top + t * (b.top - a.top);
    }
  }
  return anchors[anchors.length - 1]!.top;
}

/** Source line (fractional) for a pixel offset in the preview. */
export function offsetToLine(anchors: Anchor[], top: number): number {
  if (!anchors.length) return 1;
  const first = anchors[0]!;
  if (top <= first.top) return Math.max(1, first.top > 0 ? (top / first.top) * first.line : first.line);
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]!;
    const b = anchors[i + 1]!;
    if (top >= a.top && top < b.top) {
      const t = b.top === a.top ? 0 : (top - a.top) / (b.top - a.top);
      return a.line + t * (b.line - a.line);
    }
  }
  return anchors[anchors.length - 1]!.line;
}

/** The last block starting at or before `line` (the one the cursor is in). */
export function blockAtLine<T extends { line: number }>(blocks: T[], line: number): T | null {
  let best: T | null = null;
  for (const b of blocks) {
    if (b.line <= line && (!best || b.line >= best.line)) best = b;
  }
  return best;
}
