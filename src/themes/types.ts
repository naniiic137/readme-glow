import type { FontKey } from './fonts';

export const THEME_IDS = [
  'github',
  'aurora',
  'editorial',
  'terminal',
  'pixel',
  'synthwave',
  'blueprint',
  'notebook',
  'swiss',
  'midnight',
  'brutalist',
  'zen',
  'manuscript',
  'frost',
  'comic',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type Mode = 'light' | 'dark';

/** Colours for syntax highlighting. All must read at ≥ 4.5:1 on the code background (comments ≥ 3.5:1). */
export interface SyntaxTokens {
  keyword: string;
  string: string;
  number: string;
  comment: string;
  function: string;
  type: string;
  variable: string;
  attr: string;
  tag: string;
  punctuation: string;
  meta: string;
  addition: string;
  deletion: string;
}

/**
 * Every colour a theme must define (opaque hex, #rrggbb). Contrast rules, checked by tests:
 * text, muted, link, alert colours on `bg` ≥ 4.5:1; text on `surface` and `bgAlt` ≥ 4.5:1;
 * heading on `bg` ≥ 3:1; accentText on accent ≥ 4.5:1; codeText on codeBg ≥ 4.5:1;
 * inlineCodeText on inlineCodeBg ≥ 4.5:1; markText on mark ≥ 4.5:1.
 */
export interface ThemeTokens {
  /** Page background (solid; decorative layers go in the theme CSS backdrop). */
  bg: string;
  /** Secondary background: sidebars, zebra rows, table headers. */
  bgAlt: string;
  /** Cards, details, callouts. */
  surface: string;
  text: string;
  muted: string;
  heading: string;
  accent: string;
  accentText: string;
  link: string;
  border: string;
  codeBg: string;
  codeText: string;
  inlineCodeBg: string;
  inlineCodeText: string;
  mark: string;
  markText: string;
  selection: string;
  note: string;
  tip: string;
  important: string;
  warning: string;
  caution: string;
  syntax: SyntaxTokens;
}

export interface ThemeFonts {
  /** Full CSS font stacks. */
  body: string;
  heading: string;
  mono: string;
}

/** Background painter used for the PNG social card. */
export type CardBackground =
  | 'plain'
  | 'mesh'
  | 'grid'
  | 'lines'
  | 'dots'
  | 'scanlines'
  | 'sun'
  | 'paper'
  | 'halftone'
  | 'stars'
  | 'pixels'
  | 'blocks'
  | 'petals'
  | 'parchment'
  | 'frost';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  /** One short line for the gallery. */
  tagline: string;
  defaultMode: Mode;
  variants: Partial<Record<Mode, ThemeTokens>>;
  fonts: ThemeFonts;
  /** Font families to declare (from src/themes/fontFiles.ts). */
  fontKeys: FontKey[];
  /** Body size in px at 100 %. */
  baseSize: number;
  lineHeight: number;
  /** Corner radius, e.g. '10px' or '0px'. */
  radius: string;
  /** Default content width in px for the Document layout. */
  measure: number;
  /** The theme's signature CSS (loaded lazily, also embedded in HTML exports). */
  css: () => Promise<string>;
  card: { background: CardBackground; titleCase?: 'none' | 'upper' };
}
