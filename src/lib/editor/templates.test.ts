import { describe, expect, it } from 'vitest';
import { STARTER_TEMPLATES, findTemplate } from './templates';
import { renderMarkdown } from '../markdown/pipeline';
import { collectImageRefs } from './zip';

const byId = (id: string) => findTemplate(id)!;

describe('starter templates', () => {
  it('offers the six starters with unique ids', () => {
    expect(STARTER_TEMPLATES.map((t) => t.id)).toEqual(['web-app', 'library', 'cli', 'game', 'profile', 'minimal']);
    for (const t of STARTER_TEMPLATES) {
      expect(t.name.trim()).not.toBe('');
      expect(t.description.trim()).not.toBe('');
      expect(t.emoji.trim()).not.toBe('');
    }
    expect(findTemplate('nope')).toBeUndefined();
  });

  it.each(STARTER_TEMPLATES.map((t) => [t.id, t] as const))('%s renders cleanly with a title', async (_id, t) => {
    const r = await renderMarkdown(t.markdown);
    expect(r.toc[0]?.depth).toBe(1);
    expect(r.meta.title).toBeTruthy();
    expect(r.html).not.toContain('data-missing');
    expect(t.markdown.endsWith('\n')).toBe(true);
    expect(t.markdown).not.toContain('\r');
  });

  it.each(STARTER_TEMPLATES.map((t) => [t.id, t] as const))('%s has no broken local images and few comments', (_id, t) => {
    // Local screenshots are suggested in comments, so a fresh template never shows a broken image.
    for (const { url } of collectImageRefs(t.markdown)) expect(url).toMatch(/^https:\/\//);
    expect((t.markdown.match(/<!--/g) ?? []).length).toBeLessThanOrEqual(2);
  });

  it('uses British spelling for the licence heading', () => {
    for (const t of STARTER_TEMPLATES.filter((x) => x.id !== 'profile')) {
      expect(t.markdown).toContain('## Licence');
      expect(t.markdown).not.toMatch(/^## License/m);
    }
  });

  it('web app: centred header, badge row, alert, tables and a roadmap', async () => {
    const r = await renderMarkdown(byId('web-app').markdown);
    expect(r.meta.badges.length).toBeGreaterThanOrEqual(3);
    expect(r.html).toContain('class="rg-badges"');
    expect(r.html).toContain('markdown-alert-tip');
    expect(r.stats.tables).toBeGreaterThanOrEqual(1);
    expect(r.html).toContain('contains-task-list');
    expect(r.meta.description).toContain('One sentence');
  });

  it('library: install, usage and an API table', async () => {
    const r = await renderMarkdown(byId('library').markdown);
    expect(r.toc.map((t) => t.text)).toEqual(expect.arrayContaining(['Installation', 'Usage', 'API']));
    expect(r.stats.tables).toBe(1);
    expect(r.html).toContain('<details');
  });

  it('CLI: a terminal session, commands and options tables', async () => {
    const r = await renderMarkdown(byId('cli').markdown);
    expect(r.html).toContain('data-lang="console"');
    expect(r.stats.tables).toBeGreaterThanOrEqual(3);
    expect(r.html).toContain('tool-name.toml');
  });

  it('game: controls table with keys, roadmap and credits', async () => {
    const r = await renderMarkdown(byId('game').markdown);
    expect(r.html.match(/<kbd>/g)!.length).toBeGreaterThanOrEqual(8);
    expect(r.html).toContain('contains-task-list');
    expect(r.toc.map((t) => t.text)).toEqual(expect.arrayContaining(['Controls', 'Roadmap', 'Credits']));
  });

  it('GitHub profile: greeting, tech badges, projects table, stats placeholders and contact', async () => {
    const t = byId('profile');
    const r = await renderMarkdown(t.markdown);
    expect(r.meta.title).toMatch(/^Hi there/);
    expect(r.toc.map((x) => x.text)).toEqual(expect.arrayContaining(['About me', 'Tech stack', 'Featured projects', 'GitHub stats', "Let's connect"]));
    expect(r.stats.tables).toBe(1);
    expect(t.markdown).toContain('username=your-username');
    expect(r.html.match(/data-badge="true"/g)!.length).toBeGreaterThanOrEqual(8);
  });

  it('minimal: short and to the point', () => {
    const t = byId('minimal');
    expect(t.markdown.trimEnd().split('\n').length).toBeLessThanOrEqual(30);
    expect(t.markdown).toContain('One sentence that says what it does and who it is for.');
  });
});
