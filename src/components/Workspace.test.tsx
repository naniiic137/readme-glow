// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResolverConfig } from '../lib/markdown/resolvers';
import { buildResolver } from '../lib/markdown/resolvers';

const hoisted = vi.hoisted(() => ({
  renderResult: { toc: [], html: '<p>hi</p>' } as unknown,
  renderError: null as string | null,
  resolvers: [] as ResolverConfig[],
}));

vi.mock('../app/useRender', () => ({
  useRender: vi.fn((_text: string, resolver: ResolverConfig) => {
    hoisted.resolvers.push(resolver);
    return { result: hoisted.renderResult, error: hoisted.renderError, pending: false };
  }),
}));
vi.mock('./TopBar', async () => {
  const { createElement } = await import('react');
  return { TopBar: ({ isMobile }: { isMobile: boolean }) => createElement('header', { 'data-testid': 'topbar', 'data-mobile': String(isMobile) }) };
});
vi.mock('./PreviewPane', async () => {
  const { createElement } = await import('react');
  return { PreviewPane: ({ editorVisible }: { editorVisible: boolean }) => createElement('div', { 'data-testid': 'preview', 'data-editor-visible': String(editorVisible) }) };
});
vi.mock('./editor/EditorPane', async () => {
  const { createElement } = await import('react');
  return { EditorPane: () => createElement('section', { 'data-testid': 'editor' }) };
});
vi.mock('./Splitter', async () => {
  const { createElement } = await import('react');
  return { Splitter: ({ onChange }: { onChange: (r: number) => void }) => createElement('button', { type: 'button', 'data-testid': 'splitter', onClick: () => onChange(0.3) }) };
});
vi.mock('./panels/CustomizePanel', async () => {
  const { createElement } = await import('react');
  return { default: () => createElement('aside', { 'data-testid': 'customize-panel' }) };
});
vi.mock('./panels/InsightsPanel', async () => {
  const { createElement } = await import('react');
  return { default: ({ markdown }: { markdown: string }) => createElement('aside', { 'data-testid': 'insights-panel' }, markdown) };
});
vi.mock('./panels/LibraryPanel', async () => {
  const { createElement } = await import('react');
  return { default: () => createElement('aside', { 'data-testid': 'library-panel' }) };
});

import { Workspace } from './Workspace';
import { doc, settings, ui } from '../app/state';
import { fakeCurrentDoc, resetStores } from '../test/helpers';
import { mediaQueryList } from '../test/dom';

function mount(current = fakeCurrentDoc()) {
  ui.set({ doc: current });
  const user = userEvent.setup();
  const utils = render(<Workspace current={current} />);
  return { user, ...utils };
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  resetStores('# Workspace\n');
  hoisted.renderResult = { toc: [], html: '<p>hi</p>' };
  hoisted.renderError = null;
  hoisted.resolvers.length = 0;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('Workspace', () => {
  it('preview view: top bar and preview only', () => {
    mount();
    expect(screen.getByTestId('topbar')).toBeInTheDocument();
    expect(screen.getByTestId('preview')).toHaveAttribute('data-editor-visible', 'false');
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(screen.queryByTestId('splitter')).toBeNull();
    expect(screen.getByRole('main')).not.toHaveClass('is-split');
  });

  it('split view: editor, splitter and preview side by side at the saved ratio', async () => {
    settings.set({ view: 'split', splitRatio: 0.6 });
    const { user } = mount();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.getByTestId('preview')).toHaveAttribute('data-editor-visible', 'true');
    const main = screen.getByRole('main');
    expect(main).toHaveClass('is-split');
    expect(main.style.gridTemplateColumns).toContain('0.6fr');
    await user.click(screen.getByTestId('splitter'));
    expect(settings.get().splitRatio).toBe(0.3);
    expect(main.style.gridTemplateColumns).toContain('0.3fr');
  });

  it('editor view: editor only', () => {
    settings.set({ view: 'editor' });
    mount();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.queryByTestId('preview')).toBeNull();
  });

  it('reacts to view changes from shortcuts', () => {
    mount();
    act(() => settings.set({ view: 'split' }));
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    act(() => settings.set({ view: 'preview' }));
    expect(screen.queryByTestId('editor')).toBeNull();
  });

  it('distraction-free mode: only the editor and an exit button', async () => {
    ui.set({ focusMode: true });
    const { user } = mount();
    expect(screen.queryByTestId('topbar')).toBeNull();
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.queryByTestId('preview')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Exit distraction-free mode/ }));
    expect(ui.get().focusMode).toBe(false);
    expect(screen.getByTestId('topbar')).toBeInTheDocument();
  });

  it('on phones the split view becomes Edit/Preview tabs', async () => {
    window.matchMedia = ((q: string) => mediaQueryList(q, true)) as typeof window.matchMedia;
    settings.set({ view: 'split' });
    const { user } = mount();
    expect(screen.getByTestId('topbar')).toHaveAttribute('data-mobile', 'true');
    const tabs = screen.getByRole('tablist', { name: 'Editor or preview' });
    expect(tabs).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('editor')).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Edit' }));
    expect(ui.get().mobileTab).toBe('edit');
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.queryByTestId('preview')).toBeNull();
    expect(screen.queryByTestId('splitter')).toBeNull();
  });

  it('publishes the render result for the rest of the app', () => {
    mount();
    expect(ui.get().render).toBe(hoisted.renderResult);
  });

  it('shows rendering errors as an alert', () => {
    hoisted.renderError = 'Unexpected token';
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('Something in this README could not be rendered: Unexpected token');
  });

  it('resolves images from dropped files for local documents', () => {
    mount(fakeCurrentDoc({ baseDir: 'docs', assets: new Map([['docs/img/a.png', 'blob:mock/a']]) }));
    const resolve = buildResolver(hoisted.resolvers.at(-1)!)!;
    expect(resolve('img/a.png', 'image')).toBe('blob:mock/a');
    expect(resolve('img/missing.png', 'image')).toBeNull();
    expect(resolve('https://example.com/x.png', 'image')).toBeUndefined();
  });

  it('resolves images from raw.githubusercontent.com for GitHub documents', () => {
    mount(fakeCurrentDoc({ source: { kind: 'github', owner: 'octo', repo: 'hello', ref: 'main', path: 'docs/README.md' } }));
    const resolve = buildResolver(hoisted.resolvers.at(-1)!)!;
    expect(resolve('shot.png', 'image')).toBe('https://raw.githubusercontent.com/octo/hello/main/docs/shot.png');
    expect(resolve('../LICENSE', 'link')).toBe('https://github.com/octo/hello/blob/main/LICENSE');
  });

  it('opens the side panels lazily, passing the live Markdown to Insights', async () => {
    mount();
    act(() => ui.set({ panel: 'customize' }));
    expect(await screen.findByTestId('customize-panel')).toBeInTheDocument();
    act(() => ui.set({ panel: 'library' }));
    expect(await screen.findByTestId('library-panel')).toBeInTheDocument();
    act(() => ui.set({ panel: 'insights' }));
    expect(await screen.findByTestId('insights-panel')).toHaveTextContent('# Workspace');
    act(() => void doc.commit('# Changed\n', { origin: 'editor' }));
    expect(screen.getByTestId('insights-panel')).toHaveTextContent('# Changed');
  });
});
