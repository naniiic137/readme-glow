// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommandPalette from './CommandPalette';
import { doc, settings, ui } from '../../app/state';
import { useStore } from '../../app/store';
import { sync } from '../../app/sync';
import { fakeCurrentDoc, fakeRender, resetStores } from '../../test/helpers';

/** The palette as the app mounts it: only while ui.dialog === 'palette'. */
function Host() {
  const dialog = useStore(ui, (s) => s.dialog);
  return (
    <>
      <button type="button">Opener</button>
      {dialog === 'palette' && <CommandPalette />}
    </>
  );
}

function openPalette() {
  const user = userEvent.setup();
  render(<Host />);
  const opener = screen.getByRole('button', { name: 'Opener' });
  opener.focus();
  act(() => ui.set({ dialog: 'palette' }));
  const input = screen.getByRole('combobox');
  return { user, opener, input };
}

function optionLabels(): string[] {
  return screen.getAllByRole('option').map((o) => o.querySelector('.pi-label')!.textContent!.trim());
}

beforeEach(() => {
  resetStores('# Doc\n');
});

describe('CommandPalette', () => {
  it('renders a modal dialog with a focused combobox wired to the listbox', () => {
    const { input } = openPalette();
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(input).toHaveFocus();
    const listbox = screen.getByRole('listbox', { name: 'Commands' });
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(input).toHaveAttribute('aria-activedescendant', `${listbox.id}-0`);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('filters as you type: "synth" finds Theme: Synthwave first', async () => {
    const { user, input } = openPalette();
    await user.type(input, 'synth');
    expect(optionLabels()[0]).toBe('Theme: Synthwave');
    // With a query, each result shows its group instead of group headers.
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Themes');
  });

  it('Enter runs the active item and closes the palette', async () => {
    const { user, input } = openPalette();
    await user.type(input, 'synth');
    await user.keyboard('{Enter}');
    expect(ui.get().dialog).toBeNull();
    await waitFor(() => expect(settings.get().theme).toBe('synthwave'));
  });

  it('ArrowDown/ArrowUp move the active option and aria-activedescendant', async () => {
    const { user, input } = openPalette();
    await user.type(input, 'layout');
    const listId = input.getAttribute('aria-controls')!;
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', `${listId}-1`);
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'false');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', `${listId}-0`);
  });

  it('runs the item chosen with the arrow keys', async () => {
    const { user, input } = openPalette();
    await user.type(input, 'layout:');
    const second = optionLabels()[1]!;
    await user.keyboard('{ArrowDown}{Enter}');
    const expected = second.replace('Layout: ', '').toLowerCase();
    await waitFor(() => expect(settings.get().layout).toBe(expected));
  });

  it('resets the active item when the query changes', async () => {
    const { user, input } = openPalette();
    const listId = input.getAttribute('aria-controls')!;
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', `${listId}-2`);
    await user.type(input, 'dark');
    expect(input).toHaveAttribute('aria-activedescendant', `${listId}-0`);
  });

  it('runs an item on click', async () => {
    const { user } = openPalette();
    await user.click(screen.getByText('Layout: Slides'));
    await waitFor(() => expect(settings.get().layout).toBe('slides'));
    expect(ui.get().dialog).toBeNull();
  });

  it('Escape closes the palette and returns focus to the opener', async () => {
    const { user, opener } = openPalette();
    await user.keyboard('{Escape}');
    expect(ui.get().dialog).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('clicking the overlay closes it', () => {
    openPalette();
    fireEvent.click(document.querySelector('.overlay')!);
    expect(ui.get().dialog).toBeNull();
  });

  it('says so when nothing matches', async () => {
    const { user, input } = openPalette();
    await user.type(input, 'zzqqxx');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/No commands match/)).toHaveTextContent('No commands match “zzqqxx”.');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{Enter}'); // nothing to run, no crash
    expect(ui.get().dialog).toBe('palette');
  });

  it('shows document commands only while a document is open', () => {
    const first = openPalette();
    expect(screen.queryByText('Undo')).toBeNull();
    expect(screen.queryByText('Close document')).toBeNull();
    expect(first.input).toBeInTheDocument();
    act(() => ui.set({ doc: fakeCurrentDoc() }));
    expect(screen.getByText('Undo')).toBeInTheDocument();
    expect(screen.getByText('Beautify this README')).toBeInTheDocument();
    expect(screen.getByText('Close document')).toBeInTheDocument();
  });

  it('lists headings from the render as "Jump to" items that reveal them', async () => {
    const heading = document.createElement('h2');
    heading.id = '1-install';
    const scroll = vi.spyOn(heading, 'scrollIntoView');
    const article = document.createElement('article');
    article.append(heading);
    const revealLine = vi.fn();
    sync.preview = { element: () => article, scrollToLine: vi.fn(), topLine: () => 1 };
    sync.editor = { revealLine } as unknown as typeof sync.editor;
    ui.set({
      doc: fakeCurrentDoc(),
      render: fakeRender([
        { id: 'intro', text: 'Introduction', depth: 1, line: 1 },
        { id: '1-install', text: 'Installation', depth: 2, line: 7 },
      ]),
    });
    const { user, input } = openPalette();
    expect(screen.getByText('Jump to', { selector: '.palette-group' })).toBeInTheDocument();
    expect(screen.getByText('Installation')).toBeInTheDocument();

    await user.type(input, 'installation');
    expect(optionLabels()[0]).toBe('Installation');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(revealLine).toHaveBeenCalledWith(7, false));
    expect(scroll).toHaveBeenCalled();
  });

  it('runs Undo from the palette against the shared history', async () => {
    ui.set({ doc: fakeCurrentDoc() });
    doc.commit('# Doc\n\nEdited\n', { origin: 'visual' });
    const { user, input } = openPalette();
    await user.type(input, 'undo');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(doc.text).toBe('# Doc\n'));
  });

  it('opens other dialogs', async () => {
    const { user, input } = openPalette();
    await user.type(input, 'keyboard shortcuts');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(ui.get().dialog).toBe('shortcuts'));
  });
});
