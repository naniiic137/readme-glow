import type { Sentence } from './sentences';

/**
 * Extractive summarisation: TextRank (weighted PageRank, damping 0.85) over a
 * TF-IDF cosine-similarity graph, then README-aware weights: sentences from
 * the intro and "About / Overview / Features" sections are boosted; very short
 * or very long sentences, link lists, code-heavy lines, instructions and
 * boilerplate (licence, contributing, ...) are penalised. Fully deterministic.
 */
export const STOPWORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being below between both but by ' +
    'can could did do does doing down during each either else etc even ever every few for from further get gets got had has have ' +
    'having he her here hers herself him himself his how however i if in into is it its itself just let lets like make makes may ' +
    'me might more most much must my myself need needs no nor not now of off on once one only or other our ours ourselves out ' +
    'over own per please same shall she should so some such than that the their theirs them themselves then there these they this ' +
    'those through thus to too under until up upon us use used uses using very via was we well were what when where whether which ' +
    'while who whom whose why will with within without would yet you your yours yourself yourselves its it’s you’ll we’re ' +
    // French
    'au aux avec ce ces cette dans de des du elle en est et il ils je la le les leur lui mais même ne nous on ou où par pas pour ' +
    'qu que qui sa se ses son sont sur ta te tes ton tu un une vos votre vous été être ' +
    // Arabic
    'في من على إلى الى عن مع هذا هذه ذلك تلك التي الذي الذين و أو او ثم أن ان إن كان كانت هو هي هم ما لا لم لن قد كل بعض عند'
  ).split(/\s+/),
);

/** Lower-cased content words: stopwords and numbers removed, light stemming. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const words = text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’_-]*/gu) ?? [];
  for (let w of words) {
    w = w.replace(/['’]s$/, '').replace(/['’_-]+$/, '');
    if (w.length < 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    if (/^[a-z]+$/.test(w) && w.length > 4) {
      if (w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
      else if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
    } else if (/^ال\p{L}{2,}/u.test(w)) {
      w = w.slice(2); // Arabic definite article
    }
    out.push(w);
  }
  return out;
}

type Vector = Map<string, number>;

function tfidfVectors(docs: string[][]): Vector[] {
  const df = new Map<string, number>();
  for (const doc of docs) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  return docs.map((doc) => {
    const tf = new Map<string, number>();
    for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v: Vector = new Map();
    for (const [t, count] of tf) v.set(t, count * (Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1));
    return v;
  });
}

function norm(v: Vector): number {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
}

export function cosine(a: Vector, b: Vector, na = norm(a), nb = norm(b)): number {
  if (!na || !nb) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, x] of small) {
    const y = large.get(t);
    if (y !== undefined) dot += x * y;
  }
  return dot / (na * nb);
}

export interface TextRankOptions {
  damping?: number;
  maxIterations?: number;
  tolerance?: number;
}

/**
 * Plain TextRank scores (mean 1) for a list of texts, plus the similarity
 * matrix used to build the graph.
 */
export function textRank(texts: string[], opts: TextRankOptions = {}): { scores: number[]; similarity: number[][] } {
  const d = opts.damping ?? 0.85;
  const maxIterations = opts.maxIterations ?? 100;
  const tolerance = opts.tolerance ?? 1e-6;
  const n = texts.length;
  if (n === 0) return { scores: [], similarity: [] };
  const vectors = tfidfVectors(texts.map(tokenize));
  const norms = vectors.map(norm);
  const sim: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = cosine(vectors[i]!, vectors[j]!, norms[i], norms[j]);
      sim[i]![j] = s;
      sim[j]![i] = s;
    }
  }
  const outWeight = sim.map((row) => row.reduce((a, b) => a + b, 0));
  let scores = new Array<number>(n).fill(1 / n);
  for (let iter = 0; iter < maxIterations; iter++) {
    // Rank held by sentences with no similar neighbours is spread evenly.
    let dangling = 0;
    for (let j = 0; j < n; j++) if (outWeight[j] === 0) dangling += scores[j]!;
    const next = new Array<number>(n);
    let delta = 0;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        const w = sim[j]![i]!;
        if (w > 0) sum += (w / outWeight[j]!) * scores[j]!;
      }
      next[i] = (1 - d) / n + d * (sum + dangling / n);
      delta += Math.abs(next[i]! - scores[i]!);
    }
    scores = next;
    if (delta < tolerance) break;
  }
  return { scores: scores.map((s) => s * n), similarity: sim };
}

const IMPERATIVE = /^(run|install|clone|open|click|type|navigate|go to|download|copy|paste|create|add|set|make sure|please|see|check|visit|read|follow|edit|change|replace|enter|press|execute|use the|cd|note:|tip:|warning:)\b/i;
const NOISE = /\b(star(s|red)? (this|the) repo|give (it|us|this) a star|⭐|sponsor|donate|buy me a coffee|pull requests? (are )?welcome|feel free to|contributions? (are )?welcome)\b/i;

export interface WeightContext {
  /** Whether the intro (before the first section heading) has any usable sentence. */
  introHasSentences: boolean;
  /** Index of the lead sentence (first usable sentence of the intro or first section). */
  leadIndex: number;
  /** Project name; sentences that mention it are usually descriptive. */
  name: string | null;
}

