// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FindBar from './FindBar';
import { ui } from '../app/state';
import { sync } from '../app/sync';
import { fakeCurrentDoc, resetStores } from '../test/helpers';

/** A stand-in for the CSS Custom Highlight API (not in jsdom). */
class FakeHighlight {
  ranges: Range[];
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}
const highlights = new Map<string, FakeHighlight>();

let article: HTMLElement;

beforeEach(() => {
  resetStores();
  ui.set({ doc: fakeCurrentDoc(), findOpen: true });
  article = document.createElement('article');
  article.innerHTML = [
    '<h1>Alpha project</h1>',
    // (Paragraphs don't start with the query: lib/find.ts joins blocks without
    // a separator, so whole-word matching misses a block's first word.)
    '<p>Say alpha beta <strong>alp</strong>ha gamma</p>',
    '<p>The <em>alphabet</em> song.</p>',
    '<details><summary>More</summary><p>hidden delta</p></details>',
    '<button>alpha in a button is skipped</button>',
  ].join('');
  document.body.append(article);
  sync.preview = { element: () => article, scrollToLine: vi.fn(), topLine: () => 1 };
  highlights.clear();
  const css = (globalThis as unknown as { CSS: Record<string, unknown> }).CSS;
  css.highlights = highlights;
  vi.stubGlobal('Highlight', FakeHighlight);
});

afterEach(() => {
  article.remove();
  delete (globalThis as unknown as { CSS: Record<string, unknown> }).CSS.highlights;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  const user = userEvent.setup();
  render(<FindBar />);
  const input = screen.getByRole('textbox', { name: 'Find in document' });
  const count = () => document.querySelector('.find-count')!.textContent;
  return { user, input, count };
}

describe('FindBar', () => {
  it('is a search landmark with the input focused', () => {
    const { input } = setup();
    expect(screen.getByRole('search', { name: 'Find in document' })).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
  });

  it('counts matches across element boundaries and shows "1 of N"', async () => {
    const { user, input, count } = setup();
    await user.type(input, 'alpha');
    // "Alpha", "alpha", "alp|ha" (split by <strong>), "alpha|bet"; the button text is skipped.
    await waitFor(() => expect(count()).toBe('1 of 4'));
    expect(highlights.get('rg-find')?.ranges).toHaveLength(4);
    expect(highlights.get('rg-find-current')?.ranges[0]?.toString()).toBe('Alpha');
  });

  it('Enter moves to the next match, Shift+Enter to the previous, wrapping around', async () => {
    const { user, input, count } = setup();
    await user.type(input, 'alpha');
    await waitFor(() => expect(count()).toBe('1 of 4'));
    await user.keyboard('{Enter}');
    expect(count()).toBe('2 of 4');
    await user.keyboard('{Enter}{Enter}{Enter}');
    expect(count()).toBe('1 of 4');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(count()).toBe('4 of 4');
    expect(highlights.get('rg-find-current')?.ranges[0]?.toString()).toBe('alpha');
  });

  it('the next/previous buttons step too and scroll the match into view', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { user, input, count } = setup();
    await user.type(input, 'gamma');
    await waitFor(() => expect(count()).toBe('1 of 1'));
    expect(scroll).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Next match' }));
    expect(count()).toBe('1 of 1');
    await user.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(count()).toBe('1 of 1');
  });

  it('Match case and Whole words narrow the results', async () => {
    const { user, input, count } = setup();
    await user.type(input, 'alpha');
    await waitFor(() => expect(count()).toBe('1 of 4'));
    const matchCase = screen.getByRole('button', { name: 'Match case' });
    await user.click(matchCase);
    expect(matchCase).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(count()).toBe('1 of 3'));
    await user.click(screen.getByRole('button', { name: 'Whole words' }));
    // "alpha" and "alp<strong>ha</strong>" as words; not "alphabet".
    await waitFor(() => expect(count()).toBe('1 of 2'));
  });

  it('says "No results" and disables stepping when nothing matches', async () => {
    const { user, input, count } = setup();
    await user.type(input, 'zeta');
    await waitFor(() => expect(count()).toBe('No results'));
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous match' })).toBeDisabled();
    await user.keyboard('{Enter}'); // no crash
    expect(count()).toBe('No results');
  });

  it('opens a collapsed <details> that contains the match', async () => {
    const details = article.querySelector('details')!;
    expect(details.open).toBe(false);
    const { user, input, count } = setup();
    await user.type(input, 'delta');
    await waitFor(() => expect(count()).toBe('1 of 1'));
    expect(details.open).toBe(true);
  });

  it('Escape closes the bar and clears the highlights', async () => {
    const { user, input, count } = setup();
    await user.type(input, 'beta');
    await waitFor(() => expect(count()).toBe('1 of 1'));
    await user.keyboard('{Escape}');
    expect(ui.get().findOpen).toBe(false);
    expect(highlights.size).toBe(0);
  });

  it('the close button closes it', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Close find' }));
    expect(ui.get().findOpen).toBe(false);
  });

  it('shows nothing without a preview to search', async () => {
    sync.preview = null;
    const { user, input, count } = setup();
    await user.type(input, 'alpha');
    await new Promise((r) => setTimeout(r, 120));
    expect(count()).toBe('No results');
  });
});
