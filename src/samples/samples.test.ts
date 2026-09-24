import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLES, SHOWCASE, getSample, type Sample } from './index';
import { renderMarkdown, type RenderOutput } from '../lib/markdown/pipeline';
import { collectImageRefs, normalisePath } from '../lib/editor/zip';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const THEMES = ['github', 'aurora', 'editorial', 'terminal', 'pixel', 'synthwave', 'blueprint', 'notebook', 'swiss', 'midnight', 'brutalist', 'zen', 'manuscript', 'frost', 'comic'];
const LAYOUTS = ['document', 'docs', 'landing', 'slides', 'magazine'];
const ALL: Sample[] = [...SAMPLES, SHOWCASE];

const rendered = new Map<string, Promise<RenderOutput>>();
function render(sample: Sample): Promise<RenderOutput> {
  let r = rendered.get(sample.id);
  if (!r) {
    // Resolve relative URLs the way the app does, against BASE_URL + assetBase.
    r = renderMarkdown(sample.markdown, {
      resolve: (url, kind) => (kind === 'image' && normalisePath(url.split(/[?#]/)[0]!) !== null ? `/readme-glow/${sample.assetBase}${url}` : undefined),
    });
    rendered.set(sample.id, r);
  }
  return r;
}

/** Visible text outside code, with tags removed. */
function proseText(html: string): string {
  return html
    .replace(/<pre[\s\S]*?<\/pre>/g, ' ')
    .replace(/<code[\s\S]*?<\/code>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  if (start === -1) return '';
  const next = markdown.indexOf('\n## ', start + 4);
  return markdown.slice(start, next === -1 ? undefined : next);
}

function lines(markdown: string): number {
  return markdown.trimEnd().split('\n').length;
}

describe('sample registry', () => {
  it('lists the samples in order and exposes the showcase', () => {
    expect(SAMPLES.map((s) => s.id)).toEqual(['nebula', 'quanta', 'pixel-quest', 'arabic']);
    expect(SHOWCASE.id).toBe('showcase');
  });

  it('finds samples by id', () => {
    expect(getSample('quanta')?.title).toBe('Quanta');
    expect(getSample('showcase')).toBe(SHOWCASE);
    expect(getSample('nope')).toBeUndefined();
  });

  it.each(ALL.map((s) => [s.id, s] as const))('%s has complete metadata', (id, s) => {
    expect(s.assetBase).toBe(`samples/${id}/`);
    expect(s.title.trim()).not.toBe('');
    expect(s.description.trim()).not.toBe('');
    expect(s.emoji.trim()).not.toBe('');
    expect(THEMES).toContain(s.recommended.theme);
    expect(LAYOUTS).toContain(s.recommended.layout);
    expect(s.markdown).not.toContain('\r');
    expect(s.markdown.endsWith('\n')).toBe(true);
  });
});

describe.each(ALL.map((s) => [s.id, s] as const))('sample %s', (_id, sample) => {
  it('renders with a level-1 title, without KaTeX errors or broken images', async () => {
    const r = await render(sample);
    expect(r.toc.some((t) => t.depth === 1)).toBe(true);
    expect(r.meta.title).toBeTruthy();
    expect(r.html).not.toContain('katex-error');
    expect(r.html).not.toContain('data-missing');
  });

  it('uses only valid emoji shortcodes', async () => {
    const r = await render(sample);
    expect(proseText(r.html)).not.toMatch(/:[a-z0-9_+-]+:/);
  });

  it('only references images that exist under public/samples/<id>/ or on https', () => {
    const refs = collectImageRefs(sample.markdown);
    for (const { url } of refs) {
      if (/^https:\/\//.test(url)) continue;
      const path = normalisePath(url);
      expect(path, url).not.toBeNull();
      expect(existsSync(join(PUBLIC, 'samples', sample.id, path!)), `${sample.id}: ${url}`).toBe(true);
    }
  });
});

describe('nebula', () => {
  const nebula = getSample('nebula')!;

  it('is a full-featured, long README', () => {
    expect(lines(nebula.markdown)).toBeGreaterThanOrEqual(180);
    expect(lines(nebula.markdown)).toBeLessThanOrEqual(260);
  });

  it('has a centred header with a logo, a badge row and a hero screenshot', async () => {
    const r = await render(nebula);
    expect(nebula.markdown.startsWith('<div align="center">')).toBe(true);
    expect(r.meta.title).toBe('Nebula Board');
    expect(r.meta.badges.length).toBeGreaterThanOrEqual(5);
    expect(r.meta.badges.length).toBeLessThanOrEqual(7);
    expect(r.meta.badges.every((b) => b.src.startsWith('https://img.shields.io/badge/'))).toBe(true);
    expect(r.meta.heroImage?.src).toContain('docs/screenshot.svg');
    expect(r.html).toContain('rg-caption');
  });

  it('uses all five GitHub alerts', async () => {
    const r = await render(nebula);
    for (const type of ['note', 'tip', 'important', 'warning', 'caution']) expect(r.html).toContain(`markdown-alert-${type}`);
  });

  it('has mermaid, footnotes, details, kbd, task lists, emoji and aligned tables', async () => {
    const r = await render(nebula);
    expect(r.features.mermaid).toBe(true);
    expect(r.features.emoji).toBe(true);
    expect(r.html).toContain('data-footnotes');
    expect(r.html).toContain('<details');
    expect(r.html).toContain('<kbd>');
    expect(r.html).toContain('contains-task-list');
    expect(r.html).toMatch(/<td[^>]*align="center"/);
    expect(r.html).toMatch(/<td[^>]*align="right"/);
    expect(r.stats.tables).toBeGreaterThanOrEqual(3);
  });

  it('has nested lists and captioned code blocks in TypeScript, Bash and YAML', async () => {
    const r = await render(nebula);
    expect(r.html).toMatch(/<li[^>]*>[\s\S]*?<ul/);
    expect(r.html).toContain('data-lang="ts"');
    expect(r.html).toContain('data-lang="bash"');
    expect(r.html).toContain('data-lang="yaml"');
    expect(r.html).toContain('src/app.ts');
    expect(r.html.match(/rg-code-file/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('covers the classic README sections', async () => {
    const r = await render(nebula);
    const headings = r.toc.map((t) => t.text).join(' | ');
    for (const h of ['Features', 'Tech stack', 'Installation', 'Usage', 'Architecture', 'Roadmap', 'FAQ', 'Contributing', 'Licence']) {
      expect(headings).toContain(h);
    }
  });
});

describe('quanta', () => {
  const quanta = getSample('quanta')!;

  it('renders inline and display maths', async () => {
    const r = await render(quanta);
    expect(r.features.math).toBe(true);
    expect(r.html).toContain('katex-display');
    expect(r.html.match(/class="katex"/g)!.length).toBeGreaterThanOrEqual(8);
  });

  it('has code in Python, Rust, JSON, YAML and shell', async () => {
    const r = await render(quanta);
    for (const lang of ['python', 'rust', 'json', 'yaml', 'bash', 'shell']) expect(r.html).toContain(`data-lang="${lang}"`);
  });

  it('uses every heading level from H1 to H6, blockquotes and footnotes', async () => {
    const r = await render(quanta);
    expect(new Set(r.toc.map((t) => t.depth))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(r.html).toContain('<blockquote');
    expect(r.html.match(/data-footnote-ref/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('has an API reference, a benchmarks table with a chart and a long changelog', async () => {
    const r = await render(quanta);
    expect(r.stats.tables).toBeGreaterThanOrEqual(2);
    expect(section(quanta.markdown, 'API reference')).toContain('| `Quantiles`');
    expect(section(quanta.markdown, 'Benchmarks')).toContain('docs/benchmark.svg');
    expect(lines(section(quanta.markdown, 'Changelog'))).toBeGreaterThanOrEqual(40);
    expect(lines(quanta.markdown)).toBeGreaterThanOrEqual(150);
    expect(lines(quanta.markdown)).toBeLessThanOrEqual(220);
  });
});

describe('pixel-quest', () => {
  const game = getSample('pixel-quest')!;

  it('uses an HTML h1 and a captioned hero screenshot', async () => {
    const r = await render(game);
    expect(game.markdown).toContain('<h1 align="center">');
    expect(r.toc[0]).toMatchObject({ depth: 1, text: 'Pixel Quest: The Clockwork Isles' });
    expect(r.html).toContain('<span class="rg-caption">The Whispering Forest, the first of five islands</span>');
  });

  it('has a three-image gallery, a controls table with kbd, spoilers and a task-list roadmap', async () => {
    const r = await render(game);
    expect(section(game.markdown, 'Screenshots').match(/!\[/g)).toHaveLength(3);
    expect(section(game.markdown, 'Controls').match(/<kbd>/g)!.length).toBeGreaterThanOrEqual(10);
    expect(r.html.match(/<details/g)).toHaveLength(2);
    expect(r.html).toContain('contains-task-list');
    expect(section(game.markdown, 'Credits')).toContain('|');
  });

  it('has an Arabic section that renders right-to-left', async () => {
    const r = await render(game);
    const arabic = section(game.markdown, 'لمحة');
    expect(arabic).toMatch(/[؀-ۿ]{3,}/);
    expect(arabic.match(/^- /gm)).toHaveLength(3);
    expect(r.toc.map((t) => t.text)).toContain('لمحة');
    expect(r.html).toMatch(/<p[^>]*dir="auto"[^>]*><strong>بيكسل كويست<\/strong>/);
  });

  it('is between 120 and 180 lines', () => {
    expect(lines(game.markdown)).toBeGreaterThanOrEqual(120);
    expect(lines(game.markdown)).toBeLessThanOrEqual(180);
  });
});

describe('arabic', () => {
  const arabic = getSample('arabic')!;

  it('is written in Arabic', async () => {
    const r = await render(arabic);
    const text = proseText(r.html);
    const ar = text.match(/[؀-ۿ]/g)?.length ?? 0;
    const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
    expect(ar).toBeGreaterThan(latin * 5);
    expect(r.meta.title).toBe('مِداد');
  });

  it('has a feature list, an install code block, an alert and a table', async () => {
    const r = await render(arabic);
    expect(r.html).toContain('data-lang="bash"');
    expect(r.html).toContain('markdown-alert-tip');
    expect(r.stats.tables).toBe(1);
    expect(section(arabic.markdown, 'المزايا').match(/^- /gm)!.length).toBeGreaterThanOrEqual(4);
  });
});

describe('showcase', () => {
  it('is short and has everything a theme preview needs', async () => {
    const r = await render(SHOWCASE);
    expect(lines(SHOWCASE.markdown)).toBeLessThanOrEqual(45);
    expect(r.meta.badges).toHaveLength(4);
    expect(r.meta.description).toBeTruthy();
    expect(r.stats.codeBlocks).toBe(1);
    expect(r.html.match(/<tr/g)).toHaveLength(4);
    expect(r.html).toContain('markdown-alert-note');
    expect(section(SHOWCASE.markdown, 'Features').match(/^- \p{Extended_Pictographic}/gmu)).toHaveLength(4);
  });
});

describe('sample images', () => {
  const root = join(PUBLIC, 'samples');
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(root);
  const svgs = files.filter((f) => f.endsWith('.svg'));

  it('are all small, self-contained SVGs', () => {
    expect(svgs.length).toBeGreaterThanOrEqual(10);
    for (const file of svgs) {
      const svg = readFileSync(file, 'utf8');
      const name = relative(root, file);
      expect(svg.length, name).toBeLessThan(25 * 1024);
      expect(svg, name).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+" viewBox="[\d. ]+"/);
      expect(svg, name).not.toMatch(/<script|<foreignObject|\son[a-z]+=|href="(?!#)|url\((?!#)|@import/i);
    }
  });

  it('are all used by a sample', () => {
    const used = new Set<string>();
    for (const s of ALL) {
      for (const { url } of collectImageRefs(s.markdown)) {
        const path = normalisePath(url);
        if (path !== null) used.add(join(root, s.id, path));
      }
    }
    expect(files.filter((f) => !used.has(f))).toEqual([]);
  });
});
