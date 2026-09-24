// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShareAccessDialog from './ShareAccessDialog';
import { settings, ui } from '../../app/state';
import { fakeCurrentDoc, resetStores, toastMessages } from '../../test/helpers';

const APP = `${window.location.origin}${import.meta.env.BASE_URL}`;

beforeEach(() => {
  resetStores('# Doc\n');
  ui.set({ dialog: 'share' });
});

describe('ShareAccessDialog', () => {
  it('starts from the open GitHub repository and shows its pretty link', () => {
    ui.set({ doc: fakeCurrentDoc({ source: { kind: 'github', owner: 'octo', repo: 'hello', ref: 'main', path: 'README.md' } }) });
    render(<ShareAccessDialog />);
    expect(screen.getByRole('dialog', { name: 'Share & access' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Links' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Pretty link' })).toHaveValue(`${APP}octo/hello`);
  });

  it('adds the current look to links on request', async () => {
    const user = userEvent.setup();
    settings.set({ ...settings.get(), theme: 'zen', layout: 'docs' });
    render(<ShareAccessDialog />);
    await user.click(screen.getByRole('tab', { name: 'Links' }));
    await user.type(screen.getByRole('textbox', { name: 'Repository' }), 'https://github.com/o/r');
    await user.click(screen.getByRole('checkbox', { name: /Open in my current look/ }));
    expect(screen.getByRole('textbox', { name: 'Pretty link' })).toHaveValue(`${APP}o/r?theme=zen&layout=docs`);
  });

  it('explains the About → Website steps with the link', async () => {
    const user = userEvent.setup();
    render(<ShareAccessDialog />);
    await user.type(screen.getByRole('textbox', { name: 'Repository' }), 'o/r');
    await user.click(screen.getByRole('tab', { name: 'Repo website' }));
    expect(screen.getByRole('textbox', { name: 'Website link' })).toHaveValue(`${APP}o/r`);
    expect(screen.getByRole('link', { name: 'github.com/o/r' })).toHaveAttribute('href', 'https://github.com/o/r');
    expect(screen.getByText(/Paste the link into/)).toBeInTheDocument();
  });

  it('downloads a redirect index.html for the repository', async () => {
    const user = userEvent.setup();
    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      created.push(b as Blob);
      return 'blob:x';
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<ShareAccessDialog />);
    await user.type(screen.getByRole('textbox', { name: 'Repository' }), 'o/r');
    await user.click(screen.getByRole('tab', { name: 'Redirect page' }));
    expect(screen.getAllByText(/o\.github\.io\/r\//, { selector: 'code' }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Download index.html/ }));
    const html = await created[0]!.text();
    expect(html).toContain(`<meta http-equiv="refresh" content="0; url=${APP}o/r">`);
  });

  it('offers a drag-only bookmarklet', async () => {
    const user = userEvent.setup();
    render(<ShareAccessDialog />);
    await user.click(screen.getByRole('tab', { name: 'Bookmarklet' }));
    const link = screen.getByText('Open in ReadmeGlow').closest('a')!;
    expect(link.getAttribute('href')).toMatch(/^javascript:/);
    await user.click(link);
    expect(toastMessages().at(-1)).toMatch(/Drag this button to your bookmarks bar/);
    expect(screen.getByText(/browser extension could add a button/)).toBeInTheDocument();
  });

  it('keeps the “View with ReadmeGlow” badge', async () => {
    const user = userEvent.setup();
    render(<ShareAccessDialog />);
    await user.type(screen.getByRole('textbox', { name: 'Repository' }), 'o/r');
    await user.click(screen.getByRole('tab', { name: 'Badge' }));
    expect(screen.getByRole('img', { name: 'View with ReadmeGlow' })).toBeInTheDocument();
    expect(screen.getByText(/\?repo=o\/r/)).toBeInTheDocument();
  });
});
