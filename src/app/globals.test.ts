// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderHook, waitFor } from '@testing-library/react';

vi.mock('./actions', () => ({
  flushSave: vi.fn(async () => undefined),
  hasUnsavedChanges: vi.fn(() => false),
  openPasted: vi.fn(async () => undefined),
  addImagesToDoc: vi.fn(async (files: File[]) => files.map((f) => `![${f.name}](images/${f.name})`)),
}));

import * as actions from './actions';
import { cycleLayout, cycleTheme, useGlobalPaste, useGlobalShortcuts, useUnloadGuard } from './globals';
import { doc, settings, ui } from './state';
import { sync } from './sync';
import { THEMES } from '../themes/registry';
import { LAYOUTS } from '../lib/settings';
import { fakeCurrentDoc, resetStores, pngFile, toastMessages } from '../test/helpers';

const key = (init: KeyboardEventInit, target: Element | Window | Document = document.body) => fireEvent.keyDown(target, init);

let field: HTMLInputElement;
let cm: HTMLElement;

beforeEach(() => {
  resetStores('# Doc\n');
  ui.set({ doc: fakeCurrentDoc() });
  field = document.createElement('input');
  cm = document.createElement('div');
  cm.className = 'cm-editor';
  cm.innerHTML = '<div class="cm-content" contenteditable="true" tabindex="0"></div>';
  document.body.append(field, cm);
  vi.clearAllMocks();
});

afterEach(() => {
  field.remove();
  cm.remove();
});

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    renderHook(() => useGlobalShortcuts());
  });

  it('Ctrl+K / ⌘K toggles the command palette, even while typing', () => {
    key({ key: 'k', ctrlKey: true });
    expect(ui.get().dialog).toBe('palette');
    key({ key: 'k', ctrlKey: true });
    expect(ui.get().dialog).toBeNull();
    key({ key: 'K', metaKey: true }, field);
    expect(ui.get().dialog).toBe('palette');
  });

  it('? opens the shortcuts dialog, but not while typing in an input', () => {
    key({ key: '?' }, field);
    expect(ui.get().dialog).toBeNull();
    key({ key: '?' }, cm.firstElementChild!);
    expect(ui.get().dialog).toBeNull();
    key({ key: '?' });
    expect(ui.get().dialog).toBe('shortcuts');
  });

  it('? works on the landing page too (no document)', () => {
    ui.set({ doc: null });
    key({ key: '?' }, field);
    expect(ui.get().dialog).toBeNull();
    key({ key: '?' });
    expect(ui.get().dialog).toBe('shortcuts');
  });

  it('document shortcuts do nothing without a document', () => {
    ui.set({ doc: null });
    key({ key: '2', code: 'Digit2', altKey: true });
    key({ key: 'f', ctrlKey: true });
    expect(settings.get().view).toBe('preview');
    expect(ui.get().findOpen).toBe(false);
  });

  it('Alt+1/2/3 switch between preview, split and editor', () => {
    key({ key: '™', code: 'Digit2', altKey: true }); // macOS gives a symbol for e.key
    expect(settings.get().view).toBe('split');
    key({ key: '3', code: 'Digit3', altKey: true });
    expect(settings.get().view).toBe('editor');
    key({ key: '1', code: 'Digit1', altKey: true });
    expect(settings.get().view).toBe('preview');
  });

  it('Alt+T cycles themes forwards, Alt+Shift+T backwards, with a toast', () => {
    const start = THEMES.findIndex((t) => t.id === settings.get().theme);
    key({ key: 't', code: 'KeyT', altKey: true });
    const next = THEMES[(start + 1) % THEMES.length]!;
    expect(settings.get().theme).toBe(next.id);
    expect(toastMessages().at(-1)).toBe(`Theme: ${next.name}`);
    key({ key: 'T', code: 'KeyT', altKey: true, shiftKey: true });
    expect(settings.get().theme).toBe(THEMES[start]!.id);
  });

  it('Alt+L cycles layouts', () => {
    key({ key: 'l', code: 'KeyL', altKey: true });
    expect(settings.get().layout).toBe(LAYOUTS[1]);
  });

  it('Alt+E toggles visual editing and Alt+Z distraction-free mode', () => {
    key({ key: 'e', code: 'KeyE', altKey: true });
    expect(ui.get().visualEdit).toBe(true);
    key({ key: 'e', code: 'KeyE', altKey: true });
    expect(ui.get().visualEdit).toBe(false);
    key({ key: 'z', code: 'KeyZ', altKey: true });
    expect(ui.get().focusMode).toBe(true);
  });

  it('Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z use the document history outside editors', () => {
    doc.commit('# Doc\n\nEdited\n', { origin: 'visual' });
    const undo = vi.spyOn(doc, 'undo');
    const redo = vi.spyOn(doc, 'redo');
    key({ key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(doc.text).toBe('# Doc\n');
    key({ key: 'y', ctrlKey: true });
    expect(doc.text).toBe('# Doc\n\nEdited\n');
    key({ key: 'z', ctrlKey: true });
    key({ key: 'Z', ctrlKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(2);
    expect(doc.text).toBe('# Doc\n\nEdited\n');
  });

  it('Ctrl+Z inside an input or the code editor is left to them', () => {
    const undo = vi.spyOn(doc, 'undo');
    key({ key: 'z', ctrlKey: true }, field);
    key({ key: 'z', ctrlKey: true }, cm.firstElementChild!);
    expect(undo).not.toHaveBeenCalled();
  });

  it('Ctrl+F and / open find (Ctrl+F in CodeMirror stays with CodeMirror)', () => {
    key({ key: 'f', ctrlKey: true }, cm.firstElementChild!);
    expect(ui.get().findOpen).toBe(false);
    key({ key: 'f', ctrlKey: true });
    expect(ui.get().findOpen).toBe(true);
    ui.set({ findOpen: false });
    key({ key: '/' }, field);
    expect(ui.get().findOpen).toBe(false);
    key({ key: '/' });
    expect(ui.get().findOpen).toBe(true);
  });

  it('Ctrl+Shift+E opens export and Ctrl+S saves', async () => {
    key({ key: 'E', ctrlKey: true, shiftKey: true });
    expect(ui.get().dialog).toBe('export');
    ui.set({ dialog: null });
    const notCancelled = key({ key: 's', ctrlKey: true });
    expect(notCancelled).toBe(false); // the browser's "Save page" is suppressed
    expect(actions.flushSave).toHaveBeenCalled();
    await waitFor(() => expect(toastMessages()).toContain('Saved in this browser.'));
  });

  it('Escape closes find, then focus mode, then the side panel', () => {
    ui.set({ findOpen: true, focusMode: true, panel: 'customize' });
    key({ key: 'Escape' });
    expect(ui.get().findOpen).toBe(false);
    expect(ui.get().focusMode).toBe(true);
    key({ key: 'Escape' });
    expect(ui.get().focusMode).toBe(false);
    key({ key: 'Escape' }, field);
    expect(ui.get().panel).toBe('customize'); // not while typing in the panel
    key({ key: 'Escape' });
    expect(ui.get().panel).toBeNull();
  });

  it('ignores shortcuts while a dialog is open (it handles its own keys)', () => {
    ui.set({ dialog: 'export', findOpen: true });
    key({ key: '?' });
    key({ key: '2', code: 'Digit2', altKey: true });
    key({ key: 'Escape' });
    expect(ui.get().dialog).toBe('export');
    expect(settings.get().view).toBe('preview');
    expect(ui.get().findOpen).toBe(true);
  });
});

describe('cycleTheme / cycleLayout', () => {
  it('wrap around both ends', () => {
    settings.set({ theme: THEMES[0]!.id });
    cycleTheme(-1);
    expect(settings.get().theme).toBe(THEMES.at(-1)!.id);
    cycleTheme(1);
    expect(settings.get().theme).toBe(THEMES[0]!.id);
    settings.set({ layout: LAYOUTS.at(-1)! });
    cycleLayout();
    expect(settings.get().layout).toBe(LAYOUTS[0]);
    expect(toastMessages().at(-1)).toBe(`Layout: ${LAYOUTS[0]![0]!.toUpperCase()}${LAYOUTS[0]!.slice(1)}`);
  });
});

/** A paste event with the given clipboard contents (jsdom has no ClipboardEvent/DataTransfer). */
function paste(target: EventTarget, data: { text?: string; files?: File[] }) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? data.text ?? '' : ''), files: data.files ?? [] },
  });
  target.dispatchEvent(event);
  return event;
}