function mentions(text: string, name: string | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return n.length >= 2 && text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').includes(n);
}

/** README-aware multiplier for a sentence (1 = neutral). */
export function sentenceWeight(s: Sentence, ctx: WeightContext = { introHasSentences: true, leadIndex: -1, name: null }): number {
  let w = 1;
  if (s.section === 0) w *= 1.6;
  else if (s.section === 1 && !ctx.introHasSentences) w *= 1.4;
  if (s.index === ctx.leadIndex) w *= 2;
  if (mentions(s.text, ctx.name)) w *= 1.25;
  const k = new Set(s.kinds);
  if (k.has('about') || k.has('features')) w *= 1.4;
  if (k.has('licence') || k.has('authors') || k.has('credits') || k.has('boilerplate') || k.has('community') || k.has('related')) w *= 0.35;
  else if (k.has('reference')) w *= 0.5;
  else if (k.has('install') || k.has('run') || k.has('requirements') || k.has('tech') || k.has('docs') || k.has('demo')) w *= 0.6;
  // List fragments ("Dark mode", "`node` object Element node") read badly in a paragraph.
  if (s.kind === 'list' && !/[.!?…。！？؟]["'”’)]*$/u.test(s.text)) w *= 0.75;
  // A paragraph sentence without an ending usually runs into a code block or formula.
  if ((s.kind === 'paragraph' || s.kind === 'quote') && /[\p{L}\p{N}]$/u.test(s.text)) {
    if (/\b(is|are|was|were|be|the|a|an|of|to|by|with|as|and|or|only|for|in|on|at|from|than|that|which|where|becomes|gives|equals|follows|using|via)$/i.test(s.text)) w *= 0.3;
    else if (!s.firstInBlock) w *= 0.6;
  }
  if (s.words < 4) w *= 0.3;
  else if (s.words < 7) w *= 0.7;
  else if (s.words > 60) w *= 0.4;
  else if (s.words > 40) w *= 0.75;
  if (s.linkRatio > 0.5) w *= 0.25;
  else if (s.linkRatio > 0.3) w *= 0.6;
  if (s.codeRatio > 0.4) w *= 0.3;
  else if (s.codeRatio > 0.2) w *= 0.7;
  if (/:$/.test(s.text)) w *= 0.4;
  if (/\?$/.test(s.text)) w *= 0.75;
  if (IMPERATIVE.test(s.text)) w *= 0.6;
  if (NOISE.test(s.text)) w *= 0.3;
  if (s.kind === 'html') w *= 0.8;
  if (s.kind === 'quote') w *= 0.85;
  return w;
}

/** Sentences good enough to appear in a summary at all. */
export function isEligible(s: Sentence): boolean {
  return s.words >= 2 && s.linkRatio <= 0.7 && s.codeRatio <= 0.6 && !/^https?:\/\//i.test(s.text);
}

export interface RankedSentence {
  sentence: Sentence;
  score: number;
}

const MAX_SENTENCES = 400;

export interface RankOptions extends TextRankOptions {
  /** Project name (sentences mentioning it get a small boost). */
  name?: string | null;
}

/**
 * Ranks sentences, best first (ties keep document order). The score is the
 * README weight times a damped TextRank score, so on small READMEs (where few
 * sentences share words) position and section still matter.
 */
export function rankSentences(sentences: Sentence[], opts: RankOptions = {}): RankedSentence[] {
  const pool = sentences.slice(0, MAX_SENTENCES);
  const { scores } = textRank(
    pool.map((s) => s.text),
    opts,
  );
  const introHasSentences = pool.some((s) => s.section === 0 && isEligible(s));
  const lead = pool.find((s) => isEligible(s) && s.words >= 4 && (introHasSentences ? s.section === 0 : s.section <= 1) && s.kind !== 'list');
  const ctx: WeightContext = { introHasSentences, leadIndex: lead?.index ?? -1, name: opts.name ?? null };
  return pool
    .map((sentence, i) => ({ sentence, score: (0.5 + 0.5 * scores[i]!) * sentenceWeight(sentence, ctx) }))
    .sort((a, b) => b.score - a.score || a.sentence.index - b.sentence.index);
}

/** How many sentences a summary should have for this many candidates. */
export function summaryLength(candidates: number): number {
  if (candidates <= 3) return candidates;
  if (candidates < 12) return 3;
  if (candidates < 25) return 4;
  return 5;
}

/**
 * The top `count` sentences (default: 3–5 depending on length), skipping
 * near-duplicates, returned in original document order.
 */
export function summarise(sentences: Sentence[], count?: number, opts: RankOptions = {}): Sentence[] {
  const eligible = sentences.filter(isEligible);
  if (!eligible.length) return [];
  const want = Math.max(0, Math.min(count ?? summaryLength(eligible.length), eligible.length));
  const ranked = rankSentences(eligible, opts);
  const vectors = tfidfVectors(ranked.map((r) => tokenize(r.sentence.text)));
  const picked: number[] = [];
  for (let i = 0; i < ranked.length && picked.length < want; i++) {
    const v = vectors[i]!;
    if (picked.some((p) => cosine(v, vectors[p]!) > 0.8)) continue;
    picked.push(i);
  }
  return picked.map((i) => ranked[i]!.sentence).sort((a, b) => a.index - b.index);
}
