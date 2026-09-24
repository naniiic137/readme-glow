import { describe, expect, it } from 'vitest';
import { DEFAULT_GH_OPTIONS, exportForGitHub, picture, restyleBadge, shieldsText, type GhExportOptions, type GhRenderer, type Variant } from './transform';
import { insertChunk, isExported, replaceChunk, unexport } from './markers';
import { readConfig } from './config';

const stub = (variants: Variant[] = ['light', 'dark']): GhRenderer => ({
  variants,
  hero: (title, tagline, v) => `<svg data-kind="hero" data-v="${v}">${title}|${tagline ?? ''}</svg>`,
  section: (text, index, v) => `<svg data-kind="section" data-v="${v}">${index ?? ''}${text}</svg>`,
  divider: (v) => `<svg data-kind="divider" data-v="${v}"/>`,
  badgeColors: { accent: '#7c5cff', label: '#0b0c1e' },
});

const opts = (o: Partial<GhExportOptions> = {}): GhExportOptions => ({ ...DEFAULT_GH_OPTIONS, ...o });

const README = `# Nebula Board

> A calm, keyboard-first task board.

[![Build](https://github.com/o/r/actions/workflows/ci.yml/badge.svg)](https://github.com/o/r/actions) ![License](https://img.shields.io/badge/license-MIT-blue)

Nebula Board keeps your work in one quiet place.

## Features

- Fast
- Calm

---

## Getting started

\`\`\`bash
npm install
\`\`\`

> **Note**
> Needs Node 20.

## Changelog

- 1.0 First release
`;

describe('markers', () => {
  it('stores readable originals and restores them exactly', () => {
    const chunk = replaceChunk('h2', '## Install', '## <img alt="Install" src="x.svg">', '\n');
    expect(chunk).toContain('<!-- readmeglow:begin h2\n## Install\n-->');
    const doc = `Intro\n\n${chunk}\n\nBody\n`;
    expect(isExported(doc)).toBe(true);
    expect(unexport(doc)).toBe('Intro\n\n## Install\n\nBody\n');
  });

  it('falls back to base64 for text a comment cannot hold', () => {
    const original = '# A -- B --> C';
    const chunk = replaceChunk('hero', original, '<h1>x</h1>', '\n');
    expect(chunk).toMatch(/begin hero b64:[A-Za-z0-9+/=]+ -->/);
    expect(chunk).not.toContain('-->\n# A');
    expect(unexport(`${chunk}\n`)).toBe(`${original}\n`);
  });

  it('keeps non-ASCII text intact through base64', () => {
    const original = '# مرحبا -- 🚀 café';
    expect(unexport(replaceChunk('hero', original, 'x', '\n'))).toBe(original);
  });

  it('removes inserted chunks with the blank line after them', () => {
    const doc = `A\n\n${insertChunk('toc', '<p>toc</p>', '\n')}## B\n`;
    expect(unexport(doc)).toBe('A\n\n## B\n');
  });

  it('ignores marker text inside code and damaged markers', () => {
    const code = '```html\n<!-- readmeglow:begin h2 -->\nx\n<!-- readmeglow:end h2 -->\n```\n';
    expect(isExported(code)).toBe(false);
    expect(unexport(code)).toBe(code);
    const damaged = '<!-- readmeglow:begin h2\n## A\n-->\n## B\n';
    expect(unexport(damaged)).toBe(damaged);
  });
});

