export type UrlKind = 'image' | 'link' | 'media';

/**
 * Rewrites a URL found in the document (after sanitising).
 * Return a string to replace it, `null` to drop it, or `undefined` to keep it.
 * Resolvers must only ever return http(s):, blob:, data:image/, mailto: or
 * in-document (#) URLs; the pipeline double-checks with `isSafeUrl`.
 */
export type UrlResolver = (url: string, kind: UrlKind) => string | null | undefined;

export interface TocEntry {
  depth: number;
  text: string;
  id: string;
  line: number;
}

export interface Badge {
  alt: string;
  src: string;
  href: string | null;
}

export interface DocStats {
  words: number;
  readingMinutes: number;
  codeBlocks: number;
  images: number;
  links: number;
  headings: number;
  tables: number;
}

export interface DocFeatures {
  math: boolean;
  mermaid: boolean;
  code: boolean;
  emoji: boolean;
  /** Mostly right-to-left text (Arabic, Hebrew…). */
  rtl: boolean;
}

export interface DocMeta {
  title: string | null;
  description: string | null;
  badges: Badge[];
  heroImage: { src: string; alt: string } | null;
}

export interface RenderOptions {
  resolve?: UrlResolver;
  /** Syntax highlighting (lazy-loaded). Default true. */
  highlight?: boolean;
  /** KaTeX math (lazy-loaded when the document has math). Default true. */
  math?: boolean;
}

export interface RenderResult {
  /** Sanitised HTML of the document body, without layout sections. */
  html: string;
  toc: TocEntry[];
  meta: DocMeta;
  stats: DocStats;
  features: DocFeatures;
  /** Render time in ms (for the curious). */
  ms: number;
}
