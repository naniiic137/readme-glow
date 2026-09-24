import { lazy, Suspense, useRef, type CSSProperties } from 'react';
import { getTheme, resolveMode, tokensFor } from '../../themes/registry';
import { withAlpha } from '../../themes/color';
import { usePrefersDark } from '../../app/presentation';
import type { Settings } from '../../lib/settings';
import { Icon } from '../Icon';
import { Menu } from '../Menu';
import { useStore } from '../../app/store';
import { doc, openDialog, setSettings, settings } from '../../app/state';
import { sync } from '../../app/sync';
import { addImagesToDoc } from '../../app/actions';
import type { Command } from '../../lib/editor/types';
import * as cmd from '../../lib/editor/commands';
import { shortcutLabel } from '../../app/shortcuts';

const CodeEditor = lazy(() => import('./CodeEditor'));

const LANGS = ['bash', 'javascript', 'typescript', 'tsx', 'python', 'json', 'yaml', 'html', 'css', 'rust', 'go', 'java', 'csharp', 'cpp', 'php', 'ruby', 'sql', 'diff', 'mermaid', 'text'];
const ALERTS = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const;

function run(c: Command) {
  sync.editor?.run(c);
}

/** Editor colours: the page theme's own code palette (always readable), or the app's light/dark. */
function editorVars(themeId: string, mode: Settings['mode'], editorTheme: Settings['editorTheme'], prefersDark: boolean): CSSProperties | undefined {
  if (editorTheme !== 'match') return undefined;
  const theme = getTheme(themeId);
  const t = tokensFor(theme, resolveMode(theme, mode, prefersDark));
  const s = t.syntax;
  const vars: Record<string, string> = {
    '--ed-bg': t.codeBg,
    '--ed-text': t.codeText,
    '--ed-gutter': s.comment,
    '--ed-active': withAlpha(t.codeText, 0.06),
    '--ed-selection': withAlpha(s.keyword, 0.28),
    '--ed-match': withAlpha(s.number, 0.25),
    '--ed-flash': withAlpha(s.function, 0.22),
    '--ed-accent': s.keyword,
    '--ed-heading': s.function,
    '--ed-strong': t.codeText,
    '--ed-em': t.codeText,
    '--ed-muted': s.comment,
    '--ed-link': s.string,
    '--ed-code': s.tag,
    '--ed-quote': s.comment,
    '--ed-tag': s.tag,
    '--ed-attr': s.attr,
    '--ed-string': s.string,
    '--ed-keyword': s.keyword,
    '--ed-number': s.number,
    '--ed-fn': s.function,
    '--ed-type': s.type,
    '--ed-mono': theme.fonts.mono,
  };
  return vars as CSSProperties;
}