describe('exportForGitHub', () => {
  it('builds a themed header, section images, a divider and alerts', () => {
    const { markdown, assets, info } = exportForGitHub(README, opts(), stub());
    expect(info).toMatchObject({ title: 'Nebula Board', tagline: 'A calm, keyboard-first task board.', titleSource: 'markdown', sections: 3, dividers: 1, alerts: 1 });
    // Header: centred <h1> with a light/dark <picture> and an accessible alt text.
    expect(markdown).toContain('<h1 align="center"><picture><source media="(prefers-color-scheme: dark)" srcset=".github/readmeglow/hero-dark.svg">');
    expect(markdown).toContain('alt="Nebula Board — A calm, keyboard-first task board."');
    // Header badges move into a centred row, restyled.
    expect(markdown).toMatch(/<p align="center">\n {2}<a href="https:\/\/github.com\/o\/r\/actions"><img alt="Build" src="https:\/\/github.com\/o\/r\/actions\/workflows\/ci.yml\/badge.svg"><\/a>/);
    expect(markdown).toContain('style=for-the-badge&amp;labelColor=0b0c1e&amp;color=7c5cff');
    // Sections keep their anchors.
    expect(markdown).toContain('## <a id="features"></a><picture>');
    expect(markdown).toContain('## <a id="getting-started"></a><picture>');
    expect(markdown).toContain('<img alt="Getting started" src=".github/readmeglow/section-02-getting-started-light.svg">');
    // Divider replaces the thematic break.
    expect(markdown).toMatch(/<p align="center"><picture>.*divider-dark\.svg.*<img alt="" src="\.github\/readmeglow\/divider-light\.svg"><\/picture><\/p>/);
    // Legacy note → GitHub alert.
    expect(markdown).toContain('> [!NOTE]\n> Needs Node 20.');
    // The intro paragraph and code stay untouched.
    expect(markdown).toContain('Nebula Board keeps your work in one quiet place.');
    expect(markdown).toContain('```bash\nnpm install\n```');
    expect(assets.map((a) => a.path)).toEqual([
      '.github/readmeglow/hero-light.svg',
      '.github/readmeglow/hero-dark.svg',
      '.github/readmeglow/section-01-features-light.svg',
      '.github/readmeglow/section-01-features-dark.svg',
      '.github/readmeglow/section-02-getting-started-light.svg',
      '.github/readmeglow/section-02-getting-started-dark.svg',
      '.github/readmeglow/section-03-changelog-light.svg',
      '.github/readmeglow/section-03-changelog-dark.svg',
      '.github/readmeglow/divider-light.svg',
      '.github/readmeglow/divider-dark.svg',
    ]);
  });

  it('round-trips: unexport gives back the original (except in-place badge and alert fixes)', () => {
    const plain = opts({ badges: 'keep', alerts: false, fold: true, toc: 'list', numbered: true });
    const { markdown } = exportForGitHub(README, plain, stub());
    expect(unexport(markdown)).toBe(README);
  });

  it('is idempotent: exporting an export gives the same result (no second banner)', () => {
    const o = opts({ toc: 'pills', fold: true, config: { theme: 'aurora', layout: 'landing', accent: '#7c5cff' } });
    const once = exportForGitHub(README, o, stub()).markdown;
    const twice = exportForGitHub(once, o, stub()).markdown;
    expect(twice).toBe(once);
    expect(twice.match(/readmeglow:begin hero/g)).toHaveLength(1);
    expect(twice.match(/<!-- readmeglow theme=/g)).toHaveLength(1);
  });

  it('writes the config comment at the very top', () => {
    const { markdown } = exportForGitHub(README, opts({ config: { theme: 'synthwave', layout: 'landing', accent: '#ff2e97' } }), stub());
    expect(markdown.startsWith('<!-- readmeglow theme="synthwave" layout="landing" accent="#ff2e97" -->\n')).toBe(true);
    expect(readConfig(markdown)).toEqual({ theme: 'synthwave', layout: 'landing', accent: '#ff2e97' });
  });

  it('adds a table of contents as a list or as pills, unless one exists', () => {
    const list = exportForGitHub(README, opts({ toc: 'list' }), stub()).markdown;
    expect(list).toContain('<details open>\n<summary><b>Contents</b></summary>\n\n- [Features](#features)\n- [Getting started](#getting-started)\n- [Changelog](#changelog)\n\n</details>');
    const pills = exportForGitHub(README, opts({ toc: 'pills' }), stub()).markdown;
    expect(pills).toContain('<a href="#getting-started"><img alt="Getting started" src="https://img.shields.io/badge/Getting%20started-7c5cff?style=for-the-badge&amp;labelColor=0b0c1e"></a>');
    // The TOC comes before the first section image.
    expect(pills.indexOf('readmeglow:begin toc')).toBeLessThan(pills.indexOf('## <a id="features">'));
    // A darker pill colour (so white text reads) is used when the renderer has one.
    const dark = { ...stub(), badgeColors: { accent: '#a78bfa', label: '#070713', pill: '#6d28d9' } };
    expect(exportForGitHub(README, opts({ toc: 'pills' }), dark).markdown).toContain('/badge/Features-6d28d9?style=');
    const existing = exportForGitHub('# T\n\n## Table of contents\n\n- [A](#a)\n\n## A\n\nx\n\n## B\n\ny\n', opts({ toc: 'list' }), stub());
    expect(existing.info.toc).toBe('exists');
    expect(existing.markdown).not.toContain('readmeglow:begin toc');
  });

  it('folds changelogs and very long sections into <details>', () => {
    const { markdown, info } = exportForGitHub(README, opts({ fold: true }), stub());
    expect(info.folded).toBe(1);
    expect(markdown).toContain('<details>\n<summary><b>Show Changelog</b></summary>\n<!-- readmeglow:end fold -->\n\n- 1.0 First release\n');
    expect(markdown.trimEnd().endsWith('</details>\n<!-- readmeglow:end fold-end -->')).toBe(true);
  });

  it('uses one plain <img> per image for single-variant themes', () => {
    const { markdown, assets } = exportForGitHub(README, opts(), stub(['only']));
    expect(assets.every((a) => !/-(light|dark)\.svg$/.test(a.path))).toBe(true);
    expect(markdown).toContain('<h1 align="center"><img alt="Nebula Board — A calm, keyboard-first task board." src=".github/readmeglow/hero.svg"></h1>');
    expect(markdown).not.toContain('<picture>');
  });

  it('replaces only the <h1> of an HTML header', () => {
    const md = '<div align="center">\n  <img src="logo.png" width="96">\n  <h1>Quanta &amp; Co</h1>\n  <p>Tagline here</p>\n</div>\n\n## Usage\n\nx\n';
    const { markdown, info } = exportForGitHub(md, opts({ sections: false, dividers: false }), stub());
    expect(info).toMatchObject({ title: 'Quanta & Co', titleSource: 'html' });
    expect(markdown).toContain('<img src="logo.png" width="96">');
    expect(markdown).toContain('<p>Tagline here</p>');
    expect(markdown).toMatch(/<h1 align="center"><picture>.*alt="Quanta &amp; Co".*<\/picture><\/h1>/);
    // The stored original has no blank line, so the HTML block stays intact.
    expect(unexport(markdown)).toBe(md);
  });

  it('leaves a README without a title alone unless a title is given', () => {
    const md = 'Some text.\n\n## A\n\nx\n';
    const none = exportForGitHub(md, opts({ sections: false }), stub());
    expect(none.info.titleSource).toBeNull();
    expect(none.markdown).toBe(md);
    const given = exportForGitHub(md, opts({ sections: false, title: 'My Tool', tagline: 'Does things' }), stub());
    expect(given.markdown.startsWith('<!-- readmeglow:begin hero -->\n<h1 align="center"><picture>')).toBe(true);
    expect(given.assets[0]!.svg).toContain('My Tool|Does things');
    expect(unexport(given.markdown)).toBe(md);
  });

  it('keeps the first paragraph when a custom tagline is used', () => {
    const { markdown } = exportForGitHub(README, opts({ tagline: 'Plan. Focus. Ship.', sections: false }), stub());
    expect(markdown).toContain('> A calm, keyboard-first task board.');
    expect(markdown).toContain('alt="Nebula Board — Plan. Focus. Ship."');
  });

  it('centred text header when images are off', () => {
    const { markdown, assets } = exportForGitHub(README, opts({ header: 'centered', sections: false, dividers: false }), stub());
    expect(assets).toHaveLength(0);
    expect(markdown).toContain('<h1 align="center">Nebula Board</h1>\n<p align="center">A calm, keyboard-first task board.</p>\n<p align="center">');
  });

  it('handles CRLF line endings and restores them', () => {
    const crlf = README.replace(/\n/g, '\r\n');
    const { markdown } = exportForGitHub(crlf, opts({ badges: 'keep', alerts: false, toc: 'list', fold: true }), stub());
    expect(markdown).not.toMatch(/[^\r]\n/);
    expect(unexport(markdown)).toBe(crlf);
  });

  it('draws emoji shortcodes and keeps slugs GitHub would make', () => {
    const md = '# App\n\n## :rocket: Quick start\n\nx\n\n## Quick start\n\ny\n';
    const { markdown, assets } = exportForGitHub(md, opts({ emoji: new Map([['rocket', '🚀']]) }), stub(['only']));
    expect(markdown).toContain('## <a id="rocket-quick-start"></a>');
    expect(markdown).toContain('## <a id="quick-start"></a>');
    expect(assets.find((a) => a.kind === 'section')!.svg).toContain('🚀 Quick start');
  });

  it('does not treat a setext heading underline as a divider', () => {
    const md = '# T\n\nIntro\n---\n\nText\n\n***\n\nMore\n';
    const { info } = exportForGitHub(md, opts({ sections: false }), stub());
    expect(info.dividers).toBe(1);
  });
});

