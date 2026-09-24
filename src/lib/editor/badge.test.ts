import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BADGE_COLORS,
  BADGE_PRESETS,
  badgeHtml,
  badgeMarkdown,
  readmeGlowBadge,
  repoBadges,
  shieldsUrl,
  type BadgeSpec,
} from './badge';
import { isBadgeUrl, parseShieldsUrl } from '../markdown/badges';
import { renderMarkdown } from '../markdown/pipeline';

const spec = (over: Partial<BadgeSpec> = {}): BadgeSpec => ({ label: 'build', message: 'passing', color: 'brightgreen', ...over });

describe('shieldsUrl', () => {
  it('builds the label-message-colour form', () => {
    expect(shieldsUrl(spec())).toBe('https://img.shields.io/badge/build-passing-brightgreen');
  });

  it('doubles dashes and underscores and encodes spaces', () => {
    const url = shieldsUrl(spec({ label: 'code-style', message: 'snake_case ok', color: '8B5CF6' }));
    expect(url).toBe('https://img.shields.io/badge/code--style-snake__case%20ok-8B5CF6');
  });

  it('encodes unicode, reserved and Markdown-sensitive characters', () => {
    const url = shieldsUrl(spec({ label: 'C#/C++', message: 'déjà vu (β) 100%', color: 'blue' }));
    expect(url).toBe('https://img.shields.io/badge/C%23%2FC%2B%2B-d%C3%A9j%C3%A0%20vu%20%28%CE%B2%29%20100%25-blue');
    expect(url).not.toMatch(/[()\s]/);
  });

  it('round-trips through the renderer’s shields parser', () => {
    for (const s of [
      spec({ label: 'a-b_c d', message: 'x--y__z', color: 'ff00aa' }),
      spec({ label: 'مرحبا', message: '日本 🚀', color: 'blue' }),
      spec({ label: 'v', message: '1.2.3-beta_1', color: 'orange' }),
    ]) {
      const parsed = parseShieldsUrl(shieldsUrl(s));
      expect(parsed).toEqual({ label: s.label, message: s.message, color: s.color });
    }
  });

  it('uses the message-colour form when the label is empty', () => {
    expect(shieldsUrl(spec({ label: '', message: 'React' }))).toBe('https://img.shields.io/badge/React-brightgreen');
    expect(shieldsUrl(spec({ label: 'only', message: '' }))).toBe('https://img.shields.io/badge/only-brightgreen');
  });

  it('adds logo, logoColor and style in order and strips # from colours', () => {
    const url = shieldsUrl(spec({ label: '', message: 'Node.js', color: '#5FA04E', logo: 'nodedotjs', logoColor: '#fff', style: 'for-the-badge' }));
    expect(url).toBe('https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=fff&style=for-the-badge');
  });
});

describe('badgeMarkdown and badgeHtml', () => {
  it('writes an image, or a linked image', () => {
    expect(badgeMarkdown(spec())).toBe('![build: passing](https://img.shields.io/badge/build-passing-brightgreen)');
    expect(badgeMarkdown(spec({ link: 'https://example.com/ci' }))).toBe(
      '[![build: passing](https://img.shields.io/badge/build-passing-brightgreen)](https://example.com/ci)',
    );
  });

  it('escapes brackets in alt text and spaces or parentheses in links', () => {
    const md = badgeMarkdown(spec({ label: '[beta]', message: 'yes', link: 'https://example.com/a b(c)' }));
    expect(md).toContain('![\\[beta\\]: yes]');
    expect(md).toContain('(https://example.com/a%20b%28c%29)');
  });

  it('escapes attribute values in HTML', () => {
    const html = badgeHtml(spec({ label: 'say "hi"', message: '<b>&', link: 'https://example.com/?a=1&b="2"' }));
    expect(html).toBe(
      '<a href="https://example.com/?a=1&amp;b=&quot;2&quot;"><img alt="say &quot;hi&quot;: &lt;b&gt;&amp;" src="https://img.shields.io/badge/say%20%22hi%22-%3Cb%3E%26-brightgreen"></a>',
    );
    expect(badgeHtml(spec())).toMatch(/^<img alt="build: passing" src="[^"]+">$/);
  });

  it('renders as a badge row through the pipeline', async () => {
    const md = `# T\n\n${badgeMarkdown(spec({ link: 'https://example.com' }))} ${badgeMarkdown(spec({ label: 'x' }))}\n`;
    const r = await renderMarkdown(md);
    expect(r.html).toContain('class="rg-badges"');
    expect(r.meta.badges).toHaveLength(2);
    expect(r.meta.badges[0]!.alt).toBe('build: passing');
  });
});