describe('useGlobalPaste', () => {
  beforeEach(() => {
    renderHook(() => useGlobalPaste());
  });

  it('opens pasted Markdown when no document is open', () => {
    ui.set({ doc: null });
    const e = paste(document.body, { text: '# Pasted\n' });
    expect(e.defaultPrevented).toBe(true);
    expect(actions.openPasted).toHaveBeenCalledWith('# Pasted\n');
  });

  it('offers to open pasted Markdown as a new document when one is open', () => {
    paste(document.body, { text: '# Another\n' });
    expect(actions.openPasted).not.toHaveBeenCalled();
    const t = ui.get().toasts.at(-1)!;
    expect(t.message).toBe('Open the pasted Markdown as a new document?');
    t.action!.run();
    expect(actions.openPasted).toHaveBeenCalledWith('# Another\n');
  });

  it('adds pasted images to the open document through the editor', async () => {
    const insertBlock = vi.fn();
    sync.editor = { insertBlock } as unknown as typeof sync.editor;
    paste(document.body, { files: [pngFile('a.png'), pngFile('b.png')] });
    await waitFor(() => expect(insertBlock).toHaveBeenCalledWith('![a.png](images/a.png)\n\n![b.png](images/b.png)'));
  });

  it('appends pasted images to the text when the editor is hidden', async () => {
    paste(document.body, { files: [pngFile('c.png')] });
    await waitFor(() => expect(doc.text).toBe('# Doc\n\n![c.png](images/c.png)\n'));
  });

  it('leaves pastes into inputs, editors and dialogs alone, and ignores tiny text', () => {
    ui.set({ doc: null });
    expect(paste(field, { text: '# In a field' }).defaultPrevented).toBe(false);
    expect(paste(cm.firstElementChild!, { text: '# In CodeMirror' }).defaultPrevented).toBe(false);
    expect(paste(document.body, { text: 'x' }).defaultPrevented).toBe(false);
    ui.set({ dialog: 'paste' });
    expect(paste(document.body, { text: '# In a dialog' }).defaultPrevented).toBe(false);
    expect(actions.openPasted).not.toHaveBeenCalled();
  });
});

describe('useUnloadGuard', () => {
  beforeEach(() => {
    renderHook(() => useUnloadGuard());
  });

  it('warns before leaving with unsaved changes and flushes them', () => {
    vi.mocked(actions.hasUnsavedChanges).mockReturnValue(true);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(actions.flushSave).toHaveBeenCalled();
  });

  it('lets you leave when everything is saved', () => {
    vi.mocked(actions.hasUnsavedChanges).mockReturnValue(false);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('saves when the tab is hidden', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(actions.flushSave).toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});
