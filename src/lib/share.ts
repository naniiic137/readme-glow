import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { settingsToParams, type Settings } from './settings';

/**
 * Share links. Small READMEs travel inside the URL hash (compressed with
 * lz-string; the hash is never sent to any server). GitHub READMEs are shared
 * as ?repo=owner/repo so the link always shows the latest version.
 */
export const MAX_HASH_CHARS = 12_000;

export type ShareResult =
  | { ok: true; url: string; compressedLength: number; kind: 'content' | 'repo' }
  | { ok: false; reason: 'too-long'; compressedLength: number };

export function encodeMarkdown(markdown: string): string {
  return compressToEncodedURIComponent(markdown);
}

export function decodeMarkdown(encoded: string): string | null {
  try {
    const out = decompressFromEncodedURIComponent(encoded);
    return typeof out === 'string' && out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function buildShareUrl(
  appUrl: string,
  settings: Settings,
  doc: { markdown: string; repo?: { owner: string; repo: string; ref?: string; file?: string } | null },
): ShareResult {
  const params = settingsToParams(settings);
  if (doc.repo) {
    const url = new URL(appUrl);
    url.search = '';
    url.hash = '';
    const search = new URLSearchParams();
    search.set('repo', `${doc.repo.owner}/${doc.repo.repo}`);
    if (doc.repo.ref) search.set('ref', doc.repo.ref);
    if (doc.repo.file && !/^readme\.(md|markdown)$/i.test(doc.repo.file)) search.set('file', doc.repo.file);
    params.forEach((v, k) => search.set(k, v));
    url.search = search.toString();
    return { ok: true, url: url.toString(), compressedLength: 0, kind: 'repo' };
  }
  const encoded = encodeMarkdown(doc.markdown);
  if (encoded.length > MAX_HASH_CHARS) return { ok: false, reason: 'too-long', compressedLength: encoded.length };
  const url = new URL(appUrl);
  url.search = params.toString();
  url.hash = `md=${encoded}`;
  return { ok: true, url: url.toString(), compressedLength: encoded.length, kind: 'content' };
}

/** Reads a shared README from a location hash like "#md=…". */
export function markdownFromHash(hash: string): string | null {
  const h = hash.replace(/^#/, '');
  const m = /(?:^|&)md=([^&]+)/.exec(h);
  return m ? decodeMarkdown(m[1]!) : null;
}
