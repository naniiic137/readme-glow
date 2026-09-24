import { describe, expect, it, vi, afterEach } from 'vitest';
import { DocStore, minimalChange } from './docStore';
import { buildShareUrl, markdownFromHash, encodeMarkdown, decodeMarkdown, MAX_HASH_CHARS } from './share';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, sanitiseSettings, settingsFromParams, settingsToParams, normaliseAccent } from './settings';
import { bundleFromFiles, chooseReadme, localResolver, normalisePath, resolveLocalPath, uniqueImagePath, type LocalFile } from './localFiles';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

describe('DocStore history', () => {
  it('undoes and redoes commits in order', () => {
    const s = new DocStore('a');
    s.commit('ab', { origin: 'editor' });
    s.commit('abc', { origin: 'visual' });
    expect(s.undo()).toBe(true);
    expect(s.text).toBe('ab');
    expect(s.undo()).toBe(true);
    expect(s.text).toBe('a');
    expect(s.undo()).toBe(false);
    expect(s.redo()).toBe(true);
    expect(s.redo()).toBe(true);
    expect(s.text).toBe('abc');
    expect(s.redo()).toBe(false);
  });

  it('groups quick typing into one undo step but keeps sources apart', () => {
    let t = 0;
    const s = new DocStore('', { now: () => t });
    for (const ch of 'hello') {
      t += 100;
      s.commit(s.text + ch, { origin: 'editor', group: 'typing' });
    }
    t += 100;
    s.commit('hello!', { origin: 'visual', group: 'visual' });
    s.undo();
    expect(s.text).toBe('hello');
    s.undo();
    expect(s.text).toBe('');
  });

  it('starts a new group after a pause', () => {
    let t = 0;
    const s = new DocStore('', { now: () => t, groupMs: 500 });
    s.commit('a', { origin: 'editor', group: 'typing' });
    t = 2000;
    s.commit('ab', { origin: 'editor', group: 'typing' });
    s.undo();
    expect(s.text).toBe('a');
  });

  it('shares one history between the code editor and the visual editor', () => {
    const s = new DocStore('# Title');
    s.commit('# Title!', { origin: 'editor' });
    s.commit('# Great Title!', { origin: 'visual' });
    s.commit('# Great Title!\n\nMore', { origin: 'beautify' });
    s.undo();
    s.undo();
    expect(s.text).toBe('# Title!');
  });

  it('clears redo after a new edit and notifies listeners with the origin', () => {
    const s = new DocStore('x');
    const seen: string[] = [];
    s.subscribe((tx) => seen.push(`${tx.origin}:${tx.text}`));
    s.commit('xy', { origin: 'editor' });
    s.undo();
    s.commit('xz', { origin: 'command' });
    expect(s.canRedo).toBe(false);
    expect(seen).toEqual(['editor:xy', 'history:x', 'command:xz']);
  });

  it('restores the selection saved before an edit', () => {
    const s = new DocStore('abc');
    s.commit('abXc', { origin: 'editor', selectionBefore: { anchor: 2, head: 2 }, selection: { anchor: 3, head: 3 } });
    s.undo();
    expect(s.lastSelection).toEqual({ anchor: 2, head: 2 });
  });

  it('ignores no-op commits and resets on load', () => {
    const s = new DocStore('a');
    expect(s.commit('a', { origin: 'editor' })).toBe(false);
    s.commit('b', { origin: 'editor' });
    s.reset('new doc');
    expect(s.canUndo).toBe(false);
    expect(s.text).toBe('new doc');
  });

  it('caps the history', () => {
    const s = new DocStore('', { limit: 5 });
    for (let i = 0; i < 20; i++) s.commit(String(i), { origin: 'editor' });
    let n = 0;
    while (s.undo()) n++;
    expect(n).toBe(5);
  });
});

describe('minimalChange', () => {
  it('finds the smallest replacement', () => {
    expect(minimalChange('hello world', 'hello brave world')).toEqual({ from: 6, to: 6, insert: 'brave ' });
    expect(minimalChange('abc', 'abc')).toBeNull();
    expect(minimalChange('abc', '')).toEqual({ from: 0, to: 3, insert: '' });
  });

  it('never splits an emoji', () => {
    const a = 'x😀y';
    const b = 'x😃y';
    const c = minimalChange(a, b)!;
    expect(a.slice(0, c.from) + c.insert + a.slice(c.to)).toBe(b);
    expect(c.insert.length % 2).toBe(0);
  });
});

describe('share links', () => {
  const app = 'https://naniiic137.github.io/readme-glow/';

  it('round-trips Markdown through the URL hash', () => {
    const md = '# Hi 👋\n\nمرحبا — ümlauts & <b>html</b>\n';
    const r = buildShareUrl(app, { ...DEFAULT_SETTINGS, theme: 'swiss' }, { markdown: md });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const url = new URL(r.url);
    expect(url.searchParams.get('theme')).toBe('swiss');
    expect(markdownFromHash(url.hash)).toBe(md);
  });

  it('shares GitHub READMEs by repository instead of content', () => {
    const r = buildShareUrl(app, DEFAULT_SETTINGS, { markdown: 'x', repo: { owner: 'o', repo: 'r', ref: 'dev' } });
    expect(r.ok && r.kind).toBe('repo');
    if (r.ok) {
      const url = new URL(r.url);
      expect(url.searchParams.get('repo')).toBe('o/r');
      expect(url.searchParams.get('ref')).toBe('dev');
      expect(url.hash).toBe('');
    }
  });

  it('refuses READMEs that are too big for a link', () => {
    let big = '';
    for (let i = 0; big.length < 60000; i++) big += `${Math.random().toString(36)} ${i}\n`;
    const r = buildShareUrl(app, DEFAULT_SETTINGS, { markdown: big });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.compressedLength).toBeGreaterThan(MAX_HASH_CHARS);
  });

  it('rejects garbage hashes', () => {
    expect(markdownFromHash('#md=%%%not-valid')).toBeNull();
    expect(markdownFromHash('#other=1')).toBeNull();
    expect(decodeMarkdown(encodeMarkdown('ok'))).toBe('ok');
  });
});

