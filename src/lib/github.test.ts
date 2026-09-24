import { describe, expect, it, vi } from 'vitest';
import { parseGitHubInput, githubResolver, fetchReadme, GitHubError, refFromDownloadUrl, decodeBase64Utf8, joinRepoPath } from './github';

describe('parseGitHubInput', () => {
  it.each([
    ['facebook/react', { owner: 'facebook', repo: 'react' }],
    ['  naniiic137/readme-glow  ', { owner: 'naniiic137', repo: 'readme-glow' }],
    ['owner/repo.git', { owner: 'owner', repo: 'repo' }],
    ['https://github.com/vitejs/vite', { owner: 'vitejs', repo: 'vite' }],
    ['https://github.com/vitejs/vite/', { owner: 'vitejs', repo: 'vite' }],
    ['https://github.com/vitejs/vite.git', { owner: 'vitejs', repo: 'vite' }],
    ['github.com/vitejs/vite', { owner: 'vitejs', repo: 'vite' }],
    ['http://www.github.com/vitejs/vite?tab=readme-ov-file#readme', { owner: 'vitejs', repo: 'vite' }],
    ['https://github.com/vitejs/vite/issues/1', { owner: 'vitejs', repo: 'vite' }],
    ['git@github.com:vitejs/vite.git', { owner: 'vitejs', repo: 'vite' }],
    ['https://github.com/o/r/tree/dev', { owner: 'o', repo: 'r', ref: 'dev' }],
    ['https://github.com/o/r/tree/main/packages/core', { owner: 'o', repo: 'r', ref: 'main', dir: 'packages/core' }],
    ['https://github.com/o/r/blob/main/docs/GUIDE.md', { owner: 'o', repo: 'r', ref: 'main', file: 'docs/GUIDE.md' }],
    ['https://github.com/o/r/blob/v1.2.0/docs/My%20Guide.md', { owner: 'o', repo: 'r', ref: 'v1.2.0', file: 'docs/My Guide.md' }],
    ['https://raw.githubusercontent.com/o/r/main/README.md', { owner: 'o', repo: 'r', ref: 'main', file: 'README.md' }],
    ['https://raw.githubusercontent.com/o/r/refs/heads/dev/docs/a.md', { owner: 'o', repo: 'r', ref: 'dev', file: 'docs/a.md' }],
  ])('%s', (input, expected) => {
    expect(parseGitHubInput(input)).toEqual(expected);
  });

  it.each(['', 'hello', 'https://gitlab.com/o/r', 'https://github.com/onlyowner', 'bad owner/repo', 'o/..', '-bad/repo', 'javascript:alert(1)'])(
    'rejects %s',
    (input) => {
      expect(parseGitHubInput(input)).toBeNull();
    },
  );
});

describe('githubResolver', () => {
  const resolve = githubResolver({ owner: 'o', repo: 'r', ref: 'main', path: 'README.md' });
  const nested = githubResolver({ owner: 'o', repo: 'r', ref: 'feature/x', path: 'docs/README.md' });

  it('points relative images at raw.githubusercontent.com', () => {
    expect(resolve('docs/shot.png', 'image')).toBe('https://raw.githubusercontent.com/o/r/main/docs/shot.png');
    expect(resolve('./logo.svg', 'image')).toBe('https://raw.githubusercontent.com/o/r/main/logo.svg');
    expect(resolve('/assets/a b.png', 'image')).toBe('https://raw.githubusercontent.com/o/r/main/assets/a%20b.png');
    expect(resolve('img.png?raw=true', 'image')).toBe('https://raw.githubusercontent.com/o/r/main/img.png');
  });

  it('points relative links at github.com blob URLs', () => {
    expect(resolve('CONTRIBUTING.md', 'link')).toBe('https://github.com/o/r/blob/main/CONTRIBUTING.md');
    expect(resolve('docs/guide.md#setup', 'link')).toBe('https://github.com/o/r/blob/main/docs/guide.md#setup');
    expect(resolve('./', 'link')).toBe('https://github.com/o/r');
  });

  it('resolves relative to the README folder and encodes branch names', () => {
    expect(nested('../logo.png', 'image')).toBe('https://raw.githubusercontent.com/o/r/feature/x/logo.png');
    expect(nested('img/a.png', 'image')).toBe('https://raw.githubusercontent.com/o/r/feature/x/docs/img/a.png');
  });

  it('leaves absolute URLs and anchors alone and drops paths that escape the repo', () => {
    expect(resolve('https://example.com/a.png', 'image')).toBeUndefined();
    expect(resolve('#install', 'link')).toBeUndefined();
    expect(resolve('mailto:a@b.c', 'link')).toBeUndefined();
    expect(resolve('../../etc/passwd', 'image')).toBeNull();
    expect(resolve('//cdn.example.com/x.png', 'image')).toBe('https://cdn.example.com/x.png');
  });
});

