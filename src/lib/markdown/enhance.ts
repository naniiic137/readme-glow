import type { Root, Element, ElementContent, RootContent, Text, Properties } from 'hast';
import GithubSlugger from 'github-slugger';
import { toString as hastToString } from 'hast-util-to-string';
import { iconElement, type IconName } from './icons';
import { isBadgeUrl } from './badges';
import { languageLabel, parseFenceInfo } from './languages';
import { isSafeUrl } from './schema';
import type { Badge, DocMeta, TocEntry, UrlResolver, UrlKind } from './types';

/**
 * Trusted post-sanitise transforms. Everything here runs on a tree that has
 * already been cleaned, and only ever creates elements and attributes we
 * control; user text only ever ends up in text nodes or checked URLs.
 */

export interface CodeInfo {
  lang: string | null;
  meta: string | null;
}

export interface EnhanceContext {
  source: string;
  /** Source ranges of raw HTML nodes, sorted by start. */
  rawRanges: Array<[number, number]>;
  /** Code fence info by the fence's start offset. */
  codeInfo: Map<number, CodeInfo>;
  /** Inline content range of editable blocks, keyed by `${kind}:${startOffset}`. */
  inner: Map<string, [number, number]>;
  resolve?: UrlResolver;
}

export interface EnhanceResult {
  toc: TocEntry[];
  meta: DocMeta;
  mermaid: boolean;
  math: boolean;
  counts: { codeBlocks: number; images: number; links: number; headings: number; tables: number };
}

type ParentNode = Root | Element;

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'table', 'tr', 'td', 'th', 'hr',
  'ul', 'ol', 'dl', 'dt', 'dd', 'details', 'summary', 'div', 'figure', 'section', 'img', 'video', 'picture',
]);
const DIR_AUTO_TAGS = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'td', 'th', 'dt', 'dd', 'summary', 'caption']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const ALERTS: Record<string, { icon: IconName; title: string }> = {
  NOTE: { icon: 'note', title: 'Note' },
  TIP: { icon: 'tip', title: 'Tip' },
  IMPORTANT: { icon: 'important', title: 'Important' },
  WARNING: { icon: 'warning', title: 'Warning' },
  CAUTION: { icon: 'caution', title: 'Caution' },
};

const ARABIC_TITLES: Record<string, string> = {
  NOTE: 'ملاحظة',
  TIP: 'نصيحة',
  IMPORTANT: 'مهم',
  WARNING: 'تحذير',
  CAUTION: 'تنبيه',
};

export function el(tagName: string, properties: Properties = {}, children: ElementContent[] = []): Element {
  return { type: 'element', tagName, properties, children };
}

export function text(value: string): Text {
  return { type: 'text', value };
}

function classes(node: Element): string[] {
  const c: unknown = node.properties.className;
  if (Array.isArray(c)) return c.map(String);
  if (typeof c === 'string') return c.split(/\s+/).filter(Boolean);
  return [];
}

function addClass(node: Element, ...names: string[]): void {
  const current = classes(node);
  for (const n of names) if (!current.includes(n)) current.push(n);
  node.properties.className = current;
}

function isElement(node: RootContent | ElementContent | undefined, tag?: string): node is Element {
  return !!node && node.type === 'element' && (tag === undefined || node.tagName === tag);
}

function isBlank(node: RootContent | ElementContent): boolean {
  return node.type === 'text' && node.value.trim() === '';
}

function elementChildren(node: ParentNode): Element[] {
  return (node.children as Array<RootContent | ElementContent>).filter((c): c is Element => c.type === 'element');
}

