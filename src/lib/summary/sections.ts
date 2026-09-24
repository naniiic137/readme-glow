import type { Root, RootContent, Nodes, Heading, Code } from 'mdast';
import { walk } from '../markdown/parse';
import { BREAK, FlatBuilder, flattenInline, stripShortcodes, type Flat, type Definitions } from './text';

/**
 * A light document model shared by the summariser and the fact extractor:
 * headings (Markdown and raw HTML), which section every top-level block sits
 * in, what kind of section that is ("Installation", "Licence", ...), and every
 * piece of prose flattened to text with source lines.
 */
export type SectionKind =
  | 'about'
  | 'features'
  | 'install'
  | 'run'
  | 'requirements'
  | 'tech'
  | 'licence'
  | 'authors'
  | 'credits'
  | 'demo'
  | 'docs'
  | 'community'
  | 'boilerplate'
  | 'related'
  | 'reference';

export interface DocHeading {
  depth: number;
  /** Plain text (emoji shortcodes and images removed). */
  text: string;
  /** Text as GitHub slugs it (shortcodes kept as an emoji placeholder). */
  slugText: string;
  line: number;
  html: boolean;
  kinds: SectionKind[];
}

export interface BlockInfo {
  node: RootContent;
  index: number;
  /** Enclosing headings, outermost first. The document title is not included. */
  path: DocHeading[];
  heading: DocHeading | null;
  kinds: ReadonlySet<SectionKind>;
  /** 0 = intro (before the first section heading), then 1, 2, ... */
  section: number;
}

export type UnitKind = 'paragraph' | 'heading' | 'list' | 'quote' | 'cell' | 'html';

export interface TextUnit {
  flat: Flat;
  kind: UnitKind;
  block: BlockInfo;
  node: Nodes;
  /** Table row (0 = header) for cells. */
  row?: number;
  /** Cell position in its row. */
  cell?: number;
  /** Depth of list nesting (1 = top-level item). */
  listDepth?: number;
  /** The list item a list paragraph belongs to. */
  item?: Nodes;
}

export interface CodeUnit {
  node: Code;
  block: BlockInfo;
}

export interface DocModel {
  source: string;
  tree: Root;
  title: DocHeading | null;
  headings: DocHeading[];
  blocks: BlockInfo[];
  units: TextUnit[];
  codes: CodeUnit[];
  definitions: Definitions;
  lineAt(offset: number): number;
}

