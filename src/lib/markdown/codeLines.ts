import type { Element, ElementContent } from 'hast';

interface Segment {
  value: string;
  ancestors: Element[];
}

/**
 * Wraps every line of a (possibly highlighted) code element in
 * `<span class="rg-line">`, splitting highlight spans that cross line breaks,
 * so CSS counters can draw line numbers. Lines stay separated by "\n" text
 * nodes, so copying the code keeps its newlines.
 */
export function splitCodeLines(code: Element): void {
  const segments: Segment[] = [];
  const flatten = (nodes: ElementContent[], ancestors: Element[]): void => {
    for (const n of nodes) {
      if (n.type === 'text') segments.push({ value: n.value, ancestors });
      else if (n.type === 'element') flatten(n.children, [...ancestors, n]);
    }
  };
  flatten(code.children, []);

  const lines: Segment[][] = [[]];
  for (const seg of segments) {
    const parts = seg.value.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ value: part, ancestors: seg.ancestors });
    });
  }
  // A trailing newline does not make an extra numbered line.
  if (lines.length > 1 && lines[lines.length - 1]!.length === 0) lines.pop();

  const children: ElementContent[] = [];
  lines.forEach((line, index) => {
    if (index > 0) children.push({ type: 'text', value: '\n' });
    children.push({
      type: 'element',
      tagName: 'span',
      properties: { className: ['rg-line'] },
      children: line.map(wrapSegment),
    });
  });
  code.children = children;
}

function wrapSegment(seg: Segment): ElementContent {
  let node: ElementContent = { type: 'text', value: seg.value };
  for (let i = seg.ancestors.length - 1; i >= 0; i--) {
    const a = seg.ancestors[i]!;
    node = { type: 'element', tagName: a.tagName, properties: { ...a.properties }, children: [node] };
  }
  return node;
}
