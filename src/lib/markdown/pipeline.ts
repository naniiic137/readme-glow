import { unified } from 'unified';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { toHtml } from 'hast-util-to-html';
import type { Root as HastRoot, Element } from 'hast';
import type { Root as MdastRoot, Text as MdText } from 'mdast';
import { parseMarkdown, walk, mdText } from './parse';
import { sanitizeSchema } from './schema';
import { enhance, walkElements, type CodeInfo } from './enhance';
import { splitCodeLines } from './codeLines';
import { sectionize, type SectionMode } from './sectionize';
import type { RenderOptions, RenderResult } from './types';

export interface RenderOutput extends RenderResult {
  /** The enhanced, sanitised tree (use `htmlFor` to get layout-specific HTML). */
  tree: HastRoot;
}

const toHast = unified()
  .use(remarkRehype, { allowDangerousHtml: true, clobberPrefix: '', footnoteBackLabel: (n: number, r: number) => `Back to reference ${n}${r > 1 ? `-${r}` : ''}` })
  .use(rehypeRaw)
  .use(rehypeSanitize, sanitizeSchema);

const SHORTCODE = /:[a-z0-9_+-]+:/i;

/**
 * Markdown → sanitised, enhanced HTML. Heavy extras (emoji table, syntax
 * highlighting, KaTeX) are imported only when the document needs them.
 */
export async function renderMarkdown(markdown: string, options: RenderOptions = {}): Promise<RenderOutput> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const mdast = parseMarkdown(markdown);

  // GitHub builds heading anchors from the source text, so `## :sparkles: Why`
  // becomes #sparkles-why. Remember that text before shortcodes turn into emoji.
  const slugText = new Map<number, string>();
  walk(mdast, (node) => {
    if (node.type === 'heading' && node.position?.start.offset !== undefined) {
      slugText.set(node.position.start.offset, mdText(node).replace(/\s+/g, ' ').trim());
    }
  });

  let emoji = false;
  if (SHORTCODE.test(markdown)) {
    const { replaceShortcodes } = await import('./emoji');
    emoji = await replaceShortcodes(mdast);
  }

  const rawRanges: Array<[number, number]> = [];
  const codeInfo = new Map<number, CodeInfo>();
  const inner = new Map<string, [number, number]>();
  walk(mdast, (node) => {
    const start = node.position?.start.offset;
    if (start !== undefined) {
      if (node.type === 'heading' || node.type === 'paragraph' || node.type === 'tableCell') {
        const range = childrenRange(node.children);
        if (range) inner.set(`${node.type === 'tableCell' ? 'cell' : node.type}:${start}`, range);
      } else if (node.type === 'listItem') {
        const first = node.children[0];
        if (first && first.type === 'paragraph' && !node.spread) {
          const range = childrenRange(first.children);
          if (range) inner.set(`item:${start}`, range);
        }
      }
    }
    if (node.type === 'html' && node.position?.start.offset !== undefined && node.position.end.offset !== undefined) {
      rawRanges.push([node.position.start.offset, node.position.end.offset]);
    }
    if (node.type === 'code' && node.position?.start.offset !== undefined) {
      codeInfo.set(node.position.start.offset, { lang: node.lang ?? null, meta: node.meta ?? null });
    }
  });
  rawRanges.sort((a, b) => a[0] - b[0]);

  const tree = toHast.runSync(mdast as MdastRoot) as HastRoot;
  const result = enhance(tree, { source: markdown, rawRanges, codeInfo, inner, slugText, resolve: options.resolve });

  if (result.counts.codeBlocks > 0) {
    const codes: Element[] = [];
    walkElements(tree, (node, parent) => {
      if (node.tagName === 'code' && parent.type === 'element' && parent.tagName === 'pre') codes.push(node);
    });
    if (options.highlight !== false) {
      const { highlightCode } = await import('./highlight');
      for (const code of codes) highlightCode(code);
    }
    for (const code of codes) splitCodeLines(code);
  }

  if (result.math && options.math !== false) {
    const { renderMath } = await import('./math');
    renderMath(tree);
  }

  const words = countWords(tree);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    tree,
    html: toHtml(tree),
    toc: result.toc,
    meta: result.meta,
    stats: {
      words,
      readingMinutes: Math.max(1, Math.round(words / 230 + result.counts.codeBlocks * 0.15 + result.counts.images * 0.08)),
      ...result.counts,
    },
    features: { math: result.math, mermaid: result.mermaid, code: result.counts.codeBlocks > 0, emoji, rtl: isMostlyRtl(markdown) },
    ms: Math.round(t1 - t0),
  };
}

/** HTML for a layout: flat, grouped into sections, or split into slides. */
export function htmlFor(tree: HastRoot, mode: SectionMode): string {
  return toHtml(sectionize(tree, mode));
}

/** True when right-to-left letters (Arabic, Hebrew…) outnumber Latin letters outside code. */
export function isMostlyRtl(markdown: string): boolean {
  const prose = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]*>|\]\([^)]*\)/g, ' ');
  const rtl = prose.match(/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/g)?.length ?? 0;
  const latin = prose.match(/[A-Za-z]/g)?.length ?? 0;
  return rtl > latin;
}

const SKIP_WORDS = new Set(['pre', 'code', 'svg', 'figcaption', 'button', 'script', 'style']);
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g;

export function countWords(tree: HastRoot): number {
  let words = 0;
  const visit = (node: HastRoot | Element): void => {
    for (const child of node.children) {
      if (child.type === 'text') {
        const cjk = child.value.match(CJK)?.length ?? 0;
        words += (child.value.replace(CJK, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu)?.length ?? 0) + Math.ceil(cjk / 2);
      } else if (child.type === 'element') {
        const cls = child.properties.className;
        if (SKIP_WORDS.has(child.tagName)) continue;
        if (Array.isArray(cls) && (cls.includes('rg-anchor') || cls.includes('sr-only') || cls.includes('katex'))) continue;
        visit(child);
      }
    }
  };
  visit(tree);
  return words;
}

function childrenRange(children: Array<{ position?: { start: { offset?: number }; end: { offset?: number } } }>): [number, number] | null {
  const first = children[0]?.position?.start.offset;
  const last = children[children.length - 1]?.position?.end.offset;
  return first !== undefined && last !== undefined ? [first, last] : null;
}

export type { MdText };
