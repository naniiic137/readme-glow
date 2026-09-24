// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildStandaloneHtml, escapeHtml, fileSlug, safeCss, EXPORT_SCRIPT } from '../lib/export/html';
import { CARD_H, CARD_W, paintCard, wrapText, type CardInput } from '../lib/export/card';
import type { CardBackground } from '../themes/types';
import { getTheme, resolveMode, tokensFor } from '../themes/registry';
import { copyMarkdown, copyShareLink, downloadMarkdown, exportHtml, exportZip, printPdf, runExport } from './exporters';
import { library, openMarkdown, openPasted } from './actions';
import { doc, settings, ui } from './state';
import { sync } from './sync';
import { markdownFromHash } from '../lib/share';
import { configFromSettings, formatConfig } from '../lib/ghexport/config';
import { fakeCurrentDoc, fakeRender, resetStores, toastMessages } from '../test/helpers';

// ------------------------------------------------------------------ helpers

/** A 2D context that records calls; text is 0.55em wide per character. */
function fakeContext() {
  const texts: Array<{ text: string; x: number; y: number; font: string }> = [];
  const state: Record<string | symbol, unknown> = {
    font: '10px sans-serif',
    measureText(t: string) {
      const px = Number(/(\d+)px/.exec(String(state.font))?.[1] ?? 10);
      return { width: t.length * px * 0.55 };
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, font: String(state.font) });
    },
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  };
  const ctx = new Proxy(state, {
    get: (t, k) => (k in t ? t[k] : () => undefined),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

function fakeCanvas(ctx: CanvasRenderingContext2D | null) {
  return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

/** measureText = 10px per character. */
const tenPx = { measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as CanvasRenderingContext2D;

function cardInput(patch: Partial<CardInput> = {}): CardInput {
  const theme = getTheme('aurora');
  return {
    title: 'ReadmeGlow',
    description: 'Drop any README and it becomes a stunning page.',
    badges: [],
    footer: '3 min read · 420 words',
    tokens: tokensFor(theme, resolveMode(theme, 'default')),
    accent: '#7c5cff',
    background: 'mesh',
    fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
    ...patch,
  };
}

/** Captures what download() hands to the browser. */
function captureDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
    blobs.push(b as Blob);
    return `blob:mock/${blobs.length}`;
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  return { blobs, names };
}

function mockClipboard(writeText = vi.fn(async (_text: string) => undefined)) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
});

// ------------------------------------------------------------------ lib/export/html

describe('buildStandaloneHtml', () => {
  const base = { docHtml: '<div class="rg-doc"><h1>Hi</h1></div>', css: ['.a{color:red}', 'b{}'], math: false, themeColor: '#101014' };

  it('escapes the title, description, language and theme colour', () => {
    const html = buildStandaloneHtml({
      ...base,
      title: '<script>alert("x")</script> & Co',
      description: `It's "great" <b>`,
      lang: 'en"><script>',
      themeColor: '"><script>',
    });
    expect(html).toContain('<title>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co</title>');
    expect(html).toContain('<meta name="description" content="It&#39;s &quot;great&quot; &lt;b&gt;">');
    expect(html).toContain('<meta property="og:title" content="&lt;script&gt;');
    expect(html).toContain('<html lang="en&quot;&gt;&lt;script&gt;">');
    expect(html).not.toContain('<script>alert');
    // The only script is the exporter's own.
    expect(html.match(/<script>/g)).toHaveLength(1);
  });

  it('inlines the CSS (neutralising </style) and includes the document and script', () => {
    const html = buildStandaloneHtml({ ...base, title: 'T', description: null, css: ['.a{color:red}', 'x{content:"</style><script>"}'] });
    expect(html).toContain('.a{color:red}');
    expect(html).toContain('<\\/style><script>');
    expect(html.match(/<\/style>/g)).toHaveLength(1);
    expect(html).toContain('<div class="rg-doc"><h1>Hi</h1></div>');
    expect(html).toContain(`<script>${EXPORT_SCRIPT}</script>`);
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('omits description metas when there is no description, and truncates long ones', () => {
    expect(buildStandaloneHtml({ ...base, title: 'T', description: null })).not.toContain('name="description"');
    const long = buildStandaloneHtml({ ...base, title: 'T', description: 'x'.repeat(500) });
    expect(long).toContain(`content="${'x'.repeat(300)}"`);
    expect(long).not.toContain('x'.repeat(301));
  });

  it('links KaTeX only when the document has math', () => {
    expect(buildStandaloneHtml({ ...base, title: 'T', description: null })).not.toContain('katex');
    const math = buildStandaloneHtml({ ...base, title: 'T', description: null, math: true });
    expect(math).toContain('https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css');
    expect(buildStandaloneHtml({ ...base, title: 'T', description: null, math: true, katexVersion: '1.2.3' })).toContain('katex@1.2.3');
  });

  it('escapeHtml and safeCss', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    expect(safeCss('a{}</STYLE>b')).toBe('a{}<\\/style>b');
  });
});

describe('fileSlug', () => {
  it.each([
    ['My Project', 'my-project'],
    ['Héllo Wörld!', 'hello-world'],
    ['  --Rocket 🚀 Launch--  ', 'rocket-launch'],
    ['日本語 README', '日本語-readme'],
    ['مِداد', 'مداد'],
    ['', 'readme'],
    ['!!!', 'readme'],
  ])('%s → %s', (title, slug) => {
    expect(fileSlug(title)).toBe(slug);
  });

  it('caps the length and supports a custom fallback', () => {
    expect(fileSlug('a'.repeat(100))).toHaveLength(60);
    expect(fileSlug('???', 'card')).toBe('card');
  });
});

// ------------------------------------------------------------------ lib/export/card

describe('wrapText', () => {
  it('keeps short text on one line and collapses whitespace', () => {
    expect(wrapText(tenPx, 'short text', 200, 2)).toEqual(['short text']);
    expect(wrapText(tenPx, '  a \n\n  b  ', 200, 2)).toEqual(['a b']);
  });

  it('wraps words onto several lines', () => {
    expect(wrapText(tenPx, 'one two three four', 100, 3)).toEqual(['one two', 'three four']);
  });

  it('stops at maxLines and ends the last line with an ellipsis that fits', () => {
    const lines = wrapText(tenPx, 'one two three four five six seven', 100, 2);
    expect(lines).toEqual(['one two', 'three fou…']);
    for (const l of lines) expect(tenPx.measureText(l).width).toBeLessThanOrEqual(100);
  });

  it('hard-cuts a single word that is too long', () => {
    expect(wrapText(tenPx, 'supercalifragilistic', 100, 2)).toEqual(['supercali…']);
  });

  it('returns no lines for empty text', () => {
    expect(wrapText(tenPx, '', 100, 2)).toEqual([]);
  });
});

describe('paintCard', () => {
  const backgrounds: CardBackground[] = ['plain', 'mesh', 'grid', 'lines', 'dots', 'scanlines', 'sun', 'paper', 'halftone', 'stars', 'pixels', 'blocks', 'petals', 'parchment', 'frost'];

  it.each(backgrounds)('paints a 1200×630 card on the %s background', (background) => {
    const { ctx, texts } = fakeContext();
    const canvas = fakeCanvas(ctx);
    expect(() => paintCard(canvas, cardInput({ background }))).not.toThrow();
    expect(canvas.width).toBe(CARD_W);
    expect(canvas.height).toBe(CARD_H);
    const drawn = texts.map((t) => t.text);
    expect(drawn).toContain('ReadmeGlow');
    expect(drawn).toContain('3 min read · 420 words');
    expect(drawn.some((t) => t.startsWith('Drop any README'))).toBe(true);
  });

  it('upper-cases the title when the theme asks for it', () => {
    const { ctx, texts } = fakeContext();
    paintCard(fakeCanvas(ctx), cardInput({ title: 'Quiet title', upperTitle: true }));
    expect(texts[0]!.text).toBe('QUIET TITLE');
  });

  it('shrinks a long title to fit in two lines', () => {
    const { ctx, texts } = fakeContext();
    paintCard(fakeCanvas(ctx), cardInput({ title: 'A rather long project title that keeps going and going on', description: null }));
    const titleLines = texts.filter((t) => t.font.startsWith('700'));
    expect(titleLines.length).toBeLessThanOrEqual(2);
    const size = Number(/700 (\d+)px/.exec(titleLines[0]!.font)![1]);
    expect(size).toBeLessThan(84);
    expect(size).toBeGreaterThanOrEqual(36);
    for (const l of titleLines) expect(l.text.endsWith('…')).toBe(false);
  });

  it('draws shields.io badges as label/message pills', () => {
    const { ctx, texts } = fakeContext();
    paintCard(
      fakeCanvas(ctx),
      cardInput({
        badges: [
          { alt: 'build', src: 'https://img.shields.io/badge/build-passing-brightgreen', href: null },
          { alt: 'License: MIT', src: 'https://example.com/license.svg', href: null },
        ],
      }),
    );
    const drawn = texts.map((t) => t.text);
    expect(drawn).toEqual(expect.arrayContaining(['build', 'passing', 'License', 'MIT']));
  });

  it('does nothing without a 2D context', () => {
    const canvas = fakeCanvas(null);
    expect(() => paintCard(canvas, cardInput())).not.toThrow();
    expect(canvas.width).toBe(CARD_W);
  });
});

// ------------------------------------------------------------------ app/exporters

describe('downloads and clipboard', () => {
  it('downloads README.md with the current text', async () => {
    const { blobs, names } = captureDownloads();
    doc.reset('# Hello\n');
    downloadMarkdown();
    expect(names).toEqual(['README.md']);
    // The exported file remembers the look in an invisible comment.
    expect(await blobs[0]!.text()).toBe(`${formatConfig(configFromSettings(settings.get()))}\n# Hello\n`);
    expect(blobs[0]!.type).toContain('text/markdown');
    expect(toastMessages()).toContain('README.md downloaded.');
  });

  it('copies the Markdown, or explains when the clipboard is blocked', async () => {
    doc.reset('# Copy me');
    const writeText = mockClipboard();
    await copyMarkdown();
    expect(writeText).toHaveBeenCalledWith(`${formatConfig(configFromSettings(settings.get()))}\n# Copy me`);
    expect(toastMessages().at(-1)).toBe('Markdown copied to the clipboard.');

    mockClipboard(vi.fn(async (_text: string) => Promise.reject(new Error('denied'))));
    await copyMarkdown();
    expect(ui.get().toasts.at(-1)).toMatchObject({ kind: 'error', message: 'Your browser blocked clipboard access.' });
  });

  it('runExport("md") dispatches to the Markdown download', async () => {
    const { names } = captureDownloads();
    await runExport('md');
    expect(names).toEqual(['README.md']);
  });
});

describe('exportZip', () => {
  it('bundles README.md with its local images and rewrites the paths', async () => {
    const { blobs, names } = captureDownloads();
    const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    ui.set({
      doc: fakeCurrentDoc({
        title: 'Zip Me',
        baseDir: 'docs',
        blobs: new Map([
          ['docs/img/shot.png', png],
          ['elsewhere/other.png', png],
        ]),
      }),
    });
    doc.reset('# Zip Me\n\n![Shot](img/shot.png)\n');
    await exportZip();
    expect(names).toEqual(['zip-me.zip']);
    const files = unzipSync(new Uint8Array(await blobs[0]!.arrayBuffer()));
    const paths = Object.keys(files).sort();
    expect(paths).toHaveLength(2);
    expect(paths).toContain('README.md');
    const imagePath = paths.find((p) => p !== 'README.md')!;
    expect(imagePath).toMatch(/^images\/shot\.png$/);
    expect([...files[imagePath]!]).toEqual([1, 2, 3]);
    expect(strFromU8(files['README.md']!)).toContain(`](${imagePath})`);
    expect(toastMessages().at(-1)).toBe('Zip downloaded with 1 image.');
  });

  it('works without images', async () => {
    const { names } = captureDownloads();
    ui.set({ doc: fakeCurrentDoc({ title: 'Plain' }) });
    doc.reset('# Plain\n');
    await exportZip();
    expect(names).toEqual(['plain.zip']);
    expect(toastMessages().at(-1)).toMatch(/no local images/);
  });
});

describe('exportHtml', () => {
  it('asks for the preview when there is none', async () => {
    ui.set({ doc: fakeCurrentDoc() });
    await exportHtml();
    expect(ui.get().toasts.at(-1)).toMatchObject({ kind: 'error', message: expect.stringMatching(/Open the preview first/) });
  });

  it('exports a cleaned-up copy of the live document', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    const { blobs, names } = captureDownloads();
    const live = document.createElement('div');
    live.className = 'rg-doc in-pane reveal-on theme-aurora';
    live.style.setProperty('--rg-viewport', '500px');
    live.innerHTML = [
      '<article class="rg-article">',
      '<h1 data-line="1" data-src="0:7" data-block="0" class="is-source-active">Hello</h1>',
      '<p contenteditable="true" data-reveal="" class="is-visible is-editing" data-inner="1:2">Body text</p>',
      '<div class="ve-ui">editing toolbar</div>',
      '<canvas class="rg-particles"></canvas>',
      '</article>',
    ].join('');
    sync.preview = { element: () => live.querySelector('article'), scrollToLine: vi.fn(), topLine: () => 1 };
    ui.set({
      doc: fakeCurrentDoc({ title: 'Hello & <World>' }),
      render: fakeRender([], { meta: { title: 'Hello', description: 'A "quoted" description', badges: [], heroImage: null }, features: { math: true } as never }),
    });
    doc.reset('# Hello\n\nBody text\n');

    await exportHtml();
    expect(names).toEqual(['hello-world.html']);
    const html = await blobs[0]!.text();
    expect(html).toContain('<title>Hello &amp; &lt;World&gt;</title>');
    expect(html).toContain('content="A &quot;quoted&quot; description"');
    expect(html).toContain('katex');
    expect(html).toContain('Body text');
    expect(html).toContain('theme-aurora');
    for (const gone of ['data-line', 'data-src', 'data-inner', 'data-block', 'data-reveal', 'contenteditable', 've-ui', 'rg-particles', 'in-pane', 'reveal-on', 'is-source-active', 'is-editing', '--rg-viewport:500px']) {
      expect(html).not.toContain(gone);
    }
    // The live preview itself is untouched.
    expect(live.querySelector('.ve-ui')).not.toBeNull();
    expect(toastMessages().at(-1)).toMatch(/Standalone HTML downloaded/);
  });
});

describe('printPdf', () => {
  it('prints with exact colours for dark themes and cleans up afterwards', () => {
    vi.useFakeTimers();
    try {
      const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
      printPdf(true);
      expect(document.body).toHaveClass('print-exact');
      vi.advanceTimersByTime(60);
      expect(print).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new Event('afterprint'));
      expect(document.body).not.toHaveClass('print-exact');
      printPdf(false);
      expect(document.body).not.toHaveClass('print-exact');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('copyShareLink', () => {
  beforeEach(async () => {
    await (await library()).clear();
  });

  it('puts small READMEs inside the link hash with the look settings', async () => {
    const writeText = mockClipboard();
    settings.set({ theme: 'synthwave', layout: 'slides' });
    await openPasted('# Share me\n\nSmall enough.');
    expect(await copyShareLink()).toBe(true);
    const url = new URL(writeText.mock.calls[0]![0] as string);
    expect(url.searchParams.get('theme')).toBe('synthwave');
    expect(url.searchParams.get('layout')).toBe('slides');
    expect(markdownFromHash(url.hash)).toBe('# Share me\n\nSmall enough.');
    expect(toastMessages().at(-1)).toMatch(/travels inside the link/);
  });

  it('shares unedited GitHub READMEs as ?repo=', async () => {
    const writeText = mockClipboard();
    await openMarkdown('# Remote', { source: { kind: 'github', owner: 'octo', repo: 'hello', ref: 'dev', path: 'README.md' } });
    await copyShareLink();
    const url = new URL(writeText.mock.calls[0]![0] as string);
    expect(url.searchParams.get('repo')).toBe('octo/hello');
    expect(url.searchParams.get('ref')).toBe('dev');
    expect(url.hash).toBe('');
  });

  it('refuses READMEs too long for a link', async () => {
    const writeText = mockClipboard();
    let seed = 1;
    const noise = Array.from({ length: 40000 }, () => String.fromCharCode(33 + ((seed = (seed * 16807) % 2147483647) % 90))).join('');
    await openPasted(`# Huge\n\n${noise}`);
    expect(await copyShareLink()).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(ui.get().toasts.at(-1)).toMatchObject({ kind: 'error', message: expect.stringMatching(/too long for a link/) });
  });

  it('returns false without a document', async () => {
    expect(await copyShareLink()).toBe(false);
  });
});
