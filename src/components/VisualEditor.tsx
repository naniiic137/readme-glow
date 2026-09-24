import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { doc, ui, toast } from '../app/state';
import { useStore } from '../app/store';
import { sync } from '../app/sync';
import { Icon } from './Icon';
import { detectStyle, serializeBlock, codeText, type InlineStyle } from '../lib/visual/serialize';
import { commitCode, commitInline, deleteBlock, insertBlockAfter, mergeWithPrevious, moveBlock, parseRange, splitBlock, type Range } from '../lib/visual/blocks';
import { isSafeUrl } from '../lib/markdown/schema';
import { applyChanges, type Command } from '../lib/editor/types';
import { setHeading, toggleBulletList, toggleNumberedList, toggleQuote, toggleTaskList } from '../lib/editor/commands';
import { buildTable, emptyCells } from '../lib/editor/table';

interface Props {
  articleRef: RefObject<HTMLElement>;
  scrollRef: RefObject<HTMLDivElement>;
  editingRef: React.MutableRefObject<HTMLElement | null>;
  onEditEnd: () => void;
}

interface Editing {
  el: HTMLElement;
  kind: string;
  block: Range;
  inner: Range;
  before: string;
  code: boolean;
}

const TOP_LEVEL = ':scope > [data-src], :scope > .rg-intro > [data-src], :scope > .rg-section > [data-src], :scope > .rg-slide > [data-src]';

const INSERTS: Array<{ id: string; label: string; icon: string; md: () => string; focus?: boolean }> = [
  { id: 'p', label: 'Paragraph', icon: 'type', md: () => 'New paragraph', focus: true },
  { id: 'h2', label: 'Heading', icon: 'heading', md: () => '## New section', focus: true },
  { id: 'ul', label: 'Bullet list', icon: 'list', md: () => '- First item\n- Second item', focus: true },
  { id: 'ol', label: 'Numbered list', icon: 'listOrdered', md: () => '1. First step\n2. Second step', focus: true },
  { id: 'task', label: 'Task list', icon: 'listChecks', md: () => '- [ ] Something to do\n- [x] Something done', focus: true },
  { id: 'table', label: 'Table', icon: 'table', md: () => buildTable({ rows: 3, cols: 3, header: true, cells: [['Column 1', 'Column 2', 'Column 3'], ...emptyCells(2, 3)] }) },
  { id: 'code', label: 'Code block', icon: 'codeBlock', md: () => '```bash\nnpm install\n```' },
  { id: 'image', label: 'Image', icon: 'image', md: () => '![Describe the image](https://placehold.co/1200x600/png)' },
  { id: 'note', label: 'Note', icon: 'info', md: () => '> [!NOTE]\n> Useful information.', focus: true },
  { id: 'warning', label: 'Warning', icon: 'alert', md: () => '> [!WARNING]\n> Something to be careful about.', focus: true },
  { id: 'quote', label: 'Quote', icon: 'quote', md: () => '> A memorable quote.', focus: true },
  { id: 'details', label: 'Details', icon: 'details', md: () => '<details>\n<summary>Click to expand</summary>\n\nHidden content.\n\n</details>' },
  { id: 'hr', label: 'Divider', icon: 'minus', md: () => '---' },
];

/**
 * "Edit on page": blocks of the themed preview become editable. Each edit is
 * converted back to Markdown for that block only and spliced into the source
 * (see lib/visual), so everything you didn't touch stays byte-identical, and
 * the same undo history as the code editor applies.
 */
