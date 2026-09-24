import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { useStore } from '../app/store';
import { doc, openDialog, setSettings, settings, togglePanel, ui, type CurrentDoc } from '../app/state';
import { closeDocument, library } from '../app/actions';
import { getTheme, tokensFor, resolveMode } from '../themes/registry';
import { LAYOUTS, LAYOUT_INFO, type LayoutId, type ViewId } from '../lib/settings';
import { checkHealth } from '../lib/health';
import { shortcutLabel } from '../app/shortcuts';
import { usePrefersDark } from '../app/presentation';
import type { RenderOutput } from '../lib/markdown/pipeline';

const LAYOUT_ICONS: Record<LayoutId, string> = {
  document: 'file',
  docs: 'panelLeft',
  landing: 'rocket',
  slides: 'presentation',
  magazine: 'newspaper',
};

const VIEWS: Array<{ id: ViewId; label: string; icon: string; key: string }> = [
  { id: 'preview', label: 'Preview', icon: 'eye', key: 'Alt-1' },
  { id: 'split', label: 'Split', icon: 'split', key: 'Alt-2' },
  { id: 'editor', label: 'Markdown', icon: 'code', key: 'Alt-3' },
];

export function TopBar({ current, result, isMobile }: { current: CurrentDoc; result: RenderOutput | null; isMobile: boolean }) {
  const s = useStore(settings, (x) => x);
  const saveState = useStore(ui, (x) => x.saveState);
  const panel = useStore(ui, (x) => x.panel);
  const visualEdit = useStore(ui, (x) => x.visualEdit);
  const prefersDark = usePrefersDark();
  const theme = getTheme(s.theme);
  const tokens = tokensFor(theme, resolveMode(theme, s.mode, prefersDark));
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(current.title);

  // The health score badge follows the text (checkHealth is fast and pure).
  const health = useMemo(() => (result ? checkHealth(doc.text) : null), [result]);

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'pending' ? 'Unsaved changes' : saveState === 'error' ? 'Not saved — storage is full or blocked' : 'Saved in this browser';
  const sourceLabel =
    current.source.kind === 'github'
      ? `${current.source.owner}/${current.source.repo}`
      : current.source.kind === 'sample'
        ? 'Sample'
        : current.source.kind === 'file' || current.source.kind === 'folder'
          ? current.source.name
          : current.source.kind === 'share'
            ? 'Shared link'
            : 'Draft';

  const commitRename = async () => {
    setRenaming(false);
    const next = title.trim();
    if (!next || next === current.title) return;
    const lib = await library();
    await lib.rename(current.id, next);
    ui.set({ doc: { ...current, title: next } });
  };

  return (
    <header className="topbar">
      <div className="tb-left">
        <button type="button" className={`icon-btn${panel === 'library' ? ' is-on' : ''}`} aria-label="Your documents" data-tip="Your documents" onClick={() => togglePanel('library')}>
          <Icon name="library" />
        </button>
        <button type="button" className="brand-mini" onClick={() => void closeDocument()} aria-label="ReadmeGlow home" data-tip="Home">
          <span className="brand-mark sm" aria-hidden="true">
            <Icon name="sparkles" size={15} />
          </span>
        </button>
        <div className="doc-title">
          {renaming ? (
            <input
              className="input title-input"
              value={title}
              autoFocus
              aria-label="Document name"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename();
                if (e.key === 'Escape') {
                  setTitle(current.title);
                  setRenaming(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="title-btn"
              onClick={() => {
                setTitle(current.title);
                setRenaming(true);
              }}
              aria-label={`Rename document: ${current.title}`}
            >
              <span className="title-text">{current.title}</span>
            </button>
          )}
          <span className="doc-sub">
            <span className={`save-dot ${saveState}`} aria-hidden="true" />
            <span className="sr-only">{saveLabel}.</span>
            <span aria-hidden="true" title={saveLabel}>
              {sourceLabel}
            </span>
            {result && !isMobile && (
              <span className="doc-stats" aria-label={`${result.stats.words} words, ${result.stats.readingMinutes} minute read`}>
                · {result.stats.readingMinutes} min read · {result.stats.words.toLocaleString()} words
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="tb-center">
        <div className="seg" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" aria-pressed={s.view === v.id} onClick={() => setSettings({ view: v.id })} data-tip={`${v.label} · ${shortcutLabel(v.key)}`}>
              <Icon name={v.icon} size={15} />
              <span className="seg-label">{v.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`btn btn-sm visual-toggle${visualEdit ? ' is-on' : ''}`}
          aria-pressed={visualEdit}
          onClick={() => {
            ui.set({ visualEdit: !visualEdit });
            if (!visualEdit && s.view === 'editor') setSettings({ view: 'split' });
          }}
          data-tip={`Click any text on the page to edit it · ${shortcutLabel('Alt-E')}`}
        >
          <Icon name="pencilLine" size={15} />
          <span className="seg-label">{visualEdit ? 'Editing on page' : 'Edit on page'}</span>
        </button>
      </div>

      <div className="tb-right">
        {isMobile && (
          <button
            type="button"
            className="icon-btn"
            aria-label={s.view === 'preview' ? 'Edit the Markdown' : 'Back to the preview'}
            onClick={() => {
              setSettings({ view: s.view === 'preview' ? 'split' : 'preview' });
              ui.set({ mobileTab: s.view === 'preview' ? 'edit' : 'preview' });
            }}
          >
            <Icon name={s.view === 'preview' ? 'code' : 'eye'} />
          </button>
        )}
        <button type="button" className={`theme-btn${panel === 'customize' ? ' is-on' : ''}`} onClick={() => togglePanel('customize')} aria-label={`Theme: ${theme.name}. Customise`} data-tip="Themes & customise">
          <span className="swatch" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${tokens.bg} 0 45%, ${s.accent ?? tokens.accent} 45% 70%, ${tokens.text} 70%)` }} />
          <span className="theme-name">{theme.name}</span>
        </button>
        <Menu
          label="Layout"
          tip={`Layout: ${LAYOUT_INFO[s.layout].name}`}
          button={<Icon name={LAYOUT_ICONS[s.layout]} />}
          align="end"
          items={LAYOUTS.map((l) => ({
            id: l,
            icon: <Icon name={LAYOUT_ICONS[l]} size={16} />,
            label: (
              <span className="menu-two">
                <strong>{LAYOUT_INFO[l].name}</strong>
                <small>{LAYOUT_INFO[l].description}</small>
              </span>
            ),
            hint: s.layout === l ? '✓' : undefined,
            onSelect: () => setSettings({ layout: l }),
          }))}
        />
        <button type="button" className="icon-btn" aria-label="Beautify this README" data-tip="Beautify" onClick={() => openDialog('beautify')}>
          <Icon name="wand" />
        </button>
        <button
          type="button"
          className={`icon-btn insights-btn${panel === 'insights' ? ' is-on' : ''}`}
          aria-label={`Insights and health check${health ? `: score ${health.score}` : ''}`}
          data-tip="Summary & health check"
          onClick={() => togglePanel('insights')}
        >
          <Icon name="lightbulb" />
          {health && <span className={`score-pill grade-${health.grade.replace('+', 'plus')}`}>{health.score}</span>}
        </button>
        <button type="button" className="icon-btn hide-sm" aria-label="Find in document" data-tip={`Find · ${shortcutLabel('Mod-F')}`} onClick={() => ui.set({ findOpen: true })}>
          <Icon name="search" />
        </button>
        <button type="button" className="btn btn-primary btn-sm export-btn" onClick={() => openDialog('export')}>
          <Icon name="download" size={16} /> <span className="seg-label">Export</span>
        </button>
        <button type="button" className="icon-btn hide-sm" aria-label="Command palette" data-tip={`Commands · ${shortcutLabel('Mod-K')}`} onClick={() => openDialog('palette')}>
          <Icon name="command" />
        </button>
        <Menu
          label="More"
          tip="More"
          align="end"
          button={<Icon name="moreH" />}
          items={[
            {
              id: 'visual',
              icon: <Icon name="pencilLine" size={16} />,
              label: visualEdit ? 'Stop editing on page' : 'Edit on page',
              hint: shortcutLabel('Alt-E'),
              onSelect: () => ui.set({ visualEdit: !visualEdit, mobileTab: 'preview' }),
            },
            { id: 'new', icon: <Icon name="plus" size={16} />, label: 'New document…', onSelect: () => openDialog('templates') },
            { id: 'github', icon: <Icon name="github" size={16} />, label: 'Open from GitHub…', onSelect: () => openDialog('github') },
            { id: 'paste', icon: <Icon name="clipboard" size={16} />, label: 'Paste Markdown…', onSelect: () => openDialog('paste') },
            { id: 'badge', icon: <Icon name="badge" size={16} />, label: '“View with ReadmeGlow” badge…', onSelect: () => openDialog('viewBadge') },
            { id: 'focus', icon: <Icon name="maximize" size={16} />, label: 'Distraction-free writing', hint: shortcutLabel('Alt-Z'), onSelect: () => ui.set({ focusMode: true }) },
            { id: 'keys', icon: <Icon name="keyboard" size={16} />, label: 'Keyboard shortcuts', hint: '?', onSelect: () => openDialog('shortcuts') },
            { id: 'palette', icon: <Icon name="command" size={16} />, label: 'Command palette', hint: shortcutLabel('Mod-K'), onSelect: () => openDialog('palette') },
            { id: 'close', icon: <Icon name="x" size={16} />, label: 'Close document', onSelect: () => void closeDocument() },
          ]}
        />
      </div>
    </header>
  );
}
