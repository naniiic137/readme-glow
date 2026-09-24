import { unified } from 'unified';
import rehypeKatex from 'rehype-katex';
import type { Root } from 'hast';

// KaTeX's stylesheet is loaded on the main thread (see app/useRender.ts), so
// this module also works inside the rendering Web Worker.

/**
 * KaTeX rendering, lazy-loaded only for documents that contain math.
 * `trust: false` keeps \href, \url and \html* commands from producing links
 * or attributes; errors render as red source text instead of throwing.
 */
const options = {
  trust: false,
  strict: 'ignore',
  throwOnError: false,
  maxExpand: 500,
  maxSize: 40,
  output: 'htmlAndMathml',
} as const;
const processor = unified().use(rehypeKatex, options as unknown as Parameters<typeof rehypeKatex>[0]);

export function renderMath(tree: Root): void {
  processor.runSync(tree);
}
