/**
 * DOM → Markdown for the visual (preview) editor. Converts the inline content
 * of one edited block back to Markdown. Only used for blocks the user actually
 * changed; everything else in the file is never re-serialised.
 */

export interface InlineStyle {
  emphasis: '_' | '*';
  strong: '**' | '__';
  /** Inside a table cell: no raw newlines, pipes escaped. */
  inTable?: boolean;
  /** Headings cannot span lines. */
  singleLine?: boolean;
}

export const DEFAULT_STYLE: InlineStyle = { emphasis: '_', strong: '**' };

/** Guesses the emphasis markers an author uses, so edits keep their style. */
export function detectStyle(source: string): Pick<InlineStyle, 'emphasis' | 'strong'> {
  const strongUnderscore = (source.match(/(^|[^\w_])__\S/g) ?? []).length;
  const strongStar = (source.match(/\*\*\S/g) ?? []).length;
  const withoutStrong = source.replace(/\*\*|__/g, '');
  const emUnderscore = (withoutStrong.match(/(^|[^\w_])_\S/g) ?? []).length;
  const emStar = (withoutStrong.match(/(^|[^*\w])\*\S/g) ?? []).length;
  return { emphasis: emStar > emUnderscore ? '*' : '_', strong: strongUnderscore > strongStar ? '__' : '**' };
}

const KEEP_AS_HTML = new Set(['kbd', 'sup', 'sub', 'mark', 'u', 'ins', 'abbr', 'small', 'q', 'samp', 'var', 'cite', 'dfn']);
const SKIP = new Set(['svg', 'button', 'input', 'script', 'style', 'template', 'figcaption']);