describe('helpers', () => {
  it('joins repository paths', () => {
    expect(joinRepoPath('docs', '../a.png')).toBe('a.png');
    expect(joinRepoPath('', '../a.png')).toBeNull();
    expect(joinRepoPath('docs/x', '/root.png')).toBe('root.png');
  });

  it('reads the ref from a download URL', () => {
    expect(refFromDownloadUrl('https://raw.githubusercontent.com/o/r/main/README.md', 'o', 'r', 'README.md')).toBe('main');
    expect(refFromDownloadUrl('https://raw.githubusercontent.com/o/r/feature/x/docs/README.md', 'o', 'r', 'docs/README.md')).toBe('feature/x');
    expect(refFromDownloadUrl('https://example.com/x', 'o', 'r', 'README.md')).toBeNull();
  });

  it('decodes base64 as UTF-8', () => {
    const text = 'Héllo 🌍 مرحبا';
    const b64 = Buffer.from(text, 'utf8').toString('base64').replace(/(.{20})/g, '$1\n');
    expect(decodeBase64Utf8(b64)).toBe(text);
  });
});

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

describe('fetchReadme', () => {
  it('loads the README and metadata', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/repos/o/r/readme')) {
        return json({
          type: 'file',
          encoding: 'base64',
          content: Buffer.from('# Hello\n').toString('base64'),
          path: 'README.md',
          size: 8,
          download_url: 'https://raw.githubusercontent.com/o/r/trunk/README.md',
          html_url: 'https://github.com/o/r/blob/trunk/README.md',
        });
      }
      if (u.endsWith('/repos/o/r')) return json({ description: 'A thing', stargazers_count: 42, default_branch: 'trunk', topics: ['x'], owner: { avatar_url: 'https://a' } });
      return new Response('nope', { status: 500 });
    });
    const r = await fetchReadme({ owner: 'o', repo: 'r' }, { fetchImpl: fetchImpl as typeof fetch });
    expect(r.markdown).toBe('# Hello\n');
    expect(r.ref).toBe('trunk');
    expect(r.path).toBe('README.md');
    expect(r.meta?.stars).toBe(42);
    expect(r.meta?.description).toBe('A thing');
  });

  it('asks for a specific file and ref', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return json({ type: 'file', encoding: 'base64', content: Buffer.from('x').toString('base64'), path: 'docs/A B.md', size: 1 });
    });
    await fetchReadme({ owner: 'o', repo: 'r', ref: 'dev', file: 'docs/A B.md' }, { fetchImpl: fetchImpl as typeof fetch, withMeta: false });
    expect(urls).toEqual(['https://api.github.com/repos/o/r/contents/docs/A%20B.md?ref=dev']);
  });

  it('explains a missing repository', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 404 }));
    await expect(fetchReadme({ owner: 'o', repo: 'nope' }, { fetchImpl: fetchImpl as typeof fetch, withMeta: false })).rejects.toMatchObject({
      kind: 'not-found',
    });
  });

  it('explains the rate limit with the reset time', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } }));
    const err = (await fetchReadme({ owner: 'o', repo: 'r' }, { fetchImpl: fetchImpl as typeof fetch, withMeta: false }).catch((e) => e)) as GitHubError;
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.kind).toBe('rate-limit');
    expect(err.resetAt?.getTime()).toBe(reset * 1000);
    expect(err.message).toMatch(/resets at/);
  });

  it('reports network failures kindly', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchReadme({ owner: 'o', repo: 'r' }, { fetchImpl: fetchImpl as typeof fetch, withMeta: false })).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('refuses huge files', async () => {
    const fetchImpl = vi.fn(async () => json({ type: 'file', encoding: 'base64', content: '', path: 'README.md', size: 5_000_000 }));
    await expect(fetchReadme({ owner: 'o', repo: 'r' }, { fetchImpl: fetchImpl as typeof fetch, withMeta: false })).rejects.toMatchObject({
      kind: 'too-large',
    });
  });
});
