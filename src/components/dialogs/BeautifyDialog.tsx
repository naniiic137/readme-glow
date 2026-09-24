import { useMemo, useState } from 'react';
import { Dialog } from './Dialog';
import { Icon } from '../Icon';
import { closeDialog, doc, toast } from '../../app/state';
import { beautify, BEAUTIFY_OPTION_INFO, DEFAULT_BEAUTIFY_OPTIONS, type BeautifyOptions } from '../../lib/beautify/beautify';
import { applyHunks, computeHunks, diffStats } from '../../lib/diff';

/** Beautify with a before/after diff: apply everything, only the chosen changes, or nothing. */
export default function BeautifyDialog() {
  const [options, setOptions] = useState<BeautifyOptions>({ ...DEFAULT_BEAUTIFY_OPTIONS });
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const before = doc.text;
  const result = useMemo(() => beautify(before, options), [before, options]);
  const hunks = useMemo(() => computeHunks(before, result.markdown), [before, result.markdown]);
  const stats = useMemo(() => diffStats(before, result.markdown), [before, result.markdown]);
  const selected = hunks.filter((h) => !excluded.has(h.id)).map((h) => h.id);

  const apply = (ids: number[]) => {
    const next = ids.length === hunks.length ? result.markdown : applyHunks(before, result.markdown, ids);
    closeDialog();
    if (next === before) return;
    doc.commit(next, { origin: 'beautify' });
    doc.breakGroup();
    toast(`Beautified: ${ids.length} change${ids.length === 1 ? '' : 's'} applied.`, 'success', { action: { label: 'Undo', run: () => doc.undo() } });
  };

  return (
    <Dialog
      title="Beautify"
      description="Tidies your README itself — review every change before it happens."
      icon="wand"
      size="xwide"
      footer={
        <>
          <span className="spacer">
            {hunks.length ? (
              <>
                <span className="diff-add">+{stats.added}</span> <span className="diff-del">−{stats.removed}</span> lines · {hunks.length} change{hunks.length === 1 ? '' : 's'}
              </>
            ) : (
              'Nothing to change with these options — nice README!'
            )}
          </span>
          <button type="button" className="btn btn-ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={!selected.length || selected.length === hunks.length} onClick={() => apply(selected)}>
            Apply selected ({selected.length})
          </button>
          <button type="button" className="btn btn-primary" disabled={!hunks.length} onClick={() => apply(hunks.map((h) => h.id))}>
            <Icon name="wand" size={16} /> Apply all
          </button>
        </>
      }
    >
      <div className="beautify">
        <aside className="beautify-options" aria-label="What to improve">
          {BEAUTIFY_OPTION_INFO.map((o) => {
            const step = result.steps.find((st) => st.id === o.id);
            return (
              <label key={o.id} className="bo-item">
                <input type="checkbox" checked={options[o.id]} onChange={(e) => setOptions({ ...options, [o.id]: e.target.checked })} />
                <span>
                  <strong>
                    {o.label}
                    {options[o.id] && step?.changed && <span className="bo-badge">changes</span>}
                  </strong>
                  <small>{o.description}</small>
                </span>
              </label>
            );
          })}
        </aside>
        <div className="beautify-diff" aria-label="Changes">
          {!hunks.length && (
            <div className="empty-state">
              <Icon name="check" size={28} />
              <p>Already tidy for the options you picked.</p>
            </div>
          )}
          {hunks.map((h) => (
            <section key={h.id} className={`hunk${excluded.has(h.id) ? ' is-off' : ''}`}>
              <label className="hunk-head">
                <input
                  type="checkbox"
                  checked={!excluded.has(h.id)}
                  onChange={(e) => {
                    const next = new Set(excluded);
                    if (e.target.checked) next.delete(h.id);
                    else next.add(h.id);
                    setExcluded(next);
                  }}
                />
                <span>
                  Change {h.id + 1} · lines {h.oldStart}–{Math.max(h.oldStart, h.oldEnd)}
                </span>
              </label>
              <pre className="hunk-body">
                {h.lines.map((l, i) => (
                  <div key={i} className={`dl dl-${l.type}`}>
                    <span className="dl-sign" aria-hidden="true">
                      {l.type === 'insert' ? '+' : l.type === 'delete' ? '−' : ' '}
                    </span>
                    <span className="sr-only">{l.type === 'insert' ? 'added: ' : l.type === 'delete' ? 'removed: ' : ''}</span>
                    {l.text || ' '}
                  </div>
                ))}
              </pre>
            </section>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
