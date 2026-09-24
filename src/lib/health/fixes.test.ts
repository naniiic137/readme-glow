import { describe, expect, it } from 'vitest';
import { applyFix, checkHealth, guessCodeLanguage, type FixId } from './index';
import { parseMarkdown, walk } from '../markdown/parse';

const fence = '```';
const ctx = { projectName: 'Demo', year: 2026 };

function issueIds(md: string): string[] {
  return checkHealth(md).issues.map((i) => i.id);
}

/** Code block and inline code contents, per remark (the real parser). */
function codeValues(md: string): string[] {
  const out: string[] = [];
  walk(parseMarkdown(md), (n) => {
    if (n.type === 'code' || n.type === 'inlineCode') out.push(n.value);
  });
  return out;
}

/** A messy README that triggers every fixable rule (badges and logos are not screenshots). */
const TRICKY = [
  '<!-- header comment -->',
  '<a name="readme-top"></a>',
  '',
  '[![CI](https://img.shields.io/badge/ci-passing-green)](https://ci.example.com)',
  '',
  '## Features',
  '',
  '- One ![](icon.png)',
  '- Two [broken]() and []() links',
  '',
  '#### Deep heading',
  '',
  fence,
  '# not a heading, ![](nope.png) [x]()',
  '<img src="in-code.png">',
  fence,
  '',
  'Inline `![](code.png)` and `[y]()` stay.',
  '',
  '<img src="logo.png" width="80">',
  '',
  '~~~',
  '{"a": 1}',
  '~~~',
  '',
  '## Contributing',
  '',
  'Pull requests are welcome.',
  '',
  '[ref]: https://example.com',
  '',
].join('\n');

const FIX_RULE: Array<[FixId, string, string]> = [
  ['add-title', 'title', TRICKY],
  ['add-description', 'description', TRICKY],
  ['add-installation', 'installation', TRICKY],
  ['add-usage', 'usage', TRICKY],
  ['add-licence', 'licence', TRICKY],
  ['add-screenshots', 'screenshots', TRICKY],
  ['add-alt-text', 'alt-text', TRICKY],
  ['fix-heading-levels', 'heading-order', TRICKY],
  ['remove-empty-links', 'empty-links', TRICKY],
  ['add-code-languages', 'code-language', TRICKY],
];

describe('applyFix: every fix', () => {
  it.each(FIX_RULE)('%s clears the %s issue, is idempotent and keeps code intact', (fix, rule, md) => {
    expect(issueIds(md)).toContain(rule);
    const once = applyFix(md, fix, ctx);
    expect(once).not.toBe(md);
    expect(issueIds(once)).not.toContain(rule);
    expect(applyFix(once, fix, ctx)).toBe(once);
    expect(codeValues(once)).toEqual(expect.arrayContaining(codeValues(md)));
    expect(once).toContain('# not a heading, ![](nope.png) [x]()\n<img src="in-code.png">');
    expect(once).toContain('Inline `![](code.png)` and `[y]()` stay.');
  });

  it('returns the Markdown unchanged when there is nothing to fix', () => {
    const md = '# Demo\n\nA tool that does one small thing very well for everyone.\n\n![Shot](s.png)\n';
    for (const fix of ['add-title', 'add-description', 'add-screenshots', 'add-alt-text', 'fix-heading-levels', 'remove-empty-links', 'add-code-languages'] as FixId[]) {
      expect(applyFix(md, fix, ctx), fix).toBe(md);
    }
  });

  it('turns an empty README into a decent one when every fix is applied', () => {
    let md = '';
    for (const [fix] of FIX_RULE) md = applyFix(md, fix, ctx);
    const report = checkHealth(md);
    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.issues.map((i) => i.id).every((id) => id === 'too-short' || id === 'placeholder-text')).toBe(true);
    const order = ['# Demo', PLACEHOLDER_START, '## Screenshots', '## Installation', '## Usage', '## Licence'].map((s) => md.indexOf(s));
    expect(order.every((pos, i) => pos >= 0 && (i === 0 || pos > order[i - 1]!))).toBe(true);
  });
});

const PLACEHOLDER_START = 'Describe what this project does';

