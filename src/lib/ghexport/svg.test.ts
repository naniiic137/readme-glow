// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { THEMES, availableModes, getTheme } from '../../themes/registry';
import { contrast } from '../../themes/color';
import { compactPath, drawLine, fit, measure, runs, wrap } from './shape';
import { dividerSvg, effectiveTokens, heroSvg, sectionSvg } from './svg';
import { createRenderer } from './renderer';
import { exportForGitHub, DEFAULT_GH_OPTIONS } from './transform';
import { loadTestFont, testFonts } from './testFonts';
import { GH_FONTS } from './fonts';

function parseSvg(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error(`Invalid SVG: ${err.textContent}`);
  return doc;
}

/** Everything an SVG shown through <img> on GitHub must not contain. */
function externalRefs(svg: string): string[] {
  const found: string[] = [];
  const withoutNs = svg.replace('xmlns="http://www.w3.org/2000/svg"', '');
  if (/https?:|\/\/[a-z]/i.test(withoutNs)) found.push('url');
  if (/<(script|image|foreignObject|iframe|a)\b/i.test(svg)) found.push('element');
  if (/@import|@font-face|url\((?!#)/i.test(svg)) found.push('css');
  if (/\bon[a-z]+\s*=/i.test(svg)) found.push('handler');
  if (/(xlink:)?href="(?!#)/.test(svg)) found.push('href');
  return found;
}

const inter = () => loadTestFont(GH_FONTS.github.heading);

describe('text shaping', () => {
  it('measures, wraps and fits with the real font', () => {
    const font = inter();
    const w = measure(font, 'Nebula Board', { size: 96 });
    expect(w).toBeGreaterThan(500);
    expect(w).toBeLessThan(700);
    const { lines, fits } = wrap(font, 'one two three four five six seven', { size: 40 }, 300, 2);
    expect(lines.length).toBe(2);
    expect(fits).toBe(false);
    expect(lines[1]!.endsWith(String.fromCharCode(0x2026))).toBe(true);
    const f = fit(font, 'A very long project title that will not fit on one line at all', { maxSize: 96, minSize: 40, maxWidth: 1000, maxLines: 2 });
    expect(f.lines.length).toBe(2);
    expect(f.size).toBeLessThan(96);
    expect(f.fits).toBe(true);
  });

  it('splits emoji and characters the font lacks into their own runs', () => {
    const font = inter();
    expect(runs(font, 'Go 🚀 now').map((r) => r.kind)).toEqual(['glyphs', 'emoji', 'glyphs']);
    expect(runs(font, 'مرحبا').map((r) => r.kind)).toEqual(['missing']);
  });

  it('draws outlines, and honest <text> for missing scripts', () => {
    const font = inter();
    const outlined = drawLine(font, 'Hello 👋', { x: 0, y: 50, size: 40, fill: '#000' });
    expect(outlined.outlined).toBe(true);
    expect(outlined.svg).toMatch(/^<path fill="#000" d="m[^"]+"\/><text [^>]*font-family="[^"]*Emoji[^"]*"[^>]*>👋<\/text>$/);
    const fallback = drawLine(font, 'مرحبا <b>', { x: 100, y: 50, size: 40, fill: '#000', anchor: 'middle' });
    expect(fallback.outlined).toBe(false);
    expect(fallback.svg).toContain('text-anchor="middle"');
    expect(fallback.svg).toContain('مرحبا &lt;b&gt;');
  });

  it('writes compact, drift-free relative path data', () => {
    const d = compactPath(
      [
        { type: 'M', x: 10, y: 10 },
        { type: 'L', x: 20.04, y: 10 },
        { type: 'L', x: 20.04, y: 0.5 },
        { type: 'Q', x1: 25, y1: 0, x: 30.33, y: 5.55 },
        { type: 'Z' },
        { type: 'M', x: 10.5, y: 10.5 },
        { type: 'L', x: 9.5, y: 9.5 },
        { type: 'L', x: 8.5, y: 8.5 },
      ],
      1,
    );
    expect(d).toBe('m10 10h10v-9.5q5-.5 10.3 5.1zm.5.5l-1-1-1-1');
  });
});

describe('SVG images', () => {
  const cases = THEMES.flatMap((theme) => availableModes(theme).map((mode) => ({ theme, mode })));

  it.each(cases.map((c) => [`${c.theme.id} ${c.mode}`, c] as const))('%s: valid, self-contained, small', (_, { theme, mode }) => {
    const fonts = testFonts(theme.id);
    const tokens = effectiveTokens(theme, mode, null);
    const hero = heroSvg({ title: 'Nebula Board', tagline: 'A calm, keyboard-first task board for small teams.', theme, tokens, fonts, animate: true });
    const section = sectionSvg({ text: 'Getting started', index: 2, theme, tokens, fonts });
    const divider = dividerSvg(theme, tokens);
    for (const svg of [hero, section, divider]) {
      const doc = parseSvg(svg);
      expect(doc.documentElement.getAttribute('viewBox')).toMatch(/^0 0 1280 \d+$/);
      expect(externalRefs(svg)).toEqual([]);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
    // Accessible names.
    expect(parseSvg(hero).querySelector('title')!.textContent).toBe('Nebula Board — A calm, keyboard-first task board for small teams.');
    expect(parseSvg(section).querySelector('title')!.textContent).toBe('Getting started');
    // Sizes GitHub serves happily.
    expect(hero.length).toBeLessThan(45_000);
    expect(section.length).toBeLessThan(20_000);
    expect(divider.length).toBeLessThan(4_000);
  });

  it('animates only for readers who allow motion, and the still frame is complete', () => {
    const theme = getTheme('aurora');
    const fonts = testFonts('aurora');
    const tokens = effectiveTokens(theme, 'dark', null);
    const moving = heroSvg({ title: 'X', tagline: null, theme, tokens, fonts, animate: true });
    const still = heroSvg({ title: 'X', tagline: null, theme, tokens, fonts, animate: false });
    expect(moving).toMatch(/<style>@media \(prefers-reduced-motion: no-preference\)\{[^<]*@keyframes[^<]*\}<\/style>/);
    expect(still).not.toContain('<style>');
    expect(still).not.toContain('animation');
    // No rule outside the media query hides anything.
    for (const id of ['notebook', 'terminal', 'pixel', 'synthwave', 'midnight', 'zen', 'comic', 'blueprint'] as const) {
      const t = getTheme(id);
      const svg = heroSvg({ title: 'X', tagline: 'Y', theme: t, tokens: effectiveTokens(t, t.defaultMode, null), fonts: testFonts(id), animate: true });
      const css = /<style>([^<]*)<\/style>/.exec(svg)?.[1] ?? '';
      expect(css.startsWith('@media (prefers-reduced-motion: no-preference){')).toBe(true);
      // Keyframes may fade things (a blinking cursor); resting styles never hide anything.
      const resting = css.replace(/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
      expect(resting).not.toMatch(/opacity:0[;}]|stroke-dashoffset|display:none|visibility/);
    }
  });

  it('is deterministic (stable diffs when re-exporting)', () => {
    const theme = getTheme('midnight');
    const fonts = testFonts('midnight');
    const tokens = effectiveTokens(theme, 'dark', null);
    const a = heroSvg({ title: 'Stars', tagline: 'At night', theme, tokens, fonts, animate: true });
    const b = heroSvg({ title: 'Stars', tagline: 'At night', theme, tokens, fonts, animate: true });
    expect(a).toBe(b);
  });

  it('applies the accent override', () => {
    const theme = getTheme('github');
    const svg = sectionSvg({ text: 'Usage', index: 1, theme, tokens: effectiveTokens(theme, 'light', '#e11d48'), fonts: testFonts('github') });
    expect(svg).toContain('#e11d48');
  });

  it('grows the hero for two-line titles and never overflows the width', () => {
    const theme = getTheme('editorial');
    const tokens = effectiveTokens(theme, 'light', null);
    const svg = heroSvg({ title: 'An Unusually Long Project Name That Needs Two Lines To Fit', tagline: 'And a tagline.', theme, tokens, fonts: testFonts('editorial'), animate: false });
    const h = Number(/viewBox="0 0 1280 (\d+)"/.exec(svg)![1]);
    expect(h).toBeGreaterThanOrEqual(360);
  });

  it('picks badge colours that read: white on the pills, a dark label', () => {
    for (const theme of THEMES) {
      const { pill, label } = createRenderer(theme, null, testFonts(theme.id), false).badgeColors;
      expect(contrast('#ffffff', pill!), theme.id).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#ffffff', label), theme.id).toBeGreaterThanOrEqual(4.5);
    }
    // Aurora keeps a vivid violet (its light variant's accent), not a greyed one.
    expect(createRenderer(getTheme('aurora'), null, testFonts('aurora'), false).badgeColors.pill).toBe('#7c3aed');
  });

  it('a full export has small, valid images for every theme', () => {
    const md = '# Nebula Board\n\nA calm task board.\n\n## Features\n\nx\n\n---\n\n## Usage\n\ny\n';
    let total = 0;
    for (const theme of THEMES) {
      const r = createRenderer(theme, null, testFonts(theme.id), true);
      const { assets } = exportForGitHub(md, DEFAULT_GH_OPTIONS, r);
      expect(assets.length).toBe(r.variants.length * 4);
      for (const a of assets) {
        parseSvg(a.svg);
        expect(externalRefs(a.svg)).toEqual([]);
        total += a.svg.length;
      }
    }
    expect(total / THEMES.length).toBeLessThan(120_000);
  });
});
