import type { UrlResolver } from './markdown/types';

/** A reference to a README (or any Markdown file) on GitHub. */
export interface RepoRef {
  owner: string;
  repo: string;
  /** Branch, tag or commit. Default branch when absent. */
  ref?: string;
  /** Directory to look for a README in (for /tree/ URLs). */
  dir?: string;
  /** Exact Markdown file path (for /blob/ and raw URLs). */
  file?: string;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

function validName(owner: string, repo: string): boolean {
  return OWNER.test(owner) && REPO.test(repo) && repo !== '.' && repo !== '..';
}

function cleanRepo(repo: string): string {
  return repo.replace(/\.git$/i, '');
}

function decodeSegments(parts: string[]): string {
  return parts
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    })
    .join('/');
}

/**
 * Understands `owner/repo`, github.com URLs (repo, /tree/, /blob/, with or
 * without https://, www., .git, ?query and #hash), git@github.com:owner/repo.git
 * and raw.githubusercontent.com file URLs. Returns null for anything else.
 */
export function parseGitHubInput(input: string): RepoRef | null {
  let s = input.trim();
  if (!s) return null;

  const ssh = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(s);
  if (ssh) return validName(ssh[1]!, ssh[2]!) ? { owner: ssh[1]!, repo: ssh[2]! } : null;

  const short = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(s);
  if (short && !s.includes('.com') && validName(short[1]!, short[2]!)) return { owner: short[1]!, repo: short[2]! };

  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'raw.githubusercontent.com') {
    // /owner/repo/ref/path/to/file.md (also /owner/repo/refs/heads/branch/…)
    if (parts.length < 4) return null;
    const [owner, repo] = parts as [string, string];
    let rest = parts.slice(2);
    let ref = rest[0]!;
    if (ref === 'refs' && rest[1] === 'heads' && rest.length > 3) {
      ref = rest[2]!;
      rest = rest.slice(3);
    } else rest = rest.slice(1);
    return validName(owner, repo) ? { owner, repo, ref: decodeURIComponent(ref), file: decodeSegments(rest) } : null;
  }

  if (host !== 'github.com') return null;
  if (parts.length < 2) return null;
  const owner = parts[0]!;
  const repo = cleanRepo(parts[1]!);
  if (!validName(owner, repo)) return null;
  const kind = parts[2];
  if ((kind === 'blob' || kind === 'raw') && parts.length >= 5) {
    return { owner, repo, ref: decodeURIComponent(parts[3]!), file: decodeSegments(parts.slice(4)) };
  }
  if (kind === 'tree' && parts.length >= 4) {
    const dir = decodeSegments(parts.slice(4));
    return dir ? { owner, repo, ref: decodeURIComponent(parts[3]!), dir } : { owner, repo, ref: decodeURIComponent(parts[3]!) };
  }
  return { owner, repo };
}

/** Canonical short form, e.g. "owner/repo". */
export function repoSlug(ref: Pick<RepoRef, 'owner' | 'repo'>): string {
  return `${ref.owner}/${ref.repo}`;
}

export type GitHubErrorKind = 'not-found' | 'rate-limit' | 'network' | 'forbidden' | 'too-large' | 'invalid' | 'server';

