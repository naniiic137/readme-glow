// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BeautifyDialog from './BeautifyDialog';
import { doc, ui } from '../../app/state';
import { beautify, DEFAULT_BEAUTIFY_OPTIONS } from '../../lib/beautify/beautify';
import { applyHunks, computeHunks } from '../../lib/diff';
import { resetStores } from '../../test/helpers';

// Three problems far enough apart to form separate hunks:
// "*" bullets, a heading that skips levels, and a code fence without a language.
const MESSY = [
  '# My Tool',
  '',
  'A small tool.',
  '',
  '* item one',
  '* item two',
  '',
  'Para a.',
  '',
  'Para b.',
  '',
  'Para c.',
  '',
  'Para d.',
  '',
  '#### Usage',
  '',
  'Para e.',
  '',
  'Para f.',
  '',
  'Para g.',
  '',
  'Para h.',
  '',
  '```',
  'npm install my-tool',
  '```',
  '',
].join('\n');

const TIDY = '# Tidy\n\nNothing to fix here.\n';

function setup(markdown = MESSY) {
  resetStores(markdown);
  ui.set({ dialog: 'beautify' });
  const user = userEvent.setup();
  render(<BeautifyDialog />);
  return { user };
}

const expected = beautify(MESSY, DEFAULT_BEAUTIFY_OPTIONS).markdown;
const hunks = computeHunks(MESSY, expected);

beforeEach(() => resetStores());

describe('BeautifyDialog', () => {
  it('fixture sanity: the messy README produces several separate changes', () => {
    expect(expected).not.toBe(MESSY);
    expect(hunks.length).toBeGreaterThanOrEqual(2);
  });

  it('shows one checked section per hunk and a summary', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Beautify' })).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox', { name: /^Change \d+ · lines/ });
    expect(boxes).toHaveLength(hunks.length);
    for (const b of boxes) expect(b).toBeChecked();
    expect(screen.getByText(`${hunks.length} changes`, { exact: false })).toBeInTheDocument();
    // Added and removed lines are announced to screen readers.
    expect(screen.getAllByText('added:').length).toBeGreaterThan(0);
    expect(screen.getAllByText('removed:').length).toBeGreaterThan(0);
  });

  it('"Apply all" commits the beautified text as one undo step', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Apply all/ }));
    expect(doc.text).toBe(expected);
    expect(ui.get().dialog).toBeNull();
    const t = ui.get().toasts.at(-1)!;
    expect(t.message).toBe(`Beautified: ${hunks.length} changes applied.`);
    expect(t.action?.label).toBe('Undo');

    expect(doc.undo()).toBe(true);
    expect(doc.text).toBe(MESSY);
    expect(doc.canUndo).toBe(false);
  });

  it('the toast’s Undo restores the original', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Apply all/ }));
    ui.get().toasts.at(-1)!.action!.run();
    expect(doc.text).toBe(MESSY);
  });

  it('unchecking a hunk + "Apply selected" applies only the others', async () => {
    const { user } = setup();
    const applySelected = screen.getByRole('button', { name: /Apply selected/ });
    // Everything selected = same as Apply all, so the partial button is disabled.
    expect(applySelected).toBeDisabled();

    const first = screen.getAllByRole('checkbox', { name: /^Change \d+ · lines/ })[0]!;
    await user.click(first);
    expect(first).not.toBeChecked();
    expect(first.closest('section')).toHaveClass('is-off');
    expect(applySelected).toBeEnabled();
    expect(applySelected).toHaveTextContent(`Apply selected (${hunks.length - 1})`);

    await user.click(applySelected);
    const others = hunks.slice(1).map((h) => h.id);
    const partial = applyHunks(MESSY, expected, others);
    expect(doc.text).toBe(partial);
    expect(doc.text).not.toBe(expected);
    // The first change (the "*" bullets) was left alone.
    expect(doc.text).toContain('* item one');
    expect(ui.get().toasts.at(-1)!.message).toBe(`Beautified: ${others.length} change${others.length === 1 ? '' : 's'} applied.`);
  });

  it('re-checking a hunk brings it back', async () => {
    const { user } = setup();
    const first = screen.getAllByRole('checkbox', { name: /^Change \d+ · lines/ })[0]!;
    await user.click(first);
    await user.click(first);
    expect(first).toBeChecked();
    expect(screen.getByRole('button', { name: /Apply selected/ })).toBeDisabled();
  });

  it('turning an option off updates the diff', async () => {
    const { user } = setup();
    const before = screen.getAllByRole('checkbox', { name: /^Change \d+ · lines/ }).length;
    const options = screen.getByRole('complementary', { name: 'What to improve' });
    await user.click(within(options).getByRole('checkbox', { name: /Tidy formatting/ }));
    await user.click(within(options).getByRole('checkbox', { name: /Fix headings/ }));
    const after = screen.queryAllByRole('checkbox', { name: /^Change \d+ · lines/ }).length;
    expect(after).toBeLessThan(before);
  });

  it('says so when there is nothing to change', () => {
    setup(TIDY);
    expect(screen.getByText('Nothing to change with these options — nice README!')).toBeInTheDocument();
    expect(screen.getByText('Already tidy for the options you picked.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply all/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Apply selected/ })).toBeDisabled();
  });

  it('Cancel closes without touching the document', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(ui.get().dialog).toBeNull();
    expect(doc.text).toBe(MESSY);
    expect(doc.canUndo).toBe(false);
  });
});
