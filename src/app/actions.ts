import { doc, ui, toast, settings, setSettings, type CurrentDoc } from './state';
import { Library, createAutosaver, titleFromMarkdown, type DocRecord, type DocSource } from '../lib/storage/library';
import { bundleFromFiles, isImageFile, isMarkdownName, MAX_MARKDOWN_BYTES, uniqueImagePath, type LocalFile } from '../lib/localFiles';
import { fetchReadme, GitHubError, parseGitHubInput, type RepoRef } from '../lib/github';
import { getSample } from '../samples';
import { safeLocalStorage } from '../lib/settings';

const LAST_DOC_KEY = 'readme-glow:last-doc';

let libraryPromise: Promise<Library> | null = null;
export function library(): Promise<Library> {
  libraryPromise ??= Library.open();
  return libraryPromise;
}

function rememberLastDoc(id: string | null): void {
  try {
    const ls = safeLocalStorage();
    if (id) ls?.setItem(LAST_DOC_KEY, id);
    else ls?.removeItem(LAST_DOC_KEY);
  } catch {
    /* private mode */
  }
}

export function lastDocId(): string | null {
  try {
    return safeLocalStorage()?.getItem(LAST_DOC_KEY) ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ autosave

const saver = createAutosaver(
  async (text) => {
    const current = ui.get().doc;
    if (!current) return;
    const lib = await library();
    const updated = await lib.updateMarkdown(current.id, text);
    if (updated && ui.get().doc?.id === current.id && updated.title !== current.title) {
      ui.set({ doc: { ...current, title: updated.title } });
    }
  },
  { delay: 700, maxWait: 5000, onState: (saveState) => ui.set({ saveState }) },
);

doc.subscribe((tx) => {
  if (tx.origin === 'load') return;
  if (ui.get().doc) saver.schedule(tx.text);
});

export function flushSave(): Promise<void> {
  return saver.flush();
}

export function hasUnsavedChanges(): boolean {
  return saver.pending;
}

// ------------------------------------------------------------------ opening documents

function revokeAssets(current: CurrentDoc | null): void {
  if (!current) return;
  for (const url of current.assets.values()) URL.revokeObjectURL(url);
}

function sampleBase(id: string): string {
  return `${import.meta.env.BASE_URL}samples/${id}/`;
}

async function activate(record: DocRecord, extra: Partial<CurrentDoc> = {}): Promise<void> {
  await saver.flush();
  const lib = await library();
  const assets = new Map<string, string>();
  const blobs = new Map<string, Blob>();
  for (const a of await lib.assets(record.id)) {
    blobs.set(a.path, a.blob);
    assets.set(a.path, URL.createObjectURL(a.blob));
  }
  revokeAssets(ui.get().doc);
  const current: CurrentDoc = {
    id: record.id,
    title: record.title,
    source: record.source,
    baseDir: record.baseDir,
    assets,
    blobs,
    meta: null,
    sampleBase: record.source.kind === 'sample' ? sampleBase(record.source.id) : undefined,
    assetsVersion: 1,
    ...extra,
  };
  doc.reset(record.markdown);
  ui.set({ doc: current, render: null, loading: null, visualEdit: false, findOpen: false, saveState: 'saved', mobileTab: 'preview' });
  rememberLastDoc(record.id);
  document.title = `${record.title} — ReadmeGlow`;
}

export interface OpenOptions {
  source: DocSource;
  baseDir?: string;
  title?: string;
  images?: LocalFile[];
  meta?: CurrentDoc['meta'];
}

/** Opens Markdown as a document (saved to the library). */
export async function openMarkdown(markdown: string, options: OpenOptions): Promise<void> {
  const lib = await library();
  const existing = await lib.findBySource(options.source);
  let record: DocRecord;
  if (existing && existing.edited) {
    // Keep the user's edits; offer the fresh version.
    record = existing;
    await activate(record, { meta: options.meta ?? null });
    toast('Opened your edited copy of this README.', 'info', {
      action: {
        label: 'Load the original',
        run: () => void createAndOpen(markdown, options),
      },
    });
    return;
  }
  if (existing) {
    record = { ...existing, markdown, updatedAt: Date.now(), title: options.title ?? titleFromMarkdown(markdown, existing.title), source: options.source };
    await lib.save(record);
  } else {
    record = await lib.create({ markdown, source: options.source, title: options.title, baseDir: options.baseDir });
  }
  if (options.images?.length) {
    for (const img of options.images) await lib.addAsset(record.id, img.path, img.file, img.file.name);
    record = (await lib.get(record.id)) ?? record;
  }
  await activate(record, { meta: options.meta ?? null });
}

async function createAndOpen(markdown: string, options: OpenOptions): Promise<void> {
  const lib = await library();
  let record = await lib.create({ markdown, source: options.source, title: options.title, baseDir: options.baseDir });
  if (options.images?.length) {
    for (const img of options.images) await lib.addAsset(record.id, img.path, img.file, img.file.name);
    record = (await lib.get(record.id)) ?? record;
  }
  await activate(record, { meta: options.meta ?? null });
}

export async function openFromLibrary(id: string): Promise<boolean> {
  const lib = await library();
  const record = await lib.get(id);
  if (!record) return false;
  await activate(record);
  if (record.source.kind === 'github') {
    const { owner, repo } = record.source;
    void import('../lib/github').then(({ fetchRepoMeta }) =>
      fetchRepoMeta({ owner, repo }, fetch.bind(globalThis))
        .then((meta) => {
          const cur = ui.get().doc;
          if (cur?.id === id) ui.set({ doc: { ...cur, meta } });
        })
        .catch(() => undefined),
    );
  }
  return true;
}

/** Files from a drop, the file picker or the folder picker. */
export async function openFiles(files: LocalFile[]): Promise<void> {
  if (!files.length) return;
  const bundle = bundleFromFiles(files);
  if (!bundle.readme) {
    const images = files.filter((f) => isImageFile({ name: f.path, type: f.file.type }));
    if (images.length && ui.get().doc) {
      await addImagesToDoc(images.map((f) => f.file));
      return;
    }
    toast('No Markdown file found. Drop a README.md (or a project folder that contains one).', 'error');
    return;
  }
  if (bundle.readme.file.size > MAX_MARKDOWN_BYTES) {
    toast('That file is larger than 3 MB — too big for a README.', 'error');
    return;
  }
  const markdown = await bundle.readme.file.text();
  const isFolder = files.every((f) => f.path.includes('/'));
  const name = isFolder ? (files[0]!.path.split('/')[0] ?? bundle.readme.file.name) : bundle.readme.file.name;
  await createAndOpen(markdown, {
    source: isFolder ? { kind: 'folder', name } : { kind: 'file', name: bundle.readme.file.name },
    baseDir: bundle.baseDir,
    images: bundle.images,
  });
  const n = bundle.images.length;
  toast(isFolder ? `Opened ${bundle.readme.path}${n ? ` with ${n} image${n === 1 ? '' : 's'}` : ''}.` : `Opened ${bundle.readme.file.name}.`, 'success');
}

export async function openPasted(markdown: string): Promise<void> {
  if (!markdown.trim()) return;
  await createAndOpen(markdown, { source: { kind: 'paste' } });
}

let githubAbort: AbortController | null = null;

export async function openGitHub(input: string | RepoRef): Promise<boolean> {
  const ref = typeof input === 'string' ? parseGitHubInput(input) : input;
  if (!ref) {
    toast('That doesn’t look like a GitHub repository. Try owner/repo or a github.com link.', 'error');
    return false;
  }
  githubAbort?.abort();
  githubAbort = new AbortController();
  ui.set({ loading: `Fetching ${ref.owner}/${ref.repo} from GitHub…` });
  try {
    const r = await fetchReadme(ref, { signal: githubAbort.signal });
    await openMarkdown(r.markdown, {
      source: { kind: 'github', owner: r.owner, repo: r.repo, ref: r.ref, path: r.path },
      meta: r.meta,
      title: titleFromMarkdown(r.markdown, r.repo),
    });
    return true;
  } catch (err) {
    ui.set({ loading: null });
    if ((err as Error).name === 'AbortError') return false;
    toast(err instanceof GitHubError ? err.message : 'Something went wrong while loading from GitHub.', 'error', { timeout: 9000 });
    return false;
  }
}

export async function openSample(id: string): Promise<void> {
  const sample = getSample(id);
  if (!sample) return;
  await openMarkdown(sample.markdown, { source: { kind: 'sample', id }, title: sample.title });
}

export async function newDocument(markdown: string, source: DocSource = { kind: 'new' }): Promise<void> {
  await createAndOpen(markdown, { source });
}

export async function closeDocument(): Promise<void> {
  await saver.flush();
  revokeAssets(ui.get().doc);
  ui.set({ doc: null, render: null, panel: null, visualEdit: false, focusMode: false, findOpen: false });
  doc.reset('');
  rememberLastDoc(null);
  document.title = 'ReadmeGlow — make any README beautiful';
}

// ------------------------------------------------------------------ images inside documents

/**
 * Stores images (pasted or dropped into the editor) with the document and
 * returns the Markdown to insert. Paths are relative (images/…), so the
 * README stays portable and the .zip export contains the files.
 */
export async function addImagesToDoc(files: File[]): Promise<string[]> {
  const current = ui.get().doc;
  if (!current) return [];
  const lib = await library();
  const taken = new Set(current.assets.keys());
  const snippets: string[] = [];
  const assets = new Map(current.assets);
  const blobs = new Map(current.blobs);
  for (const file of files) {
    if (!isImageFile(file)) continue;
    if (file.size > 15 * 1024 * 1024) {
      toast(`${file.name} is larger than 15 MB and was skipped.`, 'error');
      continue;
    }
    const rel = uniqueImagePath(file.name || 'pasted-image.png', taken);
    taken.add(rel);
    // Stored root-relative, referenced relative to the README's folder.
    const rootPath = current.baseDir ? `${current.baseDir}/${rel}` : rel;
    await lib.addAsset(current.id, rootPath, file, file.name);
    assets.set(rootPath, URL.createObjectURL(file));
    blobs.set(rootPath, file);
    const alt = (file.name || 'image').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'image';
    snippets.push(`![${alt}](${rel})`);
  }
  ui.set({ doc: { ...current, assets, blobs, assetsVersion: current.assetsVersion + 1 } });
  return snippets;
}

// ------------------------------------------------------------------ startup

let started: Promise<void> | null = null;

/** Deep links (?repo=, ?sample=, #md=), otherwise the last open document. Runs once. */
export function startup(): Promise<void> {
  started ??= runStartup();
  return started;
}

/** For tests: allow startup to run again. */
export function resetStartup(): void {
  started = null;
}

async function runStartup(): Promise<void> {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const { settingsFromParams } = await import('../lib/settings');
  const fromUrl = settingsFromParams(params, settings.get());
  if (fromUrl !== settings.get()) setSettings(fromUrl);

  if (url.hash.includes('md=')) {
    const { markdownFromHash } = await import('../lib/share');
    const md = markdownFromHash(url.hash);
    history.replaceState(null, '', `${url.pathname}${url.search}`);
    if (md) {
      await createAndOpen(md, { source: { kind: 'share' } });
      return;
    }
    toast('That share link is damaged or incomplete.', 'error');
  }
  const repo = params.get('repo');
  if (repo) {
    const ref = parseGitHubInput(repo);
    if (ref) {
      const branch = params.get('ref');
      const file = params.get('file');
      await openGitHub({ ...ref, ...(branch ? { ref: branch } : {}), ...(file ? { file } : {}) });
      return;
    }
  }
  const sample = params.get('sample');
  if (sample && getSample(sample)) {
    await openSample(sample);
    return;
  }
  const last = lastDocId();
  if (last && !params.has('home')) await openFromLibrary(last);
}

export function isMarkdownFile(name: string): boolean {
  return isMarkdownName(name);
}
