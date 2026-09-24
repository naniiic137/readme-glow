import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readConfig } from './config';
import { createRenderer } from './renderer';
import { getTheme } from '../../themes/registry';
import type { GhFonts } from './svg';
import { isExported, unexport } from './markers';
import { DEFAULT_GH_OPTIONS, exportForGitHub, type GhExportOptions, type GhRenderer } from './transform';

/**
 * ReadmeGlow's own README is made with the GitHub export (Aurora theme).
 * These checks keep the committed README and its images consistent.
 */
export const SELF_EXPORT_OPTIONS: GhExportOptions = {
  ...DEFAULT_GH_OPTIONS,
  toc: 'pills',
  config: { theme: 'aurora', layout: 'landing' },
};

const root = process.cwd();
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
const dir = resolve(root, '.github/readmeglow');

const stub: GhRenderer = {
  variants: ['light', 'dark'],
  hero: () => '',
  section: () => '',
  divider: () => '',
  // The real renderer's colours (fonts are only needed to draw).
  badgeColors: createRenderer(getTheme('aurora'), null, {} as GhFonts, true).badgeColors,
};

describe("ReadmeGlow's own README", () => {
  it('is an export that remembers its look', () => {
    expect(isExported(readme)).toBe(true);
    expect(readConfig(readme)).toEqual({ theme: 'aurora', layout: 'landing' });
    const source = unexport(readme);
    expect(source).toContain('\n# ReadmeGlow\n');
    expect(source).not.toContain('readmeglow:begin');
  });

  it('exports to exactly itself again (no second header, nothing drifts)', () => {
    expect(exportForGitHub(readme, SELF_EXPORT_OPTIONS, stub).markdown).toBe(readme);
  });

  it('has every image it uses, and no stray ones', () => {
    const used = new Set([...readme.matchAll(/\.github\/readmeglow\/[\w.-]+\.svg/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThan(10);
    for (const path of used) expect(existsSync(resolve(root, path)), path).toBe(true);
    const files = readdirSync(dir).map((f) => `.github/readmeglow/${f}`);
    expect(files.sort()).toEqual([...used].sort());
    for (const f of files) {
      const svg = readFileSync(resolve(root, f), 'utf8');
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:|<script|<image|@import|href="(?!#)/);
    }
  });
});