const KIND_PATTERNS: Array<[SectionKind, RegExp]> = [
  ['about', /\b(about|overview|introduction|intro|description|what is|what'?s this|why|motivation|summary|background|in a nutshell|tl;?dr|concept)\b|à propos|aperçu|présentation|vue d'ensemble|نبذة|حول|مقدمة|نظرة عامة|عن المشروع|الوصف/iu],
  ['features', /\b(features?|highlights?|what it does|capabilities|functionality|key points)\b|fonctionnalités|caractéristiques|المميزات|الميزات|مميزات|الخصائص/iu],
  ['install', /\b(install(ation|ing)?|setup|set up|setting up|getting started|get started|quick ?start|download(ing)?|build(ing)? from source|how to (install|build|set up)|deploy(ment|ing)?|local development)\b|démarrage|mise en place|التثبيت|تثبيت|البدء|الإعداد/iu],
  ['run', /\b(usage|how to use|how to run|run(ning)?|quick ?start|development|developing|scripts|commands|cli|examples?|launch(ing)?|start(ing)? the|local development|how to play|controls)\b|utilisation|lancement|exécution|الاستخدام|التشغيل|طريقة الاستخدام/iu],
  ['requirements', /\b(requirements?|prerequisites?|pre-requisites?|dependencies|system requirements|before you (begin|start)|what you need|you('ll| will)? need)\b|prérequis|dépendances|configuration requise|المتطلبات|متطلبات/iu],
  ['tech', /(?<![\w-])stack(?![\w-])|\b(tech(nolog(y|ies))?( stack)?|built with|made with|powered by|tools( used| and technologies)?|languages( and tools| & tools)?|skills|frameworks?|libraries used|toolbox|techs?|tech ?stack)\b|technologies|outils|langages|compétences|التقنيات|الأدوات|التقنيات المستخدمة/iu],
  ['licence', /\b(licen[cs]e|licensing|copyright|legal)\b|الترخيص|الرخصة/iu],
  ['authors', /\b(authors?|contact|maintainers?|creators?|team|about (the )?(author|me|us)|made by|created by|connect( with me)?|find me|reach (me|out)|get in touch|socials?|who am i|author & contact)\b|auteurs?|mainteneurs?|équipe|المؤلف|التواصل|تواصل|المطور/iu],
  ['credits', /\b(credits?|acknowledg(e)?ments?|thanks|special thanks)\b|remerciements|شكر/iu],
  ['demo', /\b(demo|live( version| site| preview)?|try it( online| out)?|playground|online version)\b|démo|تجربة/iu],
  ['docs', /\b(documentation|docs|wiki|guides?|manual|api reference)\b|التوثيق/iu],
  ['community', /\b(community|support|discord|chat|help|discussions?)\b|communauté|المجتمع/iu],
  ['boilerplate', /\b(contribut(e|ing|ion|ions|ors?)|code of conduct|security|sponsors?|donat(e|ion|ions)|funding|backers|faq|roadmap|todo|to-do|changelog|release notes|table of contents|contents|toc|star history|stargazers|show your support|citation|cite|spoilers?|troubleshooting|known issues|support (the|this) project)\b|contribuer|المساهمة/iu],
  ['reference', /\b(api|reference|methods?|options|parameters|params|props|properties|arguments|returns|configuration|config|events|types|hooks|functions|classes|interfaces|cli options|flags)\b|^[\w.$]+\(.*\)$/iu],
  ['related', /\b(ports?|related( projects| packages| libraries| work)?|see also|alternatives?|similar( projects| libraries| tools)?|other (projects|libraries|implementations|languages)|bindings|prior art|comparisons?|benchmarks?|inspiration|inspired by|projects using)\b/iu],
];

/** Section kinds a heading suggests ("🚀 Getting started" → install). */
export function classifyHeading(text: string): SectionKind[] {
  const t = text.toLowerCase();
  const kinds: SectionKind[] = [];
  for (const [kind, re] of KIND_PATTERNS) if (re.test(t)) kinds.push(kind);
  // "About me" is an author section, not a project overview.
  if (kinds.includes('authors') && /\babout (me|us|the author)\b/.test(t)) return kinds.filter((k) => k !== 'about');
  return kinds;
}

const SECTION_NAMES = /^(installation|install|usage|features|about|overview|introduction|getting started|licen[cs]e|contributing|requirements|prerequisites|setup|documentation|contact|authors?|credits|changelog|faq|table of contents|contents)$/i;

/** Heading text without images, with shortcodes removed (display) or kept as a placeholder (slug). */
function headingTexts(node: Heading): { text: string; slugText: string } {
  let raw = '';
  walk(node, (n) => {
    if (n.type === 'text' || n.type === 'inlineCode' || n.type === 'inlineMath') raw += n.value;
    else if (n.type === 'html') raw += n.value.replace(/<[^>]*>/g, '');
    else if (n.type === 'break') raw += ' ';
    else if (n.type === 'image' || n.type === 'imageReference' || n.type === 'footnoteReference') return false;
  });
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  return {
    text: clean(stripShortcodes(raw)),
    // GitHub renders shortcodes as emoji, which the slugger drops (keeping the space).
    slugText: clean(raw.replace(/:(?=[a-z0-9_+-]*[a-z])[a-z0-9_+-]{1,40}:/gi, '\u{1F642}')),
  };
}

function makeHeading(depth: number, text: string, slugText: string, line: number, html: boolean): DocHeading {
  return { depth, text, slugText, line, html, kinds: classifyHeading(text) };
}

export function buildModel(source: string, tree: Root): DocModel {
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineAt = (offset: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const definitions = new Map<string, string>();
  walk(tree, (n) => {
    if (n.type === 'definition' && !definitions.has(n.identifier.toLowerCase())) definitions.set(n.identifier.toLowerCase(), n.url);
    if (n.type === 'code') return false;
  });

  // Every heading in document order, and the headings of each top-level block.
  const headings: DocHeading[] = [];
  const blockHeadings = new Map<RootContent, DocHeading[]>();
  const htmlFlats = new Map<RootContent, Flat>();
  for (const block of tree.children) {
    const own: DocHeading[] = [];
    walk(block, (n) => {
      if (n.type === 'code') return false;
      if (n.type === 'heading') {
        const { text, slugText } = headingTexts(n);
        own.push(makeHeading(n.depth, text, slugText, n.position?.start.line ?? 1, false));
      } else if (n.type === 'html' && n === block) {
        const flat = new FlatBuilder(definitions);
        flat.html(n.value, n.position?.start.line ?? 1);
        const built = flat.build();
        htmlFlats.set(block, built);
        for (const h of built.headings) own.push(makeHeading(h.depth, h.text, h.text, h.line, true));
      }
    });
    headings.push(...own);
    blockHeadings.set(block, own);
  }

  const first = headings[0];
  const title = first && first.depth === 1 && !SECTION_NAMES.test(first.text) ? first : null;
  const others = headings.filter((h) => h !== title);
  const minDepth = others.length ? Math.min(...others.map((h) => h.depth)) : 2;
  const splitDepth = Math.max(2, minDepth);

  const blocks: BlockInfo[] = [];
  const stack: DocHeading[] = [];
  let section = 0;
  // A short heading right after the title ("# Name" + "### A tagline") is a subtitle, not a section.
  let afterTitle = false;
  tree.children.forEach((node, index) => {
    const own = node.type === 'heading' || node.type === 'html' ? (blockHeadings.get(node) ?? []) : [];
    if (!own.length && node.type !== 'html' && node.type !== 'definition') afterTitle = false;
    for (const h of own) {
      if (h === title) {
        afterTitle = true;
        continue;
      }
      if (afterTitle && h.depth >= 3 && (h.kinds.length === 0 || h.text.split(/\s+/).length >= 6)) {
        afterTitle = false;
        continue;
      }
      afterTitle = false;
      while (stack.length && stack[stack.length - 1]!.depth >= h.depth) stack.pop();
      stack.push(h);
      if (h.depth <= splitDepth) section++;
    }
    const path = stack.slice();
    const kinds = new Set<SectionKind>();
    for (const h of path) for (const k of h.kinds) kinds.add(k);
    blocks.push({ node, index, path, heading: path[path.length - 1] ?? null, kinds, section });
  });

  const units: TextUnit[] = [];
  const codes: CodeUnit[] = [];
  const addFlat = (flat: Flat, kind: UnitKind, block: BlockInfo, node: Nodes, extra: Partial<TextUnit> = {}) => {
    if (flat.text || flat.images.length || flat.links.length) units.push({ flat, kind, block, node, ...extra });
  };
  const visit = (node: Nodes, block: BlockInfo, context: 'paragraph' | 'list' | 'quote', listDepth: number, item?: Nodes): void => {
    const line = node.position?.start.line ?? 1;
    switch (node.type) {
      case 'paragraph':
        addFlat(flattenInline(node.children, definitions, line), context, block, node, context === 'list' ? { listDepth, item } : {});
        return;
      case 'heading':
        addFlat(flattenInline(node.children, definitions, line), 'heading', block, node);
        return;
      case 'list':
        for (const li of node.children) for (const child of li.children) visit(child, block, 'list', listDepth + 1, li);
        return;
      case 'blockquote':
        for (const child of node.children) visit(child, block, context === 'list' ? 'list' : 'quote', listDepth, item);
        return;
      case 'table':
        node.children.forEach((row, r) => {
          row.children.forEach((cell, c) => {
            addFlat(flattenInline(cell.children, definitions, cell.position?.start.line ?? line), 'cell', block, cell, { row: r, cell: c });
          });
        });
        return;
      case 'html': {
        const flat = htmlFlats.get(node as RootContent);
        if (flat) addFlat(flat, 'html', block, node);
        else {
          const b = new FlatBuilder(definitions);
          b.html(node.value, line);
          addFlat(b.build(), 'html', block, node);
        }
        return;
      }
      case 'code':
        codes.push({ node, block });
        return;
      case 'footnoteDefinition':
        for (const child of node.children) visit(child, block, 'paragraph', listDepth);
        return;
      default:
        return;
    }
  };
  for (const block of blocks) visit(block.node, block, 'paragraph', 0);

  return { source, tree, title, headings, blocks, units, codes, definitions, lineAt };
}

/** Plain text of a unit with boundaries as spaces. */
export function unitText(unit: TextUnit): string {
  return unit.flat.text.split(BREAK).join(' ').trim();
}
