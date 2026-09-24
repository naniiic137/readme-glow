import { useEffect, useMemo, useState } from 'react';
import { Dialog } from './Dialog';
import { closeDialog, doc } from '../../app/state';
import { sync } from '../../app/sync';

interface Gem {
  emoji: string;
  names: string[];
  tags: string[];
  category: string;
}

const RECENT_KEY = 'readme-glow:emoji-recent';

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export default function EmojiDialog() {
  const [list, setList] = useState<Gem[] | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('Popular');
  const recent = useMemo(readRecent, []);

  useEffect(() => {
    void import('gemoji').then(({ gemoji }) => setList(gemoji as Gem[]));
  }, []);

  const categories = useMemo(() => (list ? ['Popular', ...Array.from(new Set(list.map((g) => g.category)))] : []), [list]);
  const POPULAR = ['rocket', 'sparkles', 'tada', 'fire', 'zap', 'star', 'heart', 'white_check_mark', 'warning', 'bulb', 'package', 'wrench', 'hammer_and_wrench', 'art', 'books', 'memo', 'lock', 'globe_with_meridians', 'bug', 'construction', 'handshake', 'pray', 'eyes', 'wave', 'computer', 'iphone', 'robot', 'gear', 'chart_with_upwards_trend', 'mag', 'camera', 'video_game', 'trophy', 'heavy_check_mark', 'x', 'arrow_right', 'link', 'email', 'calendar', 'rainbow'];

  const shown = useMemo(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    if (q) return list.filter((g) => g.names.some((n) => n.includes(q)) || g.tags.some((t) => t.includes(q))).slice(0, 160);
    if (category === 'Popular') {
      const byName = new Map(list.flatMap((g) => g.names.map((n) => [n, g] as const)));
      const rec = recent.map((e) => list.find((g) => g.emoji === e)).filter((g): g is Gem => !!g);
      const pop = POPULAR.map((n) => byName.get(n)).filter((g): g is Gem => !!g);
      return [...rec, ...pop.filter((g) => !rec.includes(g))];
    }
    return list.filter((g) => g.category === category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, query, category, recent]);

  const pick = (g: Gem) => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify([g.emoji, ...recent.filter((e) => e !== g.emoji)].slice(0, 16)));
    } catch {
      /* ignore */
    }
    closeDialog();
    setTimeout(() => {
      if (sync.editor) sync.editor.insertInline(g.emoji);
      else doc.commit(`${doc.text}${g.emoji}`, { origin: 'insert' });
    }, 30);
  };

  return (
    <Dialog title="Emoji" description="Inserted at the cursor. GitHub shortcodes like :rocket: also work." size="wide" icon="smile" initialFocus="#emoji-search">
      <input id="emoji-search" className="input" placeholder="Search emoji (rocket, check, heart…)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search emoji" />
      {!query && (
        <div className="emoji-cats" role="tablist" aria-label="Emoji categories">
          {categories.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={c === category} className={`chip${c === category ? ' is-on' : ''}`} onClick={() => setCategory(c)}>
              {c.replace(' & ', ' & ')}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-grid" role="listbox" aria-label="Emoji">
        {!list && <p className="muted">Loading emoji…</p>}
        {shown.map((g) => (
          <button key={g.emoji} type="button" role="option" aria-selected="false" className="emoji-btn" title={`:${g.names[0]}:`} aria-label={g.names[0]!.replace(/_/g, ' ')} onClick={() => pick(g)}>
            {g.emoji}
          </button>
        ))}
        {list && !shown.length && <p className="muted">No emoji match “{query}”.</p>}
      </div>
    </Dialog>
  );
}
