import type { Mode, ThemeDef, ThemeId, ThemeTokens } from './types';
import { THEME_IDS } from './types';
import { getCodeTheme } from './codeThemes';
import { contrast, ensureContrast, readableOn, withAlpha, mix } from './color';
import { theme as github } from './defs/github';
import { theme as aurora } from './defs/aurora';
import { theme as editorial } from './defs/editorial';
import { theme as terminal } from './defs/terminal';
import { theme as pixel } from './defs/pixel';
import { theme as synthwave } from './defs/synthwave';
import { theme as blueprint } from './defs/blueprint';
import { theme as notebook } from './defs/notebook';
import { theme as swiss } from './defs/swiss';
import { theme as midnight } from './defs/midnight';
import { theme as brutalist } from './defs/brutalist';
import { theme as zen } from './defs/zen';
import { theme as manuscript } from './defs/manuscript';
import { theme as frost } from './defs/frost';
import { theme as comic } from './defs/comic';

export const THEMES: ThemeDef[] = [
  github,
  aurora,
  editorial,
  terminal,
  pixel,
  synthwave,
  blueprint,
  notebook,
  swiss,
  midnight,
  brutalist,
  zen,
  manuscript,
  frost,
  comic,
];

const BY_ID = new Map<string, ThemeDef>(THEMES.map((t) => [t.id, t]));

export function isThemeId(id: string): id is ThemeId {
  return (THEME_IDS as readonly string[]).includes(id);
}

export function getTheme(id: string): ThemeDef {
  return BY_ID.get(id) ?? github;
}

export function availableModes(theme: ThemeDef): Mode[] {
  return (['light', 'dark'] as const).filter((m) => theme.variants[m]);
}

export type ModePreference = 'default' | 'system' | Mode;

/**
 * The variant to use: 'default' is the designer's choice, 'system' follows the
 * OS setting, 'light'/'dark' force a variant. Themes that only exist in one
 * mode always use it.
 */
export function resolveMode(theme: ThemeDef, requested: ModePreference, prefersDark = false): Mode {
  const wanted: Mode = requested === 'default' ? theme.defaultMode : requested === 'system' ? (prefersDark ? 'dark' : 'light') : requested;
  return theme.variants[wanted] ? wanted : theme.defaultMode;
}

export function tokensFor(theme: ThemeDef, mode: Mode): ThemeTokens {
  return theme.variants[mode] ?? theme.variants[theme.defaultMode]!;
}

export interface VarOverrides {
  accent?: string | null;
  codeTheme?: string | null;
  fontScale?: number;
  measure?: number | null;
}

/** CSS custom properties for a theme variant plus the user's customisations. */
export function themeVars(theme: ThemeDef, mode: Mode, o: VarOverrides = {}): Record<string, string> {
  const t = { ...tokensFor(theme, mode) };
  let syntax = t.syntax;
  if (o.accent && /^#[0-9a-f]{6}$/i.test(o.accent)) {
    t.accent = o.accent;
    t.accentText = readableOn(o.accent);
    t.link = ensureContrast(o.accent, t.bg, 4.5);
    t.selection = withAlpha(o.accent, 0.3);
  }
  if (o.codeTheme && o.codeTheme !== 'theme') {
    const ct = getCodeTheme(o.codeTheme);
    if (ct) {
      t.codeBg = ct.bg;
      t.codeText = ct.text;
      syntax = ct.syntax;
    }
  }
  const vars: Record<string, string> = {
    '--rg-bg': t.bg,
    '--rg-bg-alt': t.bgAlt,
    '--rg-surface': t.surface,
    '--rg-text': t.text,
    '--rg-muted': t.muted,
    '--rg-heading': t.heading,
    '--rg-accent': t.accent,
    '--rg-accent-text': t.accentText,
    '--rg-accent-soft': withAlpha(t.accent, 0.14),
    '--rg-link': t.link,
    '--rg-border': t.border,
    '--rg-border-soft': mix(t.border, t.bg, 0.45),
    '--rg-code-bg': t.codeBg,
    '--rg-code-text': t.codeText,
    '--rg-code-border': contrast(t.codeBg, t.bg) < 1.15 ? t.border : 'transparent',
    '--rg-inline-code-bg': t.inlineCodeBg,
    '--rg-inline-code-text': t.inlineCodeText,
    '--rg-mark': t.mark,
    '--rg-mark-text': t.markText,
    '--rg-selection': t.selection,
    '--rg-note': t.note,
    '--rg-tip': t.tip,
    '--rg-important': t.important,
    '--rg-warning': t.warning,
    '--rg-caution': t.caution,
    '--rg-font-body': theme.fonts.body,
    '--rg-font-heading': theme.fonts.heading,
    '--rg-font-mono': theme.fonts.mono,
    '--rg-base-size': `${theme.baseSize}px`,
    '--rg-line-height': String(theme.lineHeight),
    '--rg-radius': theme.radius,
    '--rg-measure': `${o.measure ?? theme.measure}px`,
    '--rg-font-scale': String(o.fontScale ?? 1),
    '--rg-code-scheme': contrast('#ffffff', t.codeBg) > contrast('#000000', t.codeBg) ? 'dark' : 'light',
  };
  for (const [k, v] of Object.entries(syntax)) vars[`--hl-${k}`] = v;
  return vars;
}

/** `selector { --x: y; … }` for exports. */
export function varsToCss(selector: string, vars: Record<string, string>): string {
  return `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`;
}

const cssCache = new Map<string, Promise<string>>();

export function loadThemeCss(theme: ThemeDef): Promise<string> {
  let p = cssCache.get(theme.id);
  if (!p) {
    p = theme.css().catch((err) => {
      cssCache.delete(theme.id);
      throw err;
    });
    cssCache.set(theme.id, p);
  }
  return p;
}