describe('applyFix: add-title', () => {
  it('adds the title after leading comments and anchors', () => {
    const out = applyFix(TRICKY, 'add-title', ctx);
    expect(out.startsWith('<!-- header comment -->\n<a name="readme-top"></a>\n\n# Demo\n\n[![CI]')).toBe(true);
  });

  it('uses a placeholder name and handles an empty document', () => {
    expect(applyFix('', 'add-title')).toBe('# Project name\n');
    expect(applyFix('Some text.\n', 'add-title')).toBe('# Project name\n\nSome text.\n');
  });

  it('counts an HTML <h1> as a title', () => {
    const md = '<h1 align="center">Demo</h1>\n\nText.\n';
    expect(applyFix(md, 'add-title', ctx)).toBe(md);
  });
});

describe('applyFix: add-description', () => {
  it('puts the description under the title and its badges', () => {
    const md = '# Demo\n\n[![CI](https://img.shields.io/badge/ci-ok-green)](https://x.y)\n\n## Features\n\n- Fast\n';
    expect(applyFix(md, 'add-description')).toBe(
      `# Demo\n\n[![CI](https://img.shields.io/badge/ci-ok-green)](https://x.y)\n\n${PLACEHOLDER_START}, who it is for and why it is useful.\n\n## Features\n\n- Fast\n`,
    );
  });

  it('adds it right after a title that has nothing under it', () => {
    expect(applyFix('# Demo\n## Usage\n', 'add-description')).toBe(`# Demo\n\n${PLACEHOLDER_START}, who it is for and why it is useful.\n\n## Usage\n`);
  });
});

