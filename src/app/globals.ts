import { useEffect } from 'react';
import { doc, openDialog, settings, setSettings, ui, closeDialog, toast } from './state';
import { flushSave, hasUnsavedChanges, openPasted, addImagesToDoc } from './actions';
import { THEMES } from '../themes/registry';
import { LAYOUTS, VIEWS } from '../lib/settings';
import { sync } from './sync';

function inEditable(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return !!t.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"], .cm-editor');
}

export function cycleTheme(delta: number): void {
  const i = THEMES.findIndex((t) => t.id === settings.get().theme);
  const next = THEMES[(i + delta + THEMES.length) % THEMES.length]!;
  setSettings({ theme: next.id });
  toast(`Theme: ${next.name}`, 'info', { timeout: 1600 });
}

export function cycleLayout(): void {
  const i = LAYOUTS.indexOf(settings.get().layout);
  const next = LAYOUTS[(i + 1) % LAYOUTS.length]!;
  setSettings({ layout: next });
  toast(`Layout: ${next[0]!.toUpperCase()}${next.slice(1)}`, 'info', { timeout: 1600 });
}

/** App-wide keyboard shortcuts (see app/shortcuts.ts for the list shown to users). */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const state = ui.get();
      const hasDoc = !!state.doc;

      if (mod && key === 'k') {
        e.preventDefault();
        openDialog(state.dialog === 'palette' ? null : 'palette');
        return;
      }
      if (e.key === 'Escape') {
        if (state.dialog || state.lightbox) return; // dialogs handle their own Escape
        if (state.findOpen) {
          ui.set({ findOpen: false });
          return;
        }
        if (state.focusMode) {
          ui.set({ focusMode: false });
          return;
        }
        if (state.panel && !inEditable(e.target)) {
          ui.set({ panel: null });
          return;
        }
        return;
      }
      if (state.dialog) return;
      if (!hasDoc) {
        if (e.key === '?' && !inEditable(e.target)) {
          e.preventDefault();
          openDialog('shortcuts');
        }
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        void flushSave().then(() => toast('Saved in this browser.', 'success', { timeout: 1500 }));
        return;
      }
      if (mod && e.shiftKey && key === 'e') {
        e.preventDefault();
        openDialog('export');
        return;
      }
      if (mod && !e.shiftKey && key === 'f' && !(e.target as HTMLElement)?.closest?.('.cm-editor')) {
        e.preventDefault();
        ui.set({ findOpen: true });
        return;
      }
      if (mod && !inEditable(e.target) && (key === 'z' || key === 'y')) {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) doc.redo();
        else doc.undo();
        return;
      }
      if (e.altKey && !mod) {
        const code = e.code;
        if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
          e.preventDefault();
          setSettings({ view: VIEWS[Number(code.slice(-1)) - 1]! });
          return;
        }
        if (code === 'KeyE') {
          e.preventDefault();
          ui.set({ visualEdit: !state.visualEdit });
          return;
        }
        if (code === 'KeyT') {
          e.preventDefault();
          cycleTheme(e.shiftKey ? -1 : 1);
          return;
        }
        if (code === 'KeyL') {
          e.preventDefault();
          cycleLayout();
          return;
        }
        if (code === 'KeyZ') {
          e.preventDefault();
          ui.set({ focusMode: !state.focusMode });
          if (!state.focusMode) setTimeout(() => sync.editor?.focus(), 50);
          return;
        }
      }
      if (inEditable(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        openDialog('shortcuts');
      } else if (e.key === '/') {
        e.preventDefault();
        ui.set({ findOpen: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Paste Markdown anywhere to open it; paste images while a document is open to add them. */
export function useGlobalPaste(): void {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (inEditable(e.target) || ui.get().dialog) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      const hasDoc = !!ui.get().doc;
      if (files.length && hasDoc) {
        e.preventDefault();
        void addImagesToDoc(files).then((snippets) => {
          if (!snippets.length) return;
          const block = snippets.join('\n\n');
          if (sync.editor) sync.editor.insertBlock(block);
          else doc.commit(`${doc.text.replace(/\s*$/, '')}\n\n${block}\n`, { origin: 'insert' });
        });
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text.trim().length < 2) return;
      e.preventDefault();
      if (!hasDoc) {
        void openPasted(text);
      } else {
        closeDialog();
        toast('Open the pasted Markdown as a new document?', 'info', {
          action: { label: 'Open', run: () => void openPasted(text) },
        });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);
}

/** Warns before leaving while a save is still pending. */
export function useUnloadGuard(): void {
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        void flushSave();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushSave();
    };
    window.addEventListener('beforeunload', onBefore);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onBefore);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);
}
