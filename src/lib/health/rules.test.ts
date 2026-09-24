import { describe, expect, it } from 'vitest';
import type { Heading } from 'mdast';
import { checkHealth, gradeFor } from './index';
import { scanMarkdown } from './scan';
import { parseMarkdown, walk } from '../markdown/parse';

const fence = '```';

const GREAT_README = `# Starlight

[![Build](https://img.shields.io/badge/build-passing-green.svg)](https://ci.example.com)

Starlight is a tiny, fast static site generator for documentation. It turns a folder of Markdown files into a searchable website in seconds.

![Screenshot of the Starlight docs site](docs/screenshot.png)

## Features

- Instant full-text search across every page
- Dark mode and custom themes out of the box
- Zero configuration for most projects

## Installation

${fence}bash
npm install starlight
${fence}

## Usage

Run the builder in any folder that contains Markdown files:

${fence}bash
npx starlight build ./docs
${fence}

See [the configuration guide](#configuration) for more options.

## Configuration

Create a \`starlight.json\` file next to your docs to change the title, theme and navigation.

## Licence

Released under the MIT licence. See [LICENSE](LICENSE) for details.
`;

/** Enough prose to keep the too-short rule quiet. */
const FILLER =
  'This paragraph exists only to add enough ordinary words to the document so that the length check stays quiet while other rules are tested in isolation here. ' +
  'It keeps going for a little while longer with plain and simple sentences that mean nothing in particular at all. ' +
  'Another sentence follows to be completely sure that the count clears the bar without any doubt whatsoever.';

function issue(md: string, id: string) {
  return checkHealth(md).issues.find((i) => i.id === id);
}

describe('checkHealth: score and grade', () => {
  it('scores a great README at 90 or above with no errors', () => {
    const report = checkHealth(GREAT_README);
    expect(report.issues.filter((i) => i.severity !== 'info')).toEqual([]);
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(['A+', 'A']).toContain(report.grade);
  });

  it('scores an empty README below 40', () => {
    expect(checkHealth('').score).toBeLessThan(40);
    expect(checkHealth('   \n\n').score).toBeLessThan(40);
    expect(checkHealth('').grade).toBe('E');
  });

  it('orders scores sensibly: great > partial > title only > empty', () => {
    const partial = `# Starlight\n\nStarlight is a tiny, fast static site generator for documentation sites.\n\n## Installation\n\n${fence}bash\nnpm i starlight\n${fence}\n`;
    const scores = [GREAT_README, partial, '# Starlight\n', ''].map((md) => checkHealth(md).score);
    expect(scores[0]).toBeGreaterThan(scores[1]!);
    expect(scores[1]).toBeGreaterThan(scores[2]!);
    expect(scores[2]).toBeGreaterThan(scores[3]!);
  });

  it('maps scores to grades at the documented thresholds', () => {
    expect([100, 97, 96, 90, 89, 80, 79, 70, 69, 55, 54, 0].map(gradeFor)).toEqual([
      'A+', 'A+', 'A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E',
    ]);
  });

  it('lists passed checks, sorts issues by severity and labels every fix', () => {
    const report = checkHealth('Some text without a title. TODO: write more.\n\n```\ncode\n```\n');
    expect(report.passed.map((p) => p.id)).toContain('alt-text');
    const ranks = report.issues.map((i) => ({ error: 0, warning: 1, info: 2 })[i.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const i of report.issues) if (i.fix) expect(i.fixLabel).toBeTruthy();
    expect(issue('', 'installation')?.fixLabel).toBe('Add an Installation section');
    expect(report.issues.length + report.passed.length).toBe(14);
  });

  it('runs a 1000-line README in under 15 ms', () => {
    const parts: string[] = ['# Big', '', FILLER, ''];
    for (let i = 0; parts.length < 1000; i++) {
      parts.push(
        `## Section ${i}`,
        '',
        `Some **prose** with a [link](https://example.com/${i}), an ![image](img/${i}.png) and \`code\` here, plus <img src="x.png" alt="y"> more words.`,
        '',
        fence + 'js',
        `const x${i} = ${i};`,
        fence,
        '',
        `- item ${i} [anchor](#section-${i})`,
        '',
      );
    }
    const md = parts.join('\n');
    for (let i = 0; i < 3; i++) checkHealth(md);
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t = performance.now();
      checkHealth(md);
      times.push(performance.now() - t);
    }
    expect(Math.min(...times)).toBeLessThan(15);
  });
});

