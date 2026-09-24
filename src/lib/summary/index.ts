import GithubSlugger from 'github-slugger';
import type { Nodes } from 'mdast';
import { parseMarkdown, walk } from '../markdown/parse';
import { buildModel, type DocModel } from './sections';
import { extractSentences, type Sentence } from './sentences';
import { isEligible, rankSentences, summarise } from './textrank';
import { extractFacts, type Fact, type Feature } from './facts';
import { F_CODE, FlatBuilder, countWords, stripDecor, stripShortcodes, truncate } from './text';

export type { Fact, FactKind, Feature } from './facts';

export interface Insights {
  /** H1 text (or HTML `<h1>`), or the repository name. */
  name: string | null;
  /** First descriptive sentence after the title. */
  tagline: string | null;
  /** "What is this project", at most 160 characters. */
  oneLiner: string;
  /** 3–5 top sentences in original order (fewer for tiny READMEs). */
  summary: Array<{ text: string; line: number }>;
  tech: Fact[];
  install: Fact[];
  run: Fact[];
  requirements: Fact[];
  links: Fact[];
  licence: Fact | null;
  authors: Fact[];
  /** Headings with GitHub slugs. */
  outline: Array<{ depth: number; text: string; line: number; id: string }>;
  stats: { words: number; readingMinutes: number; codeBlocks: number; images: number; links: number; headings: number; sections: number };
  /** Items of the README's "Features" section, if it has one (used by `keyFeaturesSection`). */
  features?: Feature[];
}

export interface AnalyzeContext {
  repo?: { owner: string; name: string; description?: string | null };
}

const GREETING = /^(hi|hello|hey|hiya|hola|salut|bonjour|welcome|greetings|yo|مرحبا|أهلا|اهلا)\b/iu;
const NOT_TAGLINE = /^(table of contents|contents|toc|note|warning|important|caution|tip|notice|disclaimer|update|news|announcement|status|work in progress|wip)\b/i;
const ACTION_VERBS = new Set(
  (
    'turns converts makes lets helps provides generates creates allows enables transforms brings gives builds renders adds takes keeps finds shows ' +
    'tracks manages automates simplifies analyses analyzes scans syncs monitors runs serves offers delivers powers combines extracts visualises ' +
    'visualizes detects downloads uploads compiles parses formats checks lints tests deploys hosts stores sends fetches lists searches translates ' +
    'summarises summarizes displays organises organizes connects exports imports records plays handles wraps implements replaces supports'
  ).split(/\s+/),
);

function cleanName(text: string): string {
  return truncate(stripDecor(text).replace(/\s+/g, ' ').trim(), 120);
}

function findName(model: DocModel, ctx: AnalyzeContext): string | null {
  if (model.title) {
    const text = cleanName(model.title.text);
    if (text) return text;
    // `# ![Project logo](logo.svg)`: use the logo's alt text.
    const unit = model.units.find((u) => u.kind === 'heading' && (u.node.position?.start.line ?? 0) === model.title!.line);
    const alt = unit?.flat.images.find((i) => !i.badge && i.alt)?.alt ?? '';
    const fromAlt = cleanName(alt.replace(/\b(logo|banner|icon|header|image|screenshot|preview)\b/gi, ''));
    if (fromAlt.length >= 2) return fromAlt;
  }
  // Otherwise the first H1, if it comes before any H2 and is not a section name ("# Installation").
  const firstH1 = model.headings.findIndex((h) => h.depth === 1);
  const firstH2 = model.headings.findIndex((h) => h.depth === 2);
  const h1 = model.headings[firstH1];
  if (h1 && (firstH2 < 0 || firstH1 < firstH2) && h1.kinds.length === 0 && cleanName(h1.text)) return cleanName(h1.text);
  return ctx.repo?.name?.trim() || null;
}

function taglineCandidate(s: Sentence): boolean {
  return s.kind !== 'list' && s.words >= 3 && s.linkRatio <= 0.7 && s.codeRatio <= 0.5 && !/:$/.test(s.text) && !NOT_TAGLINE.test(stripDecor(s.text));
}