describe('presets and colours', () => {
  it('has about two dozen presets with unique names, covering the popular stacks', () => {
    expect(BADGE_PRESETS.length).toBeGreaterThanOrEqual(24);
    const names = BADGE_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of ['React', 'TypeScript', 'Python', 'Rust', 'Docker', 'Godot', 'Unity', 'C#', 'C++', 'Tailwind CSS']) {
      expect(names).toContain(n);
    }
  });

  it('every preset produces a valid shields URL with a simple-icons slug', () => {
    for (const { name, spec: s } of BADGE_PRESETS) {
      const url = shieldsUrl(s);
      expect(() => new URL(url)).not.toThrow();
      expect(url.startsWith('https://img.shields.io/badge/')).toBe(true);
      expect(isBadgeUrl(url)).toBe(true);
      expect(s.logo).toMatch(/^[a-z0-9]+$/);
      expect(s.color).toMatch(/^[0-9A-F]{6}$/);
      expect(parseShieldsUrl(url)?.message).toBe(name);
      expect(url).not.toMatch(/[\s()]/);
    }
  });

  it('colours are six-digit hex without #', () => {
    for (const c of BADGE_COLORS) expect(c.hex).toMatch(/^[0-9A-F]{6}$/);
  });
});

describe('repoBadges', () => {
  it('returns the usual repository badges with links', () => {
    const badges = repoBadges('naniiic137', 'readme-glow');
    expect(badges.map((b) => b.name)).toEqual(['Licence', 'Stars', 'Forks', 'Last commit', 'Issues', 'Top language', 'CI']);
    const ci = badges.find((b) => b.name === 'CI')!;
    expect(ci.markdown).toBe(
      '[![CI](https://img.shields.io/github/actions/workflow/status/naniiic137/readme-glow/ci.yml)](https://github.com/naniiic137/readme-glow/actions/workflows/ci.yml)',
    );
    expect(badges[0]!.markdown).toContain('https://img.shields.io/github/license/naniiic137/readme-glow');
    for (const b of badges) expect(b.markdown).toMatch(/^\[!\[[^\]]+\]\(https:\/\/img\.shields\.io\/github\/[^)]+\)\]\(https:\/\/github\.com\/[^)]+\)$/);
  });
});

describe('readmeGlowBadge', () => {
  it('links to the app with the repo, theme and layout', () => {
    const b = readmeGlowBadge({ owner: 'naniiic137', repo: 'readme-glow', theme: 'aurora', layout: 'landing' });
    expect(b.url).toBe('https://img.shields.io/badge/View%20with-ReadmeGlow-8B5CF6?style=for-the-badge&logo=markdown&logoColor=white');
    expect(b.link).toBe('https://naniiic137.github.io/readme-glow/?repo=naniiic137/readme-glow&theme=aurora&layout=landing');
    expect(b.markdown).toBe(`[![View with ReadmeGlow](${b.url})](${b.link})`);
    expect(b.html).toBe(
      `<a href="https://naniiic137.github.io/readme-glow/?repo=naniiic137/readme-glow&amp;theme=aurora&amp;layout=landing"><img alt="View with ReadmeGlow" src="${b.url.replace(/&/g, '&amp;')}"></a>`,
    );
  });

  it('uses the custom badge from the app URL and omits unset options', () => {
    const b = readmeGlowBadge({ owner: 'o', repo: 'r', style: 'custom', appUrl: 'https://example.com/app' });
    expect(b.url).toBe('https://example.com/app/badge.svg');
    expect(b.link).toBe('https://example.com/app/?repo=o/r');
    expect(isBadgeUrl(b.url)).toBe(true);
  });
});

describe('public/badge.svg', () => {
  const svg = readFileSync(fileURLToPath(new URL('../../../public/badge.svg', import.meta.url)), 'utf8');

  it('is a small, self-contained SVG', () => {
    expect(svg.length).toBeLessThan(8000);
    expect(svg).toMatch(/<svg[^>]*width="\d+"[^>]*height="28"/);
    expect(svg).toContain('viewBox=');
    expect(svg).not.toMatch(/<script|foreignObject|href="http|url\(http|@import/i);
    expect(svg).toContain('View with');
    expect(svg).toContain('ReadmeGlow');
  });
});
