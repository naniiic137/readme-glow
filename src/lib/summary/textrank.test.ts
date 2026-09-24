import { describe, expect, it } from 'vitest';
import type { Sentence } from './sentences';
import { isEligible, rankSentences, sentenceWeight, summarise, summaryLength, textRank, tokenize } from './textrank';

let counter = 0;
function sentence(text: string, extra: Partial<Sentence> = {}): Sentence {
  return {
    text,
    line: 1,
    index: counter++,
    block: 0,
    kind: 'paragraph',
    section: 2,
    heading: 'Details',
    kinds: [],
    words: text.split(/\s+/).filter(Boolean).length,
    linkRatio: 0,
    codeRatio: 0,
    firstInBlock: true,
    ...extra,
  };
}

function doc(texts: string[]): Sentence[] {
  counter = 0;
  return texts.map((t, i) => sentence(t, { index: i, line: i + 1 }));
}

describe('tokenize', () => {
  it('lower-cases, drops stopwords and numbers, and stems plurals', () => {
    expect(tokenize('The Editors render 3 Markdown files in the browser')).toEqual(['editor', 'render', 'markdown', 'file', 'browser']);
  });

  it('keeps non-Latin words and strips the Arabic article', () => {
    expect(tokenize('المشروع مفتوح المصدر')).toEqual(['مشروع', 'مفتوح', 'مصدر']);
  });
});

describe('textRank', () => {
  it('returns no scores for no sentences', () => {
    expect(textRank([])).toEqual({ scores: [], similarity: [] });
  });

  it('scores average 1 and favour connected sentences over unrelated ones', () => {
    const { scores, similarity } = textRank([
      'Markdown editor with live preview',
      'The live preview updates the Markdown editor instantly',
      'Preview themes for the Markdown editor',
      'Bananas are yellow',
    ]);
    expect(scores.reduce((a, b) => a + b, 0) / scores.length).toBeCloseTo(1, 5);
    // The first sentence shares the most words with the others.
    expect(Math.max(...scores)).toBe(scores[0]);
    expect(Math.min(...scores)).toBe(scores[3]);
    expect(similarity[3]!.every((s) => s === 0)).toBe(true);
    expect(similarity[0]![1]).toBeCloseTo(similarity[1]![0]!, 10);
  });

  it('is deterministic', () => {
    const texts = ['Alpha beta gamma.', 'Beta gamma delta.', 'Gamma delta epsilon.', 'Unrelated words entirely.'];
    expect(textRank(texts).scores).toEqual(textRank(texts).scores);
  });
});

describe('weights and eligibility', () => {
  it('boosts the intro and features, penalises licence, link lists, code and fragments', () => {
    const base = sentence('This library converts Markdown files into polished web pages quickly.');
    const w = sentenceWeight(base);
    expect(sentenceWeight({ ...base, section: 0 })).toBeGreaterThan(w);
    expect(sentenceWeight({ ...base, kinds: ['features'] })).toBeGreaterThan(w);
    expect(sentenceWeight({ ...base, kinds: ['licence'] })).toBeLessThan(w);
    expect(sentenceWeight({ ...base, linkRatio: 0.9 })).toBeLessThan(w);
    expect(sentenceWeight({ ...base, codeRatio: 0.6 })).toBeLessThan(w);
    expect(sentenceWeight({ ...base, text: 'Fast.', words: 1 })).toBeLessThan(w);
    expect(sentenceWeight({ ...base, words: 80 })).toBeLessThan(w);
    expect(sentenceWeight({ ...base, text: 'To install it, run:' })).toBeLessThan(w);
  });

  it('only lets real sentences into a summary', () => {
    expect(isEligible(sentence('A proper sentence about the project.'))).toBe(true);
    expect(isEligible(sentence('Docs · Demo · Discord', { linkRatio: 1 }))).toBe(false);
    expect(isEligible(sentence('https://example.com'))).toBe(false);
    expect(isEligible(sentence('Hi', { words: 1 }))).toBe(false);
  });
});

describe('summarise', () => {
  const texts = [
    'Glow turns README files into designed web pages in the browser.',
    'It renders Markdown with themes, code highlighting and diagrams.',
    'Every page can be exported as a single HTML file.',
    'The editor shows a live preview of the designed page.',
    'Themes change fonts, colours and layouts of the page.',
    'Diagrams are drawn with Mermaid inside the page.',
    'Run the tests before opening a pull request.',
    'The project is licensed under the MIT licence.',
  ];

  it('respects the requested count and keeps document order', () => {
    const out = summarise(doc(texts), 3);
    expect(out).toHaveLength(3);
    const indexes = out.map((s) => s.index);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('prefers the intro lead sentence and descriptive sentences over boilerplate', () => {
    const sentences = doc(texts).map((s, i) => (i === 0 ? { ...s, section: 0 } : i >= 6 ? { ...s, kinds: ['boilerplate' as const] } : s));
    const out = summarise(sentences, 3, { name: 'Glow' }).map((s) => s.text);
    expect(out[0]).toBe(texts[0]);
    expect(out).not.toContain(texts[6]);
    expect(out).not.toContain(texts[7]);
  });

  it('defaults to 3–5 sentences depending on length, fewer for tiny inputs', () => {
    expect(summaryLength(1)).toBe(1);
    expect(summaryLength(3)).toBe(3);
    expect(summaryLength(8)).toBe(3);
    expect(summaryLength(20)).toBe(4);
    expect(summaryLength(100)).toBe(5);
    expect(summarise(doc(texts.slice(0, 2)))).toHaveLength(2);
  });

  it('skips near-duplicates', () => {
    const out = summarise(doc(['Fast Markdown to HTML converter.', 'Fast Markdown to HTML converter!', 'Supports tables and task lists too.']), 2);
    expect(out.map((s) => s.text)).toEqual(['Fast Markdown to HTML converter.', 'Supports tables and task lists too.']);
  });

  it('is deterministic and handles empty input', () => {
    expect(summarise([])).toEqual([]);
    const a = rankSentences(doc(texts)).map((r) => r.sentence.index);
    const b = rankSentences(doc(texts)).map((r) => r.sentence.index);
    expect(a).toEqual(b);
  });
});
