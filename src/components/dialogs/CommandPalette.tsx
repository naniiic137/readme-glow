import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { useDialogFocus } from './useDialogFocus';
import { closeDialog, openDialog, setSettings, settings, togglePanel, ui, doc } from '../../app/state';
import { useStore } from '../../app/store';
import { THEMES } from '../../themes/registry';
import { LAYOUTS, LAYOUT_INFO, BACKGROUNDS, HEADING_STYLES } from '../../lib/settings';
import { fuzzyFilter } from '../../lib/fuzzy';
import { closeDocument, openSample } from '../../app/actions';
import { SAMPLES } from '../../samples';
import { sync } from '../../app/sync';
import { shortcutLabel } from '../../app/shortcuts';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: string;
  keywords?: string;
  run: () => void;
}

const run = (fn: () => void) => () => {
  closeDialog();
  setTimeout(fn, 0);
};

function exporter(name: 'html' | 'pdf' | 'png' | 'md' | 'copy' | 'zip' | 'share') {
  return run(() => void import('../../app/exporters').then((m) => m.runExport(name)));
}

/** Ctrl/⌘K: every action, theme, layout and heading, one fuzzy search away. */
export default function CommandPalette() {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const current = useStore(ui, (s) => s.doc);
  const render = useStore(ui, (s) => s.render);
  const s = useStore(settings, (x) => x);
  useDialogFocus(ref, closeDialog, 'input');

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (current) {
      out.push(
        { id: 'view-preview', group: 'View', label: 'Preview only', icon: 'eye', hint: shortcutLabel('Alt-1'), run: run(() => setSettings({ view: 'preview' })) },
        { id: 'view-split', group: 'View', label: 'Split editor and preview', icon: 'split', hint: shortcutLabel('Alt-2'), keywords: 'toggle editor', run: run(() => setSettings({ view: 'split' })) },
        { id: 'view-editor', group: 'View', label: 'Markdown editor only', icon: 'code', hint: shortcutLabel('Alt-3'), keywords: 'toggle editor', run: run(() => setSettings({ view: 'editor' })) },
        { id: 'visual', group: 'View', label: ui.get().visualEdit ? 'Stop editing on page' : 'Edit on page (visual editing)', icon: 'pencilLine', hint: shortcutLabel('Alt-E'), run: run(() => ui.set({ visualEdit: !ui.get().visualEdit })) },
        { id: 'focus', group: 'View', label: 'Distraction-free writing', icon: 'maximize', hint: shortcutLabel('Alt-Z'), run: run(() => ui.set({ focusMode: true })) },
        { id: 'find', group: 'View', label: 'Find in document', icon: 'search', hint: shortcutLabel('Mod-F'), run: run(() => ui.set({ findOpen: true })) },
        { id: 'customise', group: 'Tools', label: 'Customise the look', icon: 'sliders', keywords: 'accent font width settings', run: run(() => togglePanel('customize')) },
        { id: 'beautify', group: 'Tools', label: 'Beautify this README', icon: 'wand', keywords: 'clean format tidy', run: run(() => openDialog('beautify')) },
        { id: 'health', group: 'Tools', label: 'README health check', icon: 'health', keywords: 'score lint', run: run(() => ui.set({ panel: 'insights', insightsTab: 'health' })) },
        { id: 'summary', group: 'Tools', label: 'Summary & key insights', icon: 'lightbulb', keywords: 'ai tech stack', run: run(() => ui.set({ panel: 'insights', insightsTab: 'summary' })) },
        { id: 'library', group: 'Tools', label: 'Your documents', icon: 'library', keywords: 'recent open', run: run(() => togglePanel('library')) },
        { id: 'sections', group: 'Insert', label: 'Insert a section…', icon: 'template', keywords: 'installation usage licence', run: run(() => openDialog('sections')) },
        { id: 'table', group: 'Insert', label: 'Insert a table…', icon: 'table', run: run(() => openDialog('table')) },
        { id: 'badge', group: 'Insert', label: 'Badge builder…', icon: 'badge', keywords: 'shields', run: run(() => openDialog('badgeBuilder')) },
        { id: 'emoji', group: 'Insert', label: 'Emoji…', icon: 'smile', run: run(() => openDialog('emoji')) },
        { id: 'viewbadge', group: 'Insert', label: '“View with ReadmeGlow” badge…', icon: 'sparkles', run: run(() => openDialog('viewBadge')) },
        { id: 'exp-html', group: 'Export', label: 'Export standalone HTML', icon: 'fileCode', run: exporter('html') },
        { id: 'exp-pdf', group: 'Export', label: 'Print / save as PDF', icon: 'printer', run: exporter('pdf') },
        { id: 'exp-png', group: 'Export', label: 'Export social card (PNG 1200×630)', icon: 'image', keywords: 'og preview', run: exporter('png') },
        { id: 'exp-md', group: 'Export', label: 'Download README.md', icon: 'download', run: exporter('md') },
        { id: 'exp-zip', group: 'Export', label: 'Download .zip with images', icon: 'archive', run: exporter('zip') },
        { id: 'exp-copy', group: 'Export', label: 'Copy Markdown', icon: 'copy', run: exporter('copy') },
        { id: 'exp-share', group: 'Export', label: 'Copy share link', icon: 'share', run: exporter('share') },
        { id: 'export', group: 'Export', label: 'All export options…', icon: 'download', hint: shortcutLabel('Mod-Shift-E'), run: run(() => openDialog('export')) },
        { id: 'undo', group: 'Edit', label: 'Undo', icon: 'undo', hint: shortcutLabel('Mod-Z'), run: run(() => doc.undo()) },
        { id: 'redo', group: 'Edit', label: 'Redo', icon: 'redo', hint: shortcutLabel('Mod-Shift-Z'), run: run(() => doc.redo()) },
      );
      for (const t of render?.toc ?? []) {
        out.push({
          id: `h-${t.id}`,
          group: 'Jump to',
          label: `${'  '.repeat(Math.max(0, t.depth - 1))}${t.text}`,
          icon: 'hash',
          keywords: 'heading section go',
          run: run(() => {
            const el = sync.preview?.element()?.querySelector(`[id="${CSS.escape(t.id)}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (sync.editor) sync.editor.revealLine(t.line, false);
          }),
        });
      }
    }
    for (const t of THEMES) {
      out.push({ id: `theme-${t.id}`, group: 'Themes', label: `Theme: ${t.name}`, hint: s.theme === t.id ? '✓' : t.tagline, icon: 'palette', run: run(() => setSettings({ theme: t.id })) });
    }
    for (const l of LAYOUTS) {
      out.push({ id: `layout-${l}`, group: 'Layouts', label: `Layout: ${LAYOUT_INFO[l].name}`, hint: s.layout === l ? '✓' : LAYOUT_INFO[l].description, icon: 'layout', run: run(() => setSettings({ layout: l })) });
    }
    out.push(
      { id: 'mode-light', group: 'Appearance', label: 'Light variant', icon: 'sun', run: run(() => setSettings({ mode: 'light' })) },
      { id: 'mode-dark', group: 'Appearance', label: 'Dark variant', icon: 'moon', run: run(() => setSettings({ mode: 'dark' })) },
      { id: 'mode-default', group: 'Appearance', label: 'Theme’s own variant', icon: 'palette', run: run(() => setSettings({ mode: 'default' })) },
      { id: 'lines', group: 'Appearance', label: s.lineNumbers ? 'Hide code line numbers' : 'Show code line numbers', icon: 'hash', run: run(() => setSettings({ lineNumbers: !s.lineNumbers })) },
      { id: 'reveal', group: 'Appearance', label: s.reveal ? 'Turn off scroll animations' : 'Turn on scroll animations', icon: 'sparkles', run: run(() => setSettings({ reveal: !s.reveal })) },
      ...BACKGROUNDS.map((b) => ({ id: `bg-${b}`, group: 'Appearance', label: `Background: ${b === 'theme' ? 'theme default' : b}`, icon: 'image', run: run(() => setSettings({ background: b })) })),
      ...HEADING_STYLES.map((h) => ({ id: `hs-${h}`, group: 'Appearance', label: `Headings: ${h === 'theme' ? 'theme default' : h}`, icon: 'heading', run: run(() => setSettings({ headingStyle: h })) })),
      { id: 'new', group: 'Documents', label: 'New document…', icon: 'plus', run: run(() => openDialog('templates')) },
      { id: 'github', group: 'Documents', label: 'Open from GitHub…', icon: 'github', run: run(() => openDialog('github')) },
      { id: 'paste', group: 'Documents', label: 'Paste Markdown…', icon: 'clipboard', run: run(() => openDialog('paste')) },
      ...SAMPLES.map((x) => ({ id: `sample-${x.id}`, group: 'Documents', label: `Open sample: ${x.title}`, icon: 'book', run: run(() => void openSample(x.id)) })),
      { id: 'shortcuts', group: 'Help', label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: run(() => openDialog('shortcuts')) },
    );
    if (current) out.push({ id: 'close', group: 'Documents', label: 'Close document', icon: 'x', run: run(() => void closeDocument()) });
    return out;
  }, [current, render, s]);

  const results = useMemo(() => fuzzyFilter(items, query, (i) => `${i.label} ${i.group} ${i.keywords ?? ''}`, 80), [items, query]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  return (
    <>
      <div className="overlay" onClick={closeDialog} aria-hidden="true" />
      <div ref={ref} className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            placeholder="Type a command, theme, layout or heading…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                results[active]?.run();
              }
            }}
          />
          <kbd className="k">Esc</kbd>
        </div>
        <ul className="palette-list" role="listbox" id={listId} aria-label="Commands">
          {results.map((item, i) => {
            const showGroup = !query && (i === 0 || results[i - 1]!.group !== item.group);
            return (
              <li key={item.id} role="presentation">
                {showGroup && <div className="palette-group" role="presentation">{item.group}</div>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`palette-item${i === active ? ' is-active' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => item.run()}
                >
                  <Icon name={item.icon} size={16} />
                  <span className="pi-label">{item.label}</span>
                  {query && <span className="pi-group">{item.group}</span>}
                  {item.hint && <span className="pi-hint">{item.hint}</span>}
                </div>
              </li>
            );
          })}
          {!results.length && <li className="palette-empty">No commands match “{query}”.</li>}
        </ul>
      </div>
    </>
  );
}
