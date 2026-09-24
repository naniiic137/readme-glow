import type { Nodes } from 'mdast';
import { isBadgeUrl } from '../markdown/badges';

/**
 * Flattened plain text of a block (Markdown inline content or raw HTML), with
 * the source line of every UTF-16 unit, per-character flags (inside a link /
 * code / HTML heading) and the links and images found on the way. Summary,
 * sentence splitting and fact extraction all read documents through this.
 */
export const F_LINK = 1;
export const F_CODE = 2;
export const F_HEADING = 4;

/** Hard sentence boundary (line break, block edge) inside flattened text. */
export const BREAK = String.fromCharCode(0x2029);
const BREAK_ALL = new RegExp(BREAK, 'g');

export interface FlatImage {
  src: string;
  alt: string;
  line: number;
  /** URL of the link wrapping the image, if any. */
  link: string | null;
  badge: boolean;
}

export interface FlatLink {
  start: number;
  end: number;
  url: string;
  line: number;
  images: FlatImage[];
}

export interface FlatHeading {
  depth: number;
  text: string;
  line: number;
}

export interface Flat {
  text: string;
  lines: number[];
  flags: number[];
  links: FlatLink[];
  images: FlatImage[];
  /** Headings found in raw HTML (`<h1>` ... `<h6>`). */
  headings: FlatHeading[];
}

export type Definitions = ReadonlyMap<string, string>;

const SPACE = /\s/;
const SHORTCODE = /:(?=[a-z0-9_+-]*[a-z])[a-z0-9_+-]{1,40}:/gi;

/** Removes `:rocket:` style emoji shortcodes. */
export function stripShortcodes(text: string): string {
  return text.includes(':') ? text.replace(SHORTCODE, '') : text;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  hearts: '♥',
  times: '×',
  rarr: '→',
  larr: '←',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
};

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,10});/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Parses the attributes of an HTML start tag. Names are lower-cased. */
export function parseAttributes(source: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const name = m[1]!.toLowerCase();
    if (!attrs.has(name)) attrs.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
  }
  return attrs;
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'thead', 'tbody', 'blockquote', 'section', 'details',
  'summary', 'center', 'hr', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'header', 'footer', 'article', 'nav', 'main',
  'aside', 'picture', 'video', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);
const SKIP_TAGS = new Set(['script', 'style', 'pre', 'svg', 'textarea', 'template', 'noscript', 'math']);
const CODE_TAGS = new Set(['code', 'kbd', 'samp', 'tt']);
const TAG_RE = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

