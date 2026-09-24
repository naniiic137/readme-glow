import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import GithubSlugger from 'github-slugger';
import { toHtml } from 'hast-util-to-html';
import { toString as hastToString } from 'hast-util-to-string';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import { iconElement, type IconName } from '../markdown/icons';

/**
 * "How will this look on GitHub?" A second, deliberately plain renderer:
 * GitHub-flavoured Markdown, then GitHub's own HTML allow-list (the default
 * schema of hast-util-sanitize is modelled on it: no style attributes, no
 * scripts, ids prefixed with user-content-), then the few things GitHub adds
 * itself (alerts, heading anchors). Styled with github-markdown-css.
 *
 * It is a close approximation, not GitHub: syntax highlighting, Mermaid,
 * math and a few edge cases differ.
 */

export interface GitHubPreviewOptions {
  scheme: 'light' | 'dark';
  /** Maps a relative image path to a displayable URL (e.g. a blob: URL); null leaves it. */
  resolveImage?: (src: string) => string | null;
  emoji?: ReadonlyMap<string, string>;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  // GitHub drops style and script elements with their contents.
  .use(rehypeSanitize, { ...defaultSchema, strip: ['script', 'style'] });

const ALERTS: Record<string, { icon: IconName; title: string }> = {
  NOTE: { icon: 'note', title: 'Note' },
  TIP: { icon: 'tip', title: 'Tip' },
  IMPORTANT: { icon: 'important', title: 'Important' },
  WARNING: { icon: 'warning', title: 'Warning' },
  CAUTION: { icon: 'caution', title: 'Caution' },
};

function isElement(node: RootContent | ElementContent | undefined, tag?: string): node is Element {
  return !!node && node.type === 'element' && (!tag || node.tagName === tag);
}

function walk(node: Root | Element, fn: (el: Element, parent: Root | Element, index: number) => void): void {
  node.children.forEach((child, index) => {
    if (child.type === 'element') {
      fn(child, node, index);
      walk(child, fn);
    }
  });
}

function toAlert(bq: Element): Element | null {
  const first = bq.children.find((c) => isElement(c, 'p'));
  if (!isElement(first, 'p')) return null;
  const head = first.children[0];
  if (!head || head.type !== 'text') return null;
  const m = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i.exec(head.value);
  if (!m) return null;
  const type = m[1]!.toUpperCase();
  const def = ALERTS[type]!;
  head.value = head.value.slice(m[0].length);
  const empty = first.children.every((c) => c.type === 'text' && !c.value.trim());
  const rest = empty ? bq.children.filter((c) => c !== first) : bq.children;
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['markdown-alert', `markdown-alert-${type.toLowerCase()}`], dir: 'auto' },
    children: [
      {
        type: 'element',
        tagName: 'p',
        properties: { className: ['markdown-alert-title'], dir: 'auto' },
        children: [iconElement(def.icon, 'octicon mr-2'), { type: 'text', value: def.title }],
      },
      ...rest,
    ],
  };
}

const RELATIVE = /^(?![a-z][a-z0-9+.-]*:|\/\/|#)/i;

function rewriteSrcset(value: string, resolve: (src: string) => string | null): string {
  return value
    .split(',')
    .map((candidate) => {
      const parts = candidate.trim().split(/\s+/);
      const url = parts[0] ?? '';
      const next = RELATIVE.test(url) ? resolve(url) : null;
      return [next ?? url, ...parts.slice(1)].join(' ');
    })
    .join(', ');
}

export function renderGitHubPreview(markdown: string, options: GitHubPreviewOptions): string {
  const tree = processor.runSync(processor.parse(markdown)) as Root;
  const slugger = new GithubSlugger();
  const resolve = options.resolveImage ?? (() => null);
  const replacements: Array<[Root | Element, number, Element]> = [];

  walk(tree, (el, parent, index) => {
    switch (el.tagName) {
      case 'blockquote': {
        const alert = toAlert(el);
        if (alert) replacements.push([parent, index, alert]);
        break;
      }
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const text = hastToString(el).trim();
        if (!text) break;
        const slug = slugger.slug(text);
        el.properties = { ...el.properties, id: `user-content-${slug}` };
        break;
      }
      case 'img': {
        const src = typeof el.properties.src === 'string' ? el.properties.src : '';
        if (src && RELATIVE.test(src)) {
          const next = resolve(src);
          if (next) el.properties.src = next;
        }
        break;
      }
      case 'source': {
        const media = typeof el.properties.media === 'string' ? el.properties.media : '';
        // Force the scheme being previewed, whatever the viewer's system setting.
        const m = /prefers-color-scheme:\s*(light|dark)/i.exec(media);
        if (m) el.properties.media = m[1]!.toLowerCase() === options.scheme ? 'all' : 'not all';
        const raw: unknown = el.properties.srcSet;
        const srcset = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(', ') : '';
        if (srcset) el.properties.srcSet = rewriteSrcset(srcset, resolve);
        break;
      }
      case 'a': {
        const href = typeof el.properties.href === 'string' ? el.properties.href : '';
        if (/^https?:/i.test(href)) {
          el.properties.target = '_blank';
          el.properties.rel = ['noopener', 'noreferrer'];
        }
        break;
      }
      default:
        break;
    }
  });
  for (const [parent, index, next] of replacements) parent.children[index] = next;

  if (options.emoji) {
    const map = options.emoji;
    const fix = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type === 'text' && child.value.includes(':')) child.value = child.value.replace(/:([a-z0-9_+-]+):/gi, (w, n: string) => map.get(n.toLowerCase()) ?? w);
        else if (child.type === 'element' && child.tagName !== 'code' && child.tagName !== 'pre') fix(child);
      }
    };
    fix(tree);
  }
  return toHtml(tree);
}

/**
 * github-markdown-css scoped to one colour scheme: `.markdown-body` becomes
 * `.markdown-body.gh-light` (or `.gh-dark`), so both can live on one page.
 */
export function scopeGitHubCss(css: string, scheme: 'light' | 'dark'): string {
  return css.replace(/\.markdown-body(?![\w-])/g, `.markdown-body.gh-${scheme}`);
}
