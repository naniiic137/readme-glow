import { describe, expect, it } from 'vitest';
import { analyzeReadme, insightsToMarkdown, keyFeaturesSection, overviewSection, summaryParagraph } from './index';
import { ARABIC, FRENCH, GODOT_GAME, NODE_APP, PROFILE, PYTHON_LIB, RUST_CLI, TINY } from './testFixtures';

const FIXTURES = { NODE_APP, PYTHON_LIB, RUST_CLI, GODOT_GAME, PROFILE, TINY, ARABIC, FRENCH };

describe('analyzeReadme: name, tagline, one-liner', () => {
  it.each([
    ['NODE_APP', 'Taskly', 'Taskly is a fast, keyboard-first task manager for small teams.', 'Taskly is a fast, keyboard-first task manager for small teams.'],
    [
      'PYTHON_LIB',
      'pyfetchly',
      'A tiny, typed HTTP client for Python with retries, caching and async support built in.',
      'pyfetchly is a tiny, typed HTTP client for Python with retries, caching and async support built in.',
    ],
    ['RUST_CLI', 'rgl', 'rgl is a line-oriented search tool written in Rust.', 'rgl is a line-oriented search tool written in Rust.'],
    [
      'GODOT_GAME',
      'Starfall Drift',
      'Starfall Drift is a cosy 2D space-exploration game made in Godot 4.',
      'Starfall Drift is a cosy 2D space-exploration game made in Godot 4.',
    ],
    [
      'PROFILE',
      "Hi 👋, I'm Sara Ahmed",
      'A full-stack developer who loves building accessible web apps',
      'A full-stack developer who loves building accessible web apps.',
    ],
    ['TINY', 'tiny-thing', null, 'tiny-thing'],
  ] as const)('%s', (key, name, tagline, oneLiner) => {
    const ins = analyzeReadme(FIXTURES[key]);
    expect(ins.name).toBe(name);
    expect(ins.tagline).toBe(tagline);
    expect(ins.oneLiner).toBe(oneLiner);
    expect(ins.oneLiner.length).toBeLessThanOrEqual(160);
  });

  it('builds "<name> <verb>s ..." and "<name>: ..." one-liners and truncates long ones', () => {
    expect(analyzeReadme('# Glow\n\nTurns README files into designed web pages.\n').oneLiner).toBe('Glow turns README files into designed web pages.');
    expect(analyzeReadme('# Glow\n\nBeautiful README pages, instantly.\n').oneLiner).toBe('Glow: Beautiful README pages, instantly.');
    const long = `# Big\n\nA ${'very '.repeat(60)}long description of the project.\n`;
    const one = analyzeReadme(long).oneLiner;
    expect(one.length).toBeLessThanOrEqual(160);
    expect(one.endsWith('…')).toBe(true);
  });

  it('uses the repository context when the README has no title or description', () => {
    const ins = analyzeReadme('Some notes without a heading', { repo: { owner: 'acme', name: 'widget', description: 'Widgets for everyone' } });
    expect(ins.name).toBe('widget');
    expect(ins.tagline).toBe('Some notes without a heading');
    const bare = analyzeReadme('# widget\n', { repo: { owner: 'acme', name: 'widget', description: 'Widgets for everyone' } });
    expect(bare.tagline).toBe('Widgets for everyone');
    expect(bare.oneLiner).toBe('widget: Widgets for everyone.');
    expect(bare.summary).toEqual([{ text: 'Widgets for everyone', line: 1 }]);
  });

  it('takes the name from an HTML <h1> or a logo alt text', () => {
    expect(analyzeReadme('<h1 align="center">\n  <img src="logo.png" width="80"><br>Glowy\n</h1>\n\nMakes things glow.\n').name).toBe('Glowy');
    expect(analyzeReadme('# ![Sparkle logo](logo.svg)\n\nMakes things sparkle.\n').name).toBe('Sparkle');
  });
});

