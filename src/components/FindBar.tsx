import { useEffect, useRef, useState } from 'react';
import { ui } from '../app/state';
import { useStore } from '../app/store';
import { sync } from '../app/sync';
import { findRanges, paintHighlights, clearHighlights } from '../lib/find';
import { Icon } from './Icon';

/** Find in the rendered document, highlighted with the CSS Custom Highlight API. */
export default function FindBar() {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCase] = useState(false);
  const [wholeWord, setWhole] = useState(false);
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const ranges = useRef<Range[]>([]);
  const render = useStore(ui, (s) => s.render);

  useEffect(() => {
    input.current?.focus();
    return () => clearHighlights();
  }, []);

  useEffect(() => {
    const root = sync.preview?.element();
    if (!root) return;
    const t = setTimeout(() => {
      ranges.current = findRanges(root, query, { caseSensitive, wholeWord });
      setCount(ranges.current.length);
      setIndex(0);
      paint(0);
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, wholeWord, render]);

  const paint = (i: number) => {
    const current = ranges.current[i] ?? null;
    paintHighlights(ranges.current, current);
    if (current) {
      const el = current.startContainer.parentElement;
      // Open collapsed <details> so the match is visible.
      const details = el?.closest('details');
      if (details && !details.open) details.open = true;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  const step = (delta: number) => {
    if (!count) return;
    const next = (index + delta + count) % count;
    setIndex(next);
    paint(next);
  };

  const close = () => {
    clearHighlights();
    ui.set({ findOpen: false });
  };

  return (
    <div className="findbar" role="search" aria-label="Find in document">
      <Icon name="search" size={16} />
      <input
        ref={input}
        className="find-input"
        value={query}
        placeholder="Find in document"
        aria-label="Find in document"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
      />
      <span className="find-count" aria-live="polite">
        {query ? (count ? `${index + 1} of ${count}` : 'No results') : ''}
      </span>
      <button type="button" className={`icon-btn sm${caseSensitive ? ' is-on' : ''}`} aria-pressed={caseSensitive} aria-label="Match case" data-tip="Match case" onClick={() => setCase(!caseSensitive)}>
        <span className="find-opt">Aa</span>
      </button>
      <button type="button" className={`icon-btn sm${wholeWord ? ' is-on' : ''}`} aria-pressed={wholeWord} aria-label="Whole words" data-tip="Whole words" onClick={() => setWhole(!wholeWord)}>
        <span className="find-opt">ab|</span>
      </button>
      <button type="button" className="icon-btn sm" aria-label="Previous match" onClick={() => step(-1)} disabled={!count}>
        <Icon name="chevronDown" size={15} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <button type="button" className="icon-btn sm" aria-label="Next match" onClick={() => step(1)} disabled={!count}>
        <Icon name="chevronDown" size={15} />
      </button>
      <button type="button" className="icon-btn sm" aria-label="Close find" onClick={close}>
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}