/** Escapes text so it renders literally (and no more than needed, to keep diffs small). */
export function escapeText(text: string, style: InlineStyle, atBlockStart: boolean): string {
  let out = text.replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\');
  out = out.replace(/`/g, '\\`');
  // Emphasis markers that could open or close emphasis (touching a non-space character).
  out = out.replace(/\*/g, (m, i: number) => (/\S/.test(text[i - 1] ?? ' ') || /\S/.test(text[i + 1] ?? ' ') ? '\\*' : m));
  out = out.replace(/(^|[^\p{L}\p{N}])_|_(?=$|[^\p{L}\p{N}])/gu, (m) => m.replace('_', '\\_'));
  out = out.replace(/~~/g, '\\~\\~');
  if (/\[[^\]]*\]/.test(text) || /\]\(/.test(text)) out = out.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  out = out.replace(/!(?=\\?\[)/g, '\\!');
  out = out.replace(/&(?=#?[A-Za-z0-9]+;)/g, '&amp;');
  out = out.replace(/<(?=[A-Za-z/!?])/g, '&lt;');
  if (style.inTable) out = out.replace(/\|/g, '\\|');
  if (atBlockStart) {
    out = out
      .replace(/^(\s*)([#>+-])(?=\s|$)/, '$1\\$2')
      .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3')
      .replace(/^(\s*)(=+|-+)\s*$/, '$1\\$2');
  }
  return out;
}

function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || (text.startsWith(' ') && text.endsWith(' ') && text.trim()) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function linkDestination(url: string): string {
  if (!url) return '';
  return /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, (c) => encodeURIComponent(c))}>` : url;
}

function titlePart(title: string | null): string {
  return title ? ` "${title.replace(/"/g, '\\"')}"` : '';
}

/** Moves leading/trailing spaces outside emphasis markers (`** x**` would not be bold). */
function wrap(marker: string, inner: string, closing = marker): string {
  if (!inner.trim()) return inner;
  const lead = /^\s*/.exec(inner)![0];
  const trail = /\s*$/.exec(inner)![0];
  return `${lead}${marker}${inner.trim()}${closing}${trail}`;
}

/** Original TeX of a KaTeX-rendered formula. */
function texOf(el: Element): string | null {
  const ann = el.querySelector('annotation[encoding="application/x-tex"]');
  return ann?.textContent ?? null;
}

export function serializeInline(root: Node, style: InlineStyle = DEFAULT_STYLE): string {
  let out = '';
  const atStart = () => out === '' || /\n[ \t]*$/.test(out);

  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      let text = node.nodeValue ?? '';
      text = text.replace(/\u00a0/g, ' ');
      if (style.singleLine || style.inTable) text = text.replace(/\s*\n\s*/g, ' ');
      out += escapeText(text, style, atStart());
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) return;
    if (el.classList.contains('rg-anchor') || el.classList.contains('rg-caption') || el.getAttribute('aria-hidden') === 'true') return;
    if (el.classList.contains('katex-display') || el.classList.contains('katex')) {
      const tex = texOf(el);
      if (tex !== null) out += el.classList.contains('katex-display') ? `$$${tex}$$` : `$${tex}$`;
      return;
    }
    const inner = () => serializeInline(el, style);
    switch (tag) {
      case 'strong':
      case 'b':
        out += wrap(style.strong, inner());
        return;
      case 'em':
      case 'i':
        out += wrap(style.emphasis, inner());
        return;
      case 'del':
      case 's':
      case 'strike':
        out += wrap('~~', inner());
        return;
      case 'code':
        out += codeSpan(el.textContent ?? '');
        return;
      case 'br':
        out += style.inTable ? '<br>' : style.singleLine ? ' ' : '\\\n';
        return;
      case 'img': {
        const src = attr(el, 'data-orig') ?? attr(el, 'src') ?? attr(el, 'data-missing') ?? '';
        out += `![${(attr(el, 'alt') ?? '').replace(/([[\]])/g, '\\$1')}](${linkDestination(src)}${titlePart(attr(el, 'title'))})`;
        return;
      }
      case 'a': {
        if (el.hasAttribute('data-footnote-ref')) {
          const href = attr(el, 'data-orig') ?? attr(el, 'href') ?? '';
          const label = href.replace(/^#(user-content-)?fn-/, '');
          out += `[^${label}]`;
          return;
        }
        const href = attr(el, 'data-orig') ?? attr(el, 'href');
        const text = inner();
        if (href === null) {
          out += text;
          return;
        }
        if (text === href && /^https?:\/\/\S+$/.test(href)) {
          out += href;
          return;
        }
        out += `[${text}](${linkDestination(href)}${titlePart(attr(el, 'title'))})`;
        return;
      }
      case 'sup':
        if (el.querySelector('a[data-footnote-ref]')) {
          el.childNodes.forEach(visit);
          return;
        }
        out += `<sup>${inner()}</sup>`;
        return;
      case 'div':
      case 'p': {
        // contentEditable sometimes wraps new lines in <div>/<p>.
        if (out && !out.endsWith('\n')) out += style.singleLine || style.inTable ? ' ' : '\\\n';
        el.childNodes.forEach(visit);
        return;
      }
      default:
        if (KEEP_AS_HTML.has(tag)) {
          out += `<${tag}>${inner()}</${tag}>`;
          return;
        }
        el.childNodes.forEach(visit);
    }
  };
  root.childNodes.forEach(visit);
  return out;
}

const BLOCK_CHILDREN = new Set(['UL', 'OL', 'PRE', 'BLOCKQUOTE', 'TABLE', 'FIGURE', 'DIV', 'DETAILS', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR']);

/**
 * Serialises the inline content of an editable block element. List items
 * leave out their checkbox and nested lists; headings can't span lines;
 * table cells escape pipes.
 */
export function serializeBlock(el: Element, kind: string, style: InlineStyle = DEFAULT_STYLE): string {
  if (kind === 'item') {
    const holder = el.ownerDocument.createElement('span');
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 1 && BLOCK_CHILDREN.has((child as Element).tagName)) break;
      if (child.nodeType === 1 && (child as Element).tagName === 'INPUT') continue;
      holder.appendChild(child.cloneNode(true));
    }
    // mdast puts one space between the checkbox and the text; it is not part of the content.
    if (el.querySelector(':scope > input[type=checkbox]') && holder.firstChild?.nodeType === 3) {
      holder.firstChild.nodeValue = (holder.firstChild.nodeValue ?? '').replace(/^ /, '');
    }
    return serializeInline(holder, style).replace(/\s+$/, '');
  }
  if (kind === 'heading') return serializeInline(el, { ...style, singleLine: true }).trim();
  if (kind === 'cell') return serializeInline(el, { ...style, inTable: true }).trim();
  return serializeInline(el, style).replace(/\s+$/, '');
}

/** Plain text of a code block element (what the user typed), without line numbers. */
export function codeText(el: Element): string {
  const code = el.querySelector('code') ?? el;
  return (code.textContent ?? '').replace(/\u00a0/g, ' ');
}
