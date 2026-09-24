import { strToU8, zipSync, type Zippable } from 'fflate';
import type { GhAsset } from './transform';

export interface ExtraFile {
  path: string;
  data: Uint8Array;
}

/** Normalises a path inside the zip: forward slashes, no leading slash, no "..". Null if unsafe. */
export function zipPath(path: string): string | null {
  const parts = path.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  if (!parts.length || parts.some((p) => p === '..')) return null;
  return parts.join('/');
}

/**
 * The GitHub export as a .zip: README.md at the root and the images in their
 * folder (by default .github/readmeglow/), ready to unzip into a repository.
 * Local images the README already uses can be included as well.
 */
export function buildGitHubZip(markdown: string, assets: readonly GhAsset[], extra: readonly ExtraFile[] = [], readmeName = 'README.md'): Uint8Array {
  const files: Zippable = {};
  const add = (path: string, data: Uint8Array) => {
    const p = zipPath(path);
    if (p && !(p in files)) files[p] = [data, { level: 9 }];
  };
  add(readmeName, strToU8(markdown));
  for (const a of assets) add(a.path, strToU8(a.svg));
  for (const f of extra) add(f.path, f.data);
  return zipSync(files);
}

export function byteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
}
