/**
 * The single source of truth for the Markdown being edited, with one
 * undo/redo history shared by the code editor, the visual (preview) editor,
 * Beautify, health-check fixes and inserts.
 *
 * History entries are whole-text snapshots (a README is small; this keeps undo
 * trivially correct). Consecutive edits from the same source within a short
 * window are grouped into one undo step, like any editor.
 */

export type EditOrigin = 'editor' | 'visual' | 'command' | 'beautify' | 'fix' | 'load' | 'insert' | 'history';

export interface Selection {
  anchor: number;
  head: number;
}

interface Snapshot {
  text: string;
  selection: Selection | null;
}

export interface Transaction {
  text: string;
  previous: string;
  origin: EditOrigin;
  selection: Selection | null;
  version: number;
}

export interface CommitOptions {
  origin: EditOrigin;
  /** Selection after the change (for undo/redo and editor sync). */
  selection?: Selection | null;
  /** Selection before the change (restored on undo). */
  selectionBefore?: Selection | null;
  /** Edits with the same group key within `groupMs` form one undo step. */
  group?: string;
  /** Don't record an undo step (e.g. loading a new document). */
  history?: boolean;
}

type Listener = (tx: Transaction) => void;

export class DocStore {
  private current: string;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners = new Set<Listener>();
  private lastGroup: string | null = null;
  private lastTime = 0;
  private selection: Selection | null = null;
  version = 0;

  constructor(
    text = '',
    private readonly options: { limit?: number; groupMs?: number; now?: () => number } = {},
  ) {
    this.current = text;
  }

  get text(): string {
    return this.current;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get lastSelection(): Selection | null {
    return this.selection;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replaces the text. Returns false when nothing changed. */
  commit(next: string, opts: CommitOptions): boolean {
    if (next === this.current) {
      if (opts.selection) this.selection = opts.selection;
      return false;
    }
    const now = (this.options.now ?? Date.now)();
    const groupMs = this.options.groupMs ?? 900;
    const grouped = opts.group !== undefined && opts.group === this.lastGroup && now - this.lastTime < groupMs && this.undoStack.length > 0;
    if (opts.history !== false && !grouped) {
      this.undoStack.push({ text: this.current, selection: opts.selectionBefore ?? this.selection });
      const limit = this.options.limit ?? 300;
      if (this.undoStack.length > limit) this.undoStack.splice(0, this.undoStack.length - limit);
    }
    if (opts.history === false) {
      this.undoStack = [];
    }
    this.redoStack = [];
    this.lastGroup = opts.group ?? null;
    this.lastTime = now;
    this.apply(next, opts.origin, opts.selection ?? null);
    return true;
  }

  /** Loads a new document: resets the history. */
  reset(text: string): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastGroup = null;
    this.apply(text, 'load', null);
  }

  /** Ends the current typing group so the next edit starts a new undo step. */
  breakGroup(): void {
    this.lastGroup = null;
  }

  undo(): boolean {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.redoStack.push({ text: this.current, selection: this.selection });
    this.lastGroup = null;
    this.apply(snap.text, 'history', snap.selection);
    return true;
  }

  redo(): boolean {
    const snap = this.redoStack.pop();
    if (!snap) return false;
    this.undoStack.push({ text: this.current, selection: this.selection });
    this.lastGroup = null;
    this.apply(snap.text, 'history', snap.selection);
    return true;
  }

  private apply(text: string, origin: EditOrigin, selection: Selection | null): void {
    const previous = this.current;
    this.current = text;
    this.selection = selection;
    this.version++;
    const tx: Transaction = { text, previous, origin, selection, version: this.version };
    for (const l of this.listeners) l(tx);
  }
}

/** The smallest single replacement turning `a` into `b` (common prefix/suffix). */
export function minimalChange(a: string, b: string): { from: number; to: number; insert: string } | null {
  if (a === b) return null;
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  // Don't split a surrogate pair on either side.
  if (start > 0 && isHighSurrogate(a.charCodeAt(start - 1))) start--;
  if (endA < a.length && isLowSurrogate(a.charCodeAt(endA))) {
    endA++;
    endB++;
  }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