function countNewlines(text: string, from = 0, to = text.length): number {
  let n = 0;
  for (let i = from; i < to; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

export class FlatBuilder {
  private out: string[] = [];
  private lines: number[] = [];
  private flags: number[] = [];
  private links: FlatLink[] = [];
  private images: FlatImage[] = [];
  private headings: FlatHeading[] = [];
  private linkStack: FlatLink[] = [];
  private headingStack: Array<{ depth: number; start: number; line: number }> = [];
  private codeDepth = 0;
  private skip: string | null = null;

  constructor(private readonly defs: Definitions = new Map()) {}

  private get currentFlags(): number {
    return (this.linkStack.length ? F_LINK : 0) | (this.codeDepth ? F_CODE : 0) | (this.headingStack.length ? F_HEADING : 0);
  }

  get length(): number {
    return this.out.length;
  }

  /** Appends text; `\n` advances the line. Whitespace runs collapse to one space. */
  push(text: string, line: number, extraFlags = 0): number {
    let current = line;
    const flags = this.currentFlags | extraFlags;
    for (let i = 0; i < text.length; i++) {
      let c = text[i]!;
      if (c === '\n') {
        current++;
        c = ' ';
      }
      if (c === BREAK || SPACE.test(c)) {
        const last = this.out[this.out.length - 1];
        if (last === undefined || last === ' ' || last === BREAK) continue;
        c = ' ';
      }
      this.out.push(c);
      this.lines.push(current);
      this.flags.push(flags);
    }
    return current;
  }

  /** Inserts a hard boundary (line break or block edge). */
  brk(): void {
    while (this.out[this.out.length - 1] === ' ') {
      this.out.pop();
      this.lines.pop();
      this.flags.pop();
    }
    if (this.out.length && this.out[this.out.length - 1] !== BREAK) {
      this.out.push(BREAK);
      this.lines.push(this.lines[this.lines.length - 1] ?? 1);
      this.flags.push(0);
    }
  }

  openLink(url: string, line: number): void {
    this.linkStack.push({ start: this.out.length, end: this.out.length, url, line, images: [] });
  }

  closeLink(): void {
    const link = this.linkStack.pop();
    if (!link) return;
    link.end = this.out.length;
    this.links.push(link);
  }

  image(src: string, alt: string, line: number): void {
    const link = this.linkStack[this.linkStack.length - 1] ?? null;
    const img: FlatImage = { src, alt: stripShortcodes(alt).trim(), line, link: link?.url ?? null, badge: isBadgeUrl(src) };
    this.images.push(img);
    link?.images.push(img);
  }

  /** Feeds a chunk of raw HTML (a block or an inline tag) starting at `line`. */
  html(value: string, line: number): void {
    let last = 0;
    let current = line;
    TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG_RE.exec(value))) {
      if (m.index > last) current = this.htmlText(value.slice(last, m.index), current);
      const whole = m[0];
      const tagLine = current;
      current += countNewlines(whole);
      last = m.index + whole.length;
      if (whole.startsWith('<!--')) continue;
      this.tag(m[1] === '/', m[2]!.toLowerCase(), m[3] ?? '', tagLine);
    }
    if (last < value.length) this.htmlText(value.slice(last), current);
  }

  private htmlText(raw: string, line: number): number {
    if (this.skip) return line + countNewlines(raw);
    return this.push(decodeEntities(raw), line);
  }

  private tag(closing: boolean, name: string, attrSource: string, line: number): void {
    if (this.skip) {
      if (closing && name === this.skip) this.skip = null;
      return;
    }
    if (!closing && SKIP_TAGS.has(name) && !/\/\s*$/.test(attrSource)) {
      this.skip = name;
      return;
    }
    if (name === 'br') {
      this.brk();
      return;
    }
    if (name === 'img') {
      const attrs = parseAttributes(attrSource);
      const src = attrs.get('src') ?? attrs.get('data-src') ?? '';
      if (src) this.image(src, attrs.get('alt') ?? attrs.get('title') ?? '', line);
      return;
    }
    if (name === 'a') {
      if (closing) this.closeLink();
      else {
        const href = parseAttributes(attrSource).get('href');
        if (href !== undefined) this.openLink(href.trim(), line);
      }
      return;
    }
    if (CODE_TAGS.has(name)) {
      this.codeDepth = Math.max(0, this.codeDepth + (closing ? -1 : 1));
      return;
    }
    const heading = /^h([1-6])$/.exec(name);
    if (heading) {
      this.brk();
      if (!closing) this.headingStack.push({ depth: Number(heading[1]), start: this.out.length, line });
      else {
        const open = this.headingStack.pop();
        if (open) {
          const text = this.out.slice(open.start).join('').replace(BREAK_ALL, ' ').replace(/\s+/g, ' ').trim();
          this.headings.push({ depth: open.depth, text, line: open.line });
        }
        this.brk();
      }
      return;
    }
    if (BLOCK_TAGS.has(name)) this.brk();
  }

  /** Feeds mdast phrasing content. */
  inline(nodes: readonly Nodes[], fallbackLine: number): void {
    for (const node of nodes) this.node(node, fallbackLine);
  }

  private node(node: Nodes, fallbackLine: number): void {
    const line = node.position?.start.line ?? fallbackLine;
    switch (node.type) {
      case 'text':
        this.push(stripShortcodes(node.value), line);
        return;
      case 'inlineCode':
      case 'inlineMath':
        this.push(node.value, line, F_CODE);
        return;
      case 'break':
        this.brk();
        return;
      case 'html':
        this.html(node.value, line);
        return;
      case 'image':
        this.image(node.url, node.alt ?? '', line);
        return;
      case 'imageReference':
        this.image(this.defs.get(node.identifier.toLowerCase()) ?? '', node.alt ?? '', line);
        return;
      case 'link':
      case 'linkReference': {
        const url = node.type === 'link' ? node.url : (this.defs.get(node.identifier.toLowerCase()) ?? '');
        this.openLink(url, line);
        this.inline(node.children as Nodes[], line);
        this.closeLink();
        return;
      }
      case 'footnoteReference':
        return;
      default:
        if ('children' in node) this.inline(node.children as Nodes[], line);
    }
  }

  build(): Flat {
    while (this.linkStack.length) this.closeLink();
    while (this.out.length && (this.out[this.out.length - 1] === ' ' || this.out[this.out.length - 1] === BREAK)) {
      this.out.pop();
      this.lines.pop();
      this.flags.pop();
    }
    const text = this.out.join('');
    for (const link of this.links) link.end = Math.min(link.end, text.length);
    this.links.sort((a, b) => a.start - b.start || a.line - b.line);
    return { text, lines: this.lines, flags: this.flags, links: this.links, images: this.images, headings: this.headings };
  }
}

export function flattenInline(nodes: readonly Nodes[], defs: Definitions, fallbackLine: number): Flat {
  const b = new FlatBuilder(defs);
  b.inline(nodes, fallbackLine);
  return b.build();
}

export function flattenHtml(value: string, line: number): Flat {
  const b = new FlatBuilder();
  b.html(value, line);
  return b.build();
}

/** Text of a slice of a flat, with boundaries turned into spaces. */
export function flatSlice(flat: Flat, start: number, end: number): string {
  return flat.text.slice(start, end).replace(BREAK_ALL, ' ').replace(/\s+/g, ' ').trim();
}

/** Plain text of raw HTML, tags removed and entities decoded. */
export function htmlToText(value: string): string {
  return flattenHtml(value, 1).text.replace(BREAK_ALL, ' ').trim();
}

const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/g;
const WORD = /[\p{L}\p{N}][\p{L}\p{M}\p{N}'’_-]*/gu;

/** Word count (CJK characters count as half a word each), like the renderer. */
export function countWords(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  return (text.replace(CJK, ' ').match(WORD)?.length ?? 0) + Math.ceil(cjk / 2);
}

const DECOR_START = /^(?:[\s\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣|·•▪▸►▶→⇒➜➤✓✔☑*>~:-]|\p{Regional_Indicator})+/u;
const DECOR_END = /(?:[\s\p{Extended_Pictographic}\p{Emoji_Modifier}‍️|·•]|\p{Regional_Indicator})+$/u;

/** Strips leading bullets/emoji and trailing emoji, collapses whitespace. */
export function stripDecor(text: string): string {
  return stripShortcodes(text)
    .replace(BREAK_ALL, ' ')
    .replace(/\s+/g, ' ')
    .replace(DECOR_START, '')
    .replace(DECOR_END, '')
    .trim();
}

/** Shortens to at most `max` characters at a word boundary, adding an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const base = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s,;:–—-]+$/u, '')}…`;
}
