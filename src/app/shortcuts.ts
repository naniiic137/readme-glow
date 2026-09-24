export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** "Mod-Shift-K" → "⌘⇧K" on macOS, "Ctrl+Shift+K" elsewhere. */
export function shortcutLabel(key: string): string {
  const parts = key.split('-');
  const map: Record<string, [string, string]> = {
    Mod: ['⌘', 'Ctrl'],
    Shift: ['⇧', 'Shift'],
    Alt: ['⌥', 'Alt'],
    Ctrl: ['⌃', 'Ctrl'],
  };
  const out = parts.map((p) => {
    const m = map[p];
    if (m) return isMac ? m[0] : m[1];
    return p.length === 1 ? p.toUpperCase() : p;
  });
  return isMac ? out.join('') : out.join('+');
}

export interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string[]; label: string }>;
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Everywhere',
    items: [
      { keys: ['Mod-K'], label: 'Command palette' },
      { keys: ['?'], label: 'Keyboard shortcuts' },
      { keys: ['Mod-F', '/'], label: 'Find in document' },
      { keys: ['Mod-Z', 'Mod-Shift-Z'], label: 'Undo / redo (shared by both editors)' },
      { keys: ['Alt-1'], label: 'Preview only' },
      { keys: ['Alt-2'], label: 'Split view' },
      { keys: ['Alt-3'], label: 'Editor only' },
      { keys: ['Alt-E'], label: 'Edit on page (visual editing)' },
      { keys: ['Alt-T'], label: 'Next theme' },
      { keys: ['Alt-Shift-T'], label: 'Previous theme' },
      { keys: ['Alt-L'], label: 'Next layout' },
      { keys: ['Alt-Z'], label: 'Distraction-free writing' },
      { keys: ['Mod-S'], label: 'Save now (everything autosaves)' },
      { keys: ['Mod-Shift-E'], label: 'Export' },
      { keys: ['Escape'], label: 'Close dialogs and panels' },
    ],
  },
  {
    title: 'Markdown editor',
    items: [
      { keys: ['Mod-B'], label: 'Bold' },
      { keys: ['Mod-I'], label: 'Italic' },
      { keys: ['Mod-Shift-X'], label: 'Strikethrough' },
      { keys: ['Mod-E'], label: 'Inline code' },
      { keys: ['Mod-Shift-L'], label: 'Link' },
      { keys: ['Mod-Alt-1'], label: 'Heading 1 (…6)' },
      { keys: ['Mod-Alt-0'], label: 'Normal text' },
      { keys: ['Mod-Shift-.'], label: 'Quote' },
      { keys: ['Mod-Shift-8'], label: 'Bullet list' },
      { keys: ['Mod-Shift-7'], label: 'Numbered list' },
      { keys: ['Mod-Shift-9'], label: 'Task list' },
      { keys: ['Mod-Alt-C'], label: 'Code block' },
      { keys: ['Tab', 'Shift-Tab'], label: 'Indent / outdent list items' },
      { keys: ['Mod-F'], label: 'Find & replace' },
      { keys: ['Alt-Click'], label: 'Add a cursor (multiple cursors)' },
      { keys: ['Mod-D'], label: 'Select next occurrence' },
    ],
  },
  {
    title: 'Edit on page',
    items: [
      { keys: ['Click'], label: 'Edit a paragraph, heading, list item, cell or code' },
      { keys: ['Enter'], label: 'Split the block' },
      { keys: ['Shift-Enter'], label: 'Line break' },
      { keys: ['Backspace'], label: 'At the start: join with the block above' },
      { keys: ['Mod-B', 'Mod-I', 'Mod-E'], label: 'Bold, italic, code' },
      { keys: ['Alt-↑', 'Alt-↓'], label: 'Move the block (on its handle)' },
      { keys: ['Escape'], label: 'Stop editing' },
    ],
  },
  {
    title: 'Slides',
    items: [
      { keys: ['→', 'Space'], label: 'Next slide' },
      { keys: ['←'], label: 'Previous slide' },
      { keys: ['Home', 'End'], label: 'First / last slide' },
      { keys: ['F'], label: 'Full screen' },
    ],
  },
];