export function VisualEditor({ articleRef, scrollRef, editingRef, onEditEnd }: Props) {
  const [hover, setHover] = useState<{ el: HTMLElement; top: number; left: number; height: number } | null>(null);
  const [menuFor, setMenuFor] = useState<HTMLElement | null>(null);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const [linkInput, setLinkInput] = useState<string | null>(null);
  const [image, setImage] = useState<{ el: HTMLImageElement; alt: string; title: string; src: string; range: Range } | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number | null } | null>(null);
  const editing = useRef<Editing | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const style = useRef<InlineStyle>({ emphasis: '_', strong: '**' });
  const focusAfterRender = useRef<{ offset: number; select?: boolean } | null>(null);
  const version = useStore(ui, (s) => s.render);

  useEffect(() => {
    style.current = detectStyle(doc.text);
  }, []);

  // ------------------------------------------------------------ positions
  const topBlocks = useCallback((): HTMLElement[] => {
    const article = articleRef.current;
    return article ? Array.from(article.querySelectorAll<HTMLElement>(TOP_LEVEL)) : [];
  }, [articleRef]);

  const place = useCallback(
    (el: HTMLElement) => {
      const root = scrollRef.current;
      if (!root) return null;
      const r = el.getBoundingClientRect();
      const base = root.getBoundingClientRect();
      return { el, top: r.top - base.top + root.scrollTop, left: Math.max(4, r.left - base.left - 40), height: r.height };
    },
    [scrollRef],
  );

  // ------------------------------------------------------------ committing
  const commitNow = useCallback(() => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    const e = editing.current;
    if (!e) return;
    const source = doc.text;
    let next = source;
    if (e.code) {
      next = commitCode(source, e.block, e.inner, codeText(e.el));
    } else {
      const after = serializeBlock(e.el, e.kind, style.current);
      next = commitInline(source, e.inner, e.before, after);
      e.before = after;
    }
    if (next === source) return;
    const delta = next.length - source.length;
    e.inner = { start: e.inner.start, end: e.inner.end + delta };
    e.block = { start: e.block.start, end: e.block.end + delta };
    doc.commit(next, { origin: 'visual', group: `visual:${e.block.start}` });
  }, []);

  const scheduleCommit = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(commitNow, 220);
  }, [commitNow]);

  const stopEditing = useCallback(() => {
    const e = editing.current;
    if (!e) return;
    commitNow();
    e.el.removeAttribute('contenteditable');
    e.el.classList.remove('is-editing');
    editing.current = null;
    editingRef.current = null;
    setToolbar(null);
    setLinkInput(null);
    ui.set({ cursorLine: null });
    onEditEnd();
  }, [commitNow, editingRef, onEditEnd]);

  const startEditing = useCallback(
    (el: HTMLElement, caretAtEnd = false, select = false) => {
      if (editing.current?.el === el) return;
      stopEditing();
      const isCode = el.matches('figure.rg-code');
      const target = isCode ? el.querySelector<HTMLElement>('pre code') : el;
      const block = parseRange(el.dataset.src);
      const inner = parseRange(el.dataset.inner);
      if (!target || !block || !inner) return;
      const kind = el.dataset.block ?? 'paragraph';
      editing.current = { el: target, kind, block, inner, before: isCode ? '' : serializeBlock(target, kind, style.current), code: isCode };
      editingRef.current = target;
      target.setAttribute('contenteditable', isCode ? 'plaintext-only' : 'true');
      if (isCode && target.contentEditable !== 'plaintext-only') target.setAttribute('contenteditable', 'true');
      target.setAttribute('spellcheck', isCode ? 'false' : 'true');
      target.classList.add('is-editing');
      target.focus({ preventScroll: true });
      if (caretAtEnd || select) {
        const range = document.createRange();
        range.selectNodeContents(target);
        if (!select) range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      const line = Number(el.dataset.line);
      if (line) {
        ui.set({ cursorLine: line });
        sync.editor?.revealLine(line, false);
      }
    },
    [editingRef, stopEditing],
  );

  // Leave editing when visual mode turns off / unmounts.
  useEffect(() => () => stopEditing(), [stopEditing]);

  // After a structural change re-renders the preview, focus the new block.
  useEffect(() => {
    const want = focusAfterRender.current;
    const article = articleRef.current;
    if (!want || !article) return;
    const candidates = Array.from(article.querySelectorAll<HTMLElement>('[data-inner]'));
    const target =
      candidates.find((c) => parseRange(c.dataset.inner)?.start === want.offset) ??
      candidates.find((c) => {
        const r = parseRange(c.dataset.inner);
        return r && r.start <= want.offset && want.offset <= r.end;
      });
    if (target) {
      focusAfterRender.current = null;
      requestAnimationFrame(() => startEditing(target, !want.select, want.select));
    }
  }, [version, articleRef, startEditing]);

  const applySource = (next: string, focus?: { offset: number; select?: boolean }) => {
    stopEditing();
    if (next === doc.text) return;
    doc.commit(next, { origin: 'visual' });
    if (focus) focusAfterRender.current = focus;
  };

  // ------------------------------------------------------------ DOM events
  useEffect(() => {
    const article = articleRef.current;
    const root = scrollRef.current;
    if (!article || !root) return;

    const onPointerDown = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement;
      if (t.closest('.ve-ui')) return;
      const img = t.closest<HTMLImageElement>('img[data-block="image"]');
      if (img) {
        ev.preventDefault();
        const range = parseRange(img.dataset.src);
        if (range) {
          stopEditing();
          const md = doc.text.slice(range.start, range.end);
          const m = /^!\[([^\]]*)\]\(\s*<?([^\s>)]*)>?(?:\s+"([^"]*)")?\s*\)$/.exec(md);
          setImage({ el: img, range, alt: m?.[1] ?? img.alt, src: m?.[2] ?? img.dataset.orig ?? img.src, title: m?.[3] ?? img.title ?? '' });
        }
        return;
      }
      const code = t.closest<HTMLElement>('figure.rg-code[data-inner]');
      if (code) {
        if (t.closest('.rg-code-head')) return;
        startEditing(code);
        return;
      }
      const block = t.closest<HTMLElement>('[data-inner]');
      if (block && article.contains(block) && !t.closest('a.rg-anchor, input, summary')) {
        if (editing.current?.el !== block) startEditing(block);
        return;
      }
      if (!t.closest('[contenteditable]')) stopEditing();
    };

    const onInput = () => {
      if (editing.current) scheduleCommit();
      updateToolbar();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      const e = editing.current;
      if (!e) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        stopEditing();
        return;
      }
      if (mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        stopEditing();
        if (ev.shiftKey) doc.redo();
        else doc.undo();
        return;
      }
      if (mod && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        stopEditing();
        doc.redo();
        return;
      }
      if (e.code) return;
      if (mod && ['b', 'i'].includes(ev.key.toLowerCase())) {
        ev.preventDefault();
        document.execCommand(ev.key.toLowerCase() === 'b' ? 'bold' : 'italic');
        scheduleCommit();
        return;
      }
      if (mod && ev.key.toLowerCase() === 'e') {
        ev.preventDefault();
        wrapSelection('code');
        return;
      }
      if (ev.key === 'Enter' && !ev.shiftKey && e.kind !== 'cell') {
        ev.preventDefault();
        splitAtCaret();
        return;
      }
      if (ev.key === 'Backspace' && caretAtStart(e.el)) {
        ev.preventDefault();
        mergeBackward();
      }
    };

    const onPaste = (ev: ClipboardEvent) => {
      if (!editing.current) return;
      ev.preventDefault();
      const text = ev.clipboardData?.getData('text/plain') ?? '';
      document.execCommand('insertText', false, text);
    };

    const onDrop = (ev: DragEvent) => {
      if ((ev.target as HTMLElement).closest('[contenteditable]')) ev.preventDefault();
    };

    const onMove = (ev: PointerEvent) => {
      if (drag) return;
      const t = ev.target as HTMLElement;
      if (t.closest('.ve-ui')) return;
      const blocks = topBlocks();
      const hit = blocks.find((b) => b.contains(t));
      if (hit) setHover(place(hit));
    };

    const onSelection = () => updateToolbar();

    article.addEventListener('pointerdown', onPointerDown);
    article.addEventListener('input', onInput);
    article.addEventListener('keydown', onKeyDown);
    article.addEventListener('paste', onPaste);
    article.addEventListener('drop', onDrop);
    root.addEventListener('pointermove', onMove);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      article.removeEventListener('pointerdown', onPointerDown);
      article.removeEventListener('input', onInput);
      article.removeEventListener('keydown', onKeyDown);
      article.removeEventListener('paste', onPaste);
      article.removeEventListener('drop', onDrop);
      root.removeEventListener('pointermove', onMove);
      document.removeEventListener('selectionchange', onSelection);
    };
  });

  const updateToolbar = () => {
    const e = editing.current;
    const root = scrollRef.current;
    const sel = window.getSelection();
    if (!e || e.code || !root || !sel || sel.rangeCount === 0 || !e.el.contains(sel.anchorNode)) {
      setToolbar(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.collapsed ? e.el.getBoundingClientRect() : range.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    setToolbar({ top: rect.top - base.top + root.scrollTop - 52, left: Math.max(8, Math.min(rect.left - base.left, base.width - 420)) });
  };

  // ------------------------------------------------------------ structure edits
  const splitAtCaret = () => {
    const e = editing.current;
    const sel = window.getSelection();
    if (!e || !sel || !sel.rangeCount) return;
    commitNow();
    const caret = sel.getRangeAt(0);
    const left = document.createRange();
    left.setStart(e.el, 0);
    left.setEnd(caret.startContainer, caret.startOffset);
    const right = document.createRange();
    right.setStart(caret.endContainer, caret.endOffset);
    right.setEnd(e.el, e.el.childNodes.length);
    const holder = (frag: DocumentFragment) => {
      const h = document.createElement(e.el.tagName);
      h.appendChild(frag);
      return h;
    };
    const leftMd = serializeBlock(holder(left.cloneContents()), e.kind, style.current);
    const rightMd = serializeBlock(holder(right.cloneContents()), e.kind, style.current);
    const kind = e.kind === 'item' ? 'item' : e.kind === 'heading' ? 'heading' : 'paragraph';
    const { text, caret: offset } = splitBlock(doc.text, e.block, e.inner, kind, leftMd, rightMd || (kind === 'paragraph' ? '' : ''));
    applySource(text, { offset });
  };

  const mergeBackward = () => {
    const e = editing.current;
    const article = articleRef.current;
    if (!e || !article) return;
    commitNow();
    const all = Array.from(article.querySelectorAll<HTMLElement>('[data-inner]')).filter((x) => x.dataset.block !== 'code');
    const i = all.findIndex((x) => x === e.el || x.contains(e.el) || e.el.contains(x));
    const prev = i > 0 ? all[i - 1] : null;
    const text = e.el.textContent ?? '';
    if (!prev) return;
    const prevInner = parseRange(prev.dataset.inner);
    if (!prevInner) return;
    if (!text.trim()) {
      applySource(deleteBlock(doc.text, e.block), { offset: prevInner.end });
      return;
    }
    const r = mergeWithPrevious(doc.text, prevInner, e.block, e.inner);
    applySource(r.text, { offset: r.caret });
  };

  const insertAfter = (el: HTMLElement | null, item: (typeof INSERTS)[number]) => {
    setMenuFor(null);
    const range = el ? parseRange(el.dataset.src) : null;
    const { text, range: inserted } = insertBlockAfter(doc.text, range, item.md());
    const md = text.slice(inserted.start, inserted.end);
    // Put the caret inside the new block's text.
    const lead = /^(?:#{1,6}\s|[-*+]\s(?:\[[ x]\]\s)?|\d+\.\s|>\s(?:\[![A-Z]+\]\n>\s)?)?/.exec(md)?.[0].length ?? 0;
    applySource(text, item.focus ? { offset: inserted.start + lead, select: true } : undefined);
    toast(`${item.label} added.`, 'success');
  };

  const removeBlock = (el: HTMLElement) => {
    const range = parseRange(el.dataset.src);
    if (!range) return;
    setHover(null);
    applySource(deleteBlock(doc.text, range));
    toast('Block deleted.', 'info', { action: { label: 'Undo', run: () => doc.undo() } });
  };

  const move = (from: number, to: number) => {
    const blocks = topBlocks();
    const ranges = blocks.map((b) => parseRange(b.dataset.src)).filter((r): r is Range => !!r);
    if (ranges.length !== blocks.length) return;
    // An H2 carries its whole section (until the next H1/H2) with it.
    if (blocks[from]!.tagName === 'H2') {
      const starts = blocks.map((b, i) => (i === 0 || /^H[12]$/.test(b.tagName) ? i : -1)).filter((i) => i >= 0);
      const groups = starts.map((s, k) => ({ start: ranges[s]!.start, end: ranges[(starts[k + 1] ?? blocks.length) - 1]!.end }));
      const groupOf = (i: number) => starts.reduce((acc, s, k) => (s <= i ? k : acc), 0);
      const g = starts.indexOf(from);
      const target = Math.max(1, groupOf(to));
      if (g > 0 && target !== g) {
        applySource(moveBlock(doc.text, groups, g, target));
        return;
      }
    }
    applySource(moveBlock(doc.text, ranges, from, to));
  };

  const wrapSelection = (tag: 'code') => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const el = document.createElement(tag);
    try {
      range.surroundContents(el);
    } catch {
      el.textContent = range.toString();
      range.deleteContents();
      range.insertNode(el);
    }
    scheduleCommit();
  };

  const runBlockCommand = (cmd: Command) => {
    const e = editing.current;
    if (!e) return;
    commitNow();
    const line0 = e.block.start;
    const res = cmd(doc.text, { from: line0, to: e.inner.end });
    if (!res) return;
    applySource(applyChanges(doc.text, res.changes), { offset: res.selection.head });
  };

  const exec = (command: 'bold' | 'italic' | 'strikeThrough') => {
    document.execCommand(command);
    scheduleCommit();
    updateToolbar();
  };

  const applyLink = (url: string) => {
    const trimmed = url.trim();
    setLinkInput(null);
    if (!trimmed) return;
    if (!isSafeUrl(trimmed) || /^data:/i.test(trimmed)) {
      toast('That link is not allowed. Use an https:// address, a #section or a relative path.', 'error');
      return;
    }
    editing.current?.el.focus();
    document.execCommand('createLink', false, trimmed);
    scheduleCommit();
  };

  const saveImage = () => {
    if (!image) return;
    const esc = (s: string) => s.replace(/([[\]])/g, '\\$1');
    const title = image.title.trim() ? ` "${image.title.trim().replace(/"/g, '\\"')}"` : '';
    const src = /\s/.test(image.src) ? `<${image.src}>` : image.src;
    const md = `![${esc(image.alt)}](${src}${title})`;
    const next = doc.text.slice(0, image.range.start) + md + doc.text.slice(image.range.end);
    setImage(null);
    applySource(next);
  };

  // ------------------------------------------------------------ drag to reorder
  const onDragStart = (index: number) => (ev: React.DragEvent) => {
    stopEditing();
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', String(index));
    setDrag({ from: index, to: null });
  };
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !drag) return;
    const over = (ev: DragEvent) => {
      ev.preventDefault();
      const blocks = topBlocks();
      let to = blocks.length - 1;
      for (let i = 0; i < blocks.length; i++) {
        const r = blocks[i]!.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) {
          to = i <= drag.from ? i : i - 1;
          break;
        }
      }
      setDrag((d) => (d && d.to !== to ? { ...d, to } : d));
    };
    const drop = (ev: DragEvent) => {
      ev.preventDefault();
      if (drag.to !== null && drag.to !== drag.from) move(drag.from, drag.to);
      setDrag(null);
    };
    const end = () => setDrag(null);
    root.addEventListener('dragover', over);
    root.addEventListener('drop', drop);
    root.addEventListener('dragend', end);
    return () => {
      root.removeEventListener('dragover', over);
      root.removeEventListener('drop', drop);
      root.removeEventListener('dragend', end);
    };
  });

  const blocks = topBlocks();
  const hoverIndex = hover ? blocks.indexOf(hover.el) : -1;
  const dropLine = drag && drag.to !== null ? place(blocks[Math.min(drag.to + (drag.to >= drag.from ? 1 : 0), blocks.length - 1)] ?? blocks[blocks.length - 1]!) : null;

  return (
    <>
      {hover && hoverIndex >= 0 && hover.el.isConnected && (
        <div className="ve-ui ve-handle" style={{ top: hover.top, left: hover.left }}>
          <button type="button" className="ve-btn" aria-label="Add a block below" onClick={() => setMenuFor(hover.el)}>
            <Icon name="plus" size={15} />
          </button>
          <button
            type="button"
            className="ve-btn ve-grip"
            draggable
            onDragStart={onDragStart(hoverIndex)}
            aria-label="Drag to move this block. Alt+Up and Alt+Down also move it."
            onKeyDown={(e) => {
              if (e.altKey && e.key === 'ArrowUp' && hoverIndex > 0) move(hoverIndex, hoverIndex - 1);
              if (e.altKey && e.key === 'ArrowDown' && hoverIndex < blocks.length - 1) move(hoverIndex, hoverIndex + 1);
            }}
          >
            <Icon name="grip" size={15} />
          </button>
          <div className="ve-more">
            <button type="button" className="ve-btn" aria-label="Move up" disabled={hoverIndex === 0} onClick={() => move(hoverIndex, hoverIndex - 1)}>
              <Icon name="chevronDown" size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button type="button" className="ve-btn" aria-label="Move down" disabled={hoverIndex >= blocks.length - 1} onClick={() => move(hoverIndex, hoverIndex + 1)}>
              <Icon name="chevronDown" size={14} />
            </button>
            <button type="button" className="ve-btn danger" aria-label="Delete block" onClick={() => removeBlock(hover.el)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      )}
      {menuFor && (
        <div className="ve-ui ve-menu" role="menu" aria-label="Add a block" style={{ top: (place(menuFor)?.top ?? 0) + 30, left: (place(menuFor)?.left ?? 0) + 4 }}>
          {INSERTS.map((item) => (
            <button key={item.id} type="button" role="menuitem" onClick={() => insertAfter(menuFor, item)}>
              <Icon name={item.icon} size={15} /> {item.label}
            </button>
          ))}
          <button type="button" role="menuitem" className="ve-menu-close" onClick={() => setMenuFor(null)}>
            Cancel
          </button>
        </div>
      )}
      {dropLine && <div className="ve-ui ve-drop" style={{ top: dropLine.top - 3 }} aria-hidden="true" />}
      {toolbar && (
        <div className="ve-ui ve-toolbar" style={{ top: toolbar.top, left: toolbar.left }} role="toolbar" aria-label="Formatting" onMouseDown={(e) => e.preventDefault()}>
          {linkInput !== null ? (
            <form
              className="ve-link"
              onSubmit={(e) => {
                e.preventDefault();
                applyLink(linkInput);
              }}
            >
              <input autoFocus className="input" value={linkInput} placeholder="https://…" onChange={(e) => setLinkInput(e.target.value)} aria-label="Link address" />
              <button type="submit" className="ve-btn" aria-label="Apply link">
                <Icon name="check" size={15} />
              </button>
            </form>
          ) : (
            <>
              <button type="button" className="ve-btn" onClick={() => exec('bold')} aria-label="Bold (Ctrl+B)">
                <Icon name="bold" size={15} />
              </button>
              <button type="button" className="ve-btn" onClick={() => exec('italic')} aria-label="Italic (Ctrl+I)">
                <Icon name="italic" size={15} />
              </button>
              <button type="button" className="ve-btn" onClick={() => exec('strikeThrough')} aria-label="Strikethrough">
                <Icon name="strike" size={15} />
              </button>
              <button type="button" className="ve-btn" onClick={() => wrapSelection('code')} aria-label="Inline code (Ctrl+E)">
                <Icon name="code" size={15} />
              </button>
              <button type="button" className="ve-btn" onClick={() => setLinkInput('https://')} aria-label="Link">
                <Icon name="link" size={15} />
              </button>
              <span className="ve-sep" />
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" className="ve-btn ve-text" onClick={() => runBlockCommand(setHeading(n as 1 | 2 | 3))} aria-label={`Heading ${n}`}>
                  H{n}
                </button>
              ))}
              <button type="button" className="ve-btn ve-text" onClick={() => runBlockCommand(setHeading(0))} aria-label="Normal text">
                ¶
              </button>
              <span className="ve-sep" />
              <button type="button" className="ve-btn" onClick={() => runBlockCommand(toggleBulletList)} aria-label="Bullet list">
                <Icon name="list" size={15} />
              </button>
              <button type="button" className="ve-btn" onClick={() => runBlockCommand(toggleNumberedList)} aria-label="Numbered list">
                <Icon name="listOrdered" size={15} />
              </button>
              <button type="button" className="ve-btn" onClick={() => runBlockCommand(toggleTaskList)} aria-label="Task list">
                <Icon name="listChecks" size={15} />
              </button>
              <button type="button" className="ve-btn" onClick={() => runBlockCommand(toggleQuote)} aria-label="Quote">
                <Icon name="quote" size={15} />
              </button>
            </>
          )}
        </div>
      )}
      {image && (
        <div className="ve-ui ve-image" style={{ top: (place(image.el)?.top ?? 0) + 8, left: Math.max(12, (place(image.el)?.left ?? 0) + 48) }} role="dialog" aria-label="Edit image">
          <label className="field">
            <span>Alt text (describe the image)</span>
            <input className="input" value={image.alt} autoFocus onChange={(e) => setImage({ ...image, alt: e.target.value })} />
          </label>
          <label className="field">
            <span>Caption (title)</span>
            <input className="input" value={image.title} onChange={(e) => setImage({ ...image, title: e.target.value })} />
          </label>
          <label className="field">
            <span>Image address</span>
            <input className="input" value={image.src} onChange={(e) => setImage({ ...image, src: e.target.value })} />
          </label>
          <div className="ve-image-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setImage(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={saveImage}>
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function caretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.setStart(el, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length === 0;
}
