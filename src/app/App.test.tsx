// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { compressToEncodedURIComponent } from 'lz-string';

// Heavy, separately tested views: the landing carousel renders every theme and
// the workspace runs the Markdown pipeline.
vi.mock('../components/ThemeCarousel', () => ({ ThemeCarousel: () => null }));
vi.mock('../components/Workspace', async () => {
  const { createElement } = await import('react');
  return {
    Workspace: ({ current }: { current: { title: string } }) => createElement('main', { id: 'main', 'data-testid': 'workspace' }, createElement('h1', null, current.title)),
  };
});

import { App } from '../App';
import { library, resetStartup } from './actions';
import { ui } from './state';
import { resetStores, textFile } from '../test/helpers';

async function boot(url = '/readme-glow/') {
  window.history.replaceState(null, '', url);
  const user = userEvent.setup();
  const utils = render(<App />);
  return { user, ...utils };
}

beforeEach(async () => {
  resetStores();
  localStorage.clear();
  resetStartup();
  await (await library()).clear();
});

describe('App', () => {
  it('shows a splash while starting, then the landing page', async () => {
    await boot();
    expect(screen.getByRole('status')).toHaveTextContent('Loading ReadmeGlow…');
    expect(await screen.findByRole('heading', { level: 1, name: /Your README/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });

  it('opens a shared README straight into the workspace', async () => {
    await boot(`/readme-glow/#md=${compressToEncodedURIComponent('# Shared Thing\n\nHi')}`);
    expect(await screen.findByTestId('workspace')).toHaveTextContent('Shared Thing');
  });

  it('"?" opens the keyboard shortcuts dialog and Escape closes it', async () => {
    const { user } = await boot();
    await screen.findByRole('heading', { level: 1, name: /Your README/ });
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Ctrl+K → "sample quanta" → Enter opens that sample', async () => {
    const { user } = await boot();
    await screen.findByRole('heading', { level: 1, name: /Your README/ });
    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox');
    await user.type(input, 'open sample quanta');
    await user.keyboard('{Enter}');
    expect(await screen.findByTestId('workspace')).toHaveTextContent('Quanta');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.title).toBe('Quanta — ReadmeGlow');
  });

  it('pasting Markdown on the landing page opens it', async () => {
    await boot();
    await screen.findByRole('heading', { level: 1, name: /Your README/ });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => '# From the clipboard\n', files: [] } });
    act(() => void document.body.dispatchEvent(event));
    expect(await screen.findByTestId('workspace')).toHaveTextContent('From the clipboard');
  });

  it('dropping a README on the landing drop zone opens it', async () => {
    await boot();
    fireEvent.drop(await screen.findByTestId('dropzone'), { dataTransfer: { files: [textFile('README.md', '# Dropped In\n')] } });
    expect(await screen.findByTestId('workspace')).toHaveTextContent('Dropped In');
    expect(await screen.findByText('Opened README.md.', { selector: '.toast .msg' })).toBeInTheDocument();
  });

  it('shows errors as alert toasts that can be dismissed, and announces them', async () => {
    const { user } = await boot();
    fireEvent.drop(await screen.findByTestId('dropzone'), { dataTransfer: { files: [textFile('notes.png', 'x', 'image/png')] } });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/No Markdown file found/);
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(/No Markdown file found/);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('mounts the find bar only while a document is open', async () => {
    const { user } = await boot(`/readme-glow/#md=${compressToEncodedURIComponent('# Findable\n')}`);
    await screen.findByTestId('workspace');
    await user.keyboard('/');
    expect(await screen.findByRole('search', { name: 'Find in document' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('search')).toBeNull());
    expect(ui.get().findOpen).toBe(false);
  });

  it('shows the loading bar while fetching', async () => {
    await boot();
    await screen.findByRole('heading', { level: 1, name: /Your README/ });
    act(() => ui.set({ loading: 'Fetching octo/hello from GitHub…' }));
    expect(screen.getByRole('progressbar', { name: 'Fetching octo/hello from GitHub…' })).toBeInTheDocument();
  });
});