describe('badges', () => {
  const colors = { accent: '#7c5cff', label: '#101014' };
  it('sets style and label colour, and the accent only for generic static badges', () => {
    expect(restyleBadge('https://img.shields.io/badge/license-MIT-blue', 'flat-square', colors)).toBe(
      'https://img.shields.io/badge/license-MIT-blue?style=flat-square&labelColor=101014&color=7c5cff',
    );
    expect(restyleBadge('https://img.shields.io/badge/build-passing-brightgreen?logo=github', 'flat', colors)).toBe(
      'https://img.shields.io/badge/build-passing-brightgreen?logo=github&style=flat&labelColor=101014',
    );
    expect(restyleBadge('https://img.shields.io/npm/v/react', 'for-the-badge', colors)).toBe('https://img.shields.io/npm/v/react?style=for-the-badge&labelColor=101014');
    expect(restyleBadge('https://img.shields.io/badge/a--b-c-blue?style=plastic', 'flat', colors)).toContain('style=flat&');
  });
  it('leaves other URLs and "keep" alone', () => {
    expect(restyleBadge('https://github.com/o/r/workflows/ci/badge.svg', 'flat', colors)).toBe('https://github.com/o/r/workflows/ci/badge.svg');
    expect(restyleBadge('https://img.shields.io/badge/a-b-blue', 'keep', colors)).toBe('https://img.shields.io/badge/a-b-blue');
    expect(restyleBadge('not a url', 'flat', colors)).toBe('not a url');
  });
  it('restyles badges outside the header in place', () => {
    const md = '# T\n\nIntro text.\n\n## Status\n\n![npm](https://img.shields.io/npm/v/x) and <img src="https://img.shields.io/badge/a-b-blue?x=1&y=2">\n';
    const { markdown, info } = exportForGitHub(md, opts({ sections: false }), stub());
    expect(info.badges).toBe(2);
    expect(markdown).toContain('![npm](https://img.shields.io/npm/v/x?style=for-the-badge&labelColor=0b0c1e)');
    expect(markdown).toContain('<img src="https://img.shields.io/badge/a-b-blue?x=1&amp;y=2&amp;style=for-the-badge&amp;labelColor=0b0c1e&amp;color=7c5cff">');
  });
  it('escapes shields text', () => {
    expect(shieldsText('Get-started_now & go')).toBe('Get--started__now%20%26%20go');
  });
});

describe('picture', () => {
  it('escapes attributes', () => {
    expect(picture({ only: 'a"b.svg' }, '<x>')).toBe('<img alt="&lt;x&gt;" src="a&quot;b.svg">');
  });
});