export function enhance(tree: Root, ctx: EnhanceContext): EnhanceResult {
  const { source } = ctx;
  const slugger = new GithubSlugger();
  const toc: TocEntry[] = [];
  const counts = { codeBlocks: 0, images: 0, links: 0, headings: 0, tables: 0 };
  let mermaid = false;
  let math = false;

  const rawRangeAt = (offset: number): [number, number] | null => {
    // Binary search: last range whose start <= offset.
    let lo = 0;
    let hi = ctx.rawRanges.length - 1;
    let found: [number, number] | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = ctx.rawRanges[mid]!;
      if (r[0] <= offset) {
        found = r;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found && offset < found[1] ? found : null;
  };

  // ---------------------------------------------------------------- pass 1: source annotations
  const annotate = (node: Element, parent: ParentNode): void => {
    const pos = node.position;
    const start = pos?.start.offset;
    const end = pos?.end.offset;
    if (pos && start !== undefined) {
      const raw = rawRangeAt(start);
      if (BLOCK_TAGS.has(node.tagName)) node.properties.dataLine = pos.start.line;
      if (!raw) {
        const kind = blockKind(node);
        if (kind) {
          node.properties.dataBlock = kind;
          if (end !== undefined) node.properties.dataSrc = `${start}:${end}`;
          const inner = kind === 'code' ? innerRange(node, kind, source) : ctx.inner.get(`${kind}:${start}`);
          if (inner) node.properties.dataInner = `${inner[0]}:${inner[1]}`;
        }
      } else if (parent.type === 'root' && BLOCK_TAGS.has(node.tagName)) {
        node.properties.dataBlock = 'html';
        node.properties.dataSrc = `${raw[0]}:${Math.max(end ?? raw[1], raw[1])}`;
      }
    }
    for (const child of node.children) if (child.type === 'element') annotate(child, node);
  };
  for (const child of tree.children) if (child.type === 'element') annotate(child, tree);

  // ---------------------------------------------------------------- pass 2: structure & attributes
  const hashLinks: Element[] = [];
  const ids = new Set<string>();

  const resolveUrl = (url: string, kind: UrlKind): string | null => {
    let next: string | null | undefined = url;
    if (ctx.resolve) {
      const r = ctx.resolve(url, kind);
      if (r !== undefined) next = r;
    }
    if (next === null) return null;
    if (kind !== 'link') next = githubBlobToRaw(next);
    return isSafeUrl(next) ? next : null;
  };

  const visit = (parent: ParentNode, inPre: boolean): void => {
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i]!;
      if (node.type !== 'element') continue;
      const tag = node.tagName;

      if (tag === 'blockquote') {
        const alert = toAlert(node, source);
        if (alert) {
          parent.children[i] = alert;
          visit(alert, false);
          continue;
        }
      }

      if (tag === 'pre' && !inPre) {
        const code = node.children.find((c): c is Element => isElement(c, 'code'));
        const codeClasses = code ? classes(code) : [];
        if (codeClasses.includes('language-math')) {
          math = true;
          continue;
        }
        const start = code?.position?.start.offset ?? node.position?.start.offset;
        const info = start !== undefined ? ctx.codeInfo.get(start) : undefined;
        const langClass = codeClasses.find((c) => c.startsWith('language-'));
        const rawLang = info?.lang ?? (langClass ? langClass.slice('language-'.length) : null);
        const { lang, filename } = parseFenceInfo(rawLang, info?.meta ?? null);
        if (code && lang && langClass && `language-${lang}` !== langClass) {
          code.properties.className = codeClasses.filter((c) => c !== langClass).concat(`language-${lang}`);
        } else if (code && lang && !langClass) {
          addClass(code, `language-${lang}`);
        }
        if (lang?.toLowerCase() === 'mermaid' && code) {
          mermaid = true;
          parent.children[i] = mermaidBlock(node, code);
          continue;
        }
        counts.codeBlocks++;
        parent.children[i] = codeFigure(node, lang, filename);
        continue;
      }

      if (tag === 'code' && !inPre && classes(node).includes('math-inline')) math = true;

      if (HEADINGS.has(tag)) {
        counts.headings++;
        const isFootnoteLabel = classes(node).includes('sr-only');
        const label = hastToString(node).replace(/\s+/g, ' ').trim();
        if (!node.properties.id) node.properties.id = slugger.slug(label);
        else slugger.slug(label); // keep the counter in step with GitHub
        const id = String(node.properties.id);
        if (!isFootnoteLabel && label) {
          toc.push({ depth: Number(tag[1]), text: label, id, line: Number(node.properties.dataLine ?? 0) });
          node.children.push(
            el('a', { className: ['rg-anchor'], href: `#${id}`, ariaLabel: `Link to section: ${label}`, dataAnchor: id }, []),
          );
        }
      }

      if (tag === 'table') {
        counts.tables++;
        const wrap = el('div', { className: ['rg-table-wrap'] }, [node]);
        moveSourceAttrs(node, wrap);
        parent.children[i] = wrap;
      }

      if (tag === 'a') {
        const href = typeof node.properties.href === 'string' ? node.properties.href : null;
        if (href !== null) {
          counts.links++;
          if (href.startsWith('#')) hashLinks.push(node);
          else {
            const resolved = /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : resolveUrl(href, 'link');
            if (resolved !== href) node.properties.dataOrig = href;
            if (resolved === null) delete node.properties.href;
            else {
              node.properties.href = resolved;
              if (/^https?:/i.test(resolved)) {
                node.properties.target = '_blank';
                node.properties.rel = ['noopener', 'noreferrer', 'nofollow', 'ugc'];
              }
            }
          }
        }
      }

      if (tag === 'img') {
        const src = typeof node.properties.src === 'string' ? node.properties.src : '';
        const resolved = src ? resolveUrl(src, 'image') : null;
        if (resolved !== src) node.properties.dataOrig = src;
        if (resolved === null) {
          node.properties.dataMissing = src || 'empty';
          delete node.properties.src;
        } else node.properties.src = resolved;
        node.properties.loading = 'lazy';
        node.properties.decoding = 'async';
        if (typeof node.properties.src === 'string' && isBadgeUrl(src || node.properties.src)) {
          node.properties.dataBadge = 'true';
        } else {
          counts.images++;
          if (!(parent.type === 'element' && parent.tagName === 'a')) node.properties.dataZoom = 'true';
        }
      }

      if (tag === 'source' && typeof node.properties.srcSet === 'string') {
        const safe = rewriteSrcset(node.properties.srcSet, (u) => resolveUrl(u, 'image'));
        if (safe) node.properties.srcSet = safe;
        else delete node.properties.srcSet;
      }

      if (tag === 'video') {
        for (const attr of ['src', 'poster'] as const) {
          const v = node.properties[attr];
          if (typeof v === 'string') {
            const r = resolveUrl(v, 'media');
            if (r === null) delete node.properties[attr];
            else node.properties[attr] = r;
          }
        }
        node.properties.controls = true;
        node.properties.preload = 'metadata';
      }

      if (DIR_AUTO_TAGS.has(tag) && node.properties.dir === undefined) node.properties.dir = 'auto';
      if (node.properties.id) ids.add(String(node.properties.id));
      if (tag === 'a' && typeof node.properties.name === 'string') ids.add(node.properties.name);

      visit(node, inPre || tag === 'pre');

      if (tag === 'p' || (tag === 'div' && node.properties.align)) classifyImageParagraph(node);
    }
  };
  visit(tree, false);

  // Short, flat top-level bullet lists can be shown as a grid of cards (Landing layout).
  for (const node of tree.children) {
    if (!isElement(node, 'ul') || classes(node).includes('contains-task-list')) continue;
    const items = elementChildren(node);
    const simple =
      items.length >= 2 &&
      items.length <= 12 &&
      items.every(
        (li) =>
          li.tagName === 'li' &&
          !li.children.some((c) => isElement(c) && ['ul', 'ol', 'pre', 'figure', 'blockquote', 'div', 'table'].includes(c.tagName)) &&
          hastToString(li).trim().length <= 180,
      );
    if (simple) addClass(node, 'rg-simple-list');
  }

  // ---------------------------------------------------------------- pass 3: in-document links
  for (const a of hashLinks) {
    const target = safeDecode(String(a.properties.href).slice(1));
    if (!target) continue;
    const match = findId(ids, target);
    if (match && match !== target) {
      a.properties.dataOrig = String(a.properties.href);
      a.properties.href = `#${match}`;
    }
  }
  walkElements(tree, (node) => {
    if (typeof node.properties.ariaDescribedBy === 'string' || Array.isArray(node.properties.ariaDescribedBy)) {
      const v = Array.isArray(node.properties.ariaDescribedBy) ? node.properties.ariaDescribedBy.join(' ') : node.properties.ariaDescribedBy;
      const match = findId(ids, v.replace(/^user-content-/, ''));
      if (match) node.properties.ariaDescribedBy = [match];
    }
  });

  return { toc, meta: extractMeta(tree), mermaid, math, counts };
}

