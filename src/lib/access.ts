import { parseGitHubInput, type RepoRef } from './github';

/**
 * Ways to reach a README in ReadmeGlow:
 * - pretty links:  /readme-glow/owner/repo  and  /readme-glow/github.com/owner/repo
 *   (GitHub Pages serves 404.html, a copy of the app, for any unknown path)
 * - ?repo=owner/repo (still works)
 * - a per-repository redirect page (index.html) and a bookmarklet.
 */

/** First path segments that belong to the app itself, never to a repository. */
const APP_PATHS = new Set(['assets', 'samples', 'index.html', '404.html', 'favicon.svg', 'og.png', 'badge.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'robots.txt', '.nojekyll']);

/** github.com paths that are not repositories. */
const GITHUB_PAGES = new Set([
  'about', 'apps', 'codespaces', 'collections', 'contact', 'enterprise', 'explore', 'features', 'issues', 'login', 'logout', 'marketplace',
  'new', 'notifications', 'orgs', 'organizations', 'pricing', 'pulls', 'search', 'settings', 'signup', 'sponsors', 'topics', 'trending', 'users',
]);

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * The repository a pretty path points at, or null. `base` is the app's base
 * path ("/readme-glow/"). Accepts owner/repo, github.com/owner/repo and full
 * github.com URLs pasted after the base, with /tree/… or /blob/… parts.
 */
export function parsePrettyPath(pathname: string, base = '/'): RepoRef | null {
  const b = base.endsWith('/') ? base : `${base}/`;
  if (!pathname.startsWith(b)) return null;
  let rest = safeDecode(pathname.slice(b.length)).replace(/^\/+|\/+$/g, '');
  if (!rest) return null;
  // Browsers squash "https://" to "https:/" inside a path.
  rest = rest.replace(/^https?:\/+/i, '').replace(/^(www\.)?github\.com\//i, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0]!.toLowerCase();
  if (APP_PATHS.has(first) || GITHUB_PAGES.has(first)) return null;
  const ref = parseGitHubInput(`https://github.com/${parts.map(encodeURIComponent).join('/')}`);
  return ref;
}

/** The app's own URL, e.g. https://naniiic137.github.io/readme-glow/ */
export function appUrl(origin: string, base: string): string {
  return `${origin.replace(/\/+$/, '')}${base.startsWith('/') ? base : `/${base}`}`.replace(/([^/])$/, '$1/');
}

/** Pretty link for a repository (with its branch and file when given). */
export function prettyRepoUrl(ref: RepoRef, app: string): string {
  const seg = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  let path = `${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  if (ref.file && ref.ref) path += `/blob/${seg(ref.ref)}/${seg(ref.file)}`;
  else if (ref.ref) path += `/tree/${seg(ref.ref)}${ref.dir ? `/${seg(ref.dir)}` : ''}`;
  return `${app}${path}`;
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A string literal safe to put inside <script>. */
function scriptString(text: string): string {
  const bs = String.fromCharCode(92);
  return JSON.stringify(text).replace(/</g, `${bs}u003c`).replace(/>/g, `${bs}u003e`);
}

/**
 * A tiny index.html for a repository's own GitHub Pages site that forwards to
 * its README in ReadmeGlow: meta refresh, a script (keeps the #hash) and a
 * plain link for everything else.
 */
export function redirectHtml(ref: RepoRef, target: string): string {
  const name = `${ref.owner}/${ref.repo}`;
  const t = escapeAttr(target);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(name)} · README</title>
<meta http-equiv="refresh" content="0; url=${t}">
<link rel="canonical" href="${t}">
<meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;background:#0d1117;color:#e6edf3}a{color:#a78bfa}</style>
</head>
<body>
<p>Opening the README of <strong>${escapeAttr(name)}</strong>… <a href="${t}">Continue</a></p>
<script>location.replace(${scriptString(target)} + location.hash);</script>
</body>
</html>
`;
}

// ------------------------------------------------------------------ bookmarklet

/**
 * Where the bookmarklet goes from a page URL: only github.com repository
 * pages are accepted (anything else returns null and the bookmarklet says so).
 */
export function bookmarkletTarget(pageUrl: string, app: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  if (GITHUB_PAGES.has(parts[0]!.toLowerCase())) return null;
  if (!/^[A-Za-z0-9-]{1,39}$/.test(parts[0]!) || !/^[A-Za-z0-9._-]{1,100}$/.test(parts[1]!)) return null;
  const keep = parts[2] === 'tree' || parts[2] === 'blob' ? parts : parts.slice(0, 2);
  return `${app}${keep.join('/')}`;
}

/**
 * Bookmarklet source (the same rules as bookmarkletTarget, as one expression).
 * Drag it to the bookmarks bar; click it on a github.com repository page.
 */
export function bookmarkletCode(app: string): string {
  const pages = JSON.stringify([...GITHUB_PAGES]);
  const code =
    `(()=>{const u=new URL(location.href),p=u.pathname.split('/').filter(Boolean),no=()=>alert('ReadmeGlow: open a github.com repository page first.');` +
    `if(u.protocol!=='https:'||u.hostname!=='github.com'||p.length<2||${pages}.includes(p[0].toLowerCase())||!/^[A-Za-z0-9-]{1,39}$/.test(p[0])||!/^[A-Za-z0-9._-]{1,100}$/.test(p[1]))return no();` +
    `location.href=${JSON.stringify(app)}+(p[2]==='tree'||p[2]==='blob'?p:p.slice(0,2)).join('/')})()`;
  return `javascript:${encodeURIComponent(code)}`;
}
