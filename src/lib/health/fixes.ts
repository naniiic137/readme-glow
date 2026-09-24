import { applyChanges, type Change } from '../editor/types';
import { getAttr, scanMarkdown, type Block, type DocScan, type HeadingInfo } from './scan';
import {
  INSTALL_RE,
  INTRO_RE,
  PLACEHOLDERS,
  USAGE_RE,
  cleanHeading,
  hasDescription,
  hasLicence,
  hasVisual,
  planHeadingLevels,
  sectionHeading,
  titleHeading,
  type FixId,
} from './rules';

export interface FixContext {
  /** Used for the title and example commands. */
  projectName?: string;
  /** Year for the licence placeholder (defaults to the current year). */
  year?: number;
}

/**
 * Applies one health-check fix. Pure and idempotent: when the problem is not
 * there (or already fixed) the Markdown comes back unchanged. Fixes only touch
 * the Markdown they are about, never code blocks, inline code or other HTML
 * (add-alt-text is the one fix that edits `<img>` tags).
 */
export function applyFix(markdown: string, fix: FixId, context: FixContext = {}): string {
  const scan = scanMarkdown(markdown);
  switch (fix) {
    case 'add-title':
      return addTitle(scan, context);
    case 'add-description':
      return addDescription(scan);
    case 'add-installation':
      return addInstallation(scan, context);
    case 'add-usage':
      return addUsage(scan, context);
    case 'add-licence':
      return addLicence(scan, context);
    case 'add-screenshots':
      return addScreenshots(scan, context);
    case 'add-alt-text':
      return addAltText(scan);
    case 'fix-heading-levels':
      return fixHeadingLevels(scan);
    case 'remove-empty-links':
      return removeEmptyLinks(scan);
    case 'add-code-languages':
      return addCodeLanguages(scan);
    default:
      return markdown;
  }
}

// ------------------------------------------------------------------ placement helpers

/** Inserts a block at a line start with exactly one blank line on each side. */
export function insertBlockAt(md: string, offset: number, block: string): string {
  const before = md.slice(0, offset).replace(/(?:\n[ \t]*)*$/, '');
  let after = md.slice(offset).replace(/^(?:[ \t]*\n)*/, '');
  if (after.trim() === '') after = '';
  return (before ? `${before}\n\n` : '') + block + (after ? `\n\n${after}` : '\n');
}

function lineAfter(scan: DocScan, b: Block): number {
  return b.end < scan.source.length ? b.end + 1 : scan.source.length;
}

/** End of any leading HTML comments and `<a name>` anchors. */
function leadingMetaEnd(scan: DocScan): number {
  let pos = 0;
  for (const b of scan.blocks) {
    // `<a name="top"></a>` alone on a line is a paragraph, not an HTML block.
    if ((b.kind !== 'html' && b.kind !== 'paragraph') || !b.top) break;
    const rest = scan.source
      .slice(b.start, b.end)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<a\s[^>]*\b(?:name|id)\s*=[^>]*>\s*<\/a\s*>/gi, '')
      .trim();
    if (rest) break;
    pos = lineAfter(scan, b);
  }
  return pos;
}

function isFootnoteDefinition(scan: DocScan, b: Block): boolean {
  return b.kind === 'paragraph' && /^\s*\[\^[^\]]+\]:/.test(scan.source.slice(b.start, b.end));
}

/** Where the README's content ends: before trailing link / footnote definitions. */
function contentEnd(scan: DocScan): number {
  const { blocks } = scan;
  let k = blocks.length - 1;
  while (k >= 0 && (blocks[k]!.kind === 'definition' || isFootnoteDefinition(scan, blocks[k]!))) k--;
  return k === blocks.length - 1 ? scan.source.length : blocks[k + 1]!.start;
}

interface Section {
  h: HeadingInfo;
  start: number;
}

function topSections(scan: DocScan): Section[] {
  const title = titleHeading(scan);
  const out: Section[] = [];
  for (const h of scan.headings) {
    const b = scan.blocks[h.blockIndex]!;
    if (h !== title && b.top) out.push({ h, start: b.start });
  }
  return out;
}

function sectionDepth(scan: DocScan): number {
  const depths = topSections(scan).map((s) => s.h.depth);
  return depths.length ? Math.min(6, Math.max(2, Math.min(...depths))) : 2;
}

function titleStart(scan: DocScan): number {
  const title = titleHeading(scan);
  return title ? scan.blocks[title.blockIndex]!.start : -1;
}

/** Before the first section after the introduction (About, Features, Screenshots…). */
function afterIntro(scan: DocScan): number {
  const depth = sectionDepth(scan);
  const from = titleStart(scan);
  const target = topSections(scan).find(
    (s) => s.start > from && s.h.depth <= depth && !INTRO_RE.test(cleanHeading(s.h.text)),
  );
  return target ? target.start : contentEnd(scan);
}

