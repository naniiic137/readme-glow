import type { ThemeId } from '../../themes/types';

/**
 * Static (single-weight) WOFF files used to turn text into SVG outlines for the
 * GitHub export. opentype.js reads WOFF (not WOFF2), and static files give the
 * exact weight each theme's headings use.
 */
export interface FontRef {
  pkg: string;
  file: string;
}

const f = (pkg: string, file: string): FontRef => ({ pkg: `@fontsource/${pkg}`, file });

export const GH_FONTS: Record<ThemeId, { heading: FontRef; body: FontRef }> = {
  github: { heading: f('inter', 'inter-latin-700-normal.woff'), body: f('inter', 'inter-latin-400-normal.woff') },
  aurora: { heading: f('sora', 'sora-latin-700-normal.woff'), body: f('inter', 'inter-latin-400-normal.woff') },
  editorial: { heading: f('fraunces', 'fraunces-latin-700-normal.woff'), body: f('source-serif-4', 'source-serif-4-latin-400-normal.woff') },
  terminal: { heading: f('vt323', 'vt323-latin-400-normal.woff'), body: f('ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff') },
  pixel: { heading: f('press-start-2p', 'press-start-2p-latin-400-normal.woff'), body: f('pixelify-sans', 'pixelify-sans-latin-400-normal.woff') },
  synthwave: { heading: f('orbitron', 'orbitron-latin-800-normal.woff'), body: f('exo-2', 'exo-2-latin-400-normal.woff') },
  blueprint: { heading: f('space-grotesk', 'space-grotesk-latin-700-normal.woff'), body: f('ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff') },
  notebook: { heading: f('caveat', 'caveat-latin-700-normal.woff'), body: f('nunito', 'nunito-latin-400-normal.woff') },
  swiss: { heading: f('inter-tight', 'inter-tight-latin-800-normal.woff'), body: f('inter', 'inter-latin-400-normal.woff') },
  midnight: { heading: f('cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff'), body: f('manrope', 'manrope-latin-400-normal.woff') },
  brutalist: { heading: f('archivo-black', 'archivo-black-latin-400-normal.woff'), body: f('work-sans', 'work-sans-latin-400-normal.woff') },
  zen: { heading: f('shippori-mincho', 'shippori-mincho-latin-700-normal.woff'), body: f('zen-maru-gothic', 'zen-maru-gothic-latin-400-normal.woff') },
  manuscript: { heading: f('cinzel', 'cinzel-latin-700-normal.woff'), body: f('eb-garamond', 'eb-garamond-latin-400-normal.woff') },
  frost: { heading: f('plus-jakarta-sans', 'plus-jakarta-sans-latin-800-normal.woff'), body: f('plus-jakarta-sans', 'plus-jakarta-sans-latin-400-normal.woff') },
  comic: { heading: f('bangers', 'bangers-latin-400-normal.woff'), body: f('comic-neue', 'comic-neue-latin-700-normal.woff') },
};