describe('settings', () => {
  it('persists and restores', () => {
    const storage = memoryStorage();
    const s = { ...DEFAULT_SETTINGS, theme: 'pixel' as const, accent: '#ff00aa', fontScale: 1.1 };
    expect(saveSettings(s, storage)).toBe(true);
    expect(loadSettings(storage)).toEqual(s);
  });

  it('survives broken or hostile storage', () => {
    const storage = memoryStorage();
    storage.setItem('readme-glow:settings:v1', '{not json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, throwing)).toBe(false);
  });

  it('validates every field', () => {
    const s = sanitiseSettings({ theme: 'hacker', layout: 'slides', fontScale: 99, accent: 'red', splitRatio: -3, reveal: 'false', codeTheme: '../../x' });
    expect(s.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(s.layout).toBe('slides');
    expect(s.fontScale).toBe(1.3);
    expect(s.accent).toBeNull();
    expect(s.splitRatio).toBe(0.2);
    expect(s.reveal).toBe(false);
    expect(s.codeTheme).toBe('theme');
  });

  it('normalises accents', () => {
    expect(normaliseAccent('#ABC')).toBe('#aabbcc');
    expect(normaliseAccent('ff00AA')).toBe('#ff00aa');
    expect(normaliseAccent('javascript:')).toBeNull();
  });

  it('round-trips look settings through URL parameters', () => {
    const s = { ...DEFAULT_SETTINGS, theme: 'terminal' as const, layout: 'docs' as const, accent: '#22cc88', lineNumbers: true, headingStyle: 'numbered' as const };
    const params = settingsToParams(s);
    expect(params.get('accent')).toBe('22cc88');
    expect(params.has('reveal')).toBe(false);
    const back = settingsFromParams(new URLSearchParams(params.toString()), DEFAULT_SETTINGS);
    expect(back).toEqual(s);
  });

  it('reads deep links like ?repo=o/r&theme=aurora&layout=docs', () => {
    const s = settingsFromParams(new URLSearchParams('repo=o/r&theme=synthwave&layout=landing&font=abc'), DEFAULT_SETTINGS);
    expect(s.theme).toBe('synthwave');
    expect(s.layout).toBe('landing');
    expect(s.fontScale).toBe(DEFAULT_SETTINGS.fontScale);
  });
});

describe('local files', () => {
  const f = (path: string, size = 10, type = ''): LocalFile => ({ path, file: new File([new Uint8Array(size)], path.split('/').pop()!, { type }) });

  it('picks the shallowest README', () => {
    expect(chooseReadme([f('proj/docs/README.md'), f('proj/README.md'), f('proj/CHANGELOG.md')])?.path).toBe('proj/README.md');
    expect(chooseReadme([f('notes.txt'), f('guide.md')])?.path).toBe('guide.md');
    expect(chooseReadme([f('node_modules/x/README.md'), f('a.png')])).toBeNull();
  });

  it('bundles a dropped project folder relative to its root', () => {
    const b = bundleFromFiles([f('proj/README.md'), f('proj/docs/shot.png', 10, 'image/png'), f('proj/src/app.ts'), f('proj/node_modules/x/logo.png')]);
    expect(b.readme?.path).toBe('README.md');
    expect(b.baseDir).toBe('');
    expect(b.images.map((i) => i.path)).toEqual(['docs/shot.png']);
    expect(b.skipped).toBe(2);
  });

  it('resolves relative image paths against the README folder', () => {
    expect(resolveLocalPath('./docs/a.png', '')).toBe('docs/a.png');
    expect(resolveLocalPath('../logo.png', 'docs')).toBe('logo.png');
    expect(resolveLocalPath('/img/x%20y.png?v=2#frag', 'docs')).toBe('img/x y.png');
    expect(resolveLocalPath('https://x/y.png', '')).toBeNull();
    expect(normalisePath('../../x')).toBeNull();
  });

  it('serves known images from object URLs and flags unknown ones', () => {
    const r = localResolver(new Map([['docs/a.png', 'blob:1']]), '');
    expect(r('docs/a.png', 'image')).toBe('blob:1');
    expect(r('missing.png', 'image')).toBeNull();
    expect(r('https://x/y.png', 'image')).toBeUndefined();
    expect(r('guide.md', 'link')).toBeUndefined();
    const sample = localResolver(new Map(), '', '/readme-glow/samples/nebula/');
    expect(sample('docs/hero one.svg', 'image')).toBe('/readme-glow/samples/nebula/docs/hero%20one.svg');
  });

  it('names pasted images uniquely', () => {
    const taken = new Set(['images/screenshot.png']);
    expect(uniqueImagePath('Screenshot.PNG', taken)).toBe('images/screenshot-2.png');
    expect(uniqueImagePath('Écran 2026 (1).jpeg', new Set())).toBe('images/ecran-2026-1.jpeg');
    expect(uniqueImagePath('', new Set())).toBe('images/image.png');
  });
});

afterEach(() => {
  vi.useRealTimers();
});
