/**
 * Find in document: searches the rendered text (across element boundaries)
 * and returns DOM Ranges, which the preview highlights with the CSS Custom
 * Highlight API — the document's DOM is never modified.
 */
const SKIP = 'svg, button, .rg-anchor, .rg-code-head, script, style, .katex-mathml, .rg-mermaid-source';
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, dt, dd, summary, figcaption, caption, div, section, header';

export interface FindOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  limit?: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findRanges(root: Node, query: string, options: FindOptions = {}): Range[] {
  if (!query) return [];
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? 2 /* REJECT */ : 1 /* ACCEPT */),
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let full = '';
  let lastBlock: Element | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    // A line break between blocks, so matches never run from one paragraph into the next.
    const block = n.parentElement?.closest(BLOCKS) ?? null;
    if (nodes.length && block !== lastBlock) full += '\n';
    lastBlock = block;
    nodes.push(n);
    starts.push(full.length);
    full += n.nodeValue ?? '';
  }
  const flags = options.caseSensitive ? 'g' : 'gi';
  const body = escapeRegExp(query);
  const re = new RegExp(options.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body, `${flags}u`);
  const ranges: Range[] = [];
  const limit = options.limit ?? 2000;
  const locate = (pos: number): [Text, number] => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return [nodes[lo]!, pos - starts[lo]!];
  };
  for (const m of full.matchAll(re)) {
    if (m[0].length === 0) continue;
    const start = m.index!;
    const end = start + m[0].length;
    const [sn, so] = locate(start);
    const [en, eo] = locate(end - 1);
    const range = doc.createRange();
    range.setStart(sn, so);
    range.setEnd(en, eo + 1);
    ranges.push(range);
    if (ranges.length >= limit) break;
  }
  return ranges;
}

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };

/** Paints ranges with the CSS Custom Highlight API when available. Returns false otherwise. */
export function paintHighlights(all: Range[], current: Range | null): boolean {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const HighlightCtor = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!css?.highlights || !HighlightCtor) return false;
  css.highlights.set('rg-find', new HighlightCtor(...all));
  if (current) css.highlights.set('rg-find-current', new HighlightCtor(current));
  else css.highlights.delete('rg-find-current');
  return true;
}

export function clearHighlights(): void {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  css?.highlights?.delete('rg-find');
  css?.highlights?.delete('rg-find-current');
}
