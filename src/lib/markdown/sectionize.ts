import type { Root, RootContent, Element } from 'hast';

export type SectionMode = 'flat' | 'sections' | 'slides';

function isHeading(node: RootContent): node is Element {
  return node.type === 'element' && /^h[1-6]$/.test(node.tagName);
}

function depth(node: Element): number {
  return Number(node.tagName[1]);
}

function isFootnotes(node: RootContent): boolean {
  if (node.type !== 'element' || node.tagName !== 'section') return false;
  const c = node.properties.className;
  return Array.isArray(c) ? c.includes('footnotes') : false;
}

function wrap(tagName: string, className: string[], children: RootContent[], extra: Element['properties'] = {}): Element {
  return { type: 'element', tagName, properties: { className, ...extra }, children: children as Element['children'] };
}

/**
 * Groups top-level blocks for layouts:
 * - `sections`: an intro (everything before the first section heading) and one
 *   `<section class="rg-section">` per H2 (or H1/H3 when the README uses those).
 * - `slides`: one `<section class="rg-slide">` per H1/H2 or `---` break.
 * Returns a new root; the input tree is not modified.
 */
export function sectionize(tree: Root, mode: SectionMode): Root {
  if (mode === 'flat') return tree;
  const children = tree.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
  const footnotes = children.filter(isFootnotes);
  const body = children.filter((c) => !isFootnotes(c));

  if (mode === 'slides') {
    const slides: RootContent[][] = [[]];
    for (const node of body) {
      const current = slides[slides.length - 1]!;
      if (node.type === 'element' && node.tagName === 'hr') {
        if (current.length) slides.push([]);
        continue;
      }
      if (isHeading(node) && depth(node) <= 2 && current.some((n) => n.type === 'element')) {
        slides.push([node]);
        continue;
      }
      current.push(node);
    }
    if (footnotes.length) slides.push(footnotes);
    const nonEmpty = slides.filter((s) => s.some((n) => n.type === 'element'));
    return {
      type: 'root',
      children: nonEmpty.map((s, i) =>
        wrap('section', ['rg-slide', i === 0 ? 'rg-slide-title' : 'rg-slide-body'], s, { dataSlide: i, ariaRoledescription: 'slide' }),
      ),
    };
  }

  const headingDepths = body.filter(isHeading).map(depth);
  const h1s = headingDepths.filter((d) => d === 1).length;
  const split = headingDepths.includes(2) ? 2 : h1s > 1 ? 1 : headingDepths.includes(3) ? 3 : 0;
  const groups: RootContent[][] = [[]];
  let seenTitle = false;
  for (const node of body) {
    const splits = split > 0 && isHeading(node) && depth(node) <= split;
    if (splits && depth(node) === 1 && !seenTitle && groups.length === 1) {
      // The README's title stays in the intro.
      seenTitle = true;
      groups[0]!.push(node);
    } else if (splits) {
      groups.push([node]);
    } else {
      groups[groups.length - 1]!.push(node);
    }
  }
  const out: RootContent[] = [];
  groups.forEach((g, i) => {
    if (!g.length) return;
    if (i === 0) out.push(wrap('header', ['rg-intro'], g));
    else {
      const h = g[0] as Element;
      const id = typeof h.properties?.id === 'string' ? h.properties.id : undefined;
      out.push(wrap('section', ['rg-section'], g, id ? { ariaLabelledBy: [id], dataSection: i } : { dataSection: i }));
    }
  });
  if (footnotes.length) out.push(...footnotes);
  return { type: 'root', children: out };
}
