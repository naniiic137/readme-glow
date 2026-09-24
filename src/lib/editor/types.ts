/** A selection range in the Markdown source (UTF-16 offsets, from <= to). */
export interface Sel {
  from: number;
  to: number;
}

/**
 * One text replacement. Positions refer to the document *before* any change
 * in the same list (CodeMirror ChangeSpec semantics); lists are sorted by
 * `from` and never overlap.
 */
export interface Change {
  from: number;
  to: number;
  insert: string;
}

export interface CommandResult {
  changes: Change[];
  /** Selection in the document *after* the changes. */
  selection: { anchor: number; head: number };
}

/** A pure editing command: returns null when it does not apply. */
export type Command = (doc: string, sel: Sel) => CommandResult | null;

/** Applies a change list (original-document coordinates) to a string. */
export function applyChanges(doc: string, changes: readonly Change[]): string {
  const sorted = [...changes].sort((a, b) => a.from - b.from);
  let out = '';
  let pos = 0;
  for (const c of sorted) {
    out += doc.slice(pos, c.from) + c.insert;
    pos = c.to;
  }
  return out + doc.slice(pos);
}
