import { describe, expect, it } from 'vitest';
import type { Nodes } from 'mdast';
import { parseMarkdown, walk } from '../markdown/parse';
import { BEAUTIFY_OPTION_INFO, DEFAULT_BEAUTIFY_OPTIONS, beautify, type BeautifyOptions } from './beautify';
import { collectHeadings, slugify } from './util';

const samples = import.meta.glob('../../samples/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const md = (...lines: string[]): string => `${lines.join('\n')}\n`;

const ALL_ON: BeautifyOptions = {
  cleanFormatting: true,
  fixHeadings: true,
  groupBadges: true,
  centerHeader: true,
  addToc: true,
  backToTop: true,
  sectionEmoji: true,
  collapseLong: true,
  addEssentials: true,
};
const ALL_OFF: BeautifyOptions = Object.fromEntries(Object.keys(ALL_ON).map((k) => [k, false])) as unknown as BeautifyOptions;
const IDS = Object.keys(ALL_ON) as Array<keyof BeautifyOptions>;

const BADGE = (name: string) => `[![${name}](https://img.shields.io/badge/${name}-ok-green.svg)](https://example.com/${name})`;

/** Hand-written READMEs covering the awkward cases. */
const FIXTURES: Record<string, string> = {
  messyCrlf: [
    BADGE('build'),
    '',
    'My Project',
    '==========',
    '',
    'A tiny tool that does things.   ',
    '',
    `${BADGE('npm')} ${BADGE('licence')}`,
    '',
    '',
    '',
    'Features',
    '--------',
    '* Fast  ',
    '  and small',
    '* Friendly',
    '',
    '### Deep ###',
    '',
    '##### Deeper',
    '',
    '~~~',
    '$ npm install foo  ',
    '~~~',
    '',
    '|Name|Value|',
    '|:--|--:|',
    '|a \\| b|`x`|',
    '# Usage',
    'See [features](#features) and <a href="#usage">usage</a>.',
    '```',
    '{"a": 1}',
    '```',
    '## Changelog',
    '- v1.0.0: first',
    '- v0.9.0: beta',
  ].join('\r\n'),

  htmlHeader: md(
    '<div align="center">',
    '  <img src="logo.svg" width="120" alt="Logo">',
    '  <h1>Glow</h1>',
    '  <p>Make it shine.</p>',
    '</div>',
    '',
    '# Installation',
    '',
    '```sh',
    'npm i glow',
    '```',
    '',
    '# Usage',
    '',
    '## Options',
    '',
    'Set `theme` to `"dark"`.',
    '',
    '# Licence',
    '',
    'MIT',
  ),

  emojiHeadings: md(
    '# 🌟 Starry',
    '',
    '> A small library.',
    '',
    '## 📑 Table of Contents',
    '',
    '- [Stale](#stale)',
    '',
    '## :sparkles: Features',
    '',
    '- One',
    '',
    '## 🚀 Usage',
    '',
    'Go to [install](#installation).',
    '',
    '## Installation',
    '',
    '```bash',
    'pip install starry',
    '```',
    '',
    '## Contributing',
    '',
    'Yes please. See [FAQ](#faq).',
    '',
    '## FAQ',
    '',
    '**Q:** Why?',
  ),

  arabicRtl: md(
    '<div dir="rtl">',
    '',
    '# مشروعي',
    '',
    'أداة صغيرة لتحويل الملفات.  ',
    'سطر ثانٍ.',
    '',
    '## التثبيت',
    '',
    '```bash',
    'npm install mashrou',
    '```',
    '',
    '## الاستخدام',
    '',
    '| الاسم | القيمة |',
    '|---|---|',
    '| مثال | ١ |',
    '',
    '## المساهمة',
    '',
    'مرحباً بالجميع.',
    '',
    '## الرخصة',
    '',
    'MIT',
    '',
    '</div>',
  ),

  codeHeavy: md(
    '# Code',
    '',
    'Inline `a  b` and `` `tick` `` and math $x^2$ here.',
    '',
    '    indented   ',
    '',
    '',
    '    code  ',
    '',
    '- item',
    '',
    '  ```',
    '  const x = 1;   ',
    '  ```',
    '',
    '~~~md',
    '```js',
    'nested();',
    '```',
    '~~~',
    '',
    '$$',
    '\\int_0^1 x\\,dx   ',
    '$$',
    '',
    '<pre>',
    'pre   text',
    '',
    '',
    '',
    'more</pre>',
    '',
    '<!-- a comment',
    '',
    '',
    'spanning lines -->',
    '',
    '```',
    'import requests',
    'print(requests.get("x"))',
    '```',
  ),

  longChangelog: md(
    '# Big',
    '',
    Array.from({ length: 60 }, (_, i) => `Intro sentence number ${i} with a few extra words in it.`).join(' '),
    '',
    '## Overview',
    '',
    Array.from({ length: 90 }, (_, i) => `- point ${i}`).join('\n'),
    '',
    '## Usage',
    '',
    'Use it.',
    '',
    '## Changelog',
    '',
    '### 2.0.0',
    '',
    '- Breaking change',
    '',
    '### 1.0.0',
    '',
    '- First release',
  ),

  badgesEverywhere: md(
    '[![CI][ci-badge]][ci]',
    '',
    '![logo](docs/logo.png)',
    '',
    '# Badger',
    '',
    'Badges, badges, badges.',
    '',
    `${BADGE('a')}`,
    `${BADGE('b')}`,
    '',
    '<p align="center">',
    '',
    `${BADGE('c')}`,
    '',
    '</p>',
    '',
    '## Setup',
    '',
    `Run it. ${BADGE('inline')} stays.`,
    '',
    '[ci-badge]: https://github.com/me/badger/actions/workflows/ci.yml/badge.svg',
    '[ci]: https://github.com/me/badger/actions',
  ),

  noTitle: md(
    `${BADGE('x')} ${BADGE('y')}`,
    '',
    'Just a description.',
    '',
    '#### Setup',
    '',
    '+ step one',
    '+ step two',
    '',
    '## Usage',
    '',
    '1. first',
    '2. second',
    '',
    '* * *',
    '',
    'The end.  ',
    'Really.',
  ),

  tricky: md(
    '# Tricky',
    '',
    'Windows path C:\\  ',
    'next line',
    '',
    'Issue #',
    '-------',
    '',
    '## Duplicate',
    '',
    '## Duplicate',
    '',
    'Links: [one](#duplicate), [two](#duplicate-1), [ref][r].',
    '',
    '> ## Quoted heading',
    '> text',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 |',
    '',
    '<details>',
    '<summary>More</summary>',
    '',
    'Hidden **stuff**.',
    '',
    '</details>',
    '',
    '[r]: #tricky',
  ),

  frontMatter: md('---', 'title: Hello', 'tags: [a, b]', '---', '', 'Hello', '=====', '', '* one', '* two', '', '## Licence', '', 'MIT'),

  empty: '',
  whitespace: '\n\n   \n',
};

const INPUTS: Array<[string, string]> = [...Object.entries(FIXTURES), ...Object.entries(samples).map(([k, v]) => [`sample ${k}`, v] as [string, string])];

const OPTION_SETS: Array<[string, Partial<BeautifyOptions>]> = [
  ['all on', ALL_ON],
  ['defaults', {}],
  ...IDS.map((id): [string, Partial<BeautifyOptions>] => [`only ${id}`, { ...ALL_OFF, [id]: true }]),
  ['all but cleanFormatting', { ...ALL_ON, cleanFormatting: false }],
];

function values(markdown: string, types: ReadonlyArray<Nodes['type']>): string[] {
  const out: string[] = [];
  walk(parseMarkdown(markdown), (node) => {
    if (types.includes(node.type) && 'value' in node) out.push(node.value as string);
  });
  return out;
}

/** True when every item of `sub` appears in `all` (as a multiset). */
function includesAll(all: readonly string[], sub: readonly string[]): boolean {
  const pool = new Map<string, number>();
  for (const v of all) pool.set(v, (pool.get(v) ?? 0) + 1);
  return sub.every((v) => {
    const n = pool.get(v) ?? 0;
    if (n === 0) return false;
    pool.set(v, n - 1);
    return true;
  });
}

/** Anchor links in a document that don't match any heading slug (or the readme-top anchor). */
function brokenAnchors(markdown: string): string[] {
  const tree = parseMarkdown(markdown);
  const slugs = new Set(slugify(collectHeadings(tree).map((h) => h.text)));
  if (/id="readme-top"/.test(markdown)) slugs.add('readme-top');
  const broken: string[] = [];
  walk(tree, (node) => {
    if ((node.type === 'link' || node.type === 'definition') && node.url.startsWith('#') && !slugs.has(decodeURIComponent(node.url.slice(1)))) {
      broken.push(node.url);
    }
    if (node.type === 'html') {
      for (const m of node.value.matchAll(/href="#([^"]*)"/g)) if (!slugs.has(m[1]!)) broken.push(`#${m[1]}`);
    }
  });
  return broken;
}

describe('beautify: options and steps', () => {
  it('exports the documented defaults and one info entry per option', () => {
    expect(DEFAULT_BEAUTIFY_OPTIONS).toEqual({
      cleanFormatting: true,
      fixHeadings: true,
      groupBadges: true,
      centerHeader: false,
      addToc: true,
      backToTop: false,
      sectionEmoji: false,
      collapseLong: true,
      addEssentials: false,
    });
    expect(BEAUTIFY_OPTION_INFO.map((i) => i.id).sort()).toEqual([...IDS].sort());
    for (const info of BEAUTIFY_OPTION_INFO) {
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.description.length).toBeLessThan(110);
    }
  });

  it('falls back to the defaults for options that are not given', () => {
    const input = md('# App', '', '# Other');
    expect(beautify(input, { addToc: undefined }).steps.map((s) => s.id)).toEqual(['fixHeadings', 'cleanFormatting', 'groupBadges', 'addToc', 'collapseLong']);
    expect(beautify(input, { fixHeadings: false }).markdown).toBe(input);
  });

  it('returns the input exactly when every option is off', () => {
    for (const [, input] of INPUTS) {
      expect(beautify(input, ALL_OFF)).toEqual({ markdown: input, steps: [] });
    }
  });

  it('reports which enabled steps changed something, in pipeline order', () => {
    const { steps } = beautify(md('# App', '', '# Second', '', 'text  ', 'more'), { ...ALL_OFF, fixHeadings: true, cleanFormatting: true, addToc: true });
    expect(steps).toEqual([
      { id: 'fixHeadings', label: 'Fix headings', changed: true },
      { id: 'cleanFormatting', label: 'Tidy formatting', changed: true },
      { id: 'addToc', label: 'Table of contents', changed: false },
    ]);
    const clean = md('# App', '', 'Nothing to do.');
    expect(beautify(clean).steps.every((s) => !s.changed)).toBe(true);
    expect(beautify(clean).markdown).toBe(clean);
  });

  it('counts a CRLF-only file as a formatting change and keeps CRLF when formatting is off', () => {
    const crlf = '# App\r\n\r\nText\r\n';
    const tidy = beautify(crlf, { ...ALL_OFF, cleanFormatting: true });
    expect(tidy.markdown).toBe('# App\n\nText\n');
    expect(tidy.steps[0]!.changed).toBe(true);

    const kept = beautify('# App\r\n\r\n## Features\r\n\r\nFast\r\n', { ...ALL_OFF, sectionEmoji: true });
    expect(kept.markdown).toBe('# App\r\n\r\n## ✨ Features\r\n\r\nFast\r\n');
    expect(beautify(kept.markdown, { ...ALL_OFF, sectionEmoji: true }).markdown).toBe(kept.markdown);
  });

  it('leaves YAML front matter untouched', () => {
    const out = beautify(FIXTURES.frontMatter!, ALL_ON).markdown;
    expect(out.startsWith('---\ntitle: Hello\ntags: [a, b]\n---\n\n<a id="readme-top"></a>\n\n<div align="center">\n\n# Hello')).toBe(true);
  });
});

