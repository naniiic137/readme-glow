// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { EditorPane } from './EditorPane';
import { doc, settings, ui } from '../../app/state';
import { sync } from '../../app/sync';
import type { Transaction } from '../../lib/docStore';
import { resetStores } from '../../test/helpers';

async function mountEditor(markdown = 'Hello world') {
  resetStores(markdown);
  const user = userEvent.setup();
  const utils = render(<EditorPane />);
  const host = await screen.findByTestId('code-editor');
  const view = EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-editor')!)!;
  expect(view).toBeTruthy();
  return { ...utils, user, host, view };
}

function recordOrigins(): Transaction['origin'][] {
  const origins: Transaction['origin'][] = [];
  doc.subscribe((tx) => origins.push(tx.origin));
  return origins;
}

beforeEach(() => resetStores());

describe('EditorPane', () => {
  it('shows a loading state, then lazy-loads CodeMirror with the document', async () => {
    resetStores('# Title\n\nBody');
    render(<EditorPane />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the editor…');
    const host = await screen.findByTestId('code-editor');
    expect(host.querySelector('.cm-content')).toHaveTextContent('# TitleBody');
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toBeInTheDocument();
    expect(screen.queryByText('Loading the editor…')).toBeNull();
  });

  it('exposes the editor through sync.editor while mounted', async () => {
    const { unmount, view } = await mountEditor('abc');
    expect(sync.editor).not.toBeNull();
    act(() => view.dispatch({ selection: { anchor: 0, head: 2 } }));
    expect(sync.editor!.selectionText()).toBe('ab');
    unmount();
    expect(sync.editor).toBeNull();
  });

  it('typing in CodeMirror commits to the DocStore with origin "editor"', async () => {
    const { view } = await mountEditor('Hello world');
    const origins = recordOrigins();
    act(() => view.dispatch({ changes: { from: 0, insert: '# ' }, selection: { anchor: 2 }, userEvent: 'input.type' }));
    expect(doc.text).toBe('# Hello world');
    expect(origins).toEqual(['editor']);
    expect(doc.lastSelection).toEqual({ anchor: 2, head: 2 });
  });

  it('groups consecutive typing into one undo step', async () => {
    const { view } = await mountEditor('');
    act(() => {
      view.dispatch({ changes: { from: 0, insert: 'a' }, userEvent: 'input.type' });
      view.dispatch({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type' });
    });
    expect(doc.text).toBe('ab');
    act(() => void doc.undo());
    expect(doc.text).toBe('');
    expect(view.state.doc.toString()).toBe('');
  });

  it('the Bold button wraps the selection through sync.editor', async () => {
    const { view, user } = await mountEditor('Hello world');
    const run = vi.spyOn(sync.editor!, 'run');
    act(() => view.dispatch({ selection: { anchor: 0, head: 5 } }));
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(doc.text).toBe('**Hello** world');
    expect(view.state.doc.toString()).toBe('**Hello** world');
    // The formatted word stays selected.
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('Hello');
  });

  it('typing after a formatting command starts a new undo step', async () => {
    const { view, user } = await mountEditor('Hello');
    act(() => view.dispatch({ selection: { anchor: 0, head: 5 } }));
    await user.click(screen.getByRole('button', { name: 'Italic' }));
    expect(doc.text).toBe('_Hello_');
    act(() => view.dispatch({ changes: { from: 7, insert: ' there' }, userEvent: 'input.type' }));
    expect(doc.text).toBe('_Hello_ there');
    act(() => void doc.undo());
    expect(doc.text).toBe('_Hello_');
    act(() => void doc.undo());
    expect(doc.text).toBe('Hello');
  });

  it('the Heading menu sets the heading level of the current line', async () => {
    const { user } = await mountEditor('Getting started');
    await user.click(screen.getByRole('button', { name: 'Heading' }));
    const menu = screen.getByRole('menu', { name: 'Heading' });
    await user.click(within(menu).getByText('Heading 2'));
    expect(doc.text).toBe('## Getting started');
  });

  it('external commits (visual editor, Beautify…) update CodeMirror without echoing back', async () => {
    const { view } = await mountEditor('Hello world');
    const origins = recordOrigins();
    act(() => void doc.commit('Hello brave new world', { origin: 'visual' }));
    expect(view.state.doc.toString()).toBe('Hello brave new world');
    expect(origins).toEqual(['visual']);
  });

  it('Undo and Redo buttons use the shared DocStore history', async () => {
    const { view, user } = await mountEditor('Original');
    act(() => void doc.commit('Changed on the page', { origin: 'visual' }));
    expect(view.state.doc.toString()).toBe('Changed on the page');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(doc.text).toBe('Original');
    expect(view.state.doc.toString()).toBe('Original');

    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(doc.text).toBe('Changed on the page');
    expect(view.state.doc.toString()).toBe('Changed on the page');
  });

  it('Ctrl+Z inside the editor undoes through the DocStore too', async () => {
    const { view } = await mountEditor('One');
    act(() => void doc.commit('One two', { origin: 'visual' }));
    fireEvent.keyDown(view.contentDOM, { key: 'z', code: 'KeyZ', keyCode: 90, ctrlKey: true });
    expect(doc.text).toBe('One');
    expect(view.state.doc.toString()).toBe('One');
  });

  it('insertBlock places Markdown as a separate block', async () => {
    const { view } = await mountEditor('# Title');
    act(() => view.dispatch({ selection: { anchor: 7 } }));
    act(() => sync.editor!.insertBlock('| a | b |\n| - | - |'));
    expect(doc.text).toContain('# Title\n\n| a | b |\n| - | - |');
  });

  it('toggles soft wrap and line numbers from the toolbar', async () => {
    const { host, user } = await mountEditor('text');
    const wrap = screen.getByRole('button', { name: 'Soft wrap' });
    expect(wrap).toHaveAttribute('aria-pressed', 'true');
    expect(host.querySelector('.cm-content')).toHaveClass('cm-lineWrapping');
    await user.click(wrap);
    expect(settings.get().wrap).toBe(false);
    expect(wrap).toHaveAttribute('aria-pressed', 'false');
    expect(host.querySelector('.cm-content')).not.toHaveClass('cm-lineWrapping');

    expect(host.querySelector('.cm-lineNumbers')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Line numbers' }));
    expect(settings.get().editorLineNumbers).toBe(false);
    expect(host.querySelector('.cm-lineNumbers')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Sync scrolling' }));
    expect(settings.get().syncScroll).toBe(false);
  });

  it('opens the table, emoji, badge and sections dialogs', async () => {
    const { user } = await mountEditor();
    await user.click(screen.getByRole('button', { name: 'Table' }));
    expect(ui.get().dialog).toBe('table');
    await user.click(screen.getByRole('button', { name: 'Emoji' }));
    expect(ui.get().dialog).toBe('emoji');
    await user.click(screen.getByRole('button', { name: 'Badge builder' }));
    expect(ui.get().dialog).toBe('badgeBuilder');
    await user.click(screen.getByRole('button', { name: /Sections/ }));
    expect(ui.get().dialog).toBe('sections');
  });

  it('labels the formatting toolbar', async () => {
    await mountEditor();
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    for (const name of ['Undo', 'Redo', 'Bold', 'Italic', 'Strikethrough', 'Inline code', 'Link', 'Quote', 'Bullet list', 'Numbered list', 'Task list']) {
      expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument();
    }
  });
});