describe('applyFix: section placement', () => {
  const doc = '# Demo\n\nA tool that does one small thing very well for everyone.\n\n## Features\n\n- Fast\n\n## Usage\n\nRun it.\n\n## Contributing\n\nWelcome.\n';

  it('adds Installation after the intro and Features, before Usage', () => {
    const out = applyFix(doc, 'add-installation', ctx);
    expect(out).toContain('- Fast\n\n## Installation\n\n<!--');
    expect(out).toContain(`${fence}bash\nnpm install demo\n${fence}\n\n## Usage`);
  });

  it('adds Installation before later sections when there is no Usage section', () => {
    const md = '# Demo\n\nIntro.\n\n## Features\n\n- Fast\n\n## Contributing\n\nWelcome.\n';
    expect(applyFix(md, 'add-installation', ctx)).toMatch(/- Fast\n\n## Installation\n[\s\S]*\n\n## Contributing/);
  });

  it('adds Usage right after the Installation section', () => {
    const md = `# Demo\n\nIntro.\n\n## Installation\n\n${fence}bash\nnpm i demo\n${fence}\n\n### Requirements\n\nNode 20.\n\n## Contributing\n\nWelcome.\n`;
    const out = applyFix(md, 'add-usage', ctx);
    expect(out).toContain('Node 20.\n\n## Usage\n');
    expect(out).toMatch(/## Usage[\s\S]*npx demo --help[\s\S]*\n\n## Contributing/);
  });

  it('adds Screenshots after the intro sections', () => {
    const out = applyFix(doc, 'add-screenshots', ctx);
    expect(out).toContain('- Fast\n\n## Screenshots\n');
    expect(out).toContain('![Screenshot of Demo](docs/screenshot.png)\n\n## Usage');
  });

  it('adds the Licence last, before link definitions, with the copyright placeholder', () => {
    const md = `${doc}\n[ref]: https://example.com\n`;
    const out = applyFix(md, 'add-licence', ctx);
    expect(out).toContain('Welcome.\n\n## Licence\n\n© 2026 Your Name. All rights reserved.\n');
    expect(out).toContain('choosealicense.com');
    expect(out.endsWith('-->\n\n[ref]: https://example.com\n')).toBe(true);
  });

  it('matches the heading level the README already uses for sections', () => {
    const md = '# Demo\n\nIntro text for the project goes here in a sentence.\n\n### Features\n\n- Fast\n';
    expect(applyFix(md, 'add-licence', ctx)).toContain('\n### Licence\n');
  });
});

describe('applyFix: add-alt-text', () => {
  it('fills empty Markdown alt text and HTML alt attributes', () => {
    const md = '# X\n\n![](a.png) ![ ](b.png)\n\n<img src="c.png" width="9">\n<img alt="" src="d.png">\n';
    expect(applyFix(md, 'add-alt-text')).toBe(
      '# X\n\n![Describe this image](a.png) ![Describe this image](b.png)\n\n<img alt="Describe this image" src="c.png" width="9">\n<img alt="Describe this image" src="d.png">\n',
    );
  });

  it('leaves images in code alone', () => {
    const md = '# X\n\n`![](a.png)`\n\n```html\n<img src="b.png">\n```\n';
    expect(applyFix(md, 'add-alt-text')).toBe(md);
  });
});

describe('applyFix: fix-heading-levels', () => {
  it('keeps one H1 and moves H1 sections (and their children) down a level', () => {
    expect(applyFix('# A\n\n# B\n\n## B1\n\n# C\n', 'fix-heading-levels')).toBe('# A\n\n## B\n\n### B1\n\n## C\n');
  });

  it('closes skipped levels', () => {
    expect(applyFix('# T\n\n### A\n\n##### B\n\n## C\n', 'fix-heading-levels')).toBe('# T\n\n## A\n\n### B\n\n## C\n');
  });

  it('treats an HTML <h1> as the title and demotes Markdown H1s after it', () => {
    const md = '<h1 align="center">Demo</h1>\n\n# Install\n\n## From source\n';
    const out = applyFix(md, 'fix-heading-levels');
    expect(out).toBe('<h1 align="center">Demo</h1>\n\n## Install\n\n### From source\n');
    expect(issueIds(out)).not.toContain('heading-order');
  });

  it('handles setext headings and closing hashes', () => {
    expect(applyFix('Title\n=====\n\nOther\n=====\n\n#### Deep ####\n', 'fix-heading-levels')).toBe(
      'Title\n=====\n\nOther\n-----\n\n### Deep ####\n',
    );
  });
});

describe('applyFix: remove-empty-links', () => {
  it('unwraps [text]() and drops []()', () => {
    expect(applyFix('See [the docs]() and []() here.\n', 'remove-empty-links')).toBe('See the docs and here.\n');
    expect(applyFix('[]() Start and end []()\n', 'remove-empty-links')).toBe('Start and end\n');
  });

  it('leaves HTML links and inline code alone', () => {
    expect(applyFix('<a href="">x</a> and [y]() and `[z]()`\n', 'remove-empty-links')).toBe('<a href="">x</a> and y and `[z]()`\n');
  });

  it('turns [](url) into a visible link', () => {
    expect(applyFix('Go [](https://x.y) or [](docs/a.md).\n', 'remove-empty-links')).toBe('Go <https://x.y> or [docs/a.md](docs/a.md).\n');
  });

  it('keeps formatting and images inside the link text', () => {
    expect(applyFix('A [**bold** ![i](i.png)]() link\n', 'remove-empty-links')).toBe('A **bold** ![i](i.png) link\n');
  });
});

describe('applyFix: add-code-languages', () => {
  it('labels shell, JSON and other blocks without changing their content', () => {
    const md = `${fence}\nnpm install\ncd app\n${fence}\n\n${fence}\n{"a": [1, 2]}\n${fence}\n\n~~~~\nhello world\n~~~~\n\n- item\n\n  ${fence}\n  $ make\n  ${fence}\n`;
    expect(applyFix(md, 'add-code-languages')).toBe(
      `${fence}bash\nnpm install\ncd app\n${fence}\n\n${fence}json\n{"a": [1, 2]}\n${fence}\n\n~~~~text\nhello world\n~~~~\n\n- item\n\n  ${fence}bash\n  $ make\n  ${fence}\n`,
    );
  });

  it('guesses conservatively', () => {
    expect(guessCodeLanguage('# comment\ndocker compose up -d')).toBe('bash');
    expect(guessCodeLanguage('[1, 2, 3]')).toBe('json');
    expect(guessCodeLanguage('{ not: json }')).toBe('text');
    expect(guessCodeLanguage('Go to the settings page')).toBe('text');
    expect(guessCodeLanguage('')).toBe('text');
  });
});
