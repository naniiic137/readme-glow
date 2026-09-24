/**
 * The document library: every README you open or write, with its images,
 * saved in this browser (IndexedDB). Nothing leaves the device.
 * Falls back to memory when IndexedDB is unavailable (e.g. some private modes).
 */

export type DocSource =
  | { kind: 'new' }
  | { kind: 'file'; name: string }
  | { kind: 'folder'; name: string }
  | { kind: 'paste' }
  | { kind: 'github'; owner: string; repo: string; ref: string; path: string }
  | { kind: 'sample'; id: string }
  | { kind: 'template'; id: string }
  | { kind: 'share' };

export interface DocRecord {
  id: string;
  title: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
  source: DocSource;
  /** Folder of the README relative to the dropped project root ('' for none). */
  baseDir: string;
  /** Has the user changed it since it was opened? */
  edited: boolean;
  /** Paths of stored images (root-relative, e.g. "docs/shot.png", "images/paste-1.png"). */
  assetPaths: string[];
  /** Words, for the library list. */
  words?: number;
}

export type DocSummary = Omit<DocRecord, 'markdown'>;

export interface AssetRecord {
  key: string;
  docId: string;
  path: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
}

export const DOC_CAP = 60;

export function newId(): string {
  const bytes = new Uint8Array(9);
  (globalThis.crypto ?? { getRandomValues: (b: Uint8Array) => b.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 14);
}

export function sourceKey(source: DocSource): string | null {
  switch (source.kind) {
    case 'github':
      return `github:${source.owner}/${source.repo}:${source.path}`.toLowerCase();
    case 'sample':
      return `sample:${source.id}`;
    default:
      return null;
  }
}

export function titleFromMarkdown(markdown: string, fallback = 'Untitled README'): string {
  const atx = /^\s{0,3}#\s+(.+?)\s*#*\s*$/m.exec(markdown);
  const html = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(markdown);
  const setext = /^(?!\s*$)(.+)\n=+\s*$/m.exec(markdown);
  const raw = [atx?.[1], html?.[1], setext?.[1]].find((t) => t && t.replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, '$1').replace(/<[^>]+>/g, '').trim());
  if (!raw) return fallback;
  const clean = raw
    .replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, 80) || fallback;
}

export interface LibraryBackend {
  getAllDocs(): Promise<DocRecord[]>;
  getDoc(id: string): Promise<DocRecord | undefined>;
  putDoc(doc: DocRecord): Promise<void>;
  deleteDoc(id: string): Promise<void>;
  getAssets(docId: string): Promise<AssetRecord[]>;
  putAsset(asset: AssetRecord): Promise<void>;
  deleteAssets(docId: string): Promise<void>;
  clear(): Promise<void>;
}

export class Library {
  constructor(private backend: LibraryBackend) {}

  static async open(factory: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null): Promise<Library> {
    if (factory) {
      try {
        return new Library(await IdbBackend.open(factory));
      } catch {
        /* fall through to memory */
      }
    }
    return new Library(new MemoryBackend());
  }

  static memory(): Library {
    return new Library(new MemoryBackend());
  }

