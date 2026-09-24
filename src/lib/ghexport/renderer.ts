import type { ThemeDef, ThemeTokens } from '../../themes/types';
import { availableModes } from '../../themes/registry';
import { contrast, ensureContrast } from '../../themes/color';
import { dividerSvg, effectiveTokens, heroSvg, sectionSvg, type GhFonts } from './svg';
import type { GhRenderer, Variant } from './transform';

/** The SVG renderer for one theme (light + dark files when the theme has both). */
export function createRenderer(theme: ThemeDef, accent: string | null, fonts: GhFonts, animate: boolean): GhRenderer {
  const both = availableModes(theme).length > 1;
  const variants: Variant[] = both ? ['light', 'dark'] : ['only'];
  const tokens = (v: Variant): ThemeTokens => effectiveTokens(theme, v === 'only' ? theme.defaultMode : v, accent);
  const main = tokens(both ? theme.defaultMode : 'only');
  // A dark label reads on both of GitHub's colour schemes.
  const label = theme.variants.dark ? effectiveTokens(theme, 'dark', accent).bg : main.heading;
  // Pills carry white text: the theme's own accent that reads with it (often the light variant's), else a darkened one.
  const accents = [theme.variants.light ? effectiveTokens(theme, 'light', accent).accent : null, main.accent].filter((c): c is string => !!c);
  const pill = accents.find((c) => contrast('#ffffff', c) >= 4.5) ?? ensureContrast(main.accent, '#ffffff', 4.5);
  return {
    variants,
    hero: (title, tagline, v) => heroSvg({ title, tagline, theme, tokens: tokens(v), fonts, animate }),
    section: (text, index, v) => sectionSvg({ text, index, theme, tokens: tokens(v), fonts }),
    divider: (v) => dividerSvg(theme, tokens(v)),
    badgeColors: { accent: main.accent, label, pill },
  };
}
