import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../markdown/parse';
import { buildModel } from './sections';
import { extractSentences, sentencesOf } from './sentences';

const sentencesIn = (md: string, includeHtml = false) => extractSentences(buildModel(md, parseMarkdown(md)), { includeHtml });

describe('sentencesOf (splitting)', () => {
  it('splits ordinary sentences on . ! and ?', () => {
    expect(sentencesOf('It is fast. Is it small? Yes! It is.')).toEqual(['It is fast.', 'Is it small?', 'Yes!', 'It is.']);
  });

  it('does not split after abbreviations, initials or honorifics', () => {
    expect(sentencesOf('Use a bundler, e.g. Vite or Rollup. It works, i.e. mostly. Ask Dr. Smith or J. R. R. Tolkien. Done.')).toEqual([
      'Use a bundler, e.g. Vite or Rollup.',
      'It works, i.e. mostly.',
      'Ask Dr. Smith or J. R. R. Tolkien.',
      'Done.',
    ]);
  });

  it('keeps version numbers, file names and URLs intact', () => {
    expect(sentencesOf('Requires v1.2.3 and Node.js 20. Edit config.yml first. See https://example.com/a.b?c=d. Then run it.')).toEqual([
      'Requires v1.2.3 and Node.js 20.',
      'Edit config.yml first.',
      'See https://example.com/a.b?c=d.',
      'Then run it.',
    ]);
  });

  it('treats "etc." as an ending only before a capital letter, and handles ellipses', () => {
    expect(sentencesOf('It parses JSON, YAML, etc. and more. It supports CSV, TSV, etc. The end... or is it? Maybe... Probably.')).toEqual([
      'It parses JSON, YAML, etc. and more.',
      'It supports CSV, TSV, etc.',
      'The end... or is it?',
      'Maybe...',
      'Probably.',
    ]);
  });

  it('does not split inside a parenthesis', () => {
    expect(sentencesOf('fCoSE (pron. "f-cosay", fast Compound Spring Embedder) is quick. It is also neat.')).toEqual([
      'fCoSE (pron. "f-cosay", fast Compound Spring Embedder) is quick.',
      'It is also neat.',
    ]);
  });

  it('handles French spacing and abbreviations', () => {
    expect(sentencesOf("Bonjour ! Il convertit vos fichiers, p. ex. les images. Voir M. Dupont pour plus d'infos.")).toEqual([
      'Bonjour !',
      'Il convertit vos fichiers, p. ex. les images.',
      "Voir M. Dupont pour plus d'infos.",
    ]);
  });

  it('handles Arabic punctuation', () => {
    expect(sentencesOf('هذا مشروع مفتوح المصدر. هل تريد تجربته؟ جرّب النسخة الحية الآن.')).toEqual([
      'هذا مشروع مفتوح المصدر.',
      'هل تريد تجربته؟',
      'جرّب النسخة الحية الآن.',
    ]);
  });

  it('splits CJK text on full-width punctuation without spaces', () => {
    expect(sentencesOf('这是一个工具。它很快！你喜欢吗？')).toEqual(['这是一个工具。', '它很快！', '你喜欢吗？']);
  });

  it('returns nothing for empty or whitespace-only text', () => {
    expect(sentencesOf('')).toEqual([]);
    expect(sentencesOf('   \n  ')).toEqual([]);
  });
});

describe('extractSentences', () => {
  it('reads paragraphs, list items and quotes, and skips code, tables, badges and HTML', () => {
    const md = [
      '# Title',
      '',
      '[![Build](https://img.shields.io/badge/build-passing-green)](https://ci.example.com) First sentence here. Second one.',
      '',
      '```js',
      'const notASentence = true. // Nope.',
      '```',
      '',
      '| Col | Other |',
      '| --- | ----- |',
      '| Not a sentence. | Nor this. |',
      '',
      '<p>Raw HTML text is skipped.</p>',
      '',
      '- A list item sentence.',
      '',
      '> A quoted sentence.',
    ].join('\n');
    const s = sentencesIn(md);
    expect(s.map((x) => x.text)).toEqual(['First sentence here.', 'Second one.', 'A list item sentence.', 'A quoted sentence.']);
    expect(s.map((x) => x.kind)).toEqual(['paragraph', 'paragraph', 'list', 'quote']);
  });

  it('keeps the source line of every sentence, even mid-paragraph', () => {
    const md = '# T\n\nLine three starts here and\ncontinues on line four. This one starts on line four.\nAnd this on line five.\n';
    const s = sentencesIn(md);
    expect(s.map((x) => [x.text, x.line])).toEqual([
      ['Line three starts here and continues on line four.', 3],
      ['This one starts on line four.', 4],
      ['And this on line five.', 5],
    ]);
  });

  it('measures link and code share and strips GitHub alert markers', () => {
    const md = '[Docs](https://a.dev) · [Demo](https://b.dev)\n\nRun `npm run build` now.\n\n> [!NOTE]\n> Keep your key safe.\n';
    const s = sentencesIn(md);
    const nav = s.find((x) => x.text.includes('Docs'))!;
    expect(nav.linkRatio).toBeGreaterThan(0.8);
    const run = s.find((x) => x.text.startsWith('Run'))!;
    expect(run.codeRatio).toBeGreaterThan(0.5);
    expect(s.map((x) => x.text)).toContain('Keep your key safe.');
  });

  it('records the section and intro position of each sentence', () => {
    const md = '# App\n\nIntro sentence.\n\n## Installation\n\nInstall it first.\n';
    const s = sentencesIn(md);
    expect(s[0]).toMatchObject({ text: 'Intro sentence.', section: 0, heading: null });
    expect(s[1]).toMatchObject({ text: 'Install it first.', section: 1, heading: 'Installation' });
    expect(s[1]!.kinds).toContain('install');
  });

  it('includes raw HTML text on request, but not HTML titles', () => {
    const md = '<h1 align="center">App</h1>\n<h3 align="center">A small helper for big jobs</h3>\n<p>It does <b>one</b> thing well.</p>\n';
    expect(sentencesIn(md, false)).toEqual([]);
    expect(sentencesIn(md, true).map((x) => x.text)).toEqual(['A small helper for big jobs', 'It does one thing well.']);
  });
});
