import { useEffect, useRef } from 'react';
import { EditorState, EditorSelection, Compartment, StateEffect, StateField, Annotation, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
  placeholder,
  Decoration,
  type DecorationSet,
} from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, search, openSearchPanel } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { tags as t } from '@lezer/highlight';
import { doc, ui, settings, toast } from '../../app/state';
import { useStore } from '../../app/store';
import { sync, claimScroll } from '../../app/sync';
import { addImagesToDoc } from '../../app/actions';
import { minimalChange } from '../../lib/docStore';
import type { Command } from '../../lib/editor/types';
import * as cmd from '../../lib/editor/commands';

const external = Annotation.define<boolean>();

// A brief highlight on the line the preview (or the visual editor) points at.
const flashLine = StateEffect.define<number | null>();
const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(flashLine)) {
        if (e.value === null) return Decoration.none;
        const line = tr.state.doc.line(Math.max(1, Math.min(tr.state.doc.lines, e.value)));
        return Decoration.set([Decoration.line({ class: 'cm-flash-line' }).range(line.from)]);
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const highlight = HighlightStyle.define([
  { tag: t.heading1, color: 'var(--ed-heading)', fontWeight: '800', fontSize: '1.22em' },
  { tag: t.heading2, color: 'var(--ed-heading)', fontWeight: '750', fontSize: '1.12em' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], color: 'var(--ed-heading)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700', color: 'var(--ed-strong)' },
  { tag: t.emphasis, fontStyle: 'italic', color: 'var(--ed-em)' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--ed-muted)' },
  { tag: [t.link, t.url], color: 'var(--ed-link)' },
  { tag: t.monospace, color: 'var(--ed-code)', fontFamily: 'var(--ed-mono)' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--ed-muted)' },
  { tag: t.quote, color: 'var(--ed-quote)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--ed-accent)' },
  { tag: [t.angleBracket, t.tagName], color: 'var(--ed-tag)' },
  { tag: t.attributeName, color: 'var(--ed-attr)' },
  { tag: t.attributeValue, color: 'var(--ed-string)' },
  { tag: t.comment, color: 'var(--ed-muted)', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], color: 'var(--ed-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--ed-string)' },
  { tag: [t.number, t.bool, t.atom], color: 'var(--ed-number)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--ed-fn)' },
  { tag: [t.typeName, t.className], color: 'var(--ed-type)' },
  { tag: t.propertyName, color: 'var(--ed-attr)' },
]);

