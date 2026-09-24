import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { renderGitHubPreview, scopeGitHubCss } from './githubHtml';
import { buildGitHubZip, formatBytes, zipPath } from './zip';

const light = { scheme: 'light' as const };

describe('GitHub preview renderer (GitHub allow-list)', () => {
  it.each([
    ['<script>alert(1)</script>', /<script|alert\(1\)/],
    ['<img src="x" onerror="alert(1)">', /onerror/],
    ['<a href="javascript:alert(1)">x</a>', /javascript:/],
    ['<iframe src="https://evil.example"></iframe>', /<iframe/],
    ['<p style="color:red">x</p>', /style=/],
    ['<svg><circle r="5"/></svg>', /<svg|<circle/],
    ['<style>body{display:none}</style>', /<style|display:none/],
    ['<form action="/x"><input name="q"></form>', /<form/],
    ['<img src="data:image/svg+xml;base64,AAAA">', /data:/],
  ])('strips %s', (input, bad) => {
    expect(renderGitHubPreview(input, light)).not.toMatch(bad);
  });

  it('keeps what GitHub keeps: align, picture/source, details, width', () => {
    const html = renderGitHubPreview(
      '<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="d.svg"><img alt="A" src="l.svg" width="100"></picture></p>\n\n<details><summary>More</summary>\n\nHidden\n\n</details>',
      light,
    );
    expect(html).toContain('<p align="center">');
    expect(html).toContain('<picture>');
    expect(html).toContain('width="100"');
    expect(html).toContain('<details><summary>More</summary>');
  });

  it('prefixes user ids like GitHub and adds heading anchors', () => {
    const html = renderGitHubPreview('## <a id="install"></a>Install\n\n## Usage', light);
    expect(html).toContain('id="user-content-install"');
    expect(html).toContain('<h2 id="user-content-usage">Usage</h2>');
  });

  it('renders alerts with their icon and title', () => {
    const html = renderGitHubPreview('> [!WARNING]\n> Careful.', light);
    expect(html).toMatch(/<div class="markdown-alert markdown-alert-warning" dir="auto"><p class="markdown-alert-title" dir="auto"><svg class="octicon mr-2"[^>]*><path d="[^"]+"><\/path><\/svg>Warning<\/p>/);
    expect(html).toContain('Careful.');
  });

  it('forces the previewed colour scheme on <picture> sources and resolves local images', () => {
    const md = '<picture><source media="(prefers-color-scheme: dark)" srcset=".github/readmeglow/hero-dark.svg"><source media="(prefers-color-scheme: light)" srcset=".github/readmeglow/hero-light.svg"><img alt="H" src=".github/readmeglow/hero-light.svg"></picture>';
    const resolveImage = (src: string) => `blob:${src}`;
    const dark = renderGitHubPreview(md, { scheme: 'dark', resolveImage });
    expect(dark).toContain('<source media="all" srcset="blob:.github/readmeglow/hero-dark.svg">');
    expect(dark).toContain('<source media="not all" srcset="blob:.github/readmeglow/hero-light.svg">');
    expect(dark).toContain('src="blob:.github/readmeglow/hero-light.svg"');
    const lightHtml = renderGitHubPreview(md, { scheme: 'light', resolveImage });
    expect(lightHtml).toContain('<source media="not all" srcset="blob:.github/readmeglow/hero-dark.svg">');
    // Remote images stay remote.
    expect(renderGitHubPreview('![b](https://img.shields.io/badge/a-b-blue)', { scheme: 'light', resolveImage })).toContain('src="https://img.shields.io/badge/a-b-blue"');
  });

  it('drops HTML comments (the export markers never show)', () => {
    const html = renderGitHubPreview('<!-- readmeglow theme="aurora" -->\n<!-- readmeglow:begin h2\n## A\n-->\n## B\n<!-- readmeglow:end h2 -->', light);
    expect(html).not.toContain('readmeglow');
    expect(html).not.toContain('<h2 id="user-content-a"');
  });

  it('turns emoji shortcodes into emoji outside code', () => {
    const html = renderGitHubPreview('Ship :rocket: `:rocket:`', { scheme: 'light', emoji: new Map([['rocket', '🚀']]) });
    expect(html).toContain('Ship 🚀 <code>:rocket:</code>');
  });

  it('scopes github-markdown-css to one scheme', () => {
    expect(scopeGitHubCss('.markdown-body{color:red}.markdown-body h1:hover .anchor{x:y}.markdown-body-x{}', 'dark')).toBe(
      '.markdown-body.gh-dark{color:red}.markdown-body.gh-dark h1:hover .anchor{x:y}.markdown-body-x{}',
    );
  });
});

describe('GitHub export zip', () => {
  it('puts README.md at the root and images in their folder', () => {
    const zip = buildGitHubZip('# Hi', [{ path: '.github/readmeglow/hero-light.svg', svg: '<svg/>', kind: 'hero', variant: 'light' }], [
      { path: 'images/logo.png', data: new Uint8Array([1, 2, 3]) },
      { path: '../evil.txt', data: new Uint8Array([1]) },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(['.github/readmeglow/hero-light.svg', 'README.md', 'images/logo.png']);
    expect(strFromU8(files['README.md']!)).toBe('# Hi');
    expect(strFromU8(files['.github/readmeglow/hero-light.svg']!)).toBe('<svg/>');
  });

  it('normalises paths and refuses escapes', () => {
    expect(zipPath('./a//b\\c.svg')).toBe('a/b/c.svg');
    expect(zipPath('/abs/x')).toBe('abs/x');
    expect(zipPath('a/../../x')).toBeNull();
    expect(zipPath('')).toBeNull();
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(40_000)).toBe('39 KB');
  });
});
