// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { settings, ui } from '../../app/state';
import { fakeCurrentDoc, resetStores, toastMessages } from '../../test/helpers';
import { exportForGitHub, type GhExportOptions, type GhRenderer } from '../../lib/ghexport/transform';

const renderer: GhRenderer = {
  variants: ['light', 'dark'],
  hero: (title, _tagline, v) => `<svg xmlns="http://www.w3.org/2000/svg"><title>${title} ${v}</title></svg>`,
  section: (text, _i, v) => `<svg xmlns="http://www.w3.org/2000/svg"><title>${text} ${v}</title></svg>`,
  divider: () => '<svg xmlns="http://www.w3.org/2000/svg"/>',
  badgeColors: { accent: '#7c5cff', label: '#0b0c1e' },
};

const build = vi.fn(async (req: { markdown: string; options: Omit<GhExportOptions, 'emoji'> }) => exportForGitHub(req.markdown, req.options, renderer));

vi.mock('../../lib/ghexport', async (original) => ({
  ...(await original<typeof import('../../lib/ghexport')>()),
  buildGitHubExport: (req: { markdown: string; options: Omit<GhExportOptions, 'emoji'> }) => build(req),
}));

const { default: GitHubExportDialog } = await import('./GitHubExportDialog');

const README = '# Nebula Board\n\nA calm task board.\n\n## Usage\n\n> **Note**\n> Be nice.\n\n## Changelog\n\n- 1.0\n';

beforeEach(() => {
  resetStores(README);
  build.mockClear();
  settings.set({ ...settings.get(), theme: 'aurora', layout: 'landing', accent: null });
  ui.set({ dialog: 'githubExport', doc: fakeCurrentDoc({ title: 'Nebula Board' }) });
});

async function ready() {
  render(<GitHubExportDialog />);
  await waitFor(() => expect(build).toHaveBeenCalled());
  return screen.findByRole('img', { name: 'Nebula Board — A calm task board.' });
}

describe('GitHubExportDialog', () => {
  it('previews the export in GitHub styles with light/dark images', async () => {
    const hero = await ready();
    expect(screen.getByRole('dialog', { name: 'GitHub export' })).toBeInTheDocument();
    expect(hero.getAttribute('src')).toMatch(/^blob:/);
    const article = hero.closest('article')!;
    expect(article).toHaveClass('markdown-body');
    // GitHub alert conversion shows as a real callout.
    expect(article.querySelector('.markdown-alert-note')).not.toBeNull();
    // An honest note about what the preview is.
    expect(screen.getByText(/Close to github.com, not identical/)).toBeInTheDocument();
    // Sources are forced to the previewed scheme.
    const media = [...article.querySelectorAll('source')].map((s) => s.getAttribute('media'));
    expect(media.sort()).toEqual(expect.arrayContaining(['all', 'not all']));
    expect(screen.getByText(/6 images/)).toBeInTheDocument();
  });

  it('passes the options, with the config comment for the chosen theme', async () => {
    const user = userEvent.setup();
    await ready();
    const last = () => build.mock.calls.at(-1)![0] as { options: GhExportOptions };
    expect(last().options.config).toMatchObject({ theme: 'aurora', layout: 'landing' });
    await user.click(screen.getByRole('button', { name: 'Pills' }));
    await user.click(screen.getByRole('checkbox', { name: /Fold long sections/ }));
    await waitFor(() => expect(last().options).toMatchObject({ toc: 'pills', fold: true }));
    await user.click(screen.getByRole('checkbox', { name: /Remember the look/ }));
    await waitFor(() => expect(last().options.config).toBeNull());
  });

  it('copies the README and explains where the images go', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await ready();
    await user.click(screen.getByRole('button', { name: /Copy README/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('<h1 align="center"><picture>'));
    expect(toastMessages().at(-1)).toMatch(/points at 6 images in \.github\/readmeglow\/: download the \.zip/);
  });

  it('downloads a zip with README.md and the images', async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blobs.push(b as Blob);
      return `blob:mock/${blobs.length}`;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await ready();
    await user.click(screen.getByRole('button', { name: /Download .zip/ }));
    const zip = blobs.find((b) => b.type === 'application/zip')!;
    const { unzipSync } = await import('fflate');
    const files = Object.keys(unzipSync(new Uint8Array(await zip.arrayBuffer())));
    expect(files).toContain('README.md');
    expect(files).toContain('.github/readmeglow/hero-dark.svg');
    expect(files).toHaveLength(7);
  });
});
