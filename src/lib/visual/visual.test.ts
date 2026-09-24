// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../markdown/pipeline';
import { serializeBlock, serializeInline, detectStyle, escapeText, DEFAULT_STYLE } from './serialize';
import {
  commitInline,
  commitCode,
  continuationPrefix,
  deleteBlock,
  insertBlockAfter,
  moveBlock,
  parseRange,
  splitBlock,
  mergeWithPrevious,
  sectionRanges,
  type Range,
} from './blocks';

async function mount(md: string): Promise<HTMLElement> {
  const { html } = await renderMarkdown(md);
  const root = document.createElement('article');
  root.innerHTML = html;
  return root;
}

function blockOf(root: HTMLElement, selector: string) {
  const el = root.querySelector<HTMLElement>(selector)!;
  return { el, kind: el.dataset.block!, src: parseRange(el.dataset.src)!, inner: parseRange(el.dataset.inner)! };
}

/** Simulates the user typing: runs `edit` on the element and commits the block. */
async function editBlock(md: string, selector: string, edit: (el: HTMLElement) => void): Promise<string> {
  const root = await mount(md);
  const { el, kind, inner } = blockOf(root, selector);
  const style = detectStyle(md);
  const before = serializeBlock(el, kind, style);
  edit(el);
  const after = serializeBlock(el, kind, style);
  return commitInline(md, inner, before, after);
}