function findTagline(model: DocModel, sentences: Sentence[], ctx: AnalyzeContext): string | null {
  const intro = sentences.find((s) => s.section === 0 && taglineCandidate(s));
  // "# Name" followed directly by "### A short subtitle".
  const subtitle = model.headings.find(
    (h) =>
      h !== model.title &&
      !h.html &&
      h.depth >= 3 &&
      (h.kinds.length === 0 || h.text.split(/\s+/).length >= 6) &&
      h.text.split(/\s+/).length >= 3 &&
      model.blocks.some((b) => b.section === 0 && b.node.type === 'heading' && b.node.position?.start.line === h.line),
  );
  if (subtitle && (!intro || subtitle.line < intro.line)) return truncate(stripDecor(subtitle.text), 300);
  if (intro) return truncate(stripDecor(intro.text), 300);
  const about = sentences.find((s) => s.kinds.includes('about') && taglineCandidate(s));
  if (about) return truncate(stripDecor(about.text), 300);
  const description = ctx.repo?.description?.trim();
  return description ? truncate(description, 300) : null;
}

const normaliseForCompare = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Whether `text` names the project as a whole word ("widget" is not in "Widgets"). */
function mentionsName(text: string, name: string): boolean {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

function lcFirst(text: string): string {
  const first = text.split(/\s/)[0] ?? '';
  // Keep acronyms and brand names ("API", "GitHub") as they are.
  if (/^\p{Lu}[\p{Ll}'’-]*$/u.test(first) && first.length > 0) return text.charAt(0).toLowerCase() + text.slice(1);
  return text;
}

function ensureTerminal(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return /[.!?…。！？؟]["'”’)\]]*$/u.test(t) ? t : `${t}.`;
}

function buildOneLiner(name: string | null, tagline: string | null, top: string | null): string {
  const usableName = name && !GREETING.test(name) ? name : null;
  let out = '';
  const t = tagline ? stripDecor(tagline) : '';
  if (t) {
    const latin = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(t);
    const firstWord = (t.split(/\s+/)[0] ?? '').toLowerCase();
    if (!usableName || mentionsName(t, usableName)) out = t;
    else if (latin && /^(an?|the)\s/i.test(t)) out = `${usableName} is ${lcFirst(t)}`;
    else if (latin && ACTION_VERBS.has(firstWord)) out = `${usableName} ${lcFirst(t)}`;
    else out = `${usableName}: ${t}`;
  } else if (top) {
    out = stripDecor(top);
  } else if (name) {
    out = name;
  }
  if (!out) return '';
  out = out.replace(/\s+/g, ' ').trim();
  if (out.length > 160) return truncate(out, 160);
  return out === name ? out : ensureTerminal(out);
}

function computeStats(model: DocModel): Insights['stats'] {
  let words = 0;
  let codeBlocks = 0;
  walk(model.tree, (node: Nodes) => {
    if (node.type === 'code') {
      const lang = (node.lang ?? '').toLowerCase();
      if (lang !== 'mermaid' && lang !== 'math') codeBlocks++;
      return false;
    }
    if (node.type === 'math' || node.type === 'inlineMath' || node.type === 'inlineCode') return false;
    if (node.type === 'text') words += countWords(stripShortcodes(node.value));
    if (node.type === 'html') {
      codeBlocks += node.value.match(/<pre\b/gi)?.length ?? 0;
      const b = new FlatBuilder();
      b.html(node.value, 1);
      const flat = b.build();
      let prose = '';
      for (let i = 0; i < flat.text.length; i++) prose += (flat.flags[i]! & F_CODE) !== 0 ? ' ' : flat.text[i]!;
      words += countWords(prose);
    }
  });
  let images = 0;
  let links = 0;
  for (const unit of model.units) {
    images += unit.flat.images.filter((i) => !i.badge && i.src).length;
    links += unit.flat.links.length;
  }
  return {
    words,
    readingMinutes: Math.max(1, Math.round(words / 230)),
    codeBlocks,
    images,
    links,
    headings: model.headings.length,
    sections: model.headings.filter((h) => h.depth === 2).length,
  };
}

/**
 * Offline README analysis: name, tagline, a one-line description, an
 * extractive summary (TextRank), key facts with source lines, an outline with
 * GitHub anchors and reading stats. Never throws on odd input.
 */
export function analyzeReadme(markdown: string, context: AnalyzeContext = {}): Insights {
  const source = typeof markdown === 'string' ? markdown : '';
  const model = buildModel(source, parseMarkdown(source));
  const facts = extractFacts(model, context);
  const name = findName(model, context);

  const withHtml = extractSentences(model, { includeHtml: true });
  const markdownOnly = withHtml.filter((s) => s.kind !== 'html');
  const candidates = markdownOnly.filter(isEligible).length >= 2 ? markdownOnly : withHtml;

  const tagline = findTagline(model, withHtml, context);
  const summary = summarise(candidates, undefined, { name })
    .map((s) => ({ text: stripDecor(s.text), line: s.line }))
    .filter((s) => s.text);
  if (!summary.length && tagline) summary.push({ text: tagline, line: model.title?.line ?? 1 });

  const top = rankSentences(candidates.filter(isEligible), { name })[0]?.sentence.text ?? null;
  const oneLiner = buildOneLiner(name, tagline, top);

  const slugger = new GithubSlugger();
  const outline: Insights['outline'] = [];
  for (const h of model.headings) {
    const id = slugger.slug(h.slugText);
    if (h.text) outline.push({ depth: h.depth, text: h.text, line: h.line, id });
  }

  return {
    name,
    tagline,
    oneLiner,
    summary,
    tech: facts.tech,
    install: facts.install,
    run: facts.run,
    requirements: facts.requirements,
    links: facts.links,
    licence: facts.licence,
    authors: facts.authors,
    outline,
    stats: computeStats(model),
    features: facts.features,
  };
}

// ---------------------------------------------------------------------------- Markdown output

function escapeMd(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, '\\$1');
}

function codeSpan(text: string): string {
  if (!text.includes('`')) return `\`${text}\``;
  return `\`\` ${text} \`\``;
}

function linkMd(text: string, href: string): string {
  return `[${escapeMd(text)}](${href.replace(/[()\s]/g, (c) => encodeURIComponent(c))})`;
}

/** The summary as one paragraph (each sentence ends with punctuation). */
export function summaryParagraph(ins: Insights): string {
  return ins.summary.map((s) => ensureTerminal(s.text)).join(' ');
}

/** "Copy summary as Markdown". */
export function insightsToMarkdown(ins: Insights): string {
  const parts: string[] = [`### ${escapeMd(ins.name ?? 'Summary')}`];
  const paragraph = summaryParagraph(ins);
  // Skip the one-liner when the summary already says it (or it is just the name).
  const one = normaliseForCompare(ins.oneLiner);
  if (one && !normaliseForCompare(paragraph).includes(one) && (ins.oneLiner !== ins.name || !paragraph)) parts.push(escapeMd(ins.oneLiner));
  if (paragraph) parts.push(escapeMd(paragraph));

  const bullets: string[] = [];
  const values = (facts: Fact[], max: number) => facts.slice(0, max).map((f) => escapeMd(f.value));
  if (ins.tech.length) bullets.push(`- **Tech:** ${values(ins.tech, 15).join(', ')}`);
  if (ins.requirements.length) bullets.push(`- **Requirements:** ${values(ins.requirements, 5).join('; ')}`);
  if (ins.install.length) bullets.push(`- **Install:** ${ins.install.slice(0, 3).map((f) => codeSpan(f.value)).join(', ')}`);
  if (ins.run.length) bullets.push(`- **Run:** ${ins.run.slice(0, 3).map((f) => codeSpan(f.value)).join(', ')}`);
  for (const link of ins.links.slice(0, 6)) {
    bullets.push(`- **${link.label}:** ${link.href ? linkMd(link.value, link.href) : escapeMd(link.value)}`);
  }
  if (ins.licence) bullets.push(`- **Licence:** ${ins.licence.href ? linkMd(ins.licence.value, ins.licence.href) : escapeMd(ins.licence.value)}`);
  if (ins.authors.length) {
    const people = ins.authors.slice(0, 5).map((a) => (a.href && !a.href.startsWith('mailto:') ? linkMd(a.value, a.href) : escapeMd(a.value)));
    bullets.push(`- **${ins.authors.length === 1 ? 'Author' : 'Authors'}:** ${people.join(', ')}`);
  }
  if (bullets.length) parts.push(bullets.join('\n'));
  return `${parts.join('\n\n')}\n`;
}

/** "## Overview" section for the README, built from the summary. */
export function overviewSection(ins: Insights): string {
  const describes = ins.oneLiner && ins.oneLiner !== ins.name;
  const paragraph = summaryParagraph(ins) || (describes ? ensureTerminal(ins.oneLiner) : '') || 'Add a short description of the project here.';
  return `## Overview\n\n${paragraph}\n`;
}

/** "## Key features" section: the README's own Features list if it has one, otherwise the top sentences. */
export function keyFeaturesSection(ins: Insights): string {
  let items = (ins.features ?? []).map((f) => f.markdown || f.text).filter(Boolean);
  if (!items.length) items = ins.summary.map((s) => ensureTerminal(s.text));
  if (!items.length && ins.oneLiner && ins.oneLiner !== ins.name) items = [ensureTerminal(ins.oneLiner)];
  if (!items.length) items = ['Describe what makes this project useful.'];
  return `## Key features\n\n${items.map((i) => `- ${i}`).join('\n')}\n`;
}
