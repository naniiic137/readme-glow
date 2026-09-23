import { describe, expect, it } from 'vitest';
import { renderMarkdown, htmlFor } from './pipeline';

async function html(md: string) {
  return (await renderMarkdown(md)).html;
}

describe('markdown pipeline: GFM', () => {
  it('renders tables with alignment inside a scroll wrapper', async () => {
    const out = await html('| a | b |\n|:--|--:|\n| 1 | 2 |\n');
    expect(out).toContain('<div class="rg-table-wrap"');
    expect(out).toMatch(/<th[^>]*align="left"/);
    expect(out).toMatch(/<td[^>]*align="right"[^>]*>2<\/td>/);
  });

  it('renders task lists with disabled checkboxes', async () => {
    const out = await html('- [x] done\n- [ ] todo\n');
    expect(out).toContain('contains-task-list');
    expect(out).toMatch(/<input[^>]*type="checkbox"[^>]*checked[^>]*disabled|<input[^>]*checked[^>]*disabled/);
    expect(out.match(/type="checkbox"/g)).toHaveLength(2);
  });

  it('renders strikethrough and autolinks', async () => {
    const out = await html('~~old~~ see https://example.com');
    expect(out).toContain('<del>old</del>');
    expect(out).toMatch(/<a href="https:\/\/example\.com"[^>]*target="_blank"[^>]*rel="noopener noreferrer nofollow ugc"/);
  });

  it('renders footnotes with working back-links', async () => {
    const out = await html('Claim[^1].\n\n[^1]: Source.\n');
    expect(out).toContain('data-footnotes');
    expect(out).toContain('id="user-content-fn-1"');
    // The reference link is rewritten to the clobbered id so it works without scripts.
    expect(out).toContain('href="#user-content-fn-1"');
    expect(out).toContain('href="#user-content-fnref-1"');
    expect(out).toContain('data-footnote-backref');
  });

  it('replaces emoji shortcodes but not inside code', async () => {
    const out = await html('Ship it :rocket: `:rocket:`');
    expect(out).toContain('Ship it 🚀');
    expect(out).toContain('<code>:rocket:</code>');
  });
});

describe('markdown pipeline: headings', () => {
  it('adds GitHub-style slugs, deduplicated', async () => {
    const r = await renderMarkdown('# Hello World!\n\n## Install\n\n## Install\n\n### Café & Crème\n');
    expect(r.toc.map((t) => t.id)).toEqual(['hello-world', 'install', 'install-1', 'café--crème']);
    expect(r.toc.map((t) => t.depth)).toEqual([1, 2, 2, 3]);
    expect(r.html).toMatch(/<h2[^>]*id="install"/);
    expect(r.html).toContain('class="rg-anchor" href="#install"');
  });

  it('records the source line of each heading', async () => {
    const r = await renderMarkdown('intro\n\n## One\n\ntext\n\n## Two\n');
    expect(r.toc.map((t) => t.line)).toEqual([3, 7]);
  });

  it('makes in-document links reach clobbered user ids', async () => {
    const out = await html('<a name="top"></a>\n\n[up](#top)\n');
    expect(out).toContain('name="user-content-top"');
    expect(out).toContain('href="#user-content-top"');
  });
});

describe('markdown pipeline: GitHub alerts', () => {
  it.each(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'])('renders > [!%s]', async (type) => {
    const out = await html(`> [!${type}]\n> Body text.\n`);
    expect(out).toContain(`markdown-alert markdown-alert-${type.toLowerCase()}`);
    expect(out).toContain('markdown-alert-title');
    expect(out).not.toContain(`[!${type}]`);
    expect(out).toContain('Body text.');
  });

  it('leaves ordinary blockquotes alone', async () => {
    const out = await html('> [!NOTABLE] not an alert\n');
    expect(out).toContain('<blockquote');
    expect(out).not.toContain('markdown-alert');
  });

  it('points the alert paragraph at the text after the marker', async () => {
    const md = '> [!TIP]\n> Use the force.\n';
    const out = await html(md);
    const m = /data-inner="(\d+):(\d+)"/.exec(out);
    expect(m).not.toBeNull();
    expect(md.slice(Number(m![1]), Number(m![2]))).toBe('Use the force.');
  });
});