export class GitHubError extends Error {
  constructor(
    public kind: GitHubErrorKind,
    message: string,
    public resetAt: Date | null = null,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface RepoMeta {
  description: string | null;
  stars: number | null;
  forks: number | null;
  language: string | null;
  homepage: string | null;
  topics: string[];
  defaultBranch: string | null;
  avatarUrl: string | null;
  license: string | null;
}

export interface GitHubReadme {
  markdown: string;
  owner: string;
  repo: string;
  /** The ref raw files are served from (branch name or sha). */
  ref: string;
  /** Path of the README inside the repository, e.g. "README.md" or "docs/README.md". */
  path: string;
  htmlUrl: string;
  meta: RepoMeta | null;
}

const API = 'https://api.github.com';
const MAX_BYTES = 2_000_000;

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function apiGet(path: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(`${API}${path}`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new GitHubError('network', 'Could not reach GitHub. Check your connection, or drop the README file instead.');
  }
  return res;
}

function errorFor(res: Response, slug: string): GitHubError {
  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  if (res.status === 429 || (res.status === 403 && remaining === '0')) {
    const resetAt = reset ? new Date(Number(reset) * 1000) : null;
    return new GitHubError(
      'rate-limit',
      `GitHub's hourly limit for anonymous requests is used up${resetAt ? ` — it resets at ${formatTime(resetAt)}` : ''}. Meanwhile, paste the README or drop the file.`,
      resetAt,
    );
  }
  if (res.status === 404) {
    return new GitHubError('not-found', `No README found for ${slug}. Check the spelling — private repositories can't be loaded without signing in.`);
  }
  if (res.status === 403 || res.status === 451) return new GitHubError('forbidden', `GitHub refused access to ${slug}.`);
  return new GitHubError('server', `GitHub answered with an error (${res.status}). Try again in a moment.`);
}

export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join('/');
}

/** Extracts the ref from a contents API download_url, given the known file path. */
export function refFromDownloadUrl(downloadUrl: string, owner: string, repo: string, path: string): string | null {
  const prefix = `https://raw.githubusercontent.com/${owner}/${repo}/`;
  if (!downloadUrl.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  let rest = downloadUrl.slice(prefix.length).split('?')[0]!;
  const encodedPath = encodePath(path);
  for (const suffix of [`/${encodedPath}`, `/${path}`]) {
    if (rest.endsWith(suffix)) {
      rest = rest.slice(0, -suffix.length);
      try {
        return decodeURIComponent(rest.replace(/^refs\/heads\//, ''));
      } catch {
        return rest;
      }
    }
  }
  return null;
}

/** Fetches a README (or the given Markdown file) and the repository's metadata. */
export async function fetchReadme(
  ref: RepoRef,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; withMeta?: boolean } = {},
): Promise<GitHubReadme> {
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  const slug = repoSlug(ref);
  const query = ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : '';
  const path = ref.file
    ? `/repos/${ref.owner}/${ref.repo}/contents/${encodePath(ref.file)}${query}`
    : `/repos/${ref.owner}/${ref.repo}/readme${ref.dir ? `/${encodePath(ref.dir)}` : ''}${query}`;

  const metaPromise = options.withMeta === false ? Promise.resolve(null) : fetchRepoMeta(ref, fetchImpl, options.signal).catch(() => null);
  const res = await apiGet(path, fetchImpl, options.signal);
  if (!res.ok) throw errorFor(res, slug);
  let data: { content?: string; encoding?: string; path?: string; download_url?: string | null; html_url?: string; size?: number; type?: string };
  try {
    data = await res.json();
  } catch {
    throw new GitHubError('invalid', 'GitHub sent something unexpected. Try again.');
  }
  if (data.type && data.type !== 'file') throw new GitHubError('invalid', `${ref.file ?? 'That path'} is not a file.`);
  if ((data.size ?? 0) > MAX_BYTES) throw new GitHubError('too-large', 'That README is larger than 2 MB — too big to render comfortably.');
  let markdown: string;
  if (data.encoding === 'base64' && typeof data.content === 'string') markdown = decodeBase64Utf8(data.content);
  else if (data.download_url) {
    const raw = await fetchImpl(data.download_url, { signal: options.signal });
    if (!raw.ok) throw errorFor(raw, slug);
    markdown = await raw.text();
  } else throw new GitHubError('invalid', 'GitHub did not include the file contents.');

  const filePath = data.path ?? ref.file ?? 'README.md';
  const meta = await metaPromise;
  const usedRef = (data.download_url && refFromDownloadUrl(data.download_url, ref.owner, ref.repo, filePath)) ?? ref.ref ?? meta?.defaultBranch ?? 'HEAD';
  return {
    markdown,
    owner: ref.owner,
    repo: ref.repo,
    ref: usedRef,
    path: filePath,
    htmlUrl: data.html_url ?? `https://github.com/${slug}`,
    meta,
  };
}

export async function fetchRepoMeta(ref: RepoRef, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<RepoMeta | null> {
  const res = await apiGet(`/repos/${ref.owner}/${ref.repo}`, fetchImpl, signal);
  if (!res.ok) return null;
  const d = (await res.json()) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const owner = d.owner as Record<string, unknown> | undefined;
  const license = d.license as Record<string, unknown> | null | undefined;
  return {
    description: str(d.description),
    stars: num(d.stargazers_count),
    forks: num(d.forks_count),
    language: str(d.language),
    homepage: str(d.homepage),
    topics: Array.isArray(d.topics) ? d.topics.filter((t): t is string => typeof t === 'string').slice(0, 12) : [],
    defaultBranch: str(d.default_branch),
    avatarUrl: owner ? str(owner.avatar_url) : null,
    license: license ? str(license.spdx_id) ?? str(license.name) : null,
  };
}

/** Resolves ./ and ../ inside a repository path. Returns null when it escapes the root. */
export function joinRepoPath(dir: string, relative: string): string | null {
  const out: string[] = relative.startsWith('/') ? [] : dir.split('/').filter(Boolean);
  for (const part of relative.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/**
 * Relative links and images in a GitHub README point into the repository:
 * images → raw.githubusercontent.com, links → github.com/…/blob/… (GitHub
 * redirects blob → tree for folders).
 */
export function githubResolver(ctx: { owner: string; repo: string; ref: string; path: string }): UrlResolver {
  const dir = dirname(ctx.path);
  const refPart = ctx.ref
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return (url, kind) => {
    if (!url || url.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(url)) return undefined;
    if (url.startsWith('//')) return `https:${url}`;
    const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(url);
    const rawPath = match?.[1] ?? url;
    const query = match?.[2] ?? '';
    const hash = match?.[3] ?? '';
    let decoded = rawPath;
    try {
      decoded = decodeURI(rawPath);
    } catch {
      /* keep as is */
    }
    const joined = joinRepoPath(dir, decoded);
    if (joined === null) return null;
    const encoded = encodePath(joined);
    if (kind === 'link') {
      if (!joined) return `https://github.com/${ctx.owner}/${ctx.repo}${hash}`;
      return `https://github.com/${ctx.owner}/${ctx.repo}/blob/${refPart}/${encoded}${query}${hash}`;
    }
    const q = query.replace(/[?&]raw=true/, '').replace(/^&/, '?');
    return `https://raw.githubusercontent.com/${ctx.owner}/${ctx.repo}/${refPart}/${encoded}${q === '?' ? '' : q}`;
  };
}