describe('analyzeReadme: summary', () => {
  it('picks sensible sentences from the intro in original order', () => {
    const ins = analyzeReadme(NODE_APP);
    expect(ins.summary.map((s) => s.text)).toEqual([
      'Taskly is a fast, keyboard-first task manager for small teams.',
      'It keeps your to-dos, notes and deadlines in one tidy board that syncs in real time.',
      'Instant search across every board, e.g. by tag or assignee',
      'Real-time sync powered by Supabase',
    ]);
    expect(ins.summary.map((s) => s.line)).toEqual([11, 11, 17, 18]);
  });

  it('keeps 3–5 sentences, in document order, for every fixture', () => {
    for (const md of [NODE_APP, PYTHON_LIB, RUST_CLI, GODOT_GAME, PROFILE, ARABIC]) {
      const { summary } = analyzeReadme(md);
      expect(summary.length).toBeGreaterThanOrEqual(3);
      expect(summary.length).toBeLessThanOrEqual(5);
      const lines = summary.map((s) => s.line);
      expect(lines).toEqual([...lines].sort((a, b) => a - b));
    }
  });

  it('never picks installation, licence or contributing boilerplate for a descriptive README', () => {
    const texts = analyzeReadme(NODE_APP).summary.map((s) => s.text).join(' ');
    expect(texts).not.toMatch(/Pull requests|MIT|npm/);
    const rust = analyzeReadme(RUST_CLI).summary.map((s) => s.text);
    expect(rust).not.toContain('Licensed under either of Apache License, Version 2.0 or MIT license at your option.');
  });

  it('summarises Arabic READMEs sentence by sentence', () => {
    const ins = analyzeReadme(ARABIC);
    expect(ins.name).toBe('مُحوِّل النصوص');
    expect(ins.summary[0]).toEqual({ text: 'مُحوِّل النصوص هو أداة مفتوحة المصدر لتحويل ملفات Markdown إلى صفحات ويب جميلة.', line: 3 });
    expect(ins.summary[1]!.text).toBe('يعمل بالكامل داخل المتصفح دون الحاجة إلى خادم.');
    expect(ins.outline.map((o) => o.id)).toEqual(['مُحوِّل-النصوص', 'المميزات', 'التثبيت', 'الترخيص']);
  });

  it('is deterministic', () => {
    for (const md of Object.values(FIXTURES)) expect(analyzeReadme(md)).toEqual(analyzeReadme(md));
  });

  it('handles empty and odd input without throwing', () => {
    const empty = analyzeReadme('');
    expect(empty).toMatchObject({ name: null, tagline: null, oneLiner: '', summary: [], tech: [], licence: null, outline: [] });
    expect(empty.stats).toEqual({ words: 0, readingMinutes: 1, codeBlocks: 0, images: 0, links: 0, headings: 0, sections: 0 });
    for (const odd of ['   ', '\n\n\n', '```', '<div>', '# ', '| a |\n| - |', '[x]: http://a', '$$\n\\frac{1}{2}\n$$', undefined as unknown as string]) {
      expect(() => analyzeReadme(odd)).not.toThrow();
    }
  });
});

describe('analyzeReadme: outline and stats', () => {
  it('lists headings with GitHub slugs, de-duplicated like GitHub', () => {
    const md = '# App :rocket:\n\n## Install\n\n## Install\n\n## 🚀 Features\n\n### `code` & C++\n';
    expect(analyzeReadme(md).outline).toEqual([
      { depth: 1, text: 'App', line: 1, id: 'app-' },
      { depth: 2, text: 'Install', line: 3, id: 'install' },
      { depth: 2, text: 'Install', line: 5, id: 'install-1' },
      { depth: 2, text: '🚀 Features', line: 7, id: '-features' },
      { depth: 3, text: 'code & C++', line: 9, id: 'code--c' },
    ]);
  });

  it('counts words (without code), code blocks, non-badge images, links, headings and H2 sections', () => {
    expect(analyzeReadme(NODE_APP).stats).toEqual({ words: 120, readingMinutes: 1, codeBlocks: 2, images: 1, links: 9, headings: 8, sections: 7 });
    const words = analyzeReadme(`# Long\n\n${'word '.repeat(700)}\n\n\`\`\`\n${'code '.repeat(500)}\n\`\`\`\n`).stats;
    expect(words.words).toBe(701);
    expect(words.readingMinutes).toBe(3);
  });
});

