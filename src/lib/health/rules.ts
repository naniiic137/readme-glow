import GithubSlugger from 'github-slugger';
import { isBadgeUrl } from '../markdown/badges';
import { scanMarkdown, type Block, type DocScan, type HeadingInfo } from './scan';

export type Severity = 'error' | 'warning' | 'info';

export type FixId =
  | 'add-title'
  | 'add-description'
  | 'add-installation'
  | 'add-usage'
  | 'add-licence'
  | 'add-screenshots'
  | 'add-alt-text'
  | 'fix-heading-levels'
  | 'remove-empty-links'
  | 'add-code-languages';

export interface HealthIssue {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  line?: number;
  count?: number;
  fix?: FixId;
  fixLabel?: string;
}

export interface HealthReport {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E';
  issues: HealthIssue[];
  passed: Array<{ id: string; title: string }>;
}

export const FIX_LABELS: Record<FixId, string> = {
  'add-title': 'Add a title',
  'add-description': 'Add a description',
  'add-installation': 'Add an Installation section',
  'add-usage': 'Add a Usage section',
  'add-licence': 'Add a Licence section',
  'add-screenshots': 'Add a Screenshots section',
  'add-alt-text': 'Add alt text',
  'fix-heading-levels': 'Fix heading levels',
  'remove-empty-links': 'Remove empty links',
  'add-code-languages': 'Label code blocks',
};

/** Placeholder text inserted by the fixes (and flagged by the placeholder check until replaced). */
export const PLACEHOLDERS = {
  description: 'Describe what this project does, who it is for and why it is useful.',
  alt: 'Describe this image',
  owner: 'Your Name',
} as const;

export const INSTALL_RE =
  /\b(?:install(?:ation|ing|s)?|set[ -]?up|setting up|getting started|get started|quick[ -]?start|downloads?|build(?:ing)? from source)\b/i;
export const USAGE_RE = /\b(?:usage|how to use|how-to|examples?|quick[ -]?start|tutorials?|basic use)\b/i;
export const LICENCE_HEADING_RE = /\b(?:licen[cs](?:e|es|ing)|copyright)\b/i;
/** Sections that belong to a README's introduction (installation goes after them). */
export const INTRO_RE =
  /^(?:table of contents|contents|toc\b|about|overview|introduction|intro\b|description|(?:key )?features|highlights|why\b|motivation|screenshots?|demo|preview|background|what is|what's)/i;

const LONG_LINE = 180;
const MIN_WORDS = 60;
const DESCRIPTION_WORDS = 8;

// ------------------------------------------------------------------ shared helpers

/** Heading text without leading emoji, numbering or punctuation. */
export function cleanHeading(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+/u, '').replace(/^\d+(?:\.\d+)*[.)]?\s+/, '');
}

export function titleHeading(scan: DocScan): HeadingInfo | undefined {
  return scan.headings.find((h) => h.depth === 1);
}

/** True when a descriptive paragraph (≥ 8 words) follows the title (or opens the README). */
export function hasDescription(scan: DocScan): boolean {
  const { blocks } = scan;
  const title = titleHeading(scan);
  let i = 0;
  if (title) {
    const tb = blocks[title.blockIndex]!;
    if (tb.kind === 'html' && tb.proseWords >= DESCRIPTION_WORDS) return true;
    i = title.blockIndex + 1;
  }
  let seen = 0;
  for (; i < blocks.length && seen < 6; i++) {
    const b = blocks[i]!;
    if (b.kind === 'heading') {
      if (!title && seen === 0) continue;
      break;
    }
    if (b.kind === 'definition') continue;
    seen++;
    if (b.listItem) continue;
    if ((b.kind === 'paragraph' || b.kind === 'html') && b.proseWords >= DESCRIPTION_WORDS) return true;
  }
  return false;
}

/**
 * Target levels for every heading (HTML headings keep theirs): one H1 title,
 * extra Markdown H1s (and everything after the title) shifted down a level,
 * then no level may be more than one deeper than the heading before it.
 */
