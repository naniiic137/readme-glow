import { describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Library, createAutosaver, titleFromMarkdown, DOC_CAP } from './library';

async function fresh(): Promise<Library> {
  return Library.open(new IDBFactory());
}

describe('Library (IndexedDB)', () => {
  it('creates, lists newest first and restores documents', async () => {
    const lib = await fresh();
    const a = await lib.create({ markdown: '# Alpha\n\nfirst', source: { kind: 'paste' }, now: 1 });
    const b = await lib.create({ markdown: '# Beta', source: { kind: 'new' }, now: 2 });
    const list = await lib.list();
    expect(list.map((d) => d.title)).toEqual(['Beta', 'Alpha']);
    expect('markdown' in list[0]!).toBe(false);
    expect((await lib.get(a.id))?.markdown).toBe('# Alpha\n\nfirst');
    expect(b.words).toBe(1);
  });

  it('updates Markdown, marks the document edited and follows the title', async () => {
    const lib = await fresh();
    const d = await lib.create({ markdown: '# Old', source: { kind: 'paste' } });
    const next = await lib.updateMarkdown(d.id, '# New name\n\nbody');
    expect(next?.edited).toBe(true);
    expect(next?.title).toBe('New name');
  });

  it('keeps a custom name when the heading changes', async () => {
    const lib = await fresh();
    const d = await lib.create({ markdown: '# Old', source: { kind: 'paste' } });
    await lib.rename(d.id, 'My notes');
    const next = await lib.updateMarkdown(d.id, '# Changed');
    expect(next?.title).toBe('My notes');
  });

  it('duplicates documents with their images', async () => {
    const lib = await fresh();
    const d = await lib.create({ markdown: '![x](images/a.png)', source: { kind: 'sample', id: 'nebula' } });
    await lib.addAsset(d.id, 'images/a.png', new Blob(['png'], { type: 'image/png' }), 'a.png');
    const copy = (await lib.duplicate(d.id))!;
    expect(copy.title).toMatch(/\(copy\)$/);
    expect(copy.source).toEqual({ kind: 'new' });
    const assets = await lib.assets(copy.id);
    expect(assets.map((x) => x.path)).toEqual(['images/a.png']);
    expect((await lib.get(copy.id))?.assetPaths).toEqual(['images/a.png']);
  });

  it('deletes a document and its images; clears everything', async () => {
    const lib = await fresh();
    const d = await lib.create({ markdown: 'x', source: { kind: 'paste' } });
    await lib.addAsset(d.id, 'images/a.png', new Blob(['1']), 'a.png');
    await lib.remove(d.id);
    expect(await lib.get(d.id)).toBeUndefined();
    expect(await lib.assets(d.id)).toEqual([]);
    await lib.create({ markdown: 'y', source: { kind: 'paste' } });
    await lib.clear();
    expect(await lib.list()).toEqual([]);
  });

  it('finds an earlier copy of the same GitHub README', async () => {
    const lib = await fresh();
    const src = { kind: 'github' as const, owner: 'O', repo: 'R', ref: 'main', path: 'README.md' };
    const d = await lib.create({ markdown: 'x', source: src });
    expect((await lib.findBySource({ ...src, owner: 'o', repo: 'r' }))?.id).toBe(d.id);
  });

  it('caps the library to the newest documents', async () => {
    const lib = Library.memory();
    for (let i = 0; i < DOC_CAP + 5; i++) await lib.create({ markdown: `# D${i}`, source: { kind: 'paste' }, now: i });
    const list = await lib.list();
    expect(list).toHaveLength(DOC_CAP);
    expect(list[0]!.title).toBe(`D${DOC_CAP + 4}`);
  });

  it('falls back to memory when IndexedDB is missing', async () => {
    const lib = await Library.open(null);
    const d = await lib.create({ markdown: '# M', source: { kind: 'new' } });
    expect((await lib.get(d.id))?.title).toBe('M');
  });
});

describe('titleFromMarkdown', () => {
  it.each([
    ['# Hello *World*', 'Hello World'],
    ['<h1 align="center">  <img src="x"> Glow </h1>', 'Glow'],
    ['Setext\n======\n', 'Setext'],
    ['# [Linked](https://x) title', 'Linked title'],
    ['no heading', 'Untitled README'],
    ['<h1 align="center"><img src="logo.svg" alt="awesome" width="200"></h1>', 'awesome'],
  ])('%s → %s', (md, title) => {
    expect(titleFromMarkdown(md)).toBe(title);
  });
});

describe('createAutosaver', () => {
  it('debounces writes and saves only the latest text', async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const states: string[] = [];
    const saver = createAutosaver(async (t) => void saved.push(t), { delay: 500, onState: (s) => states.push(s) });
    saver.schedule('a');
    saver.schedule('ab');
    saver.schedule('abc');
    expect(saver.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(saved).toEqual(['abc']);
    expect(saver.state).toBe('saved');
    expect(states).toContain('saving');
    vi.useRealTimers();
  });

  it('saves at least every maxWait while typing continuously', async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const saver = createAutosaver(async (t) => void saved.push(t), { delay: 500, maxWait: 1200 });
    for (let i = 0; i < 10; i++) {
      saver.schedule(`v${i}`);
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(saved.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  it('flushes immediately and reports errors', async () => {
    const saver = createAutosaver(async () => {
      throw new Error('disk full');
    });
    saver.schedule('x');
    await saver.flush();
    expect(saver.state).toBe('error');
  });
});
