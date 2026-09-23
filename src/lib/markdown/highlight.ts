import { createLowlight, common } from 'lowlight';
import type { Element } from 'hast';
import { toString as hastToString } from 'hast-util-to-string';
import { hljsName } from './languages';

/**
 * Syntax highlighting with highlight.js grammars (via lowlight, which returns
 * a hast tree, so no HTML strings are ever parsed). Token colours come from
 * CSS variables, so every theme and code theme can restyle them.
 * This module is lazy-loaded the first time a document has a code block.
 */
const lowlight = createLowlight(common);
const MAX_HIGHLIGHT = 120_000;

export function highlightCode(code: Element): void {
  const cls = code.properties.className;
  const list = Array.isArray(cls) ? cls.map(String) : [];
  const langClass = list.find((c) => c.startsWith('language-'));
  if (!langClass) return;
  const name = hljsName(langClass.slice('language-'.length));
  if (!lowlight.registered(name)) return;
  const source = hastToString(code);
  if (source.length > MAX_HIGHLIGHT) return;
  const result = lowlight.highlight(name, source);
  code.children = result.children as Element['children'];
  if (!list.includes('hljs')) code.properties.className = [...list, 'hljs'];
}

export function isHighlightable(lang: string): boolean {
  return lowlight.registered(hljsName(lang));
}