describe('checkHealth: rules', () => {
  it('title: flags a missing H1 as an error with a fix', () => {
    const i = issue(`Just text.\n\n## Section\n\n${fence}\n# not a heading\n${fence}\n`, 'title');
    expect(i).toMatchObject({ severity: 'error', title: 'No title', fix: 'add-title', fixLabel: 'Add a title' });
  });

  it('title: ignores headings inside HTML comments and indented code', () => {
    expect(issue('<!--\n# Old title\n-->\n\nText.\n\n    # code\n', 'title')).toBeDefined();
  });

  it('title: accepts ATX, setext and HTML <h1> titles', () => {
    expect(issue('# Name\n', 'title')).toBeUndefined();
    expect(issue('Name\n====\n', 'title')).toBeUndefined();
    expect(issue('<h1 align="center">\n  <img src="logo.png" width="80"><br>\n  Name\n</h1>\n', 'title')).toBeUndefined();
  });

  it('description: flags a README with only badges under the title', () => {
    const md = '# Name\n\n[![CI](https://img.shields.io/badge/ci-ok-green)](https://x.y)\n\n## Usage\n\nRun the thing with care, it is a long enough sentence here.\n';
    expect(issue(md, 'description')).toMatchObject({ severity: 'warning', fix: 'add-description' });
  });

  it('description: accepts a paragraph, a quote or centred HTML text after the title', () => {
    expect(issue('# Name\n\nA small library that formats dates for humans in many languages.\n', 'description')).toBeUndefined();
    expect(issue('# Name\n\n> A small library that formats dates for humans in many languages.\n', 'description')).toBeUndefined();
    const html = '<h1 align="center">Name</h1>\n<p align="center">A small library that formats dates for humans in many languages.</p>\n';
    expect(issue(html, 'description')).toBeUndefined();
    // Nav links do not count as a description.
    expect(issue('# Name\n\n[Docs](a) · [Demo](b) · [Issues](c) · [Discussions](d) · [Changelog](e) · [Roadmap](f) · [Sponsor](g) · [Blog](h)\n', 'description')).toBeDefined();
  });

  it('installation: recognises common section names, emoji and HTML headings', () => {
    for (const h of ['## Installation', '## Install', '## 📦 Setup', '### Getting Started', '## Quick start', '<h2>Installing</h2>']) {
      expect(issue(`# X\n\n${h}\n`, 'installation'), h).toBeUndefined();
    }
    expect(issue('# X\n\n## Features\n', 'installation')).toMatchObject({ title: 'No installation section', fix: 'add-installation' });
  });

  it('installation: tells people why, in a friendly way', () => {
    expect(issue('# X\n', 'installation')?.detail).toBe('Tell people how to get it running — even one command helps.');
  });

  it('usage: recognises Usage, How to use and Examples', () => {
    for (const h of ['## Usage', '## How to use', '## Examples', '## 🚀 Quick Start']) {
      expect(issue(`# X\n\n${h}\n`, 'usage'), h).toBeUndefined();
    }
    expect(issue('# X\n\n## Installation\n', 'usage')).toMatchObject({ severity: 'warning', fix: 'add-usage' });
  });

  it('screenshots: badges and logos are not screenshots; images, GIFs and demo links are', () => {
    expect(issue('# X\n\n![build](https://img.shields.io/badge/a-b-c)\n\n<img src="assets/logo.svg" width="64">\n', 'screenshots')).toMatchObject({
      severity: 'info',
      fix: 'add-screenshots',
    });
    expect(issue('# X\n\n![The dashboard](docs/dashboard.png)\n', 'screenshots')).toBeUndefined();
    expect(issue('# X\n\nTry the [live demo](https://x.example.com).\n', 'screenshots')).toBeUndefined();
    expect(issue('# X\n\nhttps://github.com/user-attachments/assets/0f1e2d3c\n', 'screenshots')).toBeUndefined();
  });

  it('licence: accepts a section, a copyright line or a licence badge', () => {
    expect(issue('# X\n\n## License\n\nMIT\n', 'licence')).toBeUndefined();
    expect(issue('# X\n\n© 2024 Jane Doe\n', 'licence')).toBeUndefined();
    expect(issue('# X\n\nAll rights reserved.\n', 'licence')).toBeUndefined();
    expect(issue('# X\n\n![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)\n', 'licence')).toBeUndefined();
    expect(issue('# X\n\nNothing legal here.\n\n```\nlicense = "MIT"\n```\n', 'licence')).toMatchObject({
      title: 'No licence',
      fix: 'add-licence',
      fixLabel: 'Add a Licence section',
    });
  });

  it('heading-order: flags multiple H1s at the second one', () => {
    const i = issue('# One\n\ntext\n\n# Two\n\n## Sub\n\n# Three\n', 'heading-order');
    expect(i).toMatchObject({ title: 'More than one H1 heading', line: 5, count: 2, fix: 'fix-heading-levels' });
  });

  it('heading-order: flags skipped levels with the line of the first offender', () => {
    const i = issue('# Title\n\n## A\n\n#### Deep\n\n## B\n\n##### Deeper\n', 'heading-order');
    expect(i).toMatchObject({ title: 'Heading levels skip a step', line: 5, count: 2 });
    expect(issue('# Title\n\n## A\n\n### B\n\n## C\n\n### D\n\n#### E\n', 'heading-order')).toBeUndefined();
  });

  it('heading-order: ignores headings inside code blocks', () => {
    expect(issue(`# Title\n\n${fence}md\n# Another\n#### Skip\n${fence}\n`, 'heading-order')).toBeUndefined();
  });

  it('alt-text: counts Markdown and HTML images without alt text', () => {
    const md = '# X\n\ntext\n\n![](a.png) and ![ok](b.png)\n\n<img src="c.png" width="50">\n<img src="d.png" alt="">\n<img src="e.png" alt="Fine">\n';
    expect(issue(md, 'alt-text')).toMatchObject({ title: '3 images have no alt text', line: 5, count: 3, fix: 'add-alt-text' });
    expect(issue('# X\n\n![A cat](cat.png) <img src="d.png" alt="A dog">\n', 'alt-text')).toBeUndefined();
  });

  it('alt-text: ignores images inside code', () => {
    expect(issue(`# X\n\n\`![](a.png)\`\n\n${fence}\n<img src="x">\n${fence}\n`, 'alt-text')).toBeUndefined();
  });

  it('long-lines: flags long prose lines but not code, tables, HTML or link-only lines', () => {
    const long = 'word '.repeat(40).trim();
    const md = [
      '# X',
      '',
      'short',
      long,
      '',
      fence,
      long,
      fence,
      '',
      '| a | b |',
      '|---|---|',
      `| ${long} | x |`,
      '',
      `<p>${long}</p>`,
      '',
      Array.from({ length: 6 }, (_, i) => `[![b${i}](https://img.shields.io/badge/some-very-long-badge-label-${i}-blue)](https://example.com/very/long/link/${i})`).join(' '),
      '',
      long,
    ].join('\n');
    expect(issue(md, 'long-lines')).toMatchObject({ severity: 'info', line: 4, count: 2 });
    expect(issue('# X\n\nshort line\n', 'long-lines')).toBeUndefined();
  });

  it('empty-links: counts [](), [x]() and href=""', () => {
    const md = '# X\n\nSee [docs]() and []() here.\n\n<a href="">nothing</a>\n\n[fine](https://x.y) and [top](#x)\n';
    expect(issue(md, 'empty-links')).toMatchObject({ title: '3 empty links', line: 3, count: 3, fix: 'remove-empty-links' });
    expect(issue('# X\n\n[fine](https://x.y) `[]()`\n', 'empty-links')).toBeUndefined();
  });

  it('empty-links: offers no fix when only HTML links are empty', () => {
    const i = issue('# X\n\n<a href="">nothing</a>\n', 'empty-links');
    expect(i?.count).toBe(1);
    expect(i?.fix).toBeUndefined();
  });

  it('broken-anchors: flags #links without a matching heading or id', () => {
    const md = [
      '# My Project',
      '',
      '<a name="custom-anchor"></a>',
      '',
      '- [Install](#installation)',
      '- [Emoji](#-quick-start)',
      '- [Custom](#custom-anchor)',
      '- [Second usage](#usage-1)',
      '- [Encoded](#%C3%A9t%C3%A9)',
      '- [Broken](#instalation)',
      '- [Top](#top)',
      '',
      '## Installation',
      '## 🚀 Quick Start',
      '## Usage',
      '## Usage',
      '## Été',
    ].join('\n');
    expect(issue(md, 'broken-anchors')).toMatchObject({ severity: 'warning', line: 10, count: 1 });
    expect(issue('# X\n\n[go](#x)\n', 'broken-anchors')).toBeUndefined();
  });

  it('broken-anchors: matches GitHub slugs for code, links and underscores in headings', () => {
    const md = '# X\n\n[a](#the-init-method) [b](#snake_case_name) [c](#see-docs)\n\n## The `__init__` method\n## snake_case_name\n## See [docs](https://x.y)\n';
    expect(issue(md, 'broken-anchors')).toMatchObject({ count: 1 });
    // `__init__` in code keeps its underscores: the right slug is the-__init__-method
    expect(issue(md.replace('#the-init-method', '#the-__init__-method'), 'broken-anchors')).toBeUndefined();
  });

  it('too-short: warns under 60 words and treats an empty README as an error', () => {
    expect(issue('# X\n\nA few words only.\n', 'too-short')).toMatchObject({ severity: 'warning', title: 'Your README is quite short' });
    expect(issue('', 'too-short')).toMatchObject({ severity: 'error', title: 'This README is empty' });
    expect(issue(`# X\n\n${FILLER}\n`, 'too-short')).toBeUndefined();
  });

  it('too-short: does not count words inside code blocks', () => {
    const code = `${fence}\n${'word '.repeat(100)}\n${fence}\n`;
    expect(issue(`# X\n\n${code}`, 'too-short')).toBeDefined();
  });

  it('placeholder-text: finds TODO, TBD, lorem ipsum and coming soon with the line', () => {
    const md = '# X\n\nFine text.\n\nDocs are coming soon.\n\n- TODO: write tests\n- Lorem ipsum dolor\n';
    expect(issue(md, 'placeholder-text')).toMatchObject({ severity: 'info', line: 5, count: 3 });
  });

  it('placeholder-text: ignores lower-case "todo", code and URLs', () => {
    const md = '# A todo app\n\nKeeps your todo list tidy. `TODO` [link](https://x.y/TODO)\n\n```\nTODO\n```\n';
    expect(issue(md, 'placeholder-text')).toBeUndefined();
  });

  it('code-language: counts fenced blocks without a language, not indented code', () => {
    const md = `# X\n\ntext\n\n${fence}\nplain\n${fence}\n\n~~~\nmore\n~~~\n\n${fence}js\nok()\n${fence}\n\n    indented code\n`;
    expect(issue(md, 'code-language')).toMatchObject({ severity: 'info', line: 5, count: 2, fix: 'add-code-languages' });
    expect(issue(`# X\n\n${fence}bash\nls\n${fence}\n`, 'code-language')).toBeUndefined();
  });
});

