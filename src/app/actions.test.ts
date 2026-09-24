// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import {
  addImagesToDoc,
  closeDocument,
  flushSave,
  hasUnsavedChanges,
  lastDocId,
  library,
  openFiles,
  openMarkdown,
  openPasted,
  openSample,
  resetStartup,
  startup,
} from './actions';
import { doc, settings, ui } from './state';
import { resetStores, textFile, pngFile, toastMessages } from '../test/helpers';
import { getSample } from '../samples';

function setUrl(url: string): void {
  window.history.replaceState(null, '', url);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function base64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

beforeEach(async () => {
  resetStores();
  localStorage.clear();
  setUrl('/readme-glow/');
  resetStartup();
  await (await library()).clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('openFiles', () => {
  it('opens a single README.md: document, text, source, title and toast', async () => {
    const md = '# My Project\n\nHello world.\n';
    await openFiles([{ path: 'README.md', file: textFile('README.md', md) }]);
    const current = ui.get().doc!;
    expect(current).not.toBeNull();
    expect(doc.text).toBe(md);
    expect(current.title).toBe('My Project');
    expect(current.source).toEqual({ kind: 'file', name: 'README.md' });
    expect(document.title).toBe('My Project — ReadmeGlow');
    expect(lastDocId()).toBe(current.id);
    expect(toastMessages()).toContain('Opened README.md.');
    expect(doc.canUndo).toBe(false); // opening resets the history
  });

  it('opens a dropped folder with its images stored as assets', async () => {
    const md = '# Folder App\n\n![Shot](docs/shot.png)\n';
    const shot = pngFile('shot.png');
    await openFiles([
      { path: 'folder-app/README.md', file: textFile('README.md', md) },
      { path: 'folder-app/docs/shot.png', file: shot },
      { path: 'folder-app/node_modules/pkg/README.md', file: textFile('README.md', '# Not me') },
      { path: 'folder-app/src/index.ts', file: textFile('index.ts', 'x', 'text/plain') },
    ]);
    const current = ui.get().doc!;
    expect(doc.text).toBe(md);
    expect(current.source).toEqual({ kind: 'folder', name: 'folder-app' });
    expect(current.baseDir).toBe('');
    expect([...current.assets.keys()]).toEqual(['docs/shot.png']);
    expect(current.assets.get('docs/shot.png')).toMatch(/^blob:/);
    expect(current.blobs.has('docs/shot.png')).toBe(true);

    const lib = await library();
    const stored = await lib.assets(current.id);
    expect(stored.map((a) => [a.path, a.name, a.type])).toEqual([['docs/shot.png', 'shot.png', 'image/png']]);
    expect((await lib.get(current.id))?.assetPaths).toEqual(['docs/shot.png']);
    expect(toastMessages()).toContain('Opened README.md with 1 image.');
  });

  it('keeps the README folder as baseDir when it is nested', async () => {
    await openFiles([
      { path: 'mono/packages/app/README.md', file: textFile('README.md', '# App') },
      { path: 'mono/packages/app/img/a.png', file: pngFile('a.png') },
    ]);
    const current = ui.get().doc!;
    expect(current.baseDir).toBe('packages/app');
    expect([...current.assets.keys()]).toEqual(['packages/app/img/a.png']);
  });

  it('shows an error toast for a drop without Markdown', async () => {
    await openFiles([{ path: 'logo.png', file: pngFile('logo.png') }]);
    expect(ui.get().doc).toBeNull();
    const t = ui.get().toasts.at(-1)!;
    expect(t.kind).toBe('error');
    expect(t.message).toMatch(/No Markdown file found/);
  });

  it('refuses Markdown files over 3 MB', async () => {
    const big = textFile('README.md', `# Big\n${'x'.repeat(3 * 1024 * 1024)}`);
    await openFiles([{ path: 'README.md', file: big }]);
    expect(ui.get().doc).toBeNull();
    expect(toastMessages().at(-1)).toMatch(/larger than 3 MB/);
  });

  it('adds dropped images to the open document instead of failing', async () => {
    await openPasted('# Host\n');
    const before = ui.get().doc!;
    await openFiles([{ path: 'diagram.png', file: pngFile('diagram.png') }]);
    const after = ui.get().doc!;
    expect(after.id).toBe(before.id);
    expect([...after.assets.keys()]).toEqual(['images/diagram.png']);
    expect(after.assetsVersion).toBe(before.assetsVersion + 1);
  });

  it('does nothing for an empty list', async () => {
    await openFiles([]);
    expect(ui.get().doc).toBeNull();
    expect(ui.get().toasts).toEqual([]);
  });
});

describe('addImagesToDoc', () => {
  it('stores images next to the README and returns relative Markdown', async () => {
    await openFiles([
      { path: 'site/docs/README.md', file: textFile('README.md', '# Docs') },
      { path: 'site/docs/x.txt', file: textFile('x.txt', 'not an image', 'text/plain') },
    ]);
    const snippets = await addImagesToDoc([pngFile('My Screenshot.png'), pngFile('My Screenshot.png'), textFile('notes.txt', 'x', 'text/plain')]);
    expect(snippets).toEqual(['![My Screenshot](images/my-screenshot.png)', '![My Screenshot](images/my-screenshot-2.png)']);
    const current = ui.get().doc!;
    expect(current.baseDir).toBe('docs');
    expect([...current.assets.keys()]).toEqual(['docs/images/my-screenshot.png', 'docs/images/my-screenshot-2.png']);
    const stored = await (await library()).assets(current.id);
    expect(stored.map((a) => a.path).sort()).toEqual(['docs/images/my-screenshot-2.png', 'docs/images/my-screenshot.png']);
  });

  it('returns nothing without an open document', async () => {
    expect(await addImagesToDoc([pngFile('a.png')])).toEqual([]);
  });
});

describe('openPasted / openMarkdown / openSample', () => {
  it('opens pasted Markdown as a new document', async () => {
    await openPasted('# Pasted Title\n\nBody');
    expect(ui.get().doc?.source).toEqual({ kind: 'paste' });
    expect(ui.get().doc?.title).toBe('Pasted Title');
    expect(doc.text).toBe('# Pasted Title\n\nBody');
  });

  it('ignores blank pastes', async () => {
    await openPasted('   \n  ');
    expect(ui.get().doc).toBeNull();
  });

  it('opens a sample and re-uses the same library record next time', async () => {
    await openSample('quanta');
    const first = ui.get().doc!;
    expect(first.title).toBe(getSample('quanta')!.title);
    expect(first.source).toEqual({ kind: 'sample', id: 'quanta' });
    expect(first.sampleBase).toMatch(/samples\/quanta\/$/);
    expect(doc.text).toBe(getSample('quanta')!.markdown);
    await openSample('quanta');
    expect(ui.get().doc!.id).toBe(first.id);
    expect(await (await library()).list()).toHaveLength(1);
  });

  it('keeps the user’s edited copy and offers the original', async () => {
    const source = { kind: 'github' as const, owner: 'o', repo: 'r', ref: 'main', path: 'README.md' };
    await openMarkdown('# Original\n', { source });
    const id = ui.get().doc!.id;
    await (await library()).updateMarkdown(id, '# Original\n\nMy edits.\n');

    await openMarkdown('# Original v2\n', { source });
    expect(ui.get().doc!.id).toBe(id);
    expect(doc.text).toBe('# Original\n\nMy edits.\n');
    const offer = ui.get().toasts.at(-1)!;
    expect(offer.message).toBe('Opened your edited copy of this README.');
    expect(offer.action?.label).toBe('Load the original');

    offer.action!.run();
    await vi.waitFor(() => expect(doc.text).toBe('# Original v2\n'));
    expect(ui.get().doc!.id).not.toBe(id);
  });

  it('closes the document', async () => {
    await openPasted('# Close me');
    await closeDocument();
    expect(ui.get().doc).toBeNull();
    expect(doc.text).toBe('');
    expect(lastDocId()).toBeNull();
    expect(document.title).toMatch(/^ReadmeGlow/);
  });
});

describe('autosave', () => {
  it('saves edits to the library and follows the title', async () => {
    await openPasted('# First\n');
    const id = ui.get().doc!.id;
    doc.commit('# Renamed\n\nNew text\n', { origin: 'editor' });
    expect(hasUnsavedChanges()).toBe(true);
    await flushSave();
    expect(hasUnsavedChanges()).toBe(false);
    const record = await (await library()).get(id);
    expect(record?.markdown).toBe('# Renamed\n\nNew text\n');
    expect(record?.edited).toBe(true);
    expect(ui.get().doc!.title).toBe('Renamed');
    expect(ui.get().saveState).toBe('saved');
  });
});

describe('startup', () => {
  it('opens a shared README from #md= and cleans the URL', async () => {
    const md = '# Shared\n\nFrom a link.';
    setUrl(`/readme-glow/?theme=synthwave#md=${compressToEncodedURIComponent(md)}`);
    await startup();
    expect(doc.text).toBe(md);
    expect(ui.get().doc?.source).toEqual({ kind: 'share' });
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?theme=synthwave');
    expect(settings.get().theme).toBe('synthwave');
  });

  it('reports a damaged share link', async () => {
    setUrl('/readme-glow/#md=%%%not-lz');
    await startup();
    expect(ui.get().doc).toBeNull();
    expect(toastMessages()).toContain('That share link is damaged or incomplete.');
  });

  it('fetches ?repo= from GitHub and opens its README', async () => {
    const md = '# Remote Repo\n\nFetched.';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://api.github.com/repos/octo/hello/readme') {
        return jsonResponse({
          content: base64(md),
          encoding: 'base64',
          path: 'README.md',
          type: 'file',
          size: md.length,
          download_url: 'https://raw.githubusercontent.com/octo/hello/main/README.md',
          html_url: 'https://github.com/octo/hello/blob/main/README.md',
        });
      }
      if (url === 'https://api.github.com/repos/octo/hello') {
        return jsonResponse({ description: 'Says hello', stargazers_count: 42, forks_count: 3, default_branch: 'main', topics: ['greeting'] });
      }
      return jsonResponse({ message: 'Not Found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    setUrl('/readme-glow/?repo=octo/hello');
    await startup();
    expect(fetchMock).toHaveBeenCalled();
    const current = ui.get().doc!;
    expect(doc.text).toBe(md);
    expect(current.source).toEqual({ kind: 'github', owner: 'octo', repo: 'hello', ref: 'main', path: 'README.md' });
    expect(current.meta?.stars).toBe(42);
    expect(current.meta?.description).toBe('Says hello');
    expect(ui.get().loading).toBeNull();
  });

  it('shows GitHub errors as a toast', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'Not Found' }, 404)));
    setUrl('/readme-glow/?repo=octo/missing');
    await startup();
    expect(ui.get().doc).toBeNull();
    expect(ui.get().loading).toBeNull();
    expect(toastMessages().at(-1)).toMatch(/No README found for octo\/missing/);
  });

  it('opens ?sample=', async () => {
    setUrl('/readme-glow/?sample=nebula');
    await startup();
    expect(ui.get().doc?.source).toEqual({ kind: 'sample', id: 'nebula' });
  });

  it('restores the last open document, unless ?home is set', async () => {
    await openPasted('# Remember me\n');
    const id = ui.get().doc!.id;
    // Simulate a reload: fresh UI state, same library and localStorage.
    resetStores();
    await startup();
    expect(ui.get().doc?.id).toBe(id);
    expect(doc.text).toBe('# Remember me\n');

    resetStores();
    resetStartup();
    setUrl('/readme-glow/?home');
    await startup();
    expect(ui.get().doc).toBeNull();
  });

  it('runs only once per page load', async () => {
    const md = '# Once\n';
    setUrl(`/readme-glow/#md=${compressToEncodedURIComponent(md)}`);
    await Promise.all([startup(), startup()]);
    setUrl(`/readme-glow/#md=${compressToEncodedURIComponent(md)}`);
    await startup();
    expect(await (await library()).list()).toHaveLength(1);
  });

  it('stays on the landing page when the remembered document is gone', async () => {
    localStorage.setItem('readme-glow:last-doc', 'does-not-exist');
    await startup();
    expect(ui.get().doc).toBeNull();
  });
});