function sectionEnd(scan: DocScan, section: Section): number {
  const next = topSections(scan).find((s) => s.start > section.start && s.h.depth <= section.h.depth);
  return next ? next.start : Math.max(contentEnd(scan), section.start);
}

function findTopSection(scan: DocScan, re: RegExp): Section | undefined {
  return topSections(scan).find((s) => re.test(s.h.text));
}

function packageName(context: FixContext): string {
  const slug = (context.projectName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'your-project';
}

function heading(scan: DocScan, text: string): string {
  return `${'#'.repeat(sectionDepth(scan))} ${text}`;
}

// ------------------------------------------------------------------ fixes

function addTitle(scan: DocScan, context: FixContext): string {
  if (titleHeading(scan)) return scan.source;
  const name = context.projectName?.trim() || 'Project name';
  return insertBlockAt(scan.source, leadingMetaEnd(scan), `# ${name}`);
}

function isDecoration(scan: DocScan, index: number): boolean {
  const b = scan.blocks[index]!;
  if (b.kind === 'paragraph') return !b.listItem && b.proseWords === 0;
  if (b.kind === 'html') return b.proseWords < 8 && !scan.headings.some((h) => h.blockIndex === index);
  return false;
}

function addDescription(scan: DocScan): string {
  if (hasDescription(scan)) return scan.source;
  const title = titleHeading(scan);
  let pos: number;
  if (title) {
    pos = lineAfter(scan, scan.blocks[title.blockIndex]!);
    // Keep badge rows, logos and nav links directly under the title together.
    for (let k = title.blockIndex + 1, n = 0; k < scan.blocks.length && n < 3; k++, n++) {
      if (!isDecoration(scan, k)) break;
      pos = lineAfter(scan, scan.blocks[k]!);
    }
  } else pos = leadingMetaEnd(scan);
  return insertBlockAt(scan.source, pos, PLACEHOLDERS.description);
}

function addInstallation(scan: DocScan, context: FixContext): string {
  if (sectionHeading(scan, INSTALL_RE)) return scan.source;
  let pos = afterIntro(scan);
  const usage = findTopSection(scan, USAGE_RE);
  if (usage && usage.start > titleStart(scan) && usage.start < pos) pos = usage.start;
  const block = [
    heading(scan, 'Installation'),
    '',
    '<!-- Replace with the steps people need to get the project running. -->',
    '',
    '```bash',
    `npm install ${packageName(context)}`,
    '```',
  ].join('\n');
  return insertBlockAt(scan.source, pos, block);
}

function addUsage(scan: DocScan, context: FixContext): string {
  if (sectionHeading(scan, USAGE_RE)) return scan.source;
  const install = findTopSection(scan, INSTALL_RE);
  const pos = install && install.start > titleStart(scan) ? sectionEnd(scan, install) : afterIntro(scan);
  const block = [
    heading(scan, 'Usage'),
    '',
    '<!-- Show the quickest way to use the project: a command, a short code example or a few steps. -->',
    '',
    '```bash',
    `npx ${packageName(context)} --help`,
    '```',
  ].join('\n');
  return insertBlockAt(scan.source, pos, block);
}

function addScreenshots(scan: DocScan, context: FixContext): string {
  if (hasVisual(scan)) return scan.source;
  const name = context.projectName?.trim() || 'the project';
  const block = [
    heading(scan, 'Screenshots'),
    '',
    '<!-- Replace with a screenshot or GIF that shows the project in action. -->',
    '',
    `![Screenshot of ${name}](docs/screenshot.png)`,
  ].join('\n');
  return insertBlockAt(scan.source, afterIntro(scan), block);
}

function addLicence(scan: DocScan, context: FixContext): string {
  if (hasLicence(scan)) return scan.source;
  const year = context.year ?? new Date().getFullYear();
  const block = [
    heading(scan, 'Licence'),
    '',
    `© ${year} ${PLACEHOLDERS.owner}. All rights reserved.`,
    '',
    '<!-- Want others to use, change and share your work? Pick an open-source licence at https://choosealicense.com, add it as a LICENSE file and name it here. -->',
  ].join('\n');
  return insertBlockAt(scan.source, contentEnd(scan), block);
}

function addAltText(scan: DocScan): string {
  const md = scan.source;
  const changes: Change[] = [];
  for (const img of scan.images) {
    if (img.hasAlt) continue;
    if (img.kind === 'md') {
      changes.push({ from: img.altStart, to: img.altEnd, insert: PLACEHOLDERS.alt });
      continue;
    }
    const tag = md.slice(img.start, img.end);
    const alt = getAttr(tag, 'alt');
    if (!alt) {
      const nameEnd = /^<img/i.exec(tag)?.[0].length ?? 4;
      changes.push({ from: img.start + nameEnd, to: img.start + nameEnd, insert: ` alt="${PLACEHOLDERS.alt}"` });
    } else if (alt.valueStart >= 0) {
      changes.push({ from: img.start + alt.valueStart, to: img.start + alt.valueEnd, insert: PLACEHOLDERS.alt });
    } else {
      changes.push({ from: img.start + alt.nameStart, to: img.start + alt.nameEnd, insert: `alt="${PLACEHOLDERS.alt}"` });
    }
  }
  return changes.length ? applyChanges(md, changes) : md;
}

function fixHeadingLevels(scan: DocScan): string {
  const plan = planHeadingLevels(scan.headings);
  const changes: Change[] = [];
  scan.headings.forEach((h, i) => {
    const depth = plan[i]!;
    if (h.kind !== 'md' || depth === h.depth) return;
    const b = scan.blocks[h.blockIndex]!;
    if (!b.setext) {
      changes.push({ from: b.marksStart, to: b.marksStart + b.marksLen, insert: '#'.repeat(depth) });
    } else if (depth <= 2) {
      changes.push({ from: b.marksStart, to: b.marksStart + b.marksLen, insert: (depth === 1 ? '=' : '-').repeat(b.marksLen) });
    } else if (b.top) {
      changes.push({ from: b.start, to: b.end, insert: `${'#'.repeat(depth)} ${b.text}` });
    }
  });
  return changes.length ? applyChanges(scan.source, changes) : scan.source;
}

function removeEmptyLinks(scan: DocScan): string {
  const md = scan.source;
  const changes: Change[] = [];
  for (const link of scan.links) {
    if (link.kind !== 'md' || !(link.emptyUrl || link.emptyText)) continue;
    if (link.emptyUrl && link.emptyText) {
      // Drop it, and one of the spaces around it.
      let from = link.start;
      let to = link.end;
      const before = md[from - 1];
      const after = md[to];
      if (after === ' ' && (before === undefined || before === ' ' || before === '\n')) to++;
      else if (before === ' ' && (after === undefined || after === '\n')) from--;
      changes.push({ from, to, insert: '' });
    } else if (link.emptyUrl) {
      changes.push({ from: link.start, to: link.end, insert: md.slice(link.textStart, link.textEnd) });
    } else {
      const url = link.url.trim();
      const insert = /^(?:https?:|mailto:)[^\s<>]*$/i.test(url) ? `<${url}>` : `[${url.replace(/[[\]]/g, '\\$&')}](${url})`;
      changes.push({ from: link.start, to: link.end, insert });
    }
  }
  return changes.length ? applyChanges(md, changes) : md;
}

const SHELL_RE =
  /^(?:\$\s+)?(?:sudo\s+)?(?:npm|npx|yarn|pnpm|bun|bunx|deno|pip3?|pipx|poetry|uv|python3?|git|cd|brew|apt(?:-get)?|dnf|yum|pacman|docker(?:-compose)?|kubectl|helm|curl|wget|make|cmake|cargo|rustup|go\s+(?:install|run|get|build|test|mod)|gem|bundle|composer|dotnet|mvn|gradle|\.\/\S+|mkdir|export|source|chmod|sh|bash|zsh|echo|cp|mv|rm|ls|cat|touch|conda|choco|winget|scoop|terraform|flutter|nvm|node)(?:\s|$)/;

/** Language for an unlabelled code block: bash or json when obvious, otherwise text. */
export function guessCodeLanguage(code: string): 'bash' | 'json' | 'text' {
  const t = code.trim();
  if (!t) return 'text';
  if (t[0] === '{' || t[0] === '[') {
    try {
      JSON.parse(t);
      return 'json';
    } catch {
      // not JSON
    }
  }
  const lines = t
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length && lines.every((l) => SHELL_RE.test(l))) return 'bash';
  return 'text';
}

function addCodeLanguages(scan: DocScan): string {
  const md = scan.source;
  const changes: Change[] = [];
  for (const b of scan.blocks) {
    if (b.kind !== 'code' || !b.fenced || b.lang) continue;
    const lines = md.slice(b.start, b.end).split('\n').slice(1);
    const last = lines[lines.length - 1];
    if (last !== undefined && /^[ \t>]*(`{3,}|~{3,})[ \t]*$/.test(last)) lines.pop();
    const body = (b.quoted ? lines.map((l) => l.replace(/^(?:[ \t]*>[ \t]?)+/, '')) : lines).join('\n');
    changes.push({ from: b.fenceEnd, to: b.fenceEnd, insert: guessCodeLanguage(body) });
  }
  return changes.length ? applyChanges(md, changes) : md;
}
