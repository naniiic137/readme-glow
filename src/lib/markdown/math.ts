import { unified } from 'unified';
import rehypeKatex from 'rehype-katex';
import type { Root } from 'hast';
import 'katex/dist/katex.min.css';

/**
 * KaTeX rendering, lazy-loaded only for documents that contain math.
 * `trust: false` keeps \href, \url and \html* commands from producing links
 * or attributes; errors render as red source text instead of throwing.
 */
const processor = unified().use(rehypeKatex, {
  trust: false,
  strict: 'ignore',
  throwOnError: false,
  maxExpand: 500,
  maxSize: 40,
  output: 'htmlAndMathml',
});

export function renderMath(tree: Root): void {
  processor.runSync(tree);
}