describe('beautify: idempotent', () => {
  it('has sample READMEs available or skips them gracefully', () => {
    expect(INPUTS.length).toBeGreaterThanOrEqual(Object.keys(FIXTURES).length);
  });

  for (const [name, input] of INPUTS) {
    it(`gives the same result when run twice: ${name}`, () => {
      for (const [label, options] of OPTION_SETS) {
        const once = beautify(input, options).markdown;
        const twice = beautify(once, options);
        expect(twice.markdown, `${name} / ${label}`).toBe(once);
        expect(twice.steps.some((s) => s.changed), `${name} / ${label} reports no changes`).toBe(false);
      }
    });
  }
});

describe('beautify: safe', () => {
  for (const [name, input] of INPUTS) {
    it(`keeps code, math and raw HTML byte-identical: ${name}`, () => {
      const lf = input.replace(/\r\n?/g, '\n');
      const out = beautify(input, ALL_ON).markdown;
      expect(includesAll(values(out, ['code']), values(lf, ['code']))).toBe(true);
      expect(includesAll(values(out, ['inlineCode', 'math', 'inlineMath']), values(lf, ['inlineCode', 'math', 'inlineMath']))).toBe(true);
      // Raw HTML survives (anchor hrefs may be renamed; badge-only wrappers may be removed).
      const html = (s: string) =>
        values(s, ['html'])
          .map((v) => v.replace(/href="#[^"]*"/g, 'href="#"'))
          .filter((v) => !/^<\/?(div|p)\b[^>]*>$/i.test(v.trim()));
      const outHtml = html(out).join('\n');
      for (const block of html(lf)) expect(outHtml).toContain(block);
    });
  }

  it('keeps hard breaks as hard breaks', () => {
    for (const [, input] of INPUTS) {
      const out = beautify(input, { ...ALL_OFF, cleanFormatting: true }).markdown;
      expect(values(out, ['break']).length + countBreaks(out)).toBe(countBreaks(input.replace(/\r\n?/g, '\n')));
    }
  });

  it('keeps every in-document link pointing at a real heading', () => {
    for (const name of ['emojiHeadings', 'tricky', 'messyCrlf', 'longChangelog']) {
      const input = FIXTURES[name]!;
      expect(brokenAnchors(input.replace(/\r\n?/g, '\n')).filter((a) => a !== '#stale'), name).toEqual([]);
      const out = beautify(input, ALL_ON).markdown;
      expect(brokenAnchors(out), name).toEqual([]);
    }
  });
});

function countBreaks(markdown: string): number {
  let n = 0;
  walk(parseMarkdown(markdown), (node) => {
    if (node.type === 'break') n++;
  });
  return n;
}

describe('beautify: results', () => {
  it('tidies the messy CRLF README with the default options', () => {
    const out = beautify(FIXTURES.messyCrlf!).markdown;
    expect(out).not.toContain('\r');
    expect(out).toContain(
      md('# My Project', '', '<div align="center">', '', BADGE('build'), `${BADGE('npm')} ${BADGE('licence')}`, '', '</div>', '', 'A tiny tool that does things.', '', '## Features'),
    );
    expect(out).toContain('- Fast\\\n  and small\n- Friendly');
    expect(out).toContain('### Deep\n\n#### Deeper');
    expect(out).toContain('```bash\n$ npm install foo  \n```');
    expect(out).toContain('| Name   | Value |\n| :----- | ----: |\n| a \\| b |   `x` |');
    expect(out).toContain('```json\n{"a": 1}\n```');
    expect(out).toContain('## Usage');
    expect(out.endsWith('\n') && !out.endsWith('\n\n')).toBe(true);
  });

  it('demotes Markdown H1s under an HTML title and adds a contents list', () => {
    const out = beautify(FIXTURES.htmlHeader!, { ...ALL_OFF, fixHeadings: true, addToc: true }).markdown;
    expect(out).toContain('## Installation');
    expect(out).toContain('### Options');
    expect(out).not.toMatch(/^# /m);
  });

  it('refreshes an emoji-prefixed contents section and fixes its links', () => {
    const out = beautify(FIXTURES.emojiHeadings!, ALL_ON).markdown;
    expect(out).toContain(
      md(
        '## 📑 Table of Contents',
        '',
        '- [:sparkles: Features](#sparkles-features)',
        '- [🚀 Usage](#-usage)',
        '- [📦 Installation](#-installation)',
        '- [🤝 Contributing](#-contributing)',
        '- [❓ FAQ](#-faq)',
        '- [📄 Licence](#-licence)',
      ),
    );
    expect(out).toContain('Go to [install](#-installation).');
    expect(out).toContain('See [FAQ](#-faq).');
    expect(out.match(/Table of Contents/gi)).toHaveLength(1);
  });

  it('collapses the changelog and the very long section', () => {
    const out = beautify(FIXTURES.longChangelog!).markdown;
    expect(out).toContain('## Overview\n\n<details>\n<summary>Show overview</summary>');
    expect(out).toContain('## Changelog\n\n<details>\n<summary>Show changelog</summary>\n\n### 2.0.0');
    expect(out).toContain('## Table of contents');
  });

  it('keeps the RTL wrapper intact around back-to-top links', () => {
    const out = beautify(FIXTURES.arabicRtl!, { ...DEFAULT_BEAUTIFY_OPTIONS, backToTop: true }).markdown;
    expect(out.trimEnd().endsWith('<p align="right">(<a href="#readme-top">back to top</a>)</p>\n\n</div>')).toBe(true);
    expect(out).toContain('أداة صغيرة لتحويل الملفات.\\\nسطر ثانٍ.');
  });

  it('handles empty input', () => {
    expect(beautify('').markdown).toBe('');
    expect(beautify('\n\n   \n').markdown).toBe('');
    expect(beautify('', ALL_ON).markdown).toContain('Installation');
  });
});

// ---------------------------------------------------------------------------
// Random READMEs stitched together from awkward snippets (fixed seed).

const FENCE = '```';
const SNIPPETS = [
  '# Title', 'Title\n=====', 'Sub\n---', '## Features', '## Installation', '## Usage', '### Deep', '##### Deeper', '# Another H1',
  '## Changelog\n\n### 1.0\n\n- first', '## Table of contents', '## ✨ Sparkle', '## Duplicate', '### Closing ###', '  ## Indented',
  'Some text.', 'Line one  \nline two', 'Path C:\\  \nnext', 'See [x](#features) and [y](#usage).', 'Link <a href="#usage">u</a>.',
  BADGE('a'), `${BADGE('b')} ${BADGE('c')}`, `<p align="center">\n\n${BADGE('d')}\n\n</p>`, '[![ci][b]][l]\n\n[b]: https://img.shields.io/badge/ci-ok-green\n[l]: https://x.dev',
  '* a\n* b', '+ c\n  + d', '* x\n+ y', '1. one\n\n    indented in item', '* * *', '- [ ] task',
  `${FENCE}\nnpm i x\n${FENCE}`, '~~~\ncode  \n~~~', '    indented  \n    more', `- item\n\n  ${FENCE}\n  code  \n  ${FENCE}`,
  '| a | b |\n|---|:-:|\n| 1 | 2 |', '|x|\n|-|\n|y \\| z|', '| 日本 | 😀 |\n|---|---|\n| x | y |',
  '<div align="center">', '</div>', '<details>\n<summary>More</summary>', '</details>', '<!-- comment\n\n\nstill -->', '![logo](logo.png)',
  '$$\nx^2  \n$$', 'Inline `a  b` and $y$.', '> quote\n> more', '[ref]: #features', '<div dir="rtl">', 'مرحبا بالعالم.  \nسطر.',
];

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The parsed tree without positions or code languages, with table rows padded like the renderer does. */
function shape(markdown: string): string {
  const strip = (node: unknown, columns: number): unknown => {
    if (Array.isArray(node)) return node.map((n) => strip(n, columns));
    if (!node || typeof node !== 'object') return node;
    const rec = node as Record<string, unknown>;
    const cols = rec.type === 'table' ? (rec.align as unknown[]).length : columns;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (k === 'position' || k === 'lang' || k === 'meta') continue;
      if (k === 'value' && rec.type === 'text') out[k] = String(v).replace(/\s+/g, ' ');
      else if (k === 'children' && rec.type === 'tableRow') {
        const cells = (v as unknown[]).slice(0, cols).map((c) => strip(c, cols));
        while (cells.length < cols) cells.push({ type: 'tableCell', children: [] });
        out[k] = cells;
      } else out[k] = strip(v, cols);
    }
    return out;
  };
  return JSON.stringify(strip(parseMarkdown(markdown), 0));
}

describe('beautify: random READMEs', () => {
  const rand = mulberry(2026);
  const docs = Array.from({ length: 40 }, () => {
    const n = 2 + Math.floor(rand() * 12);
    const text = Array.from({ length: n }, () => SNIPPETS[Math.floor(rand() * SNIPPETS.length)]!).join(['\n', '\n\n', '\n\n\n'][Math.floor(rand() * 3)]!) + '\n';
    return rand() < 0.2 ? text.replace(/\n/g, '\r\n') : text;
  });
  const sets: Array<[string, Partial<BeautifyOptions>]> = [
    ['all on', ALL_ON],
    ['defaults', {}],
    ['all but cleanFormatting', { ...ALL_ON, cleanFormatting: false }],
  ];

  it('stay idempotent and never lose code', () => {
    for (const doc of docs) {
      const code = values(doc.replace(/\r\n/g, '\n'), ['code', 'inlineCode', 'math', 'inlineMath']);
      for (const [label, options] of sets) {
        const once = beautify(doc, options).markdown;
        expect(beautify(once, options).markdown, `${label}: ${JSON.stringify(doc)}`).toBe(once);
        expect(includesAll(values(once.replace(/\r\n/g, '\n'), ['code', 'inlineCode', 'math', 'inlineMath']), code), `${label}: ${JSON.stringify(doc)}`).toBe(true);
      }
    }
  });

  it('render the same after tidying formatting alone', () => {
    for (const doc of docs) {
      const once = beautify(doc, { ...ALL_OFF, cleanFormatting: true }).markdown;
      expect(shape(once), JSON.stringify(doc)).toBe(shape(doc.replace(/\r\n/g, '\n')));
    }
  });
});