export function planHeadingLevels(headings: readonly HeadingInfo[]): number[] {
  const titleIdx = headings.findIndex((h) => h.depth === 1);
  const shift = titleIdx >= 0 && headings.some((h, i) => i > titleIdx && h.kind === 'md' && h.depth === 1);
  let prev: number | null = null;
  return headings.map((h, i) => {
    if (h.kind === 'html') {
      prev = h.depth;
      return h.depth;
    }
    let d = h.depth;
    if (shift && i > titleIdx) d = Math.min(6, d + 1);
    if (prev !== null && d > prev + 1) d = prev + 1;
    prev = d;
    return d;
  });
}

function headingProblems(headings: readonly HeadingInfo[]): { lines: number[]; multiple: boolean; skipped: boolean } {
  const lines: number[] = [];
  let multiple = false;
  let skipped = false;
  let seenH1 = false;
  let prev: number | null = null;
  for (const h of headings) {
    let bad = false;
    if (h.depth === 1) {
      if (seenH1) {
        multiple = true;
        bad = true;
      }
      seenH1 = true;
    }
    if (h.kind === 'md' && prev !== null && h.depth > prev + 1) {
      skipped = true;
      bad = true;
    }
    if (bad) lines.push(h.line);
    prev = h.depth;
  }
  return { lines, multiple, skipped };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function visibleLength(line: string): number {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/<[^>]+>/g, '')
    .replace(/\bhttps?:\/\/\S+/g, '')
    .trim().length;
}