function firstText(el: Node): Text {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const parent = n.parentElement;
      if (!parent || parent.closest('.katex, [data-footnote-ref], svg, .rg-anchor, .rg-caption')) return NodeFilter.FILTER_REJECT;
      const list = parent.closest('ul, ol, blockquote, pre, table');
      if (list && list !== el && el.contains(list)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n = walker.nextNode() as Text | null;
  while (n && !n.nodeValue?.trim()) n = walker.nextNode() as Text | null;
  return n!;
}

describe('serializer round-trips common Markdown', () => {
  it.each([
    'Plain text with **bold**, _italic_, `code` and ~~strike~~.',
    'A [link](https://example.com "Title") and an ![image](https://example.com/a.png).',
    'Keys <kbd>Ctrl</kbd> + <kbd>K</kbd>, H<sub>2</sub>O and x<sup>2</sup>.',
    'Snake_case_names stay as they are, and 5 * 3 = 15.',
    'Escaped \\*stars\\* and \\[brackets\\] stay escaped.',
    'Autolink https://example.com/path stays bare.',
    'Footnote reference[^1].\n\n[^1]: Note.',
  ])('%s', async (md) => {
    const root = await mount(md);
    const p = root.querySelector('p')!;
    const inner = parseRange(p.dataset.inner)!;
    expect(serializeBlock(p, 'paragraph', detectStyle(md))).toBe(md.slice(inner.start, inner.end));
  });

  it('keeps the author’s emphasis style', () => {
    expect(detectStyle('*a* and *b* and __c__')).toEqual({ emphasis: '*', strong: '__' });
    expect(detectStyle('_a_ **b**')).toEqual({ emphasis: '_', strong: '**' });
  });

  it('escapes only what could change the meaning', () => {
    expect(escapeText('5 * 3', DEFAULT_STYLE, false)).toBe('5 * 3');
    expect(escapeText('*not bold*', DEFAULT_STYLE, false)).toBe('\\*not bold\\*');
    expect(escapeText('snake_case', DEFAULT_STYLE, false)).toBe('snake_case');
    expect(escapeText('# not a heading', DEFAULT_STYLE, true)).toBe('\\# not a heading');
    expect(escapeText('1. not a list', DEFAULT_STYLE, true)).toBe('1\\. not a list');
    expect(escapeText('a | b', { ...DEFAULT_STYLE, inTable: true }, false)).toBe('a \\| b');
    expect(escapeText('<script>', DEFAULT_STYLE, false)).toBe('&lt;script>');
  });

  it('serialises formatting the user applied', () => {
    const div = document.createElement('div');
    div.innerHTML = 'Make <b>this</b> <i>italic </i><a href="https://x.y">link</a><br>next<code>a`b</code>';
    expect(serializeInline(div)).toBe('Make **this** _italic_ [link](https://x.y)\\\nnext``a`b``');
  });

  it('writes original URLs, not the resolved ones', async () => {
    const { html } = await renderMarkdown('See [guide](docs/guide.md) ![s](docs/s.png)', {
      resolve: (u, k) => (k === 'image' ? `https://raw.example/${u}` : `https://gh.example/${u}`),
    });
    const root = document.createElement('div');
    root.innerHTML = html;
    expect(serializeBlock(root.querySelector('p')!, 'paragraph')).toBe('See [guide](docs/guide.md) ![s](docs/s.png)');
  });

  it('turns KaTeX output back into TeX', async () => {
    const root = await mount('Euler $e^{i\\pi}+1=0$ rocks');
    expect(serializeBlock(root.querySelector('p')!, 'paragraph')).toBe('Euler $e^{i\\pi}+1=0$ rocks');
  });
});

describe('visual edits change only the edited characters', () => {
  const doc = '# Title\n\nFirst paragraph here.\n\n- one\n- [ ] task two\n\n> quoted\n> text\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';

  it('paragraph', async () => {
    const out = await editBlock(doc, 'p[data-block=paragraph]', (el) => (firstText(el).nodeValue = 'First paragraph, edited.'));
    expect(out).toBe(doc.replace('First paragraph here.', 'First paragraph, edited.'));
  });

  it('heading', async () => {
    const out = await editBlock(doc, 'h1', (el) => (firstText(el).nodeValue = 'New title'));
    expect(out).toBe(doc.replace('# Title', '# New title'));
  });

  it('list item', async () => {
    const out = await editBlock(doc, 'li[data-block=item]', (el) => (firstText(el).nodeValue = 'uno'));
    expect(out).toBe(doc.replace('- one', '- uno'));
  });

  it('task item keeps its checkbox', async () => {
    const out = await editBlock(doc, 'li.task-list-item', (el) => (firstText(el).nodeValue = ' task 2'));
    expect(out).toBe(doc.replace('- [ ] task two', '- [ ] task 2'));
  });

  it('multi-line blockquote paragraph keeps its > markers', async () => {
    const out = await editBlock(doc, 'blockquote p', (el) => (firstText(el).nodeValue = 'quoted\nand more'));
    expect(out).toBe(doc.replace('> quoted\n> text', '> quoted\n> and more'));
  });

  it('table cell', async () => {
    const out = await editBlock(doc, 'td', (el) => (firstText(el).nodeValue = 'x | y'));
    expect(out).toBe(doc.replace('| 1 | 2 |', '| x \\| y | 2 |'));
  });

  it('applying bold in the preview writes **', async () => {
    const out = await editBlock('Make this bold.\n', 'p', (el) => {
      el.innerHTML = 'Make <strong>this</strong> bold.';
    });
    expect(out).toBe('Make **this** bold.\n');
  });

  it('no change means no write', async () => {
    const md = 'Weird *emphasis* and __strong__ styles.\n';
    const out = await editBlock(md, 'p', () => {});
    expect(out).toBe(md);
  });

  it('alert body', async () => {
    const md = '> [!TIP]\n> Use the force.\n';
    const out = await editBlock(md, '.markdown-alert p:not(.markdown-alert-title)', (el) => (firstText(el).nodeValue = 'Use the source.'));
    expect(out).toBe('> [!TIP]\n> Use the source.\n');
  });

  it('code block contents', async () => {
    const md = 'x\n\n```js\nlet a = 1;\n```\n\ny\n';
    const root = await mount(md);
    const fig = root.querySelector<HTMLElement>('figure.rg-code')!;
    const out = commitCode(md, parseRange(fig.dataset.src)!, parseRange(fig.dataset.inner)!, 'let a = 2;\nlet b = 3;\n');
    expect(out).toBe('x\n\n```js\nlet a = 2;\nlet b = 3;\n```\n\ny\n');
  });

  it('code containing a fence gets a longer fence', () => {
    const md = '```\nold\n```\n';
    const out = commitCode(md, { start: 0, end: 11 }, { start: 4, end: 7 }, 'has\n```\ninside');
    expect(out).toBe('````\nhas\n```\ninside\n````\n');
  });
});

describe('block structure operations', () => {
  const md = '# A\n\nPara one.\n\n## B\n\nPara two.\n';
  const ranges = (text: string, parts: string[]): Range[] =>
    parts.map((p) => {
      const start = text.indexOf(p);
      return { start, end: start + p.length };
    });

  it('inserts a block after another with one blank line', () => {
    const [, p1] = ranges(md, ['# A', 'Para one.']);
    const r = insertBlockAfter(md, p1!, '> [!NOTE]\n> New');
    expect(r.text).toBe('# A\n\nPara one.\n\n> [!NOTE]\n> New\n\n## B\n\nPara two.\n');
    expect(r.text.slice(r.range.start, r.range.end)).toBe('> [!NOTE]\n> New');
  });

  it('inserts at the top and at the end', () => {
    expect(insertBlockAfter('Body\n', null, '# Title').text).toBe('# Title\n\nBody\n');
    const last = ranges(md, ['Para two.'])[0]!;
    expect(insertBlockAfter(md, last, '---').text).toBe(`${md}\n---\n`);
  });

  it('deletes a block cleanly', () => {
    const [p1] = ranges(md, ['Para one.']);
    expect(deleteBlock(md, p1!)).toBe('# A\n\n## B\n\nPara two.\n');
    const last = ranges(md, ['Para two.'])[0]!;
    expect(deleteBlock(md, last)).toBe('# A\n\nPara one.\n\n## B\n');
  });

  it('moves blocks and leaves the rest byte-identical', () => {
    const blocks = ranges(md, ['# A', 'Para one.', '## B', 'Para two.']);
    expect(moveBlock(md, blocks, 1, 3)).toBe('# A\n\n## B\n\nPara two.\n\nPara one.\n');
    expect(moveBlock(md, blocks, 3, 0)).toBe('Para two.\n\n# A\n\nPara one.\n\n## B\n');
    expect(moveBlock(md, blocks, 2, 2)).toBe(md);
  });

  it('moves whole sections', () => {
    const text = '# T\n\nIntro\n\n## One\n\n1\n\n## Two\n\n2\n';
    const blocks = [
      { ...ranges(text, ['# T'])[0]!, heading: 1 },
      ranges(text, ['Intro'])[0]!,
      { ...ranges(text, ['## One'])[0]!, heading: 2 },
      ranges(text, ['1\n'])[0]!,
      { ...ranges(text, ['## Two'])[0]!, heading: 2 },
      ranges(text, ['2\n'])[0]!,
    ].map((b) => ({ ...b, end: b.end - (text.slice(b.start, b.end).endsWith('\n') ? 1 : 0) }));
    const sections = sectionRanges(blocks);
    expect(sections).toHaveLength(3);
    expect(moveBlock(text, sections.slice(1), 1, 0)).toBe('# T\n\nIntro\n\n## Two\n\n2\n\n## One\n\n1\n');
  });

  it('splits paragraphs, headings and list items at the caret', () => {
    const p = splitBlock('Hello world\n', { start: 0, end: 11 }, { start: 0, end: 11 }, 'paragraph', 'Hello', 'world');
    expect(p.text).toBe('Hello\n\nworld\n');
    expect(p.text.slice(p.caret)).toBe('world\n');
    const h = splitBlock('## Big title\n', { start: 0, end: 12 }, { start: 3, end: 12 }, 'heading', 'Big', 'title');
    expect(h.text).toBe('## Big\n\ntitle\n');
    const li = splitBlock('1. first second\n', { start: 0, end: 15 }, { start: 3, end: 15 }, 'item', 'first', 'second');
    expect(li.text).toBe('1. first\n2. second\n');
    const task = splitBlock('- [x] a b\n', { start: 0, end: 9 }, { start: 6, end: 9 }, 'item', 'a', 'b');
    expect(task.text).toBe('- [x] a\n- [ ] b\n');
    const quote = splitBlock('> one two\n', { start: 2, end: 9 }, { start: 2, end: 9 }, 'paragraph', 'one', 'two');
    expect(quote.text).toBe('> one\n>\n> two\n');
  });

  it('merges a block into the previous one', () => {
    const src = 'First\n\nSecond\n';
    const r = mergeWithPrevious(src, { start: 0, end: 5 }, { start: 7, end: 13 }, { start: 7, end: 13 });
    expect(r.text).toBe('FirstSecond\n');
    expect(r.caret).toBe(5);
  });

  it('computes continuation prefixes', () => {
    expect(continuationPrefix('> - [ ] x', 8)).toBe('>       ');
    expect(continuationPrefix('10. item', 4)).toBe('    ');
    expect(continuationPrefix('plain', 0)).toBe('');
  });
});

const samples = import.meta.glob('../../samples/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const fixtures: Record<string, string> = {
  ...samples,
  kitchen: [
    '<div align="center">\n\n# Kitchen sink\n\n**Bold** tagline with a [link](https://x.y).\n\n</div>',
    '## Lists\n\n- one\n- two with `code`\n  - nested\n1. first\n2. second\n\n- [x] done\n- [ ] todo',
    '> [!WARNING]\n> Careful _now_.\n\n> Plain quote\n> over two lines',
    '| Col | Other |\n|:---|---:|\n| a | **b** |\n| c | d |',
    'Text with footnote[^n] and emoji :tada: and math $x^2$.\n\n[^n]: The note.',
    '### Code\n\n```ts title="a.ts"\nconst a = 1;\n```',
    '<details><summary>More</summary>\n\nHidden paragraph.\n\n</details>',
  ].join('\n\n'),
};

describe('fuzz: editing one block never touches the rest of the file', () => {
  for (const [name, md] of Object.entries(fixtures)) {
    it(name.replace(/^.*\//, ''), async () => {
      const root = await mount(md);
      const style = detectStyle(md);
      const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-inner]')).filter((el) => el.dataset.block !== 'code');
      expect(blocks.length).toBeGreaterThan(3);
      let roundTrips = 0;
      for (const el of blocks) {
        const inner = parseRange(el.dataset.inner)!;
        const kind = el.dataset.block!;
        const before = serializeBlock(el, kind, style);
        if (before === md.slice(inner.start, inner.end)) roundTrips++;
        const text = firstText(el);
        if (!text) continue;
        const original = text.nodeValue!;
        text.nodeValue = `${original}ZQX`;
        const after = serializeBlock(el, kind, style);
        text.nodeValue = original;
        const out = commitInline(md, inner, before, after);
        expect(out.slice(0, inner.start), `${kind} at ${inner.start}`).toBe(md.slice(0, inner.start));
        expect(out.slice(out.length - (md.length - inner.end)), `${kind} at ${inner.start}`).toBe(md.slice(inner.end));
        expect(out, `${kind} "${md.slice(inner.start, inner.end).slice(0, 60)}" → ${after.slice(0, 80)}`).toContain('ZQX');
      }
      // The serializer reproduces most blocks exactly, so most edits are character-precise.
      expect(roundTrips / blocks.length).toBeGreaterThan(0.75);
    });
  }
});