const baseTheme = EditorView.theme({
  '&': { height: '100%', color: 'var(--ed-text)', backgroundColor: 'var(--ed-bg)', fontSize: 'var(--ed-size, 14px)' },
  '.cm-scroller': { fontFamily: 'var(--ed-mono)', lineHeight: '1.7', scrollbarWidth: 'thin' },
  '.cm-content': { padding: '18px 0 40vh', caretColor: 'var(--ed-accent)' },
  '.cm-line': { padding: '0 22px 0 14px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-gutters': { backgroundColor: 'var(--ed-bg)', color: 'var(--ed-gutter)', border: 'none', paddingLeft: '6px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ed-text)' },
  '.cm-activeLine': { backgroundColor: 'var(--ed-active)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ed-accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--ed-selection) !important' },
  '.cm-selectionMatch': { backgroundColor: 'var(--ed-match)' },
  '.cm-searchMatch': { backgroundColor: 'var(--ed-match)', outline: '1px solid var(--ed-accent)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--ed-selection)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--ed-match)', outline: '1px solid var(--ed-accent)' },
  '.cm-flash-line': { backgroundColor: 'var(--ed-flash)', transition: 'background-color .6s ease' },
  '.cm-panels': { backgroundColor: 'var(--ed-panel)', color: 'var(--ed-text)', borderColor: 'var(--ed-border)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--ed-border)' },
  '.cm-panel.cm-search': { padding: '8px 12px', fontFamily: 'var(--ui-font)', fontSize: '13px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontSize: '13px' },
  '.cm-textfield': { backgroundColor: 'var(--ed-bg)', border: '1px solid var(--ed-border)', borderRadius: '7px', padding: '4px 8px', color: 'var(--ed-text)' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--ed-active)', border: '1px solid var(--ed-border)', borderRadius: '7px', color: 'var(--ed-text)', padding: '4px 10px' },
  '.cm-placeholder': { color: 'var(--ed-gutter)' },
});

function markdownKeymap(run: (c: Command) => boolean) {
  const bind = (key: string, c: Command) => ({ key, run: () => run(c), preventDefault: true });
  return keymap.of([
    bind('Mod-b', cmd.toggleBold),
    bind('Mod-i', cmd.toggleItalic),
    bind('Mod-Shift-x', cmd.toggleStrike),
    bind('Mod-e', cmd.toggleInlineCode),
    bind('Mod-Shift-l', cmd.insertLink()),
    bind('Mod-Alt-1', cmd.setHeading(1)),
    bind('Mod-Alt-2', cmd.setHeading(2)),
    bind('Mod-Alt-3', cmd.setHeading(3)),
    bind('Mod-Alt-4', cmd.setHeading(4)),
    bind('Mod-Alt-5', cmd.setHeading(5)),
    bind('Mod-Alt-6', cmd.setHeading(6)),
    bind('Mod-Alt-0', cmd.setHeading(0)),
    bind('Mod-Shift-.', cmd.toggleQuote),
    bind('Mod-Shift-8', cmd.toggleBulletList),
    bind('Mod-Shift-7', cmd.toggleNumberedList),
    bind('Mod-Shift-9', cmd.toggleTaskList),
    bind('Mod-Alt-c', cmd.insertCodeBlock()),
    { key: 'Tab', run: () => run(cmd.indentList(1)) },
    { key: 'Shift-Tab', run: () => run(cmd.indentList(-1)) },
    { key: 'Mod-z', run: () => doc.undo() || true, preventDefault: true },
    { key: 'Mod-y', run: () => doc.redo() || true, preventDefault: true },
    { key: 'Mod-Shift-z', run: () => doc.redo() || true, preventDefault: true },
  ]);
}

/** Wraps selections in *, _, ~ or ` when one of those is typed over selected text. */
const wrapOnType = EditorView.inputHandler.of((view, from, to, text) => {
  if (from === to || !['*', '_', '~', '`'].includes(text)) return false;
  const changes = view.state.changeByRange((range) => ({
    changes: [
      { from: range.from, insert: text },
      { from: range.to, insert: text },
    ],
    range: EditorSelection.range(range.from + 1, range.to + 1),
  }));
  view.dispatch(changes, { userEvent: 'input' });
  return true;
});

export interface CodeEditorProps {
  className?: string;
}

export default function CodeEditor({ className }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const wrap = useStore(settings, (s) => s.wrap);
  const lines = useStore(settings, (s) => s.editorLineNumbers);
  const wrapComp = useRef(new Compartment());
  const linesComp = useRef(new Compartment());

  useEffect(() => {
    if (!host.current) return;
    const run = (c: Command): boolean => {
      const view = viewRef.current;
      if (!view) return false;
      const sel = view.state.selection.main;
      const res = c(view.state.doc.toString(), { from: sel.from, to: sel.to });
      if (!res) return false;
      view.dispatch({ changes: res.changes, selection: { anchor: res.selection.anchor, head: res.selection.head }, scrollIntoView: true, userEvent: 'input.format' });
      view.focus();
      return true;
    };

    let cursorTimer: ReturnType<typeof setTimeout> | null = null;
    const extensions: Extension[] = [
      linesComp.current.of(settings.get().editorLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
      highlightSpecialChars(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      rectangularSelection(),
      crosshairCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(highlight),
      wrapComp.current.of(settings.get().wrap ? EditorView.lineWrapping : []),
      markdownKeymap(run),
      keymap.of([...closeBracketsKeymap, ...searchKeymap, ...defaultKeymap, indentWithTab].filter((b) => b.key !== 'Mod-k' && b.key !== 'Tab')),
      wrapOnType,
      flashField,
      baseTheme,
      placeholder('Start writing your README… (Markdown)'),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown source', spellcheck: 'true', autocorrect: 'off', autocapitalize: 'off' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external))) {
          const before = update.startState.selection.main;
          const after = update.state.selection.main;
          doc.commit(update.state.doc.toString(), {
            origin: 'editor',
            group: 'typing',
            selection: { anchor: after.anchor, head: after.head },
            selectionBefore: { anchor: before.anchor, head: before.head },
          });
          if (update.transactions.some((tr) => tr.isUserEvent('input.format') || tr.isUserEvent('input.paste') || tr.isUserEvent('delete.cut'))) doc.breakGroup();
        }
        if (update.selectionSet || update.docChanged) {
          if (cursorTimer) clearTimeout(cursorTimer);
          cursorTimer = setTimeout(() => {
            const v = viewRef.current;
            if (!v || !v.hasFocus) return;
            ui.set({ cursorLine: v.state.doc.lineAt(v.state.selection.main.head).number });
          }, 120);
        }
      }),
      EditorView.domEventHandlers({
        paste(event, view) {
          const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
          if (!files.length) return false;
          event.preventDefault();
          void insertImages(view, files, view.state.selection.main.head);
          return true;
        },
        drop(event, view) {
          const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
          if (!files.length) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
          void insertImages(view, files, pos);
          return true;
        },
      }),
    ];

    const view = new EditorView({
      state: EditorState.create({ doc: doc.text, extensions, selection: restoreSelection(doc.lastSelection, doc.text.length) }),
      parent: host.current,
    });
    viewRef.current = view;

    // Store → editor (visual edits, Beautify, fixes, undo/redo).
    const unsubscribe = doc.subscribe((tx) => {
      if (tx.origin === 'editor') return;
      const current = view.state.doc.toString();
      const change = minimalChange(current, tx.text);
      const selection = tx.selection ? restoreSelection(tx.selection, tx.text.length) : undefined;
      view.dispatch({
        changes: change ?? undefined,
        selection,
        annotations: external.of(true),
        scrollIntoView: !!selection,
      });
    });

    // Editor scroll → preview.
    const onScroll = () => {
      if (!settings.get().syncScroll || !sync.preview) return;
      if (!claimScroll('editor')) return;
      sync.preview.scrollToLine(topLine(view));
    };
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

    sync.editor = {
      scrollToLine(line) {
        const l = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, Math.floor(line))));
        const frac = line - Math.floor(line);
        const block = view.lineBlockAt(l.from);
        view.scrollDOM.scrollTop = block.top + frac * block.height - 8;
      },
      topLine: () => topLine(view),
      revealLine(line, select) {
        const l = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, line)));
        claimScroll('preview');
        view.dispatch({
          selection: select ? { anchor: l.from } : undefined,
          effects: [EditorView.scrollIntoView(l.from, { y: 'center' }), flashLine.of(line)],
        });
        setTimeout(() => view.dispatch({ effects: flashLine.of(null) }), 1400);
        if (select) view.focus();
      },
      focus: () => view.focus(),
      run,
      insertBlock: (md) => run(cmd.insertBlock(md)),
      insertInline: (text) => run(cmd.insertInline(text)),
      selectionText: () => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to),
    };
    (window as unknown as { __rgOpenSearch?: () => void }).__rgOpenSearch = () => openSearchPanel(view);

    return () => {
      unsubscribe();
      view.scrollDOM.removeEventListener('scroll', onScroll);
      if (cursorTimer) clearTimeout(cursorTimer);
      sync.editor = null;
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: wrapComp.current.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: linesComp.current.reconfigure(lines ? [lineNumbers(), highlightActiveLineGutter()] : []) });
  }, [lines]);

  return <div className={className ?? 'cm-host'} ref={host} data-testid="code-editor" />;
}

function topLine(view: EditorView): number {
  const top = view.scrollDOM.scrollTop;
  const block = view.lineBlockAtHeight(top);
  const line = view.state.doc.lineAt(block.from).number;
  const frac = block.height ? (top - block.top) / block.height : 0;
  return line + Math.max(0, Math.min(1, frac));
}

function restoreSelection(sel: { anchor: number; head: number } | null, length: number) {
  if (!sel) return undefined;
  return { anchor: Math.min(sel.anchor, length), head: Math.min(sel.head, length) };
}

async function insertImages(view: EditorView, files: File[], pos: number) {
  const snippets = await addImagesToDoc(files);
  if (!snippets.length) return;
  const text = snippets.join('\n\n');
  const line = view.state.doc.lineAt(Math.min(pos, view.state.doc.length));
  const atLineStart = pos === line.from;
  const insert = `${atLineStart ? '' : '\n\n'}${text}\n\n`;
  view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length }, userEvent: 'input.paste' });
  view.focus();
  toast(`${snippets.length} image${snippets.length === 1 ? '' : 's'} added — saved with this document.`, 'success');
}