  async list(): Promise<DocSummary[]> {
    const docs = await this.backend.getAllDocs();
    return docs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ markdown: _markdown, ...rest }) => rest);
  }

  get(id: string): Promise<DocRecord | undefined> {
    return this.backend.getDoc(id);
  }

  async findBySource(source: DocSource): Promise<DocRecord | undefined> {
    const key = sourceKey(source);
    if (!key) return undefined;
    const docs = await this.backend.getAllDocs();
    return docs.filter((d) => sourceKey(d.source) === key).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }

  async create(input: { markdown: string; source: DocSource; title?: string; baseDir?: string; now?: number }): Promise<DocRecord> {
    const now = input.now ?? Date.now();
    const doc: DocRecord = {
      id: newId(),
      title: input.title ?? titleFromMarkdown(input.markdown),
      markdown: input.markdown,
      createdAt: now,
      updatedAt: now,
      source: input.source,
      baseDir: input.baseDir ?? '',
      edited: false,
      assetPaths: [],
      words: countWords(input.markdown),
    };
    await this.backend.putDoc(doc);
    await this.enforceCap();
    return doc;
  }

  async save(doc: DocRecord): Promise<void> {
    await this.backend.putDoc({ ...doc, words: countWords(doc.markdown) });
  }

  async updateMarkdown(id: string, markdown: string, now = Date.now()): Promise<DocRecord | undefined> {
    const doc = await this.backend.getDoc(id);
    if (!doc) return undefined;
    const next: DocRecord = {
      ...doc,
      markdown,
      updatedAt: now,
      edited: doc.edited || doc.markdown !== markdown,
      words: countWords(markdown),
      title: doc.title === titleFromMarkdown(doc.markdown) ? titleFromMarkdown(markdown, doc.title) : doc.title,
    };
    await this.backend.putDoc(next);
    return next;
  }

  async rename(id: string, title: string): Promise<void> {
    const doc = await this.backend.getDoc(id);
    if (!doc) return;
    await this.backend.putDoc({ ...doc, title: title.trim().slice(0, 120) || doc.title, updatedAt: Date.now() });
  }

  async duplicate(id: string): Promise<DocRecord | undefined> {
    const doc = await this.backend.getDoc(id);
    if (!doc) return undefined;
    const now = Date.now();
    const copy: DocRecord = { ...doc, id: newId(), title: `${doc.title} (copy)`, createdAt: now, updatedAt: now, edited: true };
    if (copy.source.kind === 'github' || copy.source.kind === 'sample') copy.source = { kind: 'new' };
    await this.backend.putDoc(copy);
    for (const asset of await this.backend.getAssets(id)) {
      await this.backend.putAsset({ ...asset, docId: copy.id, key: assetKey(copy.id, asset.path) });
    }
    await this.enforceCap();
    return copy;
  }

  async remove(id: string): Promise<void> {
    await this.backend.deleteAssets(id);
    await this.backend.deleteDoc(id);
  }

  async clear(): Promise<void> {
    await this.backend.clear();
  }

  async addAsset(docId: string, path: string, blob: Blob, name: string): Promise<void> {
    await this.backend.putAsset({ key: assetKey(docId, path), docId, path, blob, name, type: blob.type, size: blob.size });
    const doc = await this.backend.getDoc(docId);
    if (doc && !doc.assetPaths.includes(path)) {
      await this.backend.putDoc({ ...doc, assetPaths: [...doc.assetPaths, path] });
    }
  }

  assets(docId: string): Promise<AssetRecord[]> {
    return this.backend.getAssets(docId);
  }

  /** Keeps the library to the newest DOC_CAP documents. */
  async enforceCap(cap = DOC_CAP): Promise<number> {
    const docs = (await this.backend.getAllDocs()).sort((a, b) => b.updatedAt - a.updatedAt);
    const extra = docs.slice(cap);
    for (const d of extra) await this.remove(d.id);
    return extra.length;
  }
}

export function assetKey(docId: string, path: string): string {
  return `${docId}\u0000${path}`;
}

function countWords(markdown: string): number {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// ------------------------------------------------------------------ backends

class MemoryBackend implements LibraryBackend {
  private docs = new Map<string, DocRecord>();
  private assetMap = new Map<string, AssetRecord>();
  async getAllDocs() {
    return [...this.docs.values()].map((d) => ({ ...d }));
  }
  async getDoc(id: string) {
    const d = this.docs.get(id);
    return d ? { ...d } : undefined;
  }
  async putDoc(doc: DocRecord) {
    this.docs.set(doc.id, { ...doc });
  }
  async deleteDoc(id: string) {
    this.docs.delete(id);
  }
  async getAssets(docId: string) {
    return [...this.assetMap.values()].filter((a) => a.docId === docId);
  }
  async putAsset(asset: AssetRecord) {
    this.assetMap.set(asset.key, asset);
  }
  async deleteAssets(docId: string) {
    for (const [k, a] of this.assetMap) if (a.docId === docId) this.assetMap.delete(k);
  }
  async clear() {
    this.docs.clear();
    this.assetMap.clear();
  }
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });
}

