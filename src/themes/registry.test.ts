import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEMES, getTheme, resolveMode, themeVars, tokensFor, availableModes } from './registry';
import { THEME_IDS, type ThemeTokens, type SyntaxTokens } from './types';
import { contrast, ensureContrast } from './color';
import { CODE_THEMES } from './codeThemes';
import { FONTS } from './fonts';

const TOKEN_KEYS: Array<keyof ThemeTokens> = [
  'bg', 'bgAlt', 'surface', 'text', 'muted', 'heading', 'accent', 'accentText', 'link', 'border',
  'codeBg', 'codeText', 'inlineCodeBg', 'inlineCodeText', 'mark', 'markText', 'selection',
  'note', 'tip', 'important', 'warning', 'caution', 'syntax',
];
const SYNTAX_KEYS: Array<keyof SyntaxTokens> = [
  'keyword', 'string', 'number', 'comment', 'function', 'type', 'variable', 'attr', 'tag', 'punctuation', 'meta', 'addition', 'deletion',
];
const HEX = /^#[0-9a-f]{6}$/i;

/** Splits a selector list on commas that are not inside parentheses. */
function splitTopLevel(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of selector) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  return parts;
}

const variants = THEMES.flatMap((theme) => availableModes(theme).map((mode) => ({ theme, mode, t: tokensFor(theme, mode) })));

describe('theme registry', () => {
  it('has all 15 themes, in order, with unique ids', () => {
    expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS]);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(THEMES.length);
  });

  it.each(THEMES.map((t) => [t.id, t] as const))('%s defines its metadata', (_id, theme) => {
    expect(theme.name.length).toBeGreaterThan(2);
    expect(theme.tagline.length).toBeGreaterThan(5);
    expect(theme.variants[theme.defaultMode]).toBeDefined();
    expect(theme.baseSize).toBeGreaterThanOrEqual(14);
    expect(theme.baseSize).toBeLessThanOrEqual(22);
    expect(theme.lineHeight).toBeGreaterThanOrEqual(1.3);
    expect(theme.measure).toBeGreaterThanOrEqual(560);
    expect(theme.radius).toMatch(/^\d+(\.\d+)?px$/);
    for (const key of theme.fontKeys) expect(FONTS[key], `font ${key}`).toBeDefined();
    for (const stack of Object.values(theme.fonts)) expect(stack).toMatch(/,/);
  });

  it.each(THEMES.map((t) => [t.id] as const))('%s has a real stylesheet', async (id) => {
    const css = readFileSync(new URL(`./css/${id}.css`, import.meta.url), 'utf8');
    expect(css.length, `${id}.css is still a placeholder`).toBeGreaterThan(1500);
    // Everything must be scoped to the theme so themes never leak into each other.
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
      .match(/(^|})\s*([^{}@]+)\{/g) ?? [];
    for (const raw of selectors) {
      const sel = raw.replace(/^}/, '').replace(/\{$/, '').trim();
      if (!sel || /^(from|to|\d+%)/.test(sel)) continue;
      for (const part of splitTopLevel(sel)) expect(part.trim(), `unscoped selector in ${id}.css`).toMatch(new RegExp(`\\.t-${id}\\b`));
    }
  });
});

describe.each(variants.map((v) => [`${v.theme.id}/${v.mode}`, v] as const))('tokens %s', (_label, { t }) => {
  it('defines every token as an opaque hex colour', () => {
    for (const key of TOKEN_KEYS) expect(t[key], key).toBeDefined();
    for (const key of TOKEN_KEYS) {
      if (key === 'syntax' || key === 'selection') continue;
      expect(t[key] as string, key).toMatch(HEX);
    }
    for (const key of SYNTAX_KEYS) expect(t.syntax[key], `syntax.${key}`).toMatch(HEX);
  });

  it('keeps body text readable (WCAG AA 4.5:1)', () => {
    expect(contrast(t.text, t.bg), 'text/bg').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.text, t.surface), 'text/surface').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.text, t.bgAlt), 'text/bgAlt').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.muted, t.bg), 'muted/bg').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.link, t.bg), 'link/bg').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.heading, t.bg), 'heading/bg').toBeGreaterThanOrEqual(3);
    expect(contrast(t.accentText, t.accent), 'accentText/accent').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.codeText, t.codeBg), 'code').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.inlineCodeText, t.inlineCodeBg), 'inline code').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.markText, t.mark), 'mark').toBeGreaterThanOrEqual(4.5);
  });

  it('keeps alert titles readable', () => {
    for (const key of ['note', 'tip', 'important', 'warning', 'caution'] as const) {
      expect(contrast(t[key], t.bg), key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps syntax colours readable on the code background', () => {
    for (const key of SYNTAX_KEYS) {
      expect(contrast(t.syntax[key], t.codeBg), key).toBeGreaterThanOrEqual(key === 'comment' ? 3.5 : 4.5);
    }
  });
});

describe('code themes', () => {
  it.each(CODE_THEMES.map((c) => [c.id, c] as const))('%s is readable', (_id, ct) => {
    expect(contrast(ct.text, ct.bg)).toBeGreaterThanOrEqual(4.5);
    for (const key of SYNTAX_KEYS) {
      expect(contrast(ct.syntax[key], ct.bg), key).toBeGreaterThanOrEqual(key === 'comment' ? 3.5 : 4.5);
    }
  });
});

describe('themeVars', () => {
  it('maps every token to a CSS variable', () => {
    const vars = themeVars(getTheme('github'), 'light');
    expect(vars['--rg-bg']).toBe('#ffffff');
    expect(vars['--hl-keyword']).toBe('#cf222e');
    expect(vars['--rg-font-body']).toContain('Segoe UI');
  });

  it('applies a custom accent and keeps links readable', () => {
    for (const { theme, mode, t } of variants) {
      const vars = themeVars(theme, mode, { accent: '#ffe600' });
      expect(vars['--rg-accent']).toBe('#ffe600');
      expect(contrast(vars['--rg-link']!, t.bg), `${theme.id}/${mode}`).toBeGreaterThanOrEqual(4.49);
      expect(contrast(vars['--rg-accent-text']!, '#ffe600')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('swaps in a code theme', () => {
    const vars = themeVars(getTheme('github'), 'light', { codeTheme: 'dracula' });
    expect(vars['--rg-code-bg']).toBe('#282a36');
    expect(vars['--hl-keyword']).toBe('#ff79c6');
  });

  it('resolves modes', () => {
    const gh = getTheme('github');
    expect(resolveMode(gh, 'default')).toBe('light');
    expect(resolveMode(gh, 'dark')).toBe('dark');
    expect(resolveMode(gh, 'system', true)).toBe('dark');
    expect(resolveMode(gh, 'system', false)).toBe('light');
  });

  it('falls back to GitHub for unknown ids', () => {
    expect(getTheme('nope').id).toBe('github');
  });
});

describe('ensureContrast', () => {
  it('darkens or lightens until the ratio is met', () => {
    expect(contrast(ensureContrast('#ffff00', '#ffffff'), '#ffffff')).toBeGreaterThanOrEqual(4.49);
    expect(contrast(ensureContrast('#000080', '#000000'), '#000000')).toBeGreaterThanOrEqual(4.49);
    expect(ensureContrast('#000000', '#ffffff')).toBe('#000000');
  });
});