export function EditorPane() {
  const wrap = useStore(settings, (s) => s.wrap);
  const lines = useStore(settings, (s) => s.editorLineNumbers);
  const syncScroll = useStore(settings, (s) => s.syncScroll);
  const themeId = useStore(settings, (s) => s.theme);
  const mode = useStore(settings, (s) => s.mode);
  const editorTheme = useStore(settings, (s) => s.editorTheme);
  const prefersDark = usePrefersDark();
  const imageInput = useRef<HTMLInputElement>(null);
  const style = editorVars(themeId, mode, editorTheme, prefersDark);

  const tb = (icon: string, label: string, c: Command, key?: string) => (
    <button type="button" className="icon-btn sm" aria-label={label} data-tip={key ? `${label} · ${shortcutLabel(key)}` : label} onClick={() => run(c)} onMouseDown={(e) => e.preventDefault()}>
      <Icon name={icon} size={16} />
    </button>
  );

  return (
    <section className={`editor-pane ed-${editorTheme}`} aria-label="Markdown editor" style={style}>
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
        <div className="tb-group">
          <button type="button" className="icon-btn sm" aria-label="Undo" data-tip={`Undo · ${shortcutLabel('Mod-Z')}`} onClick={() => doc.undo()} onMouseDown={(e) => e.preventDefault()}>
            <Icon name="undo" size={16} />
          </button>
          <button type="button" className="icon-btn sm" aria-label="Redo" data-tip={`Redo · ${shortcutLabel('Mod-Shift-Z')}`} onClick={() => doc.redo()} onMouseDown={(e) => e.preventDefault()}>
            <Icon name="redo" size={16} />
          </button>
        </div>
        <div className="tb-group">
          <Menu
            label="Heading"
            tip="Headings"
            className="icon-btn sm"
            button={<Icon name="heading" size={16} />}
            items={[
              ...[1, 2, 3, 4, 5, 6].map((n) => ({
                id: `h${n}`,
                label: <span className={`menu-h h${n}`}>Heading {n}</span>,
                hint: shortcutLabel(`Mod-Alt-${n}`),
                onSelect: () => run(cmd.setHeading(n as 1)),
              })),
              { id: 'p', label: 'Normal text', hint: shortcutLabel('Mod-Alt-0'), onSelect: () => run(cmd.setHeading(0)) },
            ]}
          />
          {tb('bold', 'Bold', cmd.toggleBold, 'Mod-B')}
          {tb('italic', 'Italic', cmd.toggleItalic, 'Mod-I')}
          {tb('strike', 'Strikethrough', cmd.toggleStrike, 'Mod-Shift-X')}
          {tb('code', 'Inline code', cmd.toggleInlineCode, 'Mod-E')}
          {tb('link', 'Link', cmd.insertLink(), 'Mod-Shift-L')}
        </div>
        <div className="tb-group">
          {tb('quote', 'Quote', cmd.toggleQuote, 'Mod-Shift-.')}
          {tb('list', 'Bullet list', cmd.toggleBulletList, 'Mod-Shift-8')}
          {tb('listOrdered', 'Numbered list', cmd.toggleNumberedList, 'Mod-Shift-7')}
          {tb('listChecks', 'Task list', cmd.toggleTaskList, 'Mod-Shift-9')}
        </div>
        <div className="tb-group">
          <Menu
            label="Code block"
            tip="Code block"
            className="icon-btn sm"
            button={<Icon name="codeBlock" size={16} />}
            items={LANGS.map((l) => ({ id: l, label: l, onSelect: () => run(cmd.insertCodeBlock(l === 'text' ? undefined : l)) }))}
          />
          <Menu
            label="Image"
            tip="Image"
            className="icon-btn sm"
            button={<Icon name="image" size={16} />}
            items={[
              { id: 'upload', label: 'Upload from this device…', icon: <Icon name="upload" size={15} />, onSelect: () => imageInput.current?.click() },
              { id: 'url', label: 'Image from a URL', icon: <Icon name="link" size={15} />, onSelect: () => run(cmd.insertImage()) },
            ]}
          />
          <button type="button" className="icon-btn sm" aria-label="Table" data-tip="Table builder" onClick={() => openDialog('table')}>
            <Icon name="table" size={16} />
          </button>
          <Menu
            label="Callout"
            tip="GitHub alert"
            className="icon-btn sm"
            button={<Icon name="alert" size={16} />}
            items={ALERTS.map((a) => ({ id: a, label: a[0] + a.slice(1).toLowerCase(), onSelect: () => run(cmd.insertAlert(a)) }))}
          />
          {tb('minus', 'Horizontal rule', cmd.insertHorizontalRule)}
          {tb('details', 'Collapsible details', cmd.insertDetails())}
          {tb('footnote', 'Footnote', cmd.insertFootnote())}
          <button type="button" className="icon-btn sm" aria-label="Emoji" data-tip="Emoji" onClick={() => openDialog('emoji')}>
            <Icon name="smile" size={16} />
          </button>
          <button type="button" className="icon-btn sm" aria-label="Badge builder" data-tip="Badge builder" onClick={() => openDialog('badgeBuilder')}>
            <Icon name="badge" size={16} />
          </button>
          <button type="button" className="btn btn-sm btn-ghost tb-sections" onClick={() => openDialog('sections')} data-tip="Insert a README section">
            <Icon name="template" size={15} /> Sections
          </button>
        </div>
        <div className="tb-group tb-right">
          <button type="button" className="icon-btn sm" aria-label="Find and replace" data-tip={`Find & replace · ${shortcutLabel('Mod-F')}`} onClick={() => (window as unknown as { __rgOpenSearch?: () => void }).__rgOpenSearch?.()}>
            <Icon name="search" size={16} />
          </button>
          <button type="button" className={`icon-btn sm${wrap ? ' is-on' : ''}`} aria-pressed={wrap} aria-label="Soft wrap" data-tip="Soft wrap" onClick={() => setSettings({ wrap: !wrap })}>
            <Icon name="wrap" size={16} />
          </button>
          <button type="button" className={`icon-btn sm${lines ? ' is-on' : ''}`} aria-pressed={lines} aria-label="Line numbers" data-tip="Line numbers" onClick={() => setSettings({ editorLineNumbers: !lines })}>
            <Icon name="hash" size={16} />
          </button>
          <button type="button" className={`icon-btn sm${syncScroll ? ' is-on' : ''}`} aria-pressed={syncScroll} aria-label="Sync scrolling" data-tip="Sync scrolling" onClick={() => setSettings({ syncScroll: !syncScroll })}>
            <Icon name="link" size={16} />
          </button>
          <Menu
            label="Editor colours"
            tip="Editor colours"
            className="icon-btn sm"
            align="end"
            button={<Icon name="palette" size={16} />}
            items={[
              { id: 'match', label: 'Match the page theme', hint: editorTheme === 'match' ? '✓' : undefined, onSelect: () => setSettings({ editorTheme: 'match' }) },
              { id: 'dark', label: 'Dark', hint: editorTheme === 'dark' ? '✓' : undefined, onSelect: () => setSettings({ editorTheme: 'dark' }) },
              { id: 'light', label: 'Light', hint: editorTheme === 'light' ? '✓' : undefined, onSelect: () => setSettings({ editorTheme: 'light' }) },
            ]}
          />
        </div>
      </div>
      <div className="editor-body">
        <Suspense
          fallback={
            <div className="editor-loading" role="status">
              <span className="spinner" aria-hidden="true" /> Loading the editor…
            </div>
          }
        >
          <CodeEditor />
        </Suspense>
      </div>
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          const snippets = await addImagesToDoc(files);
          if (snippets.length) sync.editor?.insertBlock(snippets.join('\n\n'));
        }}
      />
    </section>
  );
}
