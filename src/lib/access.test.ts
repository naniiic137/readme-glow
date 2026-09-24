import { describe, expect, it, vi } from 'vitest';
import { appUrl, bookmarkletCode, bookmarkletTarget, parsePrettyPath, prettyRepoUrl, redirectHtml } from './access';

const BASE = '/readme-glow/';
const APP = 'https://naniiic137.github.io/readme-glow/';

describe('pretty paths', () => {
  it.each([
    ['/readme-glow/facebook/react', { owner: 'facebook', repo: 'react' }],
    ['/readme-glow/facebook/react/', { owner: 'facebook', repo: 'react' }],
    ['/readme-glow/github.com/facebook/react', { owner: 'facebook', repo: 'react' }],
    ['/readme-glow/www.github.com/facebook/react', { owner: 'facebook', repo: 'react' }],
    ['/readme-glow/https:/github.com/facebook/react', { owner: 'facebook', repo: 'react' }],
    ['/readme-glow/https://github.com/facebook/react', { owner: 'facebook', repo: 'react' }],
    ['/readme-glow/naniiic137/readme-glow.git', { owner: 'naniiic137', repo: 'readme-glow' }],
    ['/readme-glow/vercel/next.js/tree/canary/docs', { owner: 'vercel', repo: 'next.js', ref: 'canary', dir: 'docs' }],
    ['/readme-glow/o/r/blob/main/docs/Guide%20One.md', { owner: 'o', repo: 'r', ref: 'main', file: 'docs/Guide One.md' }],
  ])('%s', (path, expected) => {
    expect(parsePrettyPath(path, BASE)).toEqual(expected);
  });

  it.each([
    '/readme-glow/',
    '/readme-glow/index.html',
    '/readme-glow/assets/index-abc.js',
    '/readme-glow/samples/nebula/logo.svg',
    '/readme-glow/facebook',
    '/readme-glow/settings/profile',
    '/readme-glow/orgs/github',
    '/elsewhere/facebook/react',
    '/readme-glow/gitlab.com/o/r',
    '/readme-glow/bad name/repo',
  ])('rejects %s', (path) => {
    expect(parsePrettyPath(path, BASE)).toBeNull();
  });

  it('builds pretty links (and round-trips them)', () => {
    expect(appUrl('https://naniiic137.github.io', '/readme-glow/')).toBe(APP);
    expect(appUrl('http://localhost:3751/', 'readme-glow')).toBe('http://localhost:3751/readme-glow/');
    expect(prettyRepoUrl({ owner: 'o', repo: 'r' }, APP)).toBe(`${APP}o/r`);
    const deep = { owner: 'o', repo: 'r', ref: 'dev', file: 'docs/My Guide.md' };
    const url = prettyRepoUrl(deep, APP);
    expect(url).toBe(`${APP}o/r/blob/dev/docs/My%20Guide.md`);
    expect(parsePrettyPath(new URL(url).pathname, BASE)).toEqual(deep);
  });
});

describe('redirect page', () => {
  it('forwards with meta refresh, script and a link, all escaped', () => {
    const html = redirectHtml({ owner: 'o', repo: 'r' }, `${APP}o/r?x="</script>`);
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=https://naniiic137.github.io/readme-glow/o/r?x=&quot;&lt;/script&gt;">');
    expect(html).toContain('<a href="https://naniiic137.github.io/readme-glow/o/r?x=&quot;&lt;/script&gt;">Continue</a>');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(script).not.toContain('</');
    expect(script).toContain('location.hash');
    expect(html).toContain('<meta name="robots" content="noindex">');
  });
});

describe('bookmarklet', () => {
  it('accepts only github.com repository pages', () => {
    expect(bookmarkletTarget('https://github.com/facebook/react', APP)).toBe(`${APP}facebook/react`);
    expect(bookmarkletTarget('https://github.com/facebook/react/issues/1', APP)).toBe(`${APP}facebook/react`);
    expect(bookmarkletTarget('https://github.com/o/r/blob/main/docs/a.md', APP)).toBe(`${APP}o/r/blob/main/docs/a.md`);
    for (const bad of ['https://gitlab.com/o/r', 'https://github.com.evil.io/o/r', 'http://github.com/o/r', 'https://gist.github.com/o/abc', 'https://github.com/settings/profile', 'https://github.com/o', 'not a url']) {
      expect(bookmarkletTarget(bad, APP)).toBeNull();
    }
  });

  function run(pageUrl: string): { went: string | null; alerted: boolean } {
    const code = decodeURIComponent(bookmarkletCode(APP).slice('javascript:'.length));
    const location = { href: pageUrl };
    const alert = vi.fn();
    new Function('location', 'alert', code)(location, alert);
    return { went: location.href === pageUrl ? null : location.href, alerted: alert.mock.calls.length > 0 };
  }

  it('runs the same rules as bookmarkletTarget', () => {
    expect(run('https://github.com/facebook/react')).toEqual({ went: `${APP}facebook/react`, alerted: false });
    expect(run('https://github.com/o/r/tree/dev/pkg')).toEqual({ went: `${APP}o/r/tree/dev/pkg`, alerted: false });
    for (const bad of ['https://example.com/o/r', 'https://github.com/explore', 'https://github.com.evil.io/o/r']) {
      expect(run(bad)).toEqual({ went: null, alerted: true });
    }
  });

  it('is a single javascript: URL with no raw spaces or quotes', () => {
    const href = bookmarkletCode(APP);
    expect(href.startsWith('javascript:')).toBe(true);
    expect(href).not.toMatch(/[\s"<>]/);
  });
});