// ------------------------------------------------------------------ helpers

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function findId(ids: Set<string>, target: string): string | null {
  if (ids.has(target)) return target;
  const prefixed = `user-content-${target}`;
  if (ids.has(prefixed)) return prefixed;
  const lower = target.toLowerCase();
  if (ids.has(lower)) return lower;
  if (ids.has(`user-content-${lower}`)) return `user-content-${lower}`;
  return null;
}

export function walkElements(node: ParentNode, fn: (el: Element, parent: ParentNode) => void): void {
  for (const child of node.children) {
    if (child.type === 'element') {
      fn(child, node);
      walkElements(child, fn);
    }
  }
}

function blockKind(node: Element): string | null {
  switch (node.tagName) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'heading';
    case 'p':
      return 'paragraph';
    case 'li':
      return 'item';
    case 'blockquote':
      return 'quote';
    case 'pre':
      return 'code';
    case 'table':
      return 'table';
    case 'td':
    case 'th':
      return 'cell';
    case 'hr':
      return 'hr';
    case 'ul':
    case 'ol':
      return 'list';
    case 'img':
      return 'image';
    case 'section':
      return classes(node).includes('footnotes') ? 'footnotes' : null;
    default:
      return null;
  }
}

function innerRange(node: Element, kind: string, source: string): [number, number] | null {
  if (kind !== 'code') return null;
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return null;
  return fencedCodeInner(source, start, end);
}