class IdbBackend implements LibraryBackend {
  private constructor(private db: IDBDatabase) {}

  static open(factory: IDBFactory): Promise<IdbBackend> {
    return new Promise((resolve, reject) => {
      const r = factory.open('readme-glow', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) {
          const s = db.createObjectStore('assets', { keyPath: 'key' });
          s.createIndex('docId', 'docId');
        }
      };
      r.onsuccess = () => resolve(new IdbBackend(r.result));
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('blocked'));
    });
  }

  async getAllDocs() {
    const tx = this.db.transaction('docs', 'readonly');
    return req(tx.objectStore('docs').getAll() as IDBRequest<DocRecord[]>);
  }
  async getDoc(id: string) {
    const tx = this.db.transaction('docs', 'readonly');
    return req(tx.objectStore('docs').get(id) as IDBRequest<DocRecord | undefined>);
  }
  async putDoc(doc: DocRecord) {
    const tx = this.db.transaction('docs', 'readwrite');
    tx.objectStore('docs').put(doc);
    await done(tx);
  }
  async deleteDoc(id: string) {
    const tx = this.db.transaction('docs', 'readwrite');
    tx.objectStore('docs').delete(id);
    await done(tx);
  }
  async getAssets(docId: string) {
    const tx = this.db.transaction('assets', 'readonly');
    return req(tx.objectStore('assets').index('docId').getAll(docId) as IDBRequest<AssetRecord[]>);
  }
  async putAsset(asset: AssetRecord) {
    const tx = this.db.transaction('assets', 'readwrite');
    tx.objectStore('assets').put(asset);
    await done(tx);
  }
  async deleteAssets(docId: string) {
    const tx = this.db.transaction('assets', 'readwrite');
    const index = tx.objectStore('assets').index('docId');
    const keys = await req(index.getAllKeys(docId));
    for (const k of keys) tx.objectStore('assets').delete(k);
    await done(tx);
  }
  async clear() {
    const tx = this.db.transaction(['docs', 'assets'], 'readwrite');
    tx.objectStore('docs').clear();
    tx.objectStore('assets').clear();
    await done(tx);
  }
}

// ------------------------------------------------------------------ autosave

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

/**
 * Debounced autosave. `schedule(text)` after every edit; the latest text is
 * written `delay` ms after typing stops (and at most every `maxWait` ms while
 * typing continuously). `flush()` writes immediately (on blur/unload).
 */
export function createAutosaver(save: (text: string) => Promise<void>, opts: { delay?: number; maxWait?: number; onState?: (s: SaveState) => void } = {}) {
  const delay = opts.delay ?? 600;
  const maxWait = opts.maxWait ?? 4000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstPending = 0;
  let latest: string | null = null;
  let running: Promise<void> | null = null;
  let state: SaveState = 'saved';
  const set = (s: SaveState) => {
    state = s;
    opts.onState?.(s);
  };

  const run = async (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (latest === null) return;
    if (running) await running;
    if (latest === null) return;
    const text = latest;
    latest = null;
    firstPending = 0;
    set('saving');
    running = save(text)
      .then(() => set(latest === null ? 'saved' : 'pending'))
      .catch(() => set('error'))
      .finally(() => {
        running = null;
      });
    await running;
  };

  return {
    schedule(text: string) {
      latest = text;
      const now = Date.now();
      if (!firstPending) firstPending = now;
      if (timer) clearTimeout(timer);
      const wait = Math.max(0, Math.min(delay, maxWait - (now - firstPending)));
      timer = setTimeout(() => void run(), wait);
      if (state !== 'saving') set('pending');
    },
    flush: run,
    get state() {
      return state;
    },
    get pending() {
      return latest !== null || state === 'saving';
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      latest = null;
      firstPending = 0;
    },
  };
}