const LOGO_RE = /\b(?:logos?|icons?|avatars?|favicons?)\b/i;
const DEMO_TEXT_RE = /\b(?:demo|live|preview|screenshots?|screencast|video|playground|try it)\b/i;
const DEMO_URL_RE =
  /youtube\.com|youtu\.be|vimeo\.com|loom\.com|asciinema\.org|\.(?:gif|mp4|webm|mov)(?:[?#]|$)|user-attachments\/assets|\/demo\b/i;

function isLogo(url: string, alt: string): boolean {
  const file = url.split(/[?#]/)[0]!.split('/').pop() ?? '';
  return LOGO_RE.test(alt) || LOGO_RE.test(file.replace(/[_.]/g, ' '));
}

/** A screenshot-like image, a video or a demo link. */
export function hasVisual(s: DocScan): boolean {
  return (
    s.hasVideo ||
    s.images.some((i) => i.url.trim() !== '' && !isBadgeUrl(i.url) && !isLogo(i.url, i.alt)) ||
    s.links.some((l) => DEMO_TEXT_RE.test(l.text) || DEMO_URL_RE.test(l.url)) ||
    s.urls.some((u) => DEMO_URL_RE.test(u))
  );
}

export function hasLicence(s: DocScan): boolean {
  return s.licenceMention || s.headings.some((h) => LICENCE_HEADING_RE.test(h.text));
}
const PLACEHOLDER_CS = new RegExp(
  `\\b(?:TODO|TBD|FIXME)\\b|${PLACEHOLDERS.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|\\b${PLACEHOLDERS.owner}\\b`,
  'g',
);
const PLACEHOLDER_CI = /lorem ipsum|coming soon/gi;

export function sectionHeading(scan: DocScan, re: RegExp): HeadingInfo | undefined {
  return scan.headings.find((h) => re.test(h.text));
}

// ------------------------------------------------------------------ rules

interface Finding {
  severity: Severity;
  title: string;
  detail: string;
  line?: number;
  count?: number;
  fix?: FixId;
  /** Overrides the usual weighted penalty. */
  penalty?: number;
}

interface Rule {
  id: string;
  passed: string;
  run(scan: DocScan): Finding | null;
}

const RULES: Rule[] = [
  {
    id: 'title',
    passed: 'Has a title',
    run: (s) =>
      titleHeading(s)
        ? null
        : {
            severity: 'error',
            title: 'No title',
            detail: 'Start with a # heading that names the project, so people know straight away where they are.',
            fix: 'add-title',
          },
  },
  {
    id: 'description',
    passed: 'Opens with a short description',
    run: (s) =>
      hasDescription(s)
        ? null
        : {
            severity: 'warning',
            title: 'No short description',
            detail: 'Add a sentence or two under the title that says what the project does and who it is for.',
            fix: 'add-description',
          },
  },
  {
    id: 'installation',
    passed: 'Explains how to install it',
    run: (s) =>
      sectionHeading(s, INSTALL_RE)
        ? null
        : {
            severity: 'warning',
            title: 'No installation section',
            detail: 'Tell people how to get it running — even one command helps.',
            fix: 'add-installation',
          },
  },
  {
    id: 'usage',
    passed: 'Shows how to use it',
    run: (s) =>
      sectionHeading(s, USAGE_RE)
        ? null
        : {
            severity: 'warning',
            title: 'No usage section',
            detail: 'Show the quickest way to use it: a command, a short code example or a few steps.',
            fix: 'add-usage',
          },
  },
  {
    id: 'screenshots',
    passed: 'Shows what it looks like',
    run: (s) =>
      hasVisual(s)
        ? null
        : {
            severity: 'info',
            title: 'No screenshots or demo',
            detail: 'A screenshot, GIF or demo link shows what the project does faster than any paragraph.',
            fix: 'add-screenshots',
          },
  },
  {
    id: 'licence',
    passed: 'Mentions a licence',
    run: (s) =>
      hasLicence(s)
        ? null
        : {
            severity: 'warning',
            title: 'No licence',
            detail: 'Say how others may use your work. Without a licence, nobody can legally reuse or share the code.',
            fix: 'add-licence',
          },
  },
  {
    id: 'heading-order',
    passed: 'Headings are in a tidy order',
    run: (s) => {
      const p = headingProblems(s.headings);
      if (!p.lines.length) return null;
      const title =
        p.multiple && p.skipped
          ? 'Heading levels need tidying'
          : p.multiple
            ? 'More than one H1 heading'
            : 'Heading levels skip a step';
      return {
        severity: 'warning',
        title,
        detail:
          'Use a single # title, ## for sections and ### inside them. Skipped levels confuse screen readers and the table of contents.',
        line: p.lines[0],
        count: p.lines.length,
        fix: 'fix-heading-levels',
      };
    },
  },
  {
    id: 'alt-text',
    passed: 'Images have alt text',
    run: (s) => {
      const missing = s.images.filter((i) => !i.hasAlt);
      if (!missing.length) return null;
      return {
        severity: 'warning',
        title: `${plural(missing.length, 'image has', 'images have')} no alt text`,
        detail: 'Alt text describes an image for screen reader users and shows up when the image cannot load.',
        line: missing[0]!.line,
        count: missing.length,
        fix: 'add-alt-text',
      };
    },
  },
  {
    id: 'long-lines',
    passed: 'Lines are a comfortable length',
    run: (s) => {
      let count = 0;
      let first = 0;
      const { source, lineStarts, excluded } = s;
      for (let l = 1; l <= lineStarts.length; l++) {
        if (excluded[l]) continue;
        const from = lineStarts[l - 1]!;
        const to = l < lineStarts.length ? lineStarts[l]! - 1 : source.length;
        if (to - from <= LONG_LINE) continue;
        if (visibleLength(source.slice(from, to)) <= LONG_LINE) continue;
        count++;
        if (!first) first = l;
      }
      if (!count) return null;
      return {
        severity: 'info',
        title: `${plural(count, 'very long line', 'very long lines')}`,
        detail: `Lines over ${LONG_LINE} characters are hard to read and review. Break long paragraphs over a few lines — they still render as one.`,
        line: first,
        count,
      };
    },
  },
  {
    id: 'empty-links',
    passed: 'No empty links',
    run: (s) => {
      const empty = s.links.filter((l) => (l.kind === 'md' && (l.emptyUrl || l.emptyText)) || (l.kind === 'html' && l.emptyUrl));
      if (!empty.length) return null;
      return {
        severity: 'warning',
        title: `${plural(empty.length, 'empty link', 'empty links')}`,
        detail: 'Every link needs some text and somewhere to go. Empty ones lead nowhere and confuse screen readers.',
        line: empty[0]!.line,
        count: empty.length,
        ...(empty.some((l) => l.kind === 'md') ? { fix: 'remove-empty-links' as const } : {}),
      };
    },
  },
  {
    id: 'broken-anchors',
    passed: 'In-page links all have a target',
    run: (s) => {
      const slugger = new GithubSlugger();
      const targets = new Set<string>(['top', 'readme']);
      for (const h of s.headings) targets.add(slugger.slug(h.text));
      for (const id of s.ids) targets.add(id);
      const broken = s.links.filter((l) => {
        if (!l.url.startsWith('#') || l.url.length < 2) return false;
        let frag = l.url.slice(1);
        try {
          frag = decodeURIComponent(frag);
        } catch {
          // keep the raw fragment
        }
        frag = frag.toLowerCase().replace(/^user-content-/, '');
        if (/^fn(?:ref)?-/.test(frag)) return false;
        return !targets.has(frag);
      });
      if (!broken.length) return null;
      return {
        severity: 'warning',
        title: `${plural(broken.length, 'in-page link points', 'in-page links point')} nowhere`,
        detail: 'These #links do not match any heading. Check the spelling, or update them after renaming a heading.',
        line: broken[0]!.line,
        count: broken.length,
      };
    },
  },
  {
    id: 'too-short',
    passed: 'Has enough detail',
    run: (s) => {
      if (s.words >= MIN_WORDS) return null;
      if (s.words === 0) {
        return {
          severity: 'error',
          title: 'This README is empty',
          detail: 'Start with a title and a sentence about what the project does, then say how to install and use it.',
          penalty: 30,
        };
      }
      return {
        severity: 'warning',
        title: 'Your README is quite short',
        detail: `Only ${plural(s.words, 'word', 'words')} so far. A few sentences on what it does, how to install it and how to use it go a long way.`,
      };
    },
  },
  {
    id: 'placeholder-text',
    passed: 'No placeholder text left',
    run: (s) => {
      let count = 0;
      let first = Infinity;
      for (const seg of s.prose) {
        for (const re of [PLACEHOLDER_CS, PLACEHOLDER_CI]) {
          re.lastIndex = 0;
          for (let m = re.exec(seg.text); m; m = re.exec(seg.text)) {
            count++;
            first = Math.min(first, s.lineOf(seg.start + m.index));
          }
        }
      }
      for (const img of s.images) {
        if (img.alt.trim() === PLACEHOLDERS.alt) {
          count++;
          first = Math.min(first, img.line);
        }
      }
      if (!count) return null;
      return {
        severity: 'info',
        title: 'Placeholder text left in',
        detail: 'Replace TODOs, “coming soon” notes and template text with the real thing, or remove them.',
        line: first,
        count,
      };
    },
  },
  {
    id: 'code-language',
    passed: 'Code blocks are labelled',
    run: (s) => {
      const bare = s.blocks.filter((b: Block) => b.kind === 'code' && b.fenced && !b.lang);
      if (!bare.length) return null;
      return {
        severity: 'info',
        title: `${plural(bare.length, 'code block has', 'code blocks have')} no language`,
        detail: 'Add a language after the opening ``` (like ```bash or ```js) to get syntax highlighting.',
        line: bare[0]!.firstLine,
        count: bare.length,
        fix: 'add-code-languages',
      };
    },
  },
];

const WEIGHT: Record<Severity, number> = { error: 15, warning: 7, info: 3 };
const CAP: Record<Severity, number> = { error: 22, warning: 10, info: 4 };
const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

function penaltyOf(f: Finding): number {
  if (f.penalty !== undefined) return f.penalty;
  const extra = Math.max(0, (f.count ?? 1) - 1);
  return Math.min(CAP[f.severity], WEIGHT[f.severity] + extra);
}

export function gradeFor(score: number): HealthReport['grade'] {
  if (score >= 97) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'E';
}

/** Scores a README and lists friendly suggestions (fast enough to run on every edit). */
export function checkHealth(markdown: string): HealthReport {
  const scan = scanMarkdown(markdown);
  const issues: HealthIssue[] = [];
  const passed: HealthReport['passed'] = [];
  let penalty = 0;
  for (const rule of RULES) {
    const f = rule.run(scan);
    if (!f) {
      passed.push({ id: rule.id, title: rule.passed });
      continue;
    }
    penalty += penaltyOf(f);
    const issue: HealthIssue = { id: rule.id, severity: f.severity, title: f.title, detail: f.detail };
    if (f.line !== undefined) issue.line = f.line;
    if (f.count !== undefined) issue.count = f.count;
    if (f.fix) {
      issue.fix = f.fix;
      issue.fixLabel = FIX_LABELS[f.fix];
    }
    issues.push(issue);
  }
  issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  return { score, grade: gradeFor(score), issues, passed };
}