/** Range of the code inside a fenced block (between the fence lines), or null for indented code. */
export function fencedCodeInner(source: string, start: number, end: number): [number, number] | null {
  const block = source.slice(start, end);
  const open = /^[ \t]*(`{3,}|~{3,})[^\n]*(\n|$)/.exec(block);
  if (!open) return null;
  const innerStart = start + open[0].length;
  const fence = open[1]!;
  const lastNl = block.lastIndexOf('\n');
  const lastLine = lastNl >= 0 ? block.slice(lastNl + 1) : '';
  const closes = lastNl >= open[0].length - 1 && new RegExp(`^[ \\t]*${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`).test(lastLine);
  if (closes) {
    // Exclude the newline before the closing fence.
    const innerEnd = start + lastNl;
    return innerEnd >= innerStart ? [innerStart, innerEnd] : [innerStart, innerStart];
  }
  return [innerStart, end];
}

function moveSourceAttrs(from: Element, to: Element): void {
  for (const key of ['dataBlock', 'dataSrc', 'dataLine', 'dataInner']) {
    if (from.properties[key] !== undefined) {
      to.properties[key] = from.properties[key];
      delete from.properties[key];
    }
  }
}

function toAlert(node: Element, source: string): Element | null {
  const firstIndex = node.children.findIndex((c) => !isBlank(c));
  const first = node.children[firstIndex];
  if (!isElement(first, 'p')) return null;
  const head = first.children[0];
  if (!head || head.type !== 'text') return null;
  const m = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i.exec(head.value);
  if (!m) return null;
  const type = m[1]!.toUpperCase();
  const def = ALERTS[type]!;
  head.value = head.value.slice(m[0].length);
  // The paragraph's editable range now starts after the marker line.
  if (typeof first.properties.dataInner === 'string') {
    const [s, e] = first.properties.dataInner.split(':').map(Number) as [number, number];
    const after = skipAlertMarker(source, s);
    if (after <= e) first.properties.dataInner = `${after}:${e}`;
  }
  const empty = first.children.every((c) => c.type === 'text' && c.value.trim() === '');
  const rest = empty ? node.children.filter((_, i) => i !== firstIndex) : node.children;
  // Right-to-left alerts get their title in Arabic, so the callout reads naturally.
  const arabic = /[؀-ۿ]/.test(hastToString(node));
  const title = el('p', { className: ['markdown-alert-title'], dir: 'auto' }, [iconElement(def.icon), text(arabic ? ARABIC_TITLES[type]! : def.title)]);
  const alert = el('div', { className: ['markdown-alert', `markdown-alert-${type.toLowerCase()}`], dataAlert: type.toLowerCase() }, [
    title,
    ...(rest as ElementContent[]),
  ]);
  moveSourceAttrs(node, alert);
  alert.properties.dataBlock = 'alert';
  alert.position = node.position;
  return alert;
}

/** Offset just after a `[!NOTE]` marker, its line break and the next line's `> ` prefix. */
export function skipAlertMarker(source: string, offset: number): number {
  const rest = source.slice(offset);
  const m = /^\[![A-Za-z]+\][ \t]*(?:\r?\n[ \t]*(?:>[ \t]?)*)?/.exec(rest);
  return m ? offset + m[0].length : offset;
}

function codeFigure(pre: Element, lang: string | null, filename: string | null): Element {
  const label = languageLabel(lang);
  const head: ElementContent[] = [];
  if (filename) head.push(el('span', { className: ['rg-code-file'] }, [iconElement('file'), text(filename)]));
  if (label) head.push(el('span', { className: ['rg-code-lang'] }, [text(label)]));
  head.push(
    el('button', { type: 'button', className: ['rg-copy'], ariaLabel: filename ? `Copy ${filename}` : 'Copy code', dataCopy: 'code' }, [
      iconElement('copy'),
      el('span', { className: ['rg-copy-label'] }, [text('Copy')]),
    ]),
  );
  pre.properties.tabIndex = 0;
  const figure = el(
    'figure',
    { className: ['rg-code', filename ? 'has-file' : 'no-file'], dataLang: lang ? lang.toLowerCase() : 'text' },
    [el('figcaption', { className: ['rg-code-head'] }, head), pre],
  );
  moveSourceAttrs(pre, figure);
  figure.position = pre.position;
  return figure;
}

function mermaidBlock(pre: Element, code: Element): Element {
  const source = hastToString(code);
  const block = el('div', { className: ['rg-mermaid'], dataMermaid: 'pending' }, [
    el('pre', { className: ['rg-mermaid-source'] }, [el('code', {}, [text(source)])]),
  ]);
  moveSourceAttrs(pre, block);
  block.position = pre.position;
  return block;
}

function rewriteSrcset(srcset: string, resolve: (url: string) => string | null): string | null {
  const out: string[] = [];
  for (const candidate of srcset.split(',')) {
    const parts = candidate.trim().split(/\s+/);
    const url = parts[0];
    if (!url) continue;
    const r = resolve(url);
    if (r === null) return null;
    out.push([r, ...parts.slice(1)].join(' '));
  }
  return out.length ? out.join(', ') : null;
}

export function githubBlobToRaw(url: string): string {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i.exec(url);
  if (!m) return url;
  const rest = m[3]!.replace(/\?raw=true$/, '');
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${rest}`;
}

/** Marks paragraphs that only hold badges (`rg-badges`) or a single image (`rg-figure`). */
function classifyImageParagraph(node: Element): void {
  let badges = 0;
  let images = 0;
  let other = 0;
  const check = (children: ElementContent[]): void => {
    for (const c of children) {
      if (c.type === 'text') {
        if (c.value.trim() !== '') other++;
      } else if (c.type === 'element') {
        if (c.tagName === 'img') {
          if (c.properties.dataBadge) badges++;
          else images++;
        } else if (c.tagName === 'a' || c.tagName === 'picture') {
          check(c.children);
        } else if (c.tagName === 'br' || c.tagName === 'source') {
          // layout only
        } else other++;
      }
    }
  };
  check(node.children);
  if (other > 0) return;
  if (badges > 0 && images === 0) addClass(node, 'rg-badges');
  else if (images === 1 && badges === 0 && node.tagName === 'p') {
    addClass(node, 'rg-figure');
    const img = findFirst(node, 'img');
    if (img && typeof img.properties.title === 'string' && img.properties.title.trim()) {
      node.children.push(el('span', { className: ['rg-caption'] }, [text(img.properties.title)]));
    }
  }
}

function findFirst(node: ParentNode, tag: string): Element | null {
  for (const c of node.children) {
    if (c.type !== 'element') continue;
    if (c.tagName === tag) return c;
    const inner = findFirst(c, tag);
    if (inner) return inner;
  }
  return null;
}

function extractMeta(tree: Root): DocMeta {
  let title: string | null = null;
  let description: string | null = null;
  const badges: Badge[] = [];
  let heroImage: DocMeta['heroImage'] = null;
  let seenH2 = false;
  let firstHeading: string | null = null;

  const scan = (parent: ParentNode, depth: number): void => {
    for (const c of elementChildren(parent)) {
      if (seenH2) return;
      if (HEADINGS.has(c.tagName)) {
        const label = hastToString(c).replace(/\s+/g, ' ').trim();
        if (c.tagName === 'h2' && title) {
          seenH2 = true;
          return;
        }
        if (!firstHeading && label) firstHeading = label;
        if (c.tagName === 'h1' && !title && label) title = label;
        continue;
      }
      if (c.tagName === 'p' || c.tagName === 'div') {
        const cls = classes(c);
        if (cls.includes('rg-badges')) {
          collectBadges(c, badges, null);
          continue;
        }
        if (cls.includes('rg-figure') || (c.tagName === 'p' && onlyImages(c))) {
          const img = findFirst(c, 'img');
          if (img && !heroImage && typeof img.properties.src === 'string') {
            heroImage = { src: img.properties.src, alt: String(img.properties.alt ?? '') };
          }
          continue;
        }
        if (c.tagName === 'p') {
          const t = hastToString(c).replace(/\s+/g, ' ').trim();
          if (!description && /\p{L}{2,}/u.test(t) && (title || firstHeading)) description = t;
          continue;
        }
        if (depth < 3) scan(c, depth + 1);
      }
    }
  };
  scan(tree, 0);
  return { title: title ?? firstHeading, description, badges: badges.slice(0, 16), heroImage };
}

function onlyImages(node: Element): boolean {
  return node.children.every((c) => (c.type === 'text' ? c.value.trim() === '' : c.type === 'element' && (c.tagName === 'img' || (c.tagName === 'a' && onlyImages(c)) || c.tagName === 'br' || c.tagName === 'picture' || c.tagName === 'source')));
}

function collectBadges(node: Element, out: Badge[], href: string | null): void {
  for (const c of node.children) {
    if (c.type !== 'element') continue;
    if (c.tagName === 'img' && typeof c.properties.src === 'string') {
      out.push({ alt: String(c.properties.alt ?? ''), src: c.properties.src, href });
    } else if (c.tagName === 'a') {
      collectBadges(c, out, typeof c.properties.href === 'string' ? c.properties.href : null);
    } else collectBadges(c, out, href);
  }
}
