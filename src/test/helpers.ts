import { doc, settings, ui, type CurrentDoc, type UiState } from '../app/state';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { sync } from '../app/sync';
import type { RenderOutput } from '../lib/markdown/pipeline';
import type { TocEntry } from '../lib/markdown/types';

const INITIAL_UI: UiState = { ...ui.get() };

/** Puts every app store back to its initial state (call in beforeEach). */
export function resetStores(markdown = ''): void {
  ui.set({ ...INITIAL_UI, toasts: [] });
  settings.set({ ...DEFAULT_SETTINGS });
  doc.reset(markdown);
  sync.editor = null;
  sync.preview = null;
  sync.source = null;
}

/** An open document without touching IndexedDB. */
export function fakeCurrentDoc(patch: Partial<CurrentDoc> = {}): CurrentDoc {
  return {
    id: 'doc-1',
    title: 'Test README',
    source: { kind: 'paste' },
    baseDir: '',
    assets: new Map(),
    blobs: new Map(),
    meta: null,
    assetsVersion: 1,
    ...patch,
  };
}

/** A minimal render result (only what the components under test read). */
export function fakeRender(toc: TocEntry[] = [], patch: Partial<RenderOutput> = {}): RenderOutput {
  return {
    html: '',
    toc,
    meta: { title: 'Test README', description: null, badges: [] },
    stats: { words: 10, readingMinutes: 1 },
    features: { math: false, mermaid: false, code: false },
    ms: 1,
    tree: { type: 'root', children: [] },
    ...patch,
  } as unknown as RenderOutput;
}

/** Messages of the toasts currently shown. */
export function toastMessages(): string[] {
  return ui.get().toasts.map((t) => t.message);
}

/** A File with the given text (jsdom's File supports text()). */
export function textFile(name: string, text: string, type = 'text/markdown'): File {
  return new File([text], name, { type });
}

/** A tiny fake PNG. */
export function pngFile(name: string): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], name, { type: 'image/png' });
}
