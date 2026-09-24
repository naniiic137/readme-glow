import { fontFaceCss, ARABIC_FONTS, type FontKey } from '../themes/fonts';
import { loadThemeCss } from '../themes/registry';
import type { ThemeDef } from '../themes/types';

/**
 * Injects theme stylesheets and @font-face rules on demand. Font files are
 * only downloaded by the browser when text actually uses them, so declaring
 * a theme's faces costs nothing until that theme is shown.
 */
const injectedFonts = new Set<FontKey>();
const injectedThemes = new Set<string>();

function styleTag(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

export function ensureFonts(keys: readonly FontKey[]): void {
  const fresh = keys.filter((k) => !injectedFonts.has(k));
  if (!fresh.length) return;
  for (const k of fresh) injectedFonts.add(k);
  styleTag(`rg-fonts-${fresh.join('-')}`, fontFaceCss(fresh));
}

export function ensureAppFonts(): void {
  ensureFonts(['inter', 'sora', 'jetbrains', ...ARABIC_FONTS]);
}

export async function ensureTheme(theme: ThemeDef): Promise<void> {
  ensureFonts([...theme.fontKeys, ...ARABIC_FONTS]);
  if (injectedThemes.has(theme.id)) return;
  const css = await loadThemeCss(theme);
  if (injectedThemes.has(theme.id)) return;
  injectedThemes.add(theme.id);
  styleTag(`rg-theme-${theme.id}`, css);
}

export function isThemeLoaded(id: string): boolean {
  return injectedThemes.has(id);
}