describe('Markdown output', () => {
  it('insightsToMarkdown gives a title, one-liner, summary and labelled facts', () => {
    const out = insightsToMarkdown(analyzeReadme(NODE_APP));
    expect(out).toBe(
      [
        '### Taskly',
        '',
        'Taskly is a fast, keyboard-first task manager for small teams. It keeps your to-dos, notes and deadlines in one tidy board that syncs in real time. Instant search across every board, e.g. by tag or assignee. Real-time sync powered by Supabase.',
        '',
        '- **Tech:** TypeScript, Supabase, React, Vite, Tailwind CSS, PostgreSQL, Node.js',
        '- **Requirements:** Node.js 18+; npm 9+',
        '- **Install:** `git clone https://github.com/jane-doe/taskly.git`, `npm install`',
        '- **Run:** `npm run dev`, `npm test`',
        '- **Live demo:** [Live demo](https://taskly-demo.netlify.app)',
        '- **Documentation:** [Documentation](https://docs.taskly.dev)',
        '- **Community:** [Discord](https://discord.gg/taskly)',
        '- **Licence:** [MIT](LICENSE)',
        '- **Author:** [Jane Doe](https://github.com/jane-doe)',
        '',
      ].join('\n'),
    );
  });

  it('escapes Markdown in names and handles a README with nothing to say', () => {
    const out = insightsToMarkdown(analyzeReadme('# my_cool*lib\n'));
    expect(out).toBe('### my\\_cool\\*lib\n\nmy\\_cool\\*lib\n');
    expect(insightsToMarkdown(analyzeReadme(''))).toBe('### Summary\n');
  });

  it('overviewSection writes an Overview paragraph from the summary', () => {
    const ins = analyzeReadme(RUST_CLI);
    expect(overviewSection(ins)).toBe(`## Overview\n\n${summaryParagraph(ins)}\n`);
    expect(overviewSection(analyzeReadme(TINY))).toBe('## Overview\n\nAdd a short description of the project here.\n');
  });

  it('keyFeaturesSection reuses the Features list, or falls back to top sentences', () => {
    expect(keyFeaturesSection(analyzeReadme(NODE_APP))).toBe(
      '## Key features\n\n- ⚡ **Instant search** across every board, e.g. by tag or assignee\n- 🔄 Real-time sync powered by Supabase\n- 🌙 Dark mode and a high-contrast theme\n- 📱 Works offline as a progressive web app\n',
    );
    expect(keyFeaturesSection(analyzeReadme(RUST_CLI))).toBe(
      '## Key features\n\n- rgl is a line-oriented search tool written in Rust.\n- It recursively searches directories for a regex pattern while respecting your .gitignore rules.\n- The minimum supported Rust version is 1.74.\n',
    );
    expect(keyFeaturesSection(analyzeReadme(TINY))).toBe('## Key features\n\n- Describe what makes this project useful.\n');
  });
});

describe('built-in samples', () => {
  // Written by another part of the app; the test passes when there are none.
  const samples = import.meta.glob('../../samples/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

  it.each(Object.entries(samples).length ? Object.entries(samples) : [['(no samples yet)', '']])('%s analyses cleanly', (file, md) => {
    if (!md) return;
    const ins = analyzeReadme(md);
    expect(ins.summary.length, file).toBeGreaterThanOrEqual(1);
    expect(ins.oneLiner.length).toBeGreaterThan(0);
    expect(ins.oneLiner.length).toBeLessThanOrEqual(160);
    for (const fact of [...ins.tech, ...ins.install, ...ins.run, ...ins.requirements, ...ins.links, ...ins.authors]) {
      expect(fact.line).toBeGreaterThanOrEqual(1);
      expect(fact.line).toBeLessThanOrEqual(md.split('\n').length);
    }
  });
});
