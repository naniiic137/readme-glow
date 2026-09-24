import { FONTS, type FontKey, type FontSubset } from './fontFiles';

export { FONTS, type FontKey };

const RANGES: Record<FontSubset, string> = {
  latin:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext':
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  arabic:
    'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC',
};

/** Arabic faces are always declared so right-to-left READMEs look good in every theme. */
export const ARABIC_FONTS: FontKey[] = ['notoSansArabic', 'notoNaskhArabic'];

export interface FontFaceOptions {
  subsets?: FontSubset[];
  /** Replace a file URL (e.g. with a data: URL when exporting). */
  mapUrl?: (url: string) => string;
}

/** `@font-face` rules for the given families. */
export function fontFaceCss(keys: readonly FontKey[], options: FontFaceOptions = {}): string {
  const rules: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const def = FONTS[key];
    for (const face of def.faces) {
      if (options.subsets && !options.subsets.includes(face.subset)) continue;
      const url = options.mapUrl ? options.mapUrl(face.url) : face.url;
      const variable = face.weight.includes(' ');
      rules.push(
        `@font-face{font-family:'${def.family}';font-style:${face.style};font-display:swap;font-weight:${face.weight};` +
          `src:url(${JSON.stringify(url)}) format('${variable ? 'woff2-variations' : 'woff2'}'),url(${JSON.stringify(url)}) format('woff2');` +
          `unicode-range:${RANGES[face.subset]};}`,
      );
    }
  }
  return rules.join('\n');
}

/** Files needed to embed the given families (for self-contained exports). */
export function fontFiles(keys: readonly FontKey[], subsets: FontSubset[]): string[] {
  const out = new Set<string>();
  for (const key of keys) for (const face of FONTS[key].faces) if (subsets.includes(face.subset)) out.add(face.url);
  return [...out];
}

export function familyName(key: FontKey): string {
  return FONTS[key].family;
}

/** A CSS font stack: the family, then Arabic fallbacks, then generic fallbacks. */
export function stack(key: FontKey | null, fallback: string, arabic: 'sans' | 'serif' = 'sans'): string {
  const arabicFamily = FONTS[arabic === 'serif' ? 'notoNaskhArabic' : 'notoSansArabic'].family;
  const first = key ? `'${FONTS[key].family}', ` : '';
  return `${first}'${arabicFamily}', ${fallback}`;
}

export const SANS_FALLBACK = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const SERIF_FALLBACK = "Georgia, Cambria, 'Times New Roman', serif";
export const MONO_FALLBACK = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
