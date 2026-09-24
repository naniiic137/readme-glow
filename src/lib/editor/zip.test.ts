import { describe, expect, it } from 'vitest';
import { collectImageRefs, normalisePath, planZip } from './zip';

describe('normalisePath', () => {
  it('resolves ./ and ../ segments', () => {
    expect(normalisePath('./docs/a.png')).toBe('docs/a.png');
    expect(normalisePath('docs/./img/../a.png')).toBe('docs/a.png');
    expect(normalisePath('docs//a.png')).toBe('docs/a.png');
    expect(normalisePath('docs\\shots\\a.png')).toBe('docs/shots/a.png');
  });

  it('resolves against a base directory', () => {
    expect(normalisePath('../assets/a.png', 'docs')).toBe('assets/a.png');
    expect(normalisePath('a.png', './docs/guide/')).toBe('docs/guide/a.png');
    expect(normalisePath('a.png', '')).toBe('a.png');
  });

  it('returns null for paths escaping the root, absolute and remote URLs', () => {
    expect(normalisePath('../a.png')).toBeNull();
    expect(normalisePath('../../a.png', 'docs')).toBeNull();
    expect(normalisePath('/docs/a.png')).toBeNull();
    expect(normalisePath('//cdn.example.com/a.png')).toBeNull();
    expect(normalisePath('https://example.com/a.png')).toBeNull();
    expect(normalisePath('data:image/png;base64,AAAA')).toBeNull();
    expect(normalisePath('C:\\Users\\a.png')).toBeNull();
    expect(normalisePath('')).toBeNull();
  });
});

describe('collectImageRefs', () => {
  it('finds inline images with titles, angle brackets and nested brackets in alt text', () => {
    const md = [
      '# Title',
      '',
      '![Shot](docs/shot.png "The dashboard")',
      '![a [nested] alt](<docs/my shot.png>)',
      '![paren](img/a(1).png)',
    ].join('\n');
    expect(collectImageRefs(md)).toEqual([
      { url: 'docs/shot.png', line: 3 },
      { url: 'docs/my shot.png', line: 4 },
      { url: 'img/a(1).png', line: 5 },
    ]);
  });

  it('finds reference-style images through their definitions, but not link-only definitions', () => {
    const md = '![Logo][logo] and ![banner][]\n\n[Docs][docs]\n\n[logo]: ./art/logo.svg "Logo"\n[banner]: <art/banner.png>\n[docs]: docs/index.md\n';
    expect(collectImageRefs(md).map((r) => r.url)).toEqual(['./art/logo.svg', 'art/banner.png']);
  });

  it('finds <img src>, srcset candidates and <source srcset> in HTML', () => {
    const md = [
      '<p align="center">',
      '  <img src="docs/logo.png" alt="Logo" width="120">',
      '</p>',
      '',
      '<picture>',
      '  <source media="(prefers-color-scheme: dark)" srcset="docs/dark.png 1x, docs/dark@2x.png 2x">',
      "  <img src='docs/light.png' alt=\"src=fake.png\" srcset=\"docs/light@2x.png 2x\">",
      '</picture>',
      '',
      'Inline <img src=star.svg height=16> icon.',
    ].join('\n');
    expect(collectImageRefs(md)).toEqual([
      { url: 'docs/logo.png', line: 2 },
      { url: 'docs/dark.png', line: 6 },
      { url: 'docs/dark@2x.png', line: 6 },
      { url: 'docs/light.png', line: 7 },
      { url: 'docs/light@2x.png', line: 7 },
      { url: 'star.svg', line: 10 },
    ]);
  });

  it('skips code blocks, inline code and HTML comments', () => {
    const md = [
      '```md',
      '![not](code.png)',
      '<img src="code.png">',
      '```',
      '',
      'Use `![x](inline.png)` like this.',
      '',
      '<!-- <img src="comment.png"> -->',
      '',
      '    ![indented](code2.png)',
      '',
      '![real](real.png)',
    ].join('\n');
    expect(collectImageRefs(md).map((r) => r.url)).toEqual(['real.png']);
  });

  it('returns URLs exactly as written, remote ones included', () => {
    const md = '![a](https://img.shields.io/badge/a-b-c) ![b](docs/a\\_b.png?raw=true#gh-dark-mode-only)\n';
    expect(collectImageRefs(md).map((r) => r.url)).toEqual(['https://img.shields.io/badge/a-b-c', 'docs/a\\_b.png?raw=true#gh-dark-mode-only']);
  });

  it('finds images inside lists, tables and blockquotes', () => {
    const md = '- ![a](a.png)\n\n| x |\n| - |\n| ![b](b.png) |\n\n> ![c](c.png)\n';
    expect(collectImageRefs(md)).toEqual([
      { url: 'a.png', line: 1 },
      { url: 'b.png', line: 5 },
      { url: 'c.png', line: 7 },
    ]);
  });
});