describe('markdown pipeline: code', () => {
  it('wraps fenced code in a figure with language label and copy button', async () => {
    const out = await html('```ts\nconst a: number = 1;\n```\n');
    expect(out).toContain('<figure class="rg-code no-file" data-lang="ts"');
    expect(out).toContain('<span class="rg-code-lang">TypeScript</span>');
    expect(out).toContain('class="rg-copy"');
    expect(out).toContain('hljs');
    expect(out).toContain('rg-line');
  });

  it('shows a filename caption from the fence info', async () => {
    for (const fence of ['```js title="server.js"', '```js:server.js', '```js filename=server.js']) {
      const out = await html(`${fence}\nlisten();\n\`\`\`\n`);
      expect(out).toContain('rg-code-file');
      expect(out).toContain('server.js');
      expect(out).toContain('JavaScript');
    }
  });

  it('splits code into numbered lines without adding a trailing empty line', async () => {
    const out = await html('```\na\nb\nc\n```\n');
    expect(out.match(/class="rg-line"/g)).toHaveLength(3);
  });

  it('keeps highlight spans intact across line splits', async () => {
    const out = await html('```js\n/* one\ntwo */\nconst x = 1;\n```\n');
    expect(out.match(/class="rg-line"/g)).toHaveLength(3);
    expect(out.match(/hljs-comment/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('turns mermaid fences into diagram placeholders', async () => {
    const r = await renderMarkdown('```mermaid\ngraph TD; A-->B;\n```\n');
    expect(r.features.mermaid).toBe(true);
    expect(r.html).toContain('class="rg-mermaid"');
    expect(r.html).toContain('graph TD; A--&#x3E;B;'.replace('&#x3E;', '>'));
  });

  it('renders inline and display math with KaTeX', async () => {
    const r = await renderMarkdown('Euler: $e^{i\\pi}+1=0$\n\n$$\n\\int_0^1 x\\,dx\n$$\n');
    expect(r.features.math).toBe(true);
    expect(r.html).toContain('class="katex"');
    expect(r.html).toContain('katex-display');
  });

  it('does not treat prices as math', async () => {
    const r = await renderMarkdown('It costs $5 and $10 per month.');
    expect(r.features.math).toBe(false);
    expect(r.html).toContain('$5 and $10');
  });
});

describe('markdown pipeline: images and badges', () => {
  it('groups badge-only paragraphs into a badge row', async () => {
    const r = await renderMarkdown(
      '# Proj\n\n[![CI](https://github.com/o/r/actions/workflows/ci.yml/badge.svg)](https://github.com/o/r/actions) ![npm](https://img.shields.io/npm/v/x)\n\nA tool.\n',
    );
    expect(r.html).toContain('class="rg-badges"');
    expect(r.meta.badges).toHaveLength(2);
    expect(r.meta.badges[0]!.href).toBe('https://github.com/o/r/actions');
    expect(r.meta.title).toBe('Proj');
    expect(r.meta.description).toBe('A tool.');
  });

  it('frames single images and shows their title as a caption', async () => {
    const out = await html('![Shot](https://example.com/a.png "The dashboard")\n');
    expect(out).toContain('class="rg-figure"');
    expect(out).toContain('<span class="rg-caption">The dashboard</span>');
    expect(out).toContain('loading="lazy"');
  });

  it('resolves relative URLs through the resolver', async () => {
    const r = await renderMarkdown('![a](docs/a.png) [guide](docs/guide.md)', {
      resolve: (url, kind) => (kind === 'image' ? `https://raw.example.com/${url}` : `https://example.com/blob/${url}`),
    });
    expect(r.html).toContain('src="https://raw.example.com/docs/a.png"');
    expect(r.html).toContain('href="https://example.com/blob/docs/guide.md"');
  });

  it('marks unresolved images instead of leaving a broken src', async () => {
    const out = await html('![a](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
  });

  it('turns github.com blob image URLs into raw URLs', async () => {
    const out = await html('![a](https://github.com/o/r/blob/main/shot.png)');
    expect(out).toContain('src="https://raw.githubusercontent.com/o/r/main/shot.png"');
  });
});

describe('markdown pipeline: source mapping', () => {
  it('annotates blocks with their source range', async () => {
    const md = '# Title\n\nSome *text* here.\n\n- one\n- two\n';
    const out = await html(md);
    const ranges = [...out.matchAll(/data-block="(\w+)"[^>]*?data-src="(\d+):(\d+)"/g)].map((m) => [m[1], md.slice(Number(m[2]), Number(m[3]))]);
    expect(ranges).toContainEqual(['heading', '# Title']);
    expect(ranges).toContainEqual(['paragraph', 'Some *text* here.']);
    expect(ranges).toContainEqual(['item', '- one']);
  });

  it('gives task items an inner range after the checkbox', async () => {
    const md = '- [ ] buy milk\n';
    const out = await html(md);
    const m = /data-block="item"[^>]*data-inner="(\d+):(\d+)"/.exec(out);
    expect(m).not.toBeNull();
    expect(md.slice(Number(m![1]), Number(m![2]))).toBe('buy milk');
  });

  it('gives code blocks an inner range between the fences', async () => {
    const md = 'x\n\n```js\nlet a = 1;\nlet b = 2;\n```\n';
    const out = await html(md);
    const m = /data-block="code"[^>]*data-inner="(\d+):(\d+)"/.exec(out);
    expect(md.slice(Number(m![1]), Number(m![2]))).toBe('let a = 1;\nlet b = 2;');
  });

  it('does not let raw HTML claim editable ranges', async () => {
    const out = await html('<p data-src="0:999" data-block="paragraph">raw</p>\n');
    expect(out).not.toContain('data-src="0:999"');
    expect(out).toContain('data-block="html"');
  });
});

describe('sectionize', () => {
  it('groups sections by H2 and keeps the title in the intro', async () => {
    const r = await renderMarkdown('# T\n\nintro\n\n## A\n\na\n\n## B\n\nb\n');
    const out = htmlFor(r.tree, 'sections');
    expect(out.match(/<section class="rg-section"/g)).toHaveLength(2);
    expect(out).toMatch(/^<header class="rg-intro"><h1/);
  });

  it('splits slides on H1/H2 and horizontal rules', async () => {
    const r = await renderMarkdown('# T\n\nhello\n\n---\n\nmore\n\n## A\n\na\n');
    const out = htmlFor(r.tree, 'slides');
    expect(out.match(/class="rg-slide /g)).toHaveLength(3);
    expect(out).not.toContain('<hr');
  });
});

describe('stats', () => {
  it('counts words outside code', async () => {
    const r = await renderMarkdown('# Hello there\n\nOne two three.\n\n```\nnot counted at all\n```\n');
    expect(r.stats.words).toBe(5);
    expect(r.stats.codeBlocks).toBe(1);
    expect(r.stats.readingMinutes).toBe(1);
  });
});
