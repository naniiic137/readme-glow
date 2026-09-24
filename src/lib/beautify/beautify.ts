/**
 * Beautify: one button that makes the README itself better. Runs a fixed
 * pipeline of pure Markdown → Markdown transforms (see ./transforms) and
 * reports which ones changed something. Every transform is idempotent, so
 * running Beautify twice gives the same result as running it once.
 */
import {
  addEssentials,
  addToc,
  backToTop,
  centerHeader,
  cleanFormatting,
  collapseLong,
  fixHeadings,
  groupBadges,
  sectionEmoji,
  type Transform,
} from './transforms';

export interface BeautifyOptions {
  cleanFormatting: boolean;
  fixHeadings: boolean;
  groupBadges: boolean;
  centerHeader: boolean;
  addToc: boolean;
  backToTop: boolean;
  sectionEmoji: boolean;
  collapseLong: boolean;
  addEssentials: boolean;
}

export const DEFAULT_BEAUTIFY_OPTIONS: BeautifyOptions = {
  cleanFormatting: true,
  fixHeadings: true,
  groupBadges: true,
  centerHeader: false,
  addToc: true,
  backToTop: false,
  sectionEmoji: false,
  collapseLong: true,
  addEssentials: false,
};

/** UI copy for each option, in the order the options are best shown. */
export const BEAUTIFY_OPTION_INFO: Array<{ id: keyof BeautifyOptions; label: string; description: string }> = [
  {
    id: 'cleanFormatting',
    label: 'Tidy formatting',
    description: 'Fixes spacing, bullets and code fences, adds obvious code languages and lines up tables.',
  },
  {
    id: 'fixHeadings',
    label: 'Fix headings',
    description: 'Keeps one main title and stops heading levels from skipping.',
  },
  {
    id: 'groupBadges',
    label: 'Group badges',
    description: 'Gathers scattered badges into one neat, centred row under the title.',
  },
  {
    id: 'centerHeader',
    label: 'Centre the header',
    description: 'Centres the logo, title, tagline and badges at the top.',
  },
  {
    id: 'addToc',
    label: 'Table of contents',
    description: 'Adds a linked contents list to longer READMEs, or refreshes the one you have.',
  },
  {
    id: 'backToTop',
    label: 'Back-to-top links',
    description: 'Adds a small “back to top” link at the end of each section.',
  },
  {
    id: 'sectionEmoji',
    label: 'Section emoji',
    description: 'Adds a fitting emoji to common sections, like ✨ Features and 📦 Installation.',
  },
  {
    id: 'collapseLong',
    label: 'Collapse long sections',
    description: 'Folds changelogs and very long sections behind a “Show” toggle.',
  },
  {
    id: 'addEssentials',
    label: 'Add missing essentials',
    description: 'Adds placeholder Installation, Usage and Licence sections if they are missing.',
  },
];

export interface BeautifyStep {
  id: keyof BeautifyOptions;
  label: string;
  changed: boolean;
}

/** The order the transforms run in. Each one re-parses the output of the one before. */
const PIPELINE: ReadonlyArray<[keyof BeautifyOptions, Transform]> = [
  ['fixHeadings', fixHeadings],
  ['cleanFormatting', cleanFormatting],
  ['addEssentials', addEssentials],
  ['sectionEmoji', sectionEmoji],
  ['groupBadges', groupBadges],
  ['centerHeader', centerHeader],
  ['addToc', addToc],
  ['backToTop', backToTop],
  ['collapseLong', collapseLong],
];

const LABELS = new Map(BEAUTIFY_OPTION_INFO.map((info) => [info.id, info.label]));

/**
 * YAML front matter (`---` … `---` at the very top) is not Markdown: it is
 * split off, left untouched and put back afterwards.
 */
function splitFrontMatter(markdown: string): { front: string; body: string } {
  // The blank lines after the closing `---` go with the front matter.
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)(?:[ \t]*\r?\n)*/.exec(markdown);
  if (!m || !/^[\w-]+[ \t]*:/m.test(m[1]!)) return { front: '', body: markdown };
  return { front: m[0], body: markdown.slice(m[0].length) };
}

/**
 * Beautifies a README. Options default to DEFAULT_BEAUTIFY_OPTIONS. `steps`
 * lists every enabled option, in the order it ran, and whether it changed
 * anything. With every option off the input comes back unchanged.
 *
 * Line endings: with `cleanFormatting` the result uses LF. Without it, a CRLF
 * file stays CRLF (the transforms work on LF internally).
 */
export function beautify(markdown: string, options: Partial<BeautifyOptions> = {}): { markdown: string; steps: BeautifyStep[] } {
  const opts: BeautifyOptions = { ...DEFAULT_BEAUTIFY_OPTIONS };
  for (const [id] of PIPELINE) {
    const value = options[id];
    if (typeof value === 'boolean') opts[id] = value;
  }
  const enabled = PIPELINE.filter(([id]) => opts[id]);
  if (enabled.length === 0) return { markdown, steps: [] };

  const { front, body } = splitFrontMatter(markdown);
  const crlf = /\r\n/.test(body);
  const start = opts.cleanFormatting ? body.replace(/\r\n?/g, '\n') : body.replace(/\r\n/g, '\n');
  let text = start;
  let tidy = '';
  const steps: BeautifyStep[] = [];
  for (const [id, transform] of enabled) {
    const next = transform(text);
    steps.push({ id, label: LABELS.get(id) ?? id, changed: next !== text });
    text = next;
    if (id === 'cleanFormatting') tidy = text;
  }

  if (opts.cleanFormatting) {
    // Later steps insert and rename things (a longer link can unalign a table),
    // so tidy once more at the end. This is what keeps Beautify idempotent.
    const tidied = text === tidy ? text : cleanFormatting(text);
    // Front matter, then one blank line, then the README.
    const head = front === '' ? '' : `${front.replace(/\r\n?/g, '\n').replace(/\s*$/, '\n')}${tidied ? '\n' : ''}`;
    const step = steps.find((s) => s.id === 'cleanFormatting');
    if (step && (tidied !== text || head !== front || body.includes('\r'))) step.changed = true;
    return { markdown: head + tidied, steps };
  }
  if (text === start) return { markdown, steps };
  return { markdown: front + (crlf ? text.replace(/\n/g, '\r\n') : text), steps };
}
