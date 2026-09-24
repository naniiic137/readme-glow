import type { UrlResolver } from './markdown/types';

/** A file from a drop or a picker, with its path inside the dropped folder. */
export interface LocalFile {
  path: string;
  file: File;
}

export interface LocalBundle {
  readme: LocalFile | null;
  /** Folder of the README inside the bundle ('' for the root). */
  baseDir: string;
  images: LocalFile[];
  /** Files ignored (too big, too many, not images, build folders). */
  skipped: number;
}

export const MARKDOWN_EXT = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;
export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const IGNORED_DIRS = /(^|\/)(node_modules|\.git|dist|build|target|\.next|\.venv|venv|__pycache__|vendor)(\/|$)/;
export const MAX_IMAGES = 80;
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
export const MAX_MARKDOWN_BYTES = 3 * 1024 * 1024;

export function isMarkdownName(name: string): boolean {
  return MARKDOWN_EXT.test(name);
}

export function isImageFile(f: { name: string; type?: string }): boolean {
  return IMAGE_EXT.test(f.name) || (!!f.type && f.type.startsWith('image/'));
}

/** Normalises a path: forward slashes, no ./, resolves ../, no leading slash. Null if it escapes the root. */
export function normalisePath(path: string): string | null {
  const out: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

export function dirOf(path: string): string {
  const n = normalisePath(path) ?? '';
  const i = n.lastIndexOf('/');
  return i === -1 ? '' : n.slice(0, i);
}

function depth(path: string): number {
  return path.split('/').length;
}

/** README.md at the shallowest level wins, then other README variants, then any Markdown file. */
export function chooseReadme(files: LocalFile[]): LocalFile | null {
  const md = files.filter((f) => isMarkdownName(f.path) && !IGNORED_DIRS.test(f.path));
  if (!md.length) return null;
  const score = (f: LocalFile): number => {
    const name = f.path.split('/').pop()!.toLowerCase();
    let s = depth(f.path) * 10;
    if (name === 'readme.md') s += 0;
    else if (/^readme\.(markdown|mdown|mkd|mdx)$/.test(name)) s += 1;
    else if (name.startsWith('readme')) s += 2;
    else if (/\.(md|markdown)$/.test(name)) s += 5;
    else s += 8;
    return s;
  };
  return [...md].sort((a, b) => score(a) - score(b) || a.path.localeCompare(b.path))[0] ?? null;
}

/**
 * Picks the README and the images that come with it from a dropped folder,
 * skipping build folders and anything too large.
 */
export function bundleFromFiles(files: LocalFile[]): LocalBundle {
  const readme = chooseReadme(files);
  const images: LocalFile[] = [];
  let bytes = 0;
  let skipped = 0;
  for (const f of files) {
    if (f === readme) continue;
    if (IGNORED_DIRS.test(f.path) || !isImageFile({ name: f.path, type: f.file.type })) {
      skipped++;
      continue;
    }
    if (images.length >= MAX_IMAGES || bytes + f.file.size > MAX_IMAGE_BYTES) {
      skipped++;
      continue;
    }
    bytes += f.file.size;
    images.push({ path: normalisePath(f.path) ?? f.path, file: f.file });
  }
  // If the drop was a single folder, strip its name so paths are relative to the project root.
  const top = readme ? readme.path.split('/')[0] : null;
  const allUnder = !!top && readme!.path.includes('/') && files.every((f) => f.path.startsWith(`${top}/`));
  const strip = (p: string) => (allUnder ? p.slice(top!.length + 1) : p);
  return {
    readme: readme ? { path: strip(normalisePath(readme.path) ?? readme.path), file: readme.file } : null,
    baseDir: readme ? dirOf(strip(normalisePath(readme.path) ?? readme.path)) : '',
    images: images.map((i) => ({ path: strip(i.path), file: i.file })),
    skipped,
  };
}

/** Where a relative URL in the README points inside the bundle (root-relative), or null. */
export function resolveLocalPath(url: string, baseDir: string): string | null {
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#') || url.startsWith('//')) return null;
  let clean = url.split('#')[0]!.split('?')[0]!;
  try {
    clean = decodeURI(clean);
  } catch {
    /* keep */
  }
  if (clean.startsWith('/')) return normalisePath(clean);
  return normalisePath(baseDir ? `${baseDir}/${clean}` : clean);
}

/**
 * Resolver for local documents: relative images are served from object URLs
 * of the dropped/pasted files; unknown ones become a friendly placeholder.
 * `fallbackBase` (e.g. the site's samples folder) is used for built-in samples.
 */
export function localResolver(assets: ReadonlyMap<string, string>, baseDir: string, fallbackBase?: string): UrlResolver {
  return (url, kind) => {
    if (kind === 'link') return undefined;
    const path = resolveLocalPath(url, baseDir);
    if (path === null) return undefined;
    const hit = assets.get(path) ?? assets.get(path.toLowerCase());
    if (hit) return hit;
    if (fallbackBase) return `${fallbackBase}${path.split('/').map(encodeURIComponent).join('/')}`;
    return null;
  };
}

/** Reads every file in a drop, walking folders (Chrome, Edge, Firefox, Safari). */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<LocalFile[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((item) => (item.kind === 'file' && 'webkitGetAsEntry' in item ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return Array.from(dt.files ?? []).map((file) => ({ path: file.name, file }));
  const out: LocalFile[] = [];
  let budget = 5000;
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (budget-- <= 0) return;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ path, file });
    } else if (entry.isDirectory) {
      if (IGNORED_DIRS.test(`${path}/`)) return;
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child, path);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

/** Files from an <input type="file"> (with or without webkitdirectory). */
export function filesFromInput(list: FileList | File[]): LocalFile[] {
  return Array.from(list).map((file) => ({ path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, file }));
}

/** A tidy, unique name for a pasted or dropped image, e.g. images/screenshot-2.png. */
export function uniqueImagePath(name: string, taken: ReadonlySet<string>, folder = 'images'): string {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? 'png').toLowerCase();
  const base =
    name
      .replace(/\.[^.]+$/, '')
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .replace(/[^\w-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'image';
  let candidate = `${folder}/${base}.${ext}`;
  let n = 2;
  while (taken.has(candidate)) candidate = `${folder}/${base}-${n++}.${ext}`;
  return candidate;
}
