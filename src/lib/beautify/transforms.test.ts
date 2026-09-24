import { describe, expect, it } from 'vitest';
import type { Nodes } from 'mdast';
import { parseMarkdown, walk } from '../markdown/parse';
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
} from './transforms';

const md = (...lines: string[]): string => `${lines.join('\n')}\n`;

function count(markdown: string, type: Nodes['type']): number {
  let n = 0;
  walk(parseMarkdown(markdown), (node) => {
    if (node.type === type) n++;
  });
  return n;
}

function headings(markdown: string): string[] {
  return markdown.split('\n').filter((l) => /^#{1,6} /.test(l));
}

const BADGE_A = '[![CI](https://github.com/me/app/actions/workflows/ci.yml/badge.svg)](https://github.com/me/app/actions)';
const BADGE_B = '[![npm](https://img.shields.io/npm/v/app.svg)](https://npmjs.com/app)';
const BADGE_C = '![MIT](https://img.shields.io/badge/licence-MIT-blue.svg)';

describe('cleanFormatting', () => {
  it('normalises CRLF, trailing whitespace, blank lines and the final newline', () => {
    const input = '\r\n\r\n# Title  \r\n\r\n\r\n\r\nSome text.   \r\n\r\n\r\nMore text\t\r\n\r\n\r\n';
    expect(cleanFormatting(input)).toBe('# Title\n\nSome text.\n\nMore text\n');
  });

  it('turns trailing-space hard breaks into backslash breaks and keeps them hard breaks', () => {
    const input = md('Line one  ', 'line two   ', 'line three');
    const out = cleanFormatting(input);
    expect(out).toBe(md('Line one\\', 'line two\\', 'line three'));
    expect(count(out, 'break')).toBe(count(input, 'break'));
    expect(count(out, 'break')).toBe(2);
  });

  it('leaves a hard break alone when a backslash comes before the spaces', () => {
    const input = md('path C:\\  ', 'next');
    const out = cleanFormatting(input);
    expect(out).toBe(input);
    expect(count(out, 'break')).toBe(1);
  });

  it('ensures blank lines around top-level headings, fences, tables and lists', () => {
    const input = md('# Title', 'Intro', '- a', '- b', '```js', 'x', '```', '## Next', '| a | b |', '| - | - |', '| 1 | 2 |');
    expect(cleanFormatting(input)).toBe(
      md('# Title', '', 'Intro', '', '- a', '- b', '', '```js', 'x', '```', '', '## Next', '', '| a   | b   |', '| --- | --- |', '| 1   | 2   |'),
    );
  });

  it('does not break lists, blockquotes or HTML blocks apart', () => {
    const input = md('- a', '  - nested', '- b', '', '> quote', '> more', '', '<div>', '<b>hi</b>', '</div>');
    expect(cleanFormatting(input)).toBe(input);
  });

  it('converts setext headings to ATX and strips closing hashes', () => {
    const input = md('Title', '=====', '', 'Sub title', '---', '', '  ## Hello ##  ', '', '### Keep \\#', '');
    expect(cleanFormatting(input)).toBe(md('# Title', '', '## Sub title', '', '## Hello', '', '### Keep \\#'));
  });

  it('escapes a trailing hash run when a setext heading becomes ATX', () => {
    const out = cleanFormatting(md('Issue #', '======'));
    expect(out).toBe(md('# Issue \\#'));
    const tree = parseMarkdown(out);
    expect(tree.children[0]).toMatchObject({ type: 'heading', depth: 1 });
    expect(JSON.stringify(tree)).toContain('"value":"Issue #"');
  });

  it('unifies bullet markers but leaves thematic breaks and adjacent lists alone', () => {
    expect(cleanFormatting(md('* a', '* b', '  + c', '', '***', '', '* * *'))).toBe(md('- a', '- b', '  - c', '', '***', '', '* * *'));
    // "* a" then "+ b" are two lists; making both "-" would merge them.
    const adjacent = cleanFormatting(md('* a', '+ b'));
    expect(adjacent).toBe(md('* a', '', '+ b'));
    expect(count(adjacent, 'list')).toBe(2);
  });

  it('turns ~~~ fences into backticks unless the code contains backticks', () => {
    expect(cleanFormatting(md('~~~python', 'print(1)', '~~~'))).toBe(md('```python', 'print(1)', '```'));
    const nested = md('~~~md', '```js', 'x', '```', '~~~');
    expect(cleanFormatting(nested)).toBe(nested);
  });

  it('adds a language to unlabelled fences only when it is obvious', () => {
    const out = cleanFormatting(md('```', 'npm install glow', '```', '', '```', 'just some words', '```', '', '```text', 'npm i', '```'));
    expect(out).toBe(md('```bash', 'npm install glow', '```', '', '```', 'just some words', '```', '', '```text', 'npm i', '```'));
  });

  it('aligns tables, keeping alignment colons and escaped pipes', () => {
    const input = md('|Name|Value|Mid|', '|:-|-:|:-:|', '|a \\| b|`x`|1|', '|日本|😀|');
    const out = cleanFormatting(input);
    expect(out).toBe(
      md('| Name   | Value | Mid |', '| :----- | ----: | :-: |', '| a \\| b |   `x` |  1  |', '| 日本   |    😀 |     |'),
    );
    const cells = (s: string) => {
      const vals: string[] = [];
      walk(parseMarkdown(s), (n) => {
        if (n.type === 'tableCell') vals.push(JSON.stringify(n.children.map((c) => ('value' in c ? c.value : c.type))));
      });
      return vals.filter((v) => v !== '[]');
    };
    expect(cells(out)).toEqual(cells(input));
  });

  it('never changes the inside of code, math, inline code or HTML', () => {
    const input = md(
      '    indented  ',
      '    ',
      '',
      '',
      '    still code',
      '',
      '```',
      'trailing   ',
      '',
      '',
      '',
      'end',
      '```',
      '',
      '$$',
      'x^2   ',
      '$$',
      '',
      '<pre>',
      'keep   ',
      '',
      '',
      '</pre>',
      '',
      'Text with `code  ',
      'span` here.',
    );
    const out = cleanFormatting(input);
    const values = (s: string) => {
      const vals: string[] = [];
      walk(parseMarkdown(s), (n) => {
        if (n.type === 'code' || n.type === 'math' || n.type === 'inlineCode' || n.type === 'html') vals.push(n.value);
      });
      return vals;
    };
    expect(values(out)).toEqual(values(input));
  });

  it('keeps link definitions right above a setext heading', () => {
    const input = md('[![ci][b]][l]', '', '[b]: https://img.shields.io/badge/ci-ok-green', '[l]: https://x.dev', 'Sub', '---');
    const out = cleanFormatting(input);
    expect(out).toBe(md('[![ci][b]][l]', '', '[b]: https://img.shields.io/badge/ci-ok-green', '[l]: https://x.dev', '', '## Sub'));
    expect(count(out, 'definition')).toBe(2);
  });

  it('is idempotent and returns an empty string for blank input', () => {
    const input = md('Title', '===', '* a  ', '  b', '~~~', 'yarn add x', '~~~');
    const once = cleanFormatting(input);
    expect(cleanFormatting(once)).toBe(once);
    expect(cleanFormatting('')).toBe('');
    expect(cleanFormatting('\n \n\t\n')).toBe('');
  });
});

describe('fixHeadings', () => {
  it('keeps the first H1 and demotes later ones together with their sub-headings', () => {
    const out = fixHeadings(md('# App', '', '# Install', '', '## Linux', '', '# Usage'));
    expect(headings(out)).toEqual(['# App', '## Install', '### Linux', '## Usage']);
  });

  it('clamps skipped levels without turning siblings into children', () => {
    const out = fixHeadings(md('# App', '', '## A', '', '#### B', '', '#### C', '', '### D', '', '###### E'));
    expect(headings(out)).toEqual(['# App', '## A', '### B', '### C', '### D', '#### E']);
  });

  it('treats an HTML <h1> in a centred header as the title', () => {
    const input = md('<div align="center">', '  <h1>App</h1>', '</div>', '', '# Features', '', '## Fast');
    expect(headings(fixHeadings(input))).toEqual(['## Features', '### Fast']);
  });

  it('writes demoted setext headings as ATX', () => {
    expect(fixHeadings(md('# App', '', 'Other', '=====', '', 'text'))).toBe(md('# App', '', '## Other', '', 'text'));
  });

  it('leaves a well-structured README untouched (and has no title requirement)', () => {
    const good = md('# App', '', '## A', '', '### B', '', '## C');
    expect(fixHeadings(good)).toBe(good);
    expect(headings(fixHeadings(md('### Only', '', '## Two')))).toEqual(['## Only', '## Two']);
  });
});

describe('groupBadges', () => {
  it('merges scattered badges into one centred row right after the title', () => {
    const input = md(BADGE_A, '', '# App', '', 'A tagline.', '', BADGE_B, BADGE_C, '', '## Install');
    expect(groupBadges(input)).toBe(
      md('# App', '', '<div align="center">', '', BADGE_A, `${BADGE_B} ${BADGE_C}`, '', '</div>', '', 'A tagline.', '', '## Install'),
    );
  });

  it('changes nothing when the badges are already in one centred wrapper', () => {
    const input = md('# App', '', '<div align="center">', '', `${BADGE_A} ${BADGE_B}`, '', '</div>', '', '## Install');
    expect(groupBadges(input)).toBe(input);
  });

  it('moves badges into a centred header instead of nesting another wrapper', () => {
    const input = md('<div align="center">', '', '# App', '', '</div>', '', BADGE_A, '', '## Install');
    expect(groupBadges(input)).toBe(md('<div align="center">', '', '# App', '', BADGE_A, '', '</div>', '', '## Install'));
  });

  it('removes a wrapper that only held badges that moved', () => {
    const input = md('# App', '', 'Intro.', '', '<p align="center">', '', BADGE_A, '', '</p>', '', BADGE_B, '', '## Install');
    const out = groupBadges(input);
    expect(out).toBe(md('# App', '', '<div align="center">', '', BADGE_A, BADGE_B, '', '</div>', '', 'Intro.', '', '## Install'));
    expect(groupBadges(out)).toBe(out);
  });

  it('understands reference-style badges and ignores ordinary images and later sections', () => {
    const input = md('# App', '', '![screenshot](docs/shot.png)', '', '[![CI][ci-badge]][ci]', '', '## Usage', '', BADGE_B, '', '[ci-badge]: https://img.shields.io/badge/ci-ok-green', '[ci]: https://ci.example.com');
    const out = groupBadges(input);
    expect(out).toContain('# App\n\n<div align="center">\n\n[![CI][ci-badge]][ci]\n\n</div>\n\n![screenshot](docs/shot.png)');
    expect(out).toContain(`## Usage\n\n${BADGE_B}`);
  });

  it('wraps badges where they are when there is no title', () => {
    const input = md('Intro text.', '', BADGE_A, '', BADGE_B, '', '## Install');
    expect(groupBadges(input)).toBe(md('Intro text.', '', '<div align="center">', '', BADGE_A, BADGE_B, '', '</div>', '', '## Install'));
  });
});

describe('centerHeader', () => {
  it('wraps the logo, title, tagline and badge row in a centred div', () => {
    const input = md('![logo](logo.png)', '', '# App', '', 'Fast and friendly.', '', `${BADGE_A} ${BADGE_B}`, '', 'Longer intro paragraph.', '', '## Install');
    expect(centerHeader(input)).toBe(
      md('<div align="center">', '', '![logo](logo.png)', '', '# App', '', 'Fast and friendly.', '', `${BADGE_A} ${BADGE_B}`, '', '</div>', '', 'Longer intro paragraph.', '', '## Install'),
    );
  });

  it('absorbs a centred badge wrapper instead of nesting it', () => {
    const input = md('# App', '', '<div align="center">', '', BADGE_A, '', '</div>', '', 'Tagline.', '', '## Install');
    const out = centerHeader(input);
    expect(out).toBe(md('<div align="center">', '', '# App', '', BADGE_A, '', 'Tagline.', '', '</div>', '', '## Install'));
    expect(centerHeader(out)).toBe(out);
  });

  it('leaves an already centred or HTML header alone', () => {
    const centred = md('<p align="center">', '', '# App', '', '</p>');
    expect(centerHeader(centred)).toBe(centred);
    const html = md('<div align="center"><h1>App</h1></div>', '', 'Text');
    expect(centerHeader(html)).toBe(html);
  });
});

const LONG = md(
  '# App',
  '',
  'Intro.',
  '',
  '## Features',
  '',
  'Things.',
  '',
  '### Fast `mode`',
  '',
  '## Usage',
  '',
  '## Usage',
  '',
  '## ✨ Extras [beta]',
  '',
  '## FAQ',
);

describe('addToc', () => {
  it('leaves short READMEs alone', () => {
    const short = md('# App', '', '## One', '', '## Two');
    expect(addToc(short)).toBe(short);
  });

  it('adds a nested contents list before the first section with GitHub slugs', () => {
    const out = addToc(LONG);
    expect(out).toContain(
      md(
        'Intro.',
        '',
        '## Table of contents',
        '',
        '- [Features](#features)',
        '  - [Fast `mode`](#fast-mode)',
        '- [Usage](#usage)',
        '- [Usage](#usage-1)',
        '- [✨ Extras \\[beta\\]](#-extras-beta)',
        '- [FAQ](#faq)',
        '',
        '## Features',
      ),
    );
    expect(addToc(out)).toBe(out);
  });

  it('adds a contents list to long prose even with few sections', () => {
    const words = Array.from({ length: 720 }, (_, i) => `word${i}`).join(' ');
    const out = addToc(md('# App', '', words, '', '## One', '', '## Two'));
    expect(out).toContain('## Table of contents\n\n- [One](#one)\n- [Two](#two)\n\n## One');
  });

  it('regenerates an existing contents list in place', () => {
    const input = md('# App', '', '## 📑 Contents', '', '- [Old](#old)', '', '## Alpha', '', '## Beta');
    expect(addToc(input)).toBe(md('# App', '', '## 📑 Contents', '', '- [Alpha](#alpha)', '- [Beta](#beta)', '', '## Alpha', '', '## Beta'));
  });

  it('fills an empty TOC section and leaves an HTML contents list alone', () => {
    expect(addToc(md('# App', '', '## TOC', '', '## Alpha', '', '## Beta'))).toBe(
      md('# App', '', '## TOC', '', '- [Alpha](#alpha)', '- [Beta](#beta)', '', '## Alpha', '', '## Beta'),
    );
    const html = md('# App', '', '<details><summary>Table of Contents</summary>', '<a href="#a">A</a>', '</details>', '', '## A', '## B', '## C', '## D');
    expect(addToc(html)).toBe(html);
  });

  it('never swallows or replaces other content in a contents section', () => {
    // A list added above indented code would absorb it into the last item.
    const indented = md('# App', '', '## Table of contents', '', '    code', '', '## A', '', '## B');
    expect(addToc(indented)).toBe(indented);
    // A contents list with more than links in it is left as it is.
    const custom = md('# App', '', '## Contents', '', '- [A](#a): the first part', '', '## A', '', '## B');
    expect(addToc(custom)).toBe(custom);
  });

  it('lists H3s but not the version headings of a changelog', () => {
    const out = addToc(md('# App', '', '## Usage', '', '### CLI', '', '## Changelog', '', '### 1.0.0', '', '## FAQ', '', '## Licence'));
    expect(out).toContain('- [Usage](#usage)\n  - [CLI](#cli)\n- [Changelog](#changelog)\n- [FAQ](#faq)');
  });

  it('regenerates a Markdown list inside a <details> contents block', () => {
    const input = md('# App', '', '<details>', '<summary>Table of Contents</summary>', '', '- [Old](#old)', '', '</details>', '', '## A', '', '## B');
    expect(addToc(input)).toBe(md('# App', '', '<details>', '<summary>Table of Contents</summary>', '', '- [A](#a)', '- [B](#b)', '', '</details>', '', '## A', '', '## B'));
  });
});

describe('backToTop', () => {
  it('adds the top anchor and a link at the end of each section except the contents', () => {
    const input = md('# App', '', '## Table of contents', '', '- [One](#one)', '', '## One', '', 'Text.', '', '## Two', '', '- item');
    const out = backToTop(input);
    const link = '<p align="right">(<a href="#readme-top">back to top</a>)</p>';
    expect(out).toBe(
      md('<a id="readme-top"></a>', '', '# App', '', '## Table of contents', '', '- [One](#one)', '', '## One', '', 'Text.', '', link, '', '## Two', '', '- item', '', link),
    );
    expect(backToTop(out)).toBe(out);
  });

  it('keeps a blank line after the link so the next heading is not swallowed by the HTML', () => {
    const out = backToTop(md('## One', 'Text', '## Two', 'More'));
    expect(out).toContain('Text\n\n<p align="right">(<a href="#readme-top">back to top</a>)</p>\n\n## Two');
    expect(count(out, 'heading')).toBe(2);
  });

  it('does nothing without sections', () => {
    const input = md('# App', '', 'Just text.');
    expect(backToTop(input)).toBe(input);
  });
});

describe('sectionEmoji', () => {
  it('prefixes known sections and updates links to them', () => {
    const input = md(
      '# App',
      '',
      'See [features](#features), [setup][s] and <a href="#getting-started">start</a>.',
      '',
      '## Features',
      '',
      '## Getting Started',
      '',
      '## 🎉 Party',
      '',
      '## Licence',
      '',
      '## Something else',
      '',
      '[s]: #getting-started',
    );
    const out = sectionEmoji(input);
    expect(headings(out)).toEqual(['# App', '## ✨ Features', '## 🏁 Getting Started', '## 🎉 Party', '## 📄 Licence', '## Something else']);
    expect(out).toContain('[features](#-features)');
    expect(out).toContain('<a href="#-getting-started">');
    expect(out).toContain('[s]: #-getting-started');
    expect(sectionEmoji(out)).toBe(out);
  });

  it('shifts duplicate-heading anchors correctly', () => {
    const out = sectionEmoji(md('## Usage', '', '### Usage', '', '[a](#usage) [b](#usage-1)'));
    expect(out).toContain('[a](#-usage) [b](#usage)');
  });
});

describe('collapseLong', () => {
  it('folds a changelog body and keeps the heading and back-to-top link outside', () => {
    const link = '<p align="right">(<a href="#readme-top">back to top</a>)</p>';
    const input = md('# App', '', '## 📝 Changelog', '', '### 1.0', '', '- First', '', link, '', '## Next');
    const out = collapseLong(input);
    expect(out).toBe(
      md('# App', '', '## 📝 Changelog', '', '<details>', '<summary>Show changelog</summary>', '', '### 1.0', '', '- First', '', '</details>', '', link, '', '## Next'),
    );
    expect(collapseLong(out)).toBe(out);
  });

  it('folds any section longer than 80 lines, keeping indented code intact', () => {
    const body = Array.from({ length: 90 }, (_, i) => `Line ${i}.`).join('\n\n');
    const input = md('## Reference', '', '    code first', '', body, '', '## Short', '', 'Text.');
    const out = collapseLong(input);
    expect(out.startsWith('## Reference\n\n<details>\n<summary>Show reference</summary>\n\n    code first\n')).toBe(true);
    expect(out).toContain('</details>\n\n## Short\n\nText.\n');
    expect(count(out, 'code')).toBe(1);
  });

  it('leaves short sections alone', () => {
    const input = md('## Usage', '', 'Short.');
    expect(collapseLong(input)).toBe(input);
  });
});

describe('addEssentials', () => {
  it('adds Installation, Usage and Licence in sensible places', () => {
    const out = addEssentials(md('# App', '', 'Intro.', '', '## Features', '', '- x', '', '## Contributing', '', 'PRs welcome.'));
    expect(headings(out)).toEqual(['# App', '## Features', '## Installation', '## Usage', '## Contributing', '## Licence']);
    expect(out).toContain('```bash\ngit clone');
    expect(out.trimEnd().endsWith('Add your licence here, for example MIT, or © 2026 Your Name. All rights reserved.')).toBe(true);
    expect(addEssentials(out)).toBe(out);
  });

  it('only inserts before top-level sections so no heading level gets skipped', () => {
    const out = addEssentials(md('# App', '', '## Guide', '', '### Usage', '', 'Run it.', '', '## FAQ'));
    expect(headings(out)).toEqual(['# App', '## Guide', '### Usage', '## FAQ', '## Installation', '## Licence']);
    expect(fixHeadings(out)).toBe(out);
  });

  it('recognises existing sections regardless of emoji, case or spelling', () => {
    const input = md('# App', '', '## 📦 INSTALL', '', '## 🚀 Usage', '', '## License');
    expect(addEssentials(input)).toBe(input);
    const out = addEssentials(md('# App', '', '## Installation', '', 'npm i', '', '## FAQ'));
    expect(headings(out)).toEqual(['# App', '## Installation', '## Usage', '## FAQ', '## Licence']);
  });
});
