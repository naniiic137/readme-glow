// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DropZone } from './DropZone';
import { textFile, pngFile } from '../test/helpers';

function setup(onFiles = vi.fn(), extra: { onPaste?: () => void; children?: React.ReactNode } = {}) {
  const utils = render(
    <DropZone onFiles={onFiles} onPaste={extra.onPaste}>
      {extra.children}
    </DropZone>,
  );
  const zone = screen.getByTestId('dropzone');
  const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
  const folderInput = zone.querySelector<HTMLInputElement>('input[webkitdirectory]')!;
  return { ...utils, zone, fileInput, folderInput, onFiles };
}

/** A fake FileSystemEntry tree for drops of whole folders (Chrome's webkitGetAsEntry). */
function fileEntry(name: string, file: File) {
  return { name, isFile: true, isDirectory: false, file: (ok: (f: File) => void) => ok(file) };
}
function dirEntry(name: string, children: unknown[]) {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      let done = false;
      return {
        readEntries(ok: (batch: unknown[]) => void) {
          ok(done ? [] : children);
          done = true;
        },
      };
    },
  };
}

describe('DropZone', () => {
  it('is a labelled region with the default prompt', () => {
    const { zone } = setup();
    expect(screen.getByRole('region', { name: /open a readme/i })).toBe(zone);
    expect(screen.getByText('Drop your README.md here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose file/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose folder/i })).toBeInTheDocument();
  });

  it('delivers a file chosen with the hidden file input as { path, file }', async () => {
    const { fileInput, onFiles } = setup();
    const readme = textFile('README.md', '# Hi');
    fireEvent.change(fileInput, { target: { files: [readme] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles).toHaveBeenCalledWith([{ path: 'README.md', file: readme }]);
  });

  it('accepts Markdown and images in the file picker', () => {
    const { fileInput } = setup();
    const accept = fileInput.getAttribute('accept')!;
    expect(accept).toContain('.md');
    expect(accept).toContain('image/*');
    expect(fileInput).toHaveAttribute('multiple');
    expect(fileInput).not.toBeVisible();
  });

  it('has a folder input with webkitdirectory that keeps relative paths', async () => {
    const { folderInput, onFiles } = setup();
    expect(folderInput).toBeTruthy();
    expect(folderInput).toHaveAttribute('webkitdirectory');
    expect(folderInput).toHaveAttribute('directory');
    const readme = textFile('README.md', '# Project');
    const shot = pngFile('shot.png');
    Object.defineProperty(readme, 'webkitRelativePath', { value: 'project/README.md' });
    Object.defineProperty(shot, 'webkitRelativePath', { value: 'project/docs/shot.png' });
    fireEvent.change(folderInput, { target: { files: [readme, shot] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0]![0]).toEqual([
      { path: 'project/README.md', file: readme },
      { path: 'project/docs/shot.png', file: shot },
    ]);
  });

  it('does not call onFiles for an empty selection', async () => {
    const { fileInput, onFiles } = setup();
    fireEvent.change(fileInput, { target: { files: [] } });
    await Promise.resolve();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('toggles the is-over state and title on drag enter/leave, counting nested enters', () => {
    const { zone } = setup();
    fireEvent.dragEnter(zone);
    expect(zone).toHaveClass('is-over');
    expect(screen.getByText('Drop it — let it glow')).toBeInTheDocument();
    // Entering a child element fires another dragenter before the parent's dragleave.
    fireEvent.dragEnter(zone);
    fireEvent.dragLeave(zone);
    expect(zone).toHaveClass('is-over');
    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveClass('is-over');
    expect(screen.getByText('Drop your README.md here')).toBeInTheDocument();
  });

  it('accepts drags over it as a copy', () => {
    const { zone } = setup();
    const dataTransfer = { dropEffect: 'none' };
    const notCancelled = fireEvent.dragOver(zone, { dataTransfer });
    expect(notCancelled).toBe(false); // preventDefault() so the browser allows the drop
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('delivers dropped files (DataTransfer without items) and resets the hover state', async () => {
    const { zone, onFiles } = setup();
    const readme = textFile('README.md', '# Dropped');
    fireEvent.dragEnter(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [readme] } });
    expect(zone).not.toHaveClass('is-over');
    await waitFor(() => expect(onFiles).toHaveBeenCalledWith([{ path: 'README.md', file: readme }]));
  });

  it('walks dropped folders through webkitGetAsEntry', async () => {
    const { zone, onFiles } = setup();
    const readme = textFile('README.md', '# Folder');
    const logo = pngFile('logo.png');
    const ignored = textFile('index.js', 'x', 'text/javascript');
    const tree = dirEntry('app', [
      fileEntry('README.md', readme),
      dirEntry('assets', [fileEntry('logo.png', logo)]),
      dirEntry('node_modules', [fileEntry('index.js', ignored)]),
    ]);
    const items = [{ kind: 'file', webkitGetAsEntry: () => tree }];
    fireEvent.drop(zone, { dataTransfer: { items, files: [] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0]![0]).toEqual([
      { path: 'app/README.md', file: readme },
      { path: 'app/assets/logo.png', file: logo },
    ]);
  });

  it('shows a busy state while onFiles is running', async () => {
    let finish!: () => void;
    const onFiles = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { zone, fileInput } = setup(onFiles);
    fireEvent.change(fileInput, { target: { files: [textFile('README.md', '# x')] } });
    await waitFor(() => expect(zone).toHaveClass('is-busy'));
    expect(screen.getByText('Reading your files…')).toBeInTheDocument();
    finish();
    await waitFor(() => expect(zone).not.toHaveClass('is-busy'));
    expect(screen.getByText('Drop your README.md here')).toBeInTheDocument();
  });

  it('clears the busy state even when onFiles fails', async () => {
    const onFiles = vi.fn(async () => {
      throw new Error('nope');
    });
    const { zone } = setup(onFiles);
    // DropZone re-throws from its (un-awaited) drop handler, so the error
    // surfaces as an unhandled rejection; swallow it here so the run stays clean.
    const swallowed = vi.fn();
    process.on('unhandledRejection', swallowed);
    try {
      fireEvent.drop(zone, { dataTransfer: { files: [textFile('README.md', '# x')] } });
      await waitFor(() => expect(onFiles).toHaveBeenCalled());
      await waitFor(() => expect(zone).not.toHaveClass('is-busy'));
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off('unhandledRejection', swallowed);
    }
  });

  it('opens the file picker when empty space is clicked', () => {
    const { zone, fileInput } = setup();
    const click = vi.spyOn(fileInput, 'click').mockImplementation(() => undefined);
    fireEvent.click(zone);
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Drop your README.md here'));
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('does not double-trigger the picker from its own buttons', () => {
    const { fileInput, folderInput } = setup();
    const fileClick = vi.spyOn(fileInput, 'click').mockImplementation(() => undefined);
    const folderClick = vi.spyOn(folderInput, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: /choose file/i }));
    expect(fileClick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /choose folder/i }));
    expect(folderClick).toHaveBeenCalledTimes(1);
    expect(fileClick).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks on links, inputs and forms rendered inside it', () => {
    const { fileInput } = setup(vi.fn(), {
      children: (
        <form aria-label="repo">
          <input aria-label="Repository" />
          <a href="#x">link</a>
        </form>
      ),
    });
    const click = vi.spyOn(fileInput, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('textbox', { name: 'Repository' }));
    fireEvent.click(screen.getByText('link'));
    fireEvent.click(screen.getByRole('form', { name: 'repo' }));
    expect(click).not.toHaveBeenCalled();
  });

  it('shows the Paste button only when onPaste is given', () => {
    const onPaste = vi.fn();
    const first = setup(vi.fn(), { onPaste });
    fireEvent.click(screen.getByRole('button', { name: /paste markdown/i }));
    expect(onPaste).toHaveBeenCalledTimes(1);
    first.unmount();
    setup();
    expect(screen.queryByRole('button', { name: /paste markdown/i })).toBeNull();
  });
});
