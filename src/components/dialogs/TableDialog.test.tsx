// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableDialog from './TableDialog';
import { doc, settings, ui } from '../../app/state';
import { sync, type EditorApi } from '../../app/sync';
import { buildTable } from '../../lib/editor/table';
import { resetStores } from '../../test/helpers';

function fakeEditor() {
  const insertBlock = vi.fn<(markdown: string) => void>();
  const editor: EditorApi = {
    scrollToLine: vi.fn(),
    topLine: () => 1,
    revealLine: vi.fn(),
    focus: vi.fn(),
    run: vi.fn(() => true),
    insertBlock,
    insertInline: vi.fn(),
    selectionText: () => '',
  };
  return { editor, insertBlock };
}

function setup() {
  ui.set({ dialog: 'table' });
  const user = userEvent.setup();
  render(<TableDialog />);
  return { user };
}

beforeEach(() => resetStores('# Doc\n'));

describe('TableDialog', () => {
  it('starts with an 8×8 size picker', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Insert a table' })).toHaveAccessibleDescription('Choose the number of rows and columns.');
    expect(screen.getByRole('grid', { name: 'Table size' })).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);
    expect(screen.getByText(/3 × 3/)).toBeInTheDocument();
  });

  it('previews the size under the pointer or keyboard focus', () => {
    setup();
    fireEvent.mouseEnter(screen.getByRole('gridcell', { name: '4 rows by 5 columns' }));
    expect(screen.getByText(/4 × 5/)).toBeInTheDocument();
    fireEvent.focus(screen.getByRole('gridcell', { name: '1 rows by 2 columns' }));
    // A table needs a header and at least one row.
    expect(screen.getByText(/2 × 2/)).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole('grid'));
    expect(screen.getByText(/3 × 3/)).toBeInTheDocument();
  });

  it('picking a size shows editable cells with a default header', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('gridcell', { name: '3 rows by 2 columns' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Type in the cells; the first row is the header.');
    expect(screen.getByRole('textbox', { name: 'Header, column 1' })).toHaveValue('Column 1');
    expect(screen.getByRole('textbox', { name: 'Header, column 2' })).toHaveValue('Column 2');
    expect(screen.getByRole('textbox', { name: 'Row 2, column 2' })).toHaveValue('');
    expect(screen.queryByRole('textbox', { name: 'Row 3, column 1' })).toBeNull();
  });

  it('never makes a table without a body row', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('gridcell', { name: '1 rows by 3 columns' }));
    expect(screen.getByRole('textbox', { name: 'Row 1, column 3' })).toBeInTheDocument();
  });

  it('typing in cells and choosing alignment updates the Markdown preview', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('gridcell', { name: '2 rows by 2 columns' }));
    const header = screen.getByRole('textbox', { name: 'Header, column 1' });
    await user.clear(header);
    await user.type(header, 'Command');
    await user.type(screen.getByRole('textbox', { name: 'Row 1, column 1' }), 'npm test');
    await user.type(screen.getByRole('textbox', { name: 'Row 1, column 2' }), 'Runs | tests');
    const align = screen.getByRole('group', { name: 'Column 2 alignment' });
    const center = align.querySelectorAll('button')[1]!;
    await user.click(center);
    expect(center).toHaveAttribute('aria-pressed', 'true');

    const md = buildTable({ rows: 2, cols: 2, header: true, align: [null, 'center'], cells: [['Command', 'Column 2'], ['npm test', 'Runs | tests']] });
    expect(screen.getByLabelText('Markdown preview').textContent).toBe(md);
    expect(md).toContain('Runs \\| tests');
    expect(md).toMatch(/:-+:/);

    // Clicking the active alignment again clears it.
    await user.click(center);
    expect(center).toHaveAttribute('aria-pressed', 'false');
  });

  it('Insert puts the table in the editor through sync.editor', async () => {
    const { editor, insertBlock } = fakeEditor();
    sync.editor = editor;
    const { user } = setup();
    await user.click(screen.getByRole('gridcell', { name: '2 rows by 2 columns' }));
    await user.type(screen.getByRole('textbox', { name: 'Row 1, column 1' }), 'a');
    const md = screen.getByLabelText('Markdown preview').textContent!;
    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    expect(ui.get().dialog).toBeNull();
    await waitFor(() => expect(insertBlock).toHaveBeenCalledWith(md));
    expect(ui.get().toasts.at(-1)?.message).toBe('Table inserted.');
  });

  it('without an editor, appends the table to the document', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('gridcell', { name: '2 rows by 1 columns' }));
    const md = screen.getByLabelText('Markdown preview').textContent!;
    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    await waitFor(() => expect(doc.text).toBe(`# Doc\n\n${md.replace(/\s*$/, '')}\n`));
    expect(doc.canUndo).toBe(true);
  });

  it('switches from preview-only to split view so the insert is visible', async () => {
    settings.set({ view: 'preview' });
    const { user } = setup();
    await user.click(screen.getByRole('gridcell', { name: '2 rows by 2 columns' }));
    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    expect(settings.get().view).toBe('split');
  });

  it('"Change size" goes back to the picker', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('gridcell', { name: '2 rows by 2 columns' }));
    await user.click(screen.getByRole('button', { name: /Change size/ }));
    expect(screen.getByRole('grid', { name: 'Table size' })).toBeInTheDocument();
  });
});
