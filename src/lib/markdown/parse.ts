import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Root, RootContent, Nodes, PhrasingContent, Heading } from 'mdast';

/**
 * The one Markdown parser used everywhere (rendering, health check, beautify,
 * summary, visual editing), so every feature agrees on what a block is and
 * where it starts and ends in the source. Positions are UTF-16 offsets into the
 * original string, which is what makes byte-exact splicing possible.
 */
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

export function parseMarkdown(markdown: string): Root {
  const tree = parser.parse(markdown) as Root;
  fixInlineMath(tree);
  return tree;
}

/**
 * GitHub only treats `$...$` as math when the content does not start or end
 * with whitespace, so "costs $5 and $10" stays text. remark-math is more eager;
 * turn those false positives back into plain text.
 */
function fixInlineMath(tree: Root): void {
  walk(tree, (node, parent, index) => {
    if (node.type !== 'inlineMath' || !parent || index === undefined) return;
    const value = node.value;
    if (value.length === 0 || /^\s/.test(value) || /\s$/.test(value)) {
      const dollars = '$';
      (parent.children as PhrasingContent[])[index] = {
        type: 'text',
        value: `${dollars}${value}${dollars}`,
        position: node.position,
      };
    }
  });
}

type Parent = Extract<Nodes, { children: unknown }>;

/** Depth-first walk over an mdast tree. Return `false` to skip children. */
export function walk(
  node: Nodes,
  visit: (node: Nodes, parent: Parent | null, index: number | undefined) => boolean | void,
  parent: Parent | null = null,
  index?: number,
): void {
  if (visit(node, parent, index) === false) return;
  if ('children' in node) {
    const children = node.children as Nodes[];
    for (let i = 0; i < children.length; i++) {
      walk(children[i]!, visit, node as Parent, i);
    }
  }
}

/** Plain text of an mdast node (inline code included, HTML tags dropped). */
export function mdText(node: Nodes): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value;
  if (node.type === 'html') return node.value.replace(/<[^>]*>/g, '');
  if (node.type === 'image') return node.alt ?? '';
  if (node.type === 'break') return ' ';
  if ('children' in node) return (node.children as Nodes[]).map(mdText).join('');
  return '';
}

export function headingText(node: Heading): string {
  return mdText(node).replace(/\s+/g, ' ').trim();
}

export function startOffset(node: { position?: { start: { offset?: number } } }): number {
  return node.position?.start.offset ?? 0;
}

export function endOffset(node: { position?: { end: { offset?: number } } }): number {
  return node.position?.end.offset ?? 0;
}

export function startLine(node: { position?: { start: { line: number } } }): number {
  return node.position?.start.line ?? 1;
}

export type { Root, RootContent };
