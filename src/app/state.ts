import { createStore } from './store';
import { DocStore } from '../lib/docStore';
import { loadSettings, saveSettings, type Settings } from '../lib/settings';
import type { DocSource, SaveState } from '../lib/storage/library';
import type { RepoMeta } from '../lib/github';
import type { RenderOutput } from '../lib/markdown/pipeline';

export interface CurrentDoc {
  id: string;
  title: string;
  source: DocSource;
  /** Folder of the README relative to the dropped project root. */
  baseDir: string;
  /** Root-relative image path → object URL. */
  assets: Map<string, string>;
  /** Root-relative image path → the file itself (exports, zip). */
  blobs: Map<string, Blob>;
  meta: RepoMeta | null;
  /** Relative image base for built-in samples. */
  sampleBase?: string;
  /** Bumped whenever assets change so the preview re-resolves images. */
  assetsVersion: number;
}

export type Panel = 'customize' | 'insights' | 'library' | null;
export type DialogId =
  | 'palette'
  | 'shortcuts'
  | 'github'
  | 'paste'
  | 'export'
  | 'beautify'
  | 'share'
  | 'githubExport'
  | 'table'
  | 'badgeBuilder'
  | 'templates'
  | 'sections'
  | 'emoji'
  | 'codeBlock'
  | 'link'
  | null;

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
  timeout?: number;
}

export interface UiState {
  doc: CurrentDoc | null;
  panel: Panel;
  dialog: DialogId;
  findOpen: boolean;
  visualEdit: boolean;
  focusMode: boolean;
  saveState: SaveState;
  mobileTab: 'edit' | 'preview';
  render: RenderOutput | null;
  lightbox: { src: string; alt: string; list: Array<{ src: string; alt: string }> } | null;
  toasts: Toast[];
  insightsTab: 'health' | 'summary';
  loading: string | null;
  /** Source line the editor cursor is on (for preview highlight). */
  cursorLine: number | null;
  /** Line the preview asked the editor to reveal. */
  revealLine: { line: number; nonce: number } | null;
  /** Remembered export/zip mode etc. */
  lastInsertLang: string;
  announce: string;
}

export const ui = createStore<UiState>({
  doc: null,
  panel: null,
  dialog: null,
  findOpen: false,
  visualEdit: false,
  focusMode: false,
  saveState: 'saved',
  mobileTab: 'preview',
  render: null,
  lightbox: null,
  toasts: [],
  insightsTab: 'health',
  loading: null,
  cursorLine: null,
  revealLine: null,
  lastInsertLang: 'bash',
  announce: '',
});

export const settings = createStore<Settings>(loadSettings());
settings.subscribe(() => saveSettings(settings.get()));

export function setSettings(patch: Partial<Settings>): void {
  settings.set(patch);
}

/** The Markdown of the open document, with one shared undo history. */
export const doc = new DocStore('');

let toastId = 0;
export function toast(message: string, kind: Toast['kind'] = 'info', extra: Partial<Pick<Toast, 'action' | 'timeout'>> = {}): number {
  const id = ++toastId;
  ui.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind, ...extra }] }));
  const timeout = extra.timeout ?? (extra.action ? 9000 : kind === 'error' ? 7000 : 3200);
  if (timeout > 0) setTimeout(() => dismissToast(id), timeout);
  ui.set({ announce: message });
  return id;
}

export function dismissToast(id: number): void {
  ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function openDialog(dialog: DialogId): void {
  ui.set({ dialog });
}

export function closeDialog(): void {
  ui.set({ dialog: null });
}

export function togglePanel(panel: Exclude<Panel, null>): void {
  ui.set((s) => ({ panel: s.panel === panel ? null : panel }));
}

export function announce(message: string): void {
  ui.set({ announce: '' });
  queueMicrotask(() => ui.set({ announce: message }));
}
