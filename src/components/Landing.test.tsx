// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The carousel renders every theme with the full Markdown pipeline; not needed here.
vi.mock('./ThemeCarousel', () => ({ ThemeCarousel: () => null }));

const recentDocs = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));
vi.mock('../app/actions', () => ({
  openFiles: vi.fn(async () => undefined),
  openGitHub: vi.fn(async () => true),
  openSample: vi.fn(async () => undefined),
  openFromLibrary: vi.fn(async () => true),
  newDocument: vi.fn(async () => undefined),
  library: vi.fn(async () => ({ list: async () => recentDocs.list })),
}));

import { Landing, timeAgo } from './Landing';
import * as actions from '../app/actions';
import { settings, ui } from '../app/state';
import { SAMPLES } from '../samples';
import { STARTER_TEMPLATES } from '../lib/editor/templates';
import { resetStores, textFile } from '../test/helpers';

beforeEach(() => {
  resetStores();
  recentDocs.list = [];
  vi.clearAllMocks();
});

function setup() {
  const user = userEvent.setup();
  const utils = render(<Landing />);
  return { user, ...utils };
}

describe('Landing', () => {
  it('renders the hero, the drop zone, the sample chips and the privacy section', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your README,beautifully designed.');
    expect(screen.getByRole('region', { name: /Open a README/ })).toBeInTheDocument();
    for (const s of SAMPLES) expect(screen.getByRole('button', { name: new RegExp(s.title.replace(/[()]/g, '\\$&')) })).toBeInTheDocument();
    const privacy = screen.getByRole('region', { name: /Privacy: your file never leaves your browser/ });
    expect(privacy).toHaveAttribute('id', 'privacy');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '#privacy');
    expect(screen.getByRole('heading', { name: 'More than a pretty face.' })).toBeInTheDocument();
  });

  it('marks the body as the landing page while mounted', () => {
    const { unmount } = setup();
    expect(document.body).toHaveClass('is-landing');
    unmount();
    expect(document.body).not.toHaveClass('is-landing');
  });

  it('clicking a sample chip applies its recommended look and opens it', async () => {
    const { user } = setup();
    const sample = SAMPLES.find((s) => s.id === 'quanta')!;
    await user.click(screen.getByRole('button', { name: new RegExp(sample.title) }));
    expect(actions.openSample).toHaveBeenCalledWith('quanta');
    expect(settings.get().theme).toBe(sample.recommended.theme);
    expect(settings.get().layout).toBe(sample.recommended.layout);
  });

  it('dropping a README on the drop zone opens it', async () => {
    setup();
    const file = textFile('README.md', '# Dropped');
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } });
    await waitFor(() => expect(actions.openFiles).toHaveBeenCalledWith([{ path: 'README.md', file }]));
  });

  it('fetches a GitHub repository from the form', async () => {
    const { user } = setup();
    const submit = screen.getByRole('button', { name: /Make it glow/ });
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'GitHub repository' }), 'vitejs/vite');
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(actions.openGitHub).toHaveBeenCalledWith('vitejs/vite');
  });

  it('typing in the repo field does not open the file picker', async () => {
    const { user } = setup();
    const picker = vi.spyOn(screen.getByTestId('file-input'), 'click').mockImplementation(() => undefined);
    await user.click(screen.getByRole('textbox', { name: 'GitHub repository' }));
    expect(picker).not.toHaveBeenCalled();
  });

  it('shows the loading state on the form', () => {
    setup();
    act(() => ui.set({ loading: 'Fetching octo/hello from GitHub…' }));
    expect(screen.getByRole('button', { name: /Loading…/ })).toBeDisabled();
  });

  it('opens the templates, paste and shortcuts dialogs', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Start writing/ }));
    expect(ui.get().dialog).toBe('templates');
    await user.click(screen.getByRole('button', { name: /Paste Markdown/ }));
    expect(ui.get().dialog).toBe('paste');
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(ui.get().dialog).toBe('shortcuts');
  });

  it('starts a new document from a template chip', async () => {
    const { user } = setup();
    const t = STARTER_TEMPLATES[0]!;
    await user.click(screen.getByRole('button', { name: new RegExp(t.name) }));
    expect(actions.newDocument).toHaveBeenCalledWith(t.markdown, { kind: 'template', id: t.id });
  });

  it('lists recent documents from the library and reopens them', async () => {
    const now = Date.now();
    recentDocs.list = [
      { id: 'a', title: 'Alpha doc', updatedAt: now - 5 * 60_000, source: { kind: 'paste' } },
      { id: 'b', title: 'Beta repo', updatedAt: now - 3 * 3_600_000, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', path: 'README.md' } },
    ];
    const { user } = setup();
    const section = await screen.findByRole('region', { name: 'Continue where you left off' });
    const items = within(section).getAllByRole('button');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Alpha doc');
    expect(items[0]).toHaveTextContent('5 min ago');
    expect(items[1]).toHaveTextContent('3 h ago');
    await user.click(items[1]!);
    expect(actions.openFromLibrary).toHaveBeenCalledWith('b');
  });

  it('hides the recent section when the library is empty', async () => {
    setup();
    await waitFor(() => expect(actions.library).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Continue where you left off' })).toBeNull();
  });
});

describe('timeAgo', () => {
  it('describes how long ago something happened', () => {
    const now = Date.now();
    expect(timeAgo(now - 10_000)).toBe('just now');
    expect(timeAgo(now - 2 * 60_000)).toBe('2 min ago');
    expect(timeAgo(now - 5 * 3_600_000)).toBe('5 h ago');
    expect(timeAgo(now - 24 * 3_600_000)).toBe('1 day ago');
    expect(timeAgo(now - 3 * 86_400_000)).toBe('3 days ago');
    expect(timeAgo(now - 90 * 86_400_000)).toBe(new Date(now - 90 * 86_400_000).toLocaleDateString());
  });
});
