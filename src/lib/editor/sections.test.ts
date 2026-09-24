import { describe, expect, it } from 'vitest';
import { SECTION_TEMPLATES, findSection } from './sections';
import { renderMarkdown } from '../markdown/pipeline';

const REQUIRED = [
  'installation',
  'usage',
  'features',
  'screenshots',
  'tech-stack',
  'roadmap',
  'contributing',
  'faq',
  'licence',
  'acknowledgements',
  'contact',
  'configuration',
  'tests',
  'deployment',
  'api-reference',
  'changelog',
];

describe('section templates', () => {
  it('has every required section, with unique ids', () => {
    const ids = SECTION_TEMPLATES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of REQUIRED) expect(ids).toContain(id);
  });

  it.each(SECTION_TEMPLATES.map((s) => [s.id, s] as const))('%s starts with an H2 and ends with one newline', (_id, s) => {
    expect(s.markdown.startsWith(`## ${s.title}\n`)).toBe(true);
    expect(s.markdown.endsWith('\n')).toBe(true);
    expect(s.markdown.endsWith('\n\n')).toBe(false);
    expect(s.emoji.trim()).not.toBe('');
    expect(s.description.trim()).not.toBe('');
  });

  it.each(SECTION_TEMPLATES.map((s) => [s.id, s] as const))('%s renders', async (_id, s) => {
    const r = await renderMarkdown(s.markdown);
    expect(r.toc[0]).toMatchObject({ depth: 2, text: s.title });
    expect(r.html).not.toContain('katex-error');
  });

  it('finds sections by id', () => {
    expect(findSection('faq')?.title).toBe('FAQ');
    expect(findSection('missing')).toBeUndefined();
  });

  it('writes the FAQ as collapsible answers', async () => {
    const r = await renderMarkdown(findSection('faq')!.markdown);
    expect(r.html.match(/<details/g)!.length).toBeGreaterThanOrEqual(3);
    expect(r.html.match(/<summary/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('offers both licence options and explains open-source licences', async () => {
    const s = findSection('licence')!;
    expect(s.title).toBe('Licence');
    expect(s.markdown).toContain('© 2026 Your Name. All rights reserved.');
    expect(s.markdown).toContain('MIT Licence');
    expect(s.markdown).toContain('choosealicense.com');
    const r = await renderMarkdown(s.markdown);
    expect(r.html).toContain('markdown-alert-note');
  });

  it('documents configuration as a table with a sample .env file', async () => {
    const r = await renderMarkdown(findSection('configuration')!.markdown);
    expect(r.stats.tables).toBe(1);
    expect(r.html).toMatch(/<th[^>]*align="center"/);
    expect(r.html).toContain('.env');
    expect(r.html).toContain('markdown-alert-warning');
  });

  it('uses the right building blocks for each section', async () => {
    const html = async (id: string) => (await renderMarkdown(findSection(id)!.markdown)).html;
    expect(await html('roadmap')).toContain('contains-task-list');
    expect(await html('tech-stack')).toContain('class="rg-badges"');
    expect(await html('api-reference')).toContain('<table');
    expect(await html('installation')).toContain('data-lang="bash"');
    expect(await html('screenshots')).toContain('rg-caption');
    expect(await html('deployment')).toContain('<details');
  });

  it('can all be inserted into one README', async () => {
    const md = `# Project\n\nIntro.\n\n${SECTION_TEMPLATES.map((s) => s.markdown).join('\n')}`;
    const r = await renderMarkdown(md);
    const h2 = r.toc.filter((t) => t.depth === 2).map((t) => t.text);
    expect(h2).toEqual(SECTION_TEMPLATES.map((s) => s.title));
  });
});
