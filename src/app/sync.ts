import type { Command } from '../lib/editor/types';

/** What the preview exposes to the editor (scroll sync, click-to-source). */
export interface PreviewApi {
  scrollToLine(line: number, smooth?: boolean): void;
  topLine(): number;
  element(): HTMLElement | null;
}

/** What the code editor exposes to the rest of the app. */
export interface EditorApi {
  scrollToLine(line: number): void;
  topLine(): number;
  revealLine(line: number, select?: boolean): void;
  focus(): void;
  run(command: Command): boolean;
  insertBlock(markdown: string): void;
  insertInline(text: string): void;
  selectionText(): string;
}

/** Links the two panes without prop drilling; `source` breaks scroll feedback loops. */
export const sync: {
  preview: PreviewApi | null;
  editor: EditorApi | null;
  source: 'editor' | 'preview' | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
} = { preview: null, editor: null, source: null, releaseTimer: null };

export function claimScroll(source: 'editor' | 'preview'): boolean {
  if (sync.source && sync.source !== source) return false;
  sync.source = source;
  if (sync.releaseTimer) clearTimeout(sync.releaseTimer);
  sync.releaseTimer = setTimeout(() => {
    sync.source = null;
  }, 140);
  return true;
}