describe('planZip', () => {
  it('copies local images to images/ and rewrites only the URL text', () => {
    const md = '# App\n\n![Shot](./docs/shot.png "Main *screen*")\n\nText stays **exactly** the same.\n';
    const plan = planZip(md, ['docs/shot.png']);
    expect(plan.files).toEqual([{ from: 'docs/shot.png', to: 'images/shot.png' }]);
    expect(plan.markdown).toBe('# App\n\n![Shot](images/shot.png "Main *screen*")\n\nText stays **exactly** the same.\n');
  });

  it('matches relative forms, URL-encoding, query strings and case differences', () => {
    const md = [
      '![a](docs/../docs/a.png)',
      '![b](./docs/my%20shot.png?raw=true)',
      '![c](DOCS/C.PNG#gh-dark-mode-only)',
    ].join('\n');
    const plan = planZip(md, ['docs/a.png', 'docs/my shot.png', 'docs/c.png']);
    expect(plan.files).toEqual([
      { from: 'docs/a.png', to: 'images/a.png' },
      { from: 'docs/my shot.png', to: 'images/my-shot.png' },
      { from: 'docs/c.png', to: 'images/c.png' },
    ]);
    expect(plan.markdown).toBe(['![a](images/a.png)', '![b](images/my-shot.png?raw=true)', '![c](images/c.png#gh-dark-mode-only)'].join('\n'));
  });

  it('dedupes name clashes with -2, -3 and copies a file used twice only once', () => {
    const md = '![1](a/logo.png) ![2](b/logo.png) ![3](c/Logo.png) ![again](./a/logo.png)\n';
    const plan = planZip(md, ['a/logo.png', 'b/logo.png', 'c/Logo.png']);
    expect(plan.files).toEqual([
      { from: 'a/logo.png', to: 'images/logo.png' },
      { from: 'b/logo.png', to: 'images/logo-2.png' },
      { from: 'c/Logo.png', to: 'images/Logo-3.png' },
    ]);
    expect(plan.markdown).toBe('![1](images/logo.png) ![2](images/logo-2.png) ![3](images/Logo-3.png) ![again](images/logo.png)\n');
  });

  it('rewrites HTML <img> and srcset URLs in place', () => {
    const md = '<div align="center">\n  <img src="./art/logo.svg" width="96" alt="logo">\n</div>\n\n<picture><source srcset="art/dark.png 2x, https://x.test/y.png 1x"><img src="art/light.png"></picture>\n';
    const plan = planZip(md, ['art/logo.svg', 'art/dark.png', 'art/light.png']);
    expect(plan.markdown).toBe(
      '<div align="center">\n  <img src="images/logo.svg" width="96" alt="logo">\n</div>\n\n<picture><source srcset="images/dark.png 2x, https://x.test/y.png 1x"><img src="images/light.png"></picture>\n',
    );
    expect(plan.files.map((f) => f.to)).toEqual(['images/logo.svg', 'images/dark.png', 'images/light.png']);
  });

  it('rewrites reference-style definitions', () => {
    const md = '![Logo][logo]\n\n[logo]: <./art/the logo.svg> "The logo"\n';
    const plan = planZip(md, ['art/the logo.svg']);
    expect(plan.markdown).toBe('![Logo][logo]\n\n[logo]: <images/the-logo.svg> "The logo"\n');
  });

  it('leaves code blocks, remote, data, blob and unknown images untouched', () => {
    const md = [
      '```',
      '![x](docs/a.png)',
      '```',
      '![remote](https://example.com/docs/a.png)',
      '![data](data:image/png;base64,AAAA)',
      '![blob](blob:https://app.test/1234)',
      '![missing](docs/missing.png)',
      '![abs](/docs/a.png)',
      '![up](../docs/a.png)',
    ].join('\n');
    const plan = planZip(md, ['docs/a.png']);
    expect(plan.markdown).toBe(md);
    expect(plan.files).toEqual([]);
  });

  it('sanitises file names that would break a reference', () => {
    const md = '![a](<shots/final (v2) & more.png>)\n\n<img src="shots/it&#39;s [1].png">\n';
    const plan = planZip(md, ['shots/final (v2) & more.png', "shots/it's [1].png"]);
    expect(plan.files.map((f) => f.to)).toEqual(['images/final-v2-more.png', 'images/it-s-1.png']);
    expect(plan.markdown).toBe('![a](<images/final-v2-more.png>)\n\n<img src="images/it-s-1.png">\n');
  });

  it('is idempotent: planning the rewritten document again changes nothing', () => {
    const md = '![1](a/logo.png) ![2](b/logo.png)\n\n<img src="./a/logo.png">\n\n![r][r]\n\n[r]: c/shot.png\n';
    const first = planZip(md, ['a/logo.png', 'b/logo.png', 'c/shot.png']);
    const second = planZip(first.markdown, first.files.map((f) => f.to));
    expect(second.markdown).toBe(first.markdown);
    expect(second.files).toEqual(first.files.map((f) => ({ from: f.to, to: f.to })));
  });

  it('keeps pasted images already under images/ where they are', () => {
    const md = '![p](images/paste-1.png) ![q](docs/paste-1.png)\n';
    const plan = planZip(md, ['images/paste-1.png', 'docs/paste-1.png']);
    expect(plan.files).toEqual([
      { from: 'images/paste-1.png', to: 'images/paste-1.png' },
      { from: 'docs/paste-1.png', to: 'images/paste-1-2.png' },
    ]);
    expect(plan.markdown).toBe('![p](images/paste-1.png) ![q](images/paste-1-2.png)\n');
  });

  it('returns the document unchanged when there are no local images', () => {
    const md = '# Hi\n\nNo images here.\n';
    expect(planZip(md, [])).toEqual({ markdown: md, files: [] });
  });
});