describe('scanner agrees with remark', () => {
  const doc = [
    '<!-- comment -->',
    '# Title',
    '',
    '> ## Quoted heading',
    '',
    '- item one',
    '  ### Heading inside a list item',
    '- item two',
    '',
    '  ```js',
    '  # inside code',
    '  ```',
    '',
    'Setext Two',
    '----------',
    '',
    '<details>',
    '<summary>More</summary>',
    '',
    '## Inside details',
    '',
    '</details>',
    '',
    '| a | b |',
    '|---|---|',
    '| [x](#y) | ![i](i.png) |',
    '',
    '    indented',
    '    # code',
    '',
    '~~~~',
    '```',
    '# still code',
    '~~~~',
    '',
    '[ref]: https://example.com',
    '',
    'A [ref] link, a [full][ref] one, `[code](x)` and \\[escaped](x) plus [real](https://r.s).',
    '',
    '###### Six ######',
  ].join('\n');

  it('finds the same headings', () => {
    const remark: Array<[number, number]> = [];
    walk(parseMarkdown(doc), (n) => {
      if (n.type === 'heading') remark.push([(n as Heading).depth, n.position!.start.line]);
    });
    const ours = scanMarkdown(doc)
      .headings.filter((h) => h.kind === 'md')
      .map((h) => [h.depth, h.line]);
    expect(ours).toEqual(remark);
  });

  it('finds the same code blocks, links and images', () => {
    const counts = { code: 0, link: 0, image: 0 };
    walk(parseMarkdown(doc), (n) => {
      if (n.type === 'code') counts.code++;
      if (n.type === 'link' || n.type === 'linkReference') counts.link++;
      if (n.type === 'image' || n.type === 'imageReference') counts.image++;
    });
    const scan = scanMarkdown(doc);
    expect(scan.blocks.filter((b) => b.kind === 'code').length).toBe(counts.code);
    expect(scan.links.filter((l) => l.kind !== 'html').length).toBe(counts.link);
    expect(scan.images.filter((i) => i.kind === 'md').length).toBe(counts.image);
  });
});
