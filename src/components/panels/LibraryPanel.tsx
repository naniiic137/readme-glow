import { useCallback, useEffect, useState } from 'react';
import { Drawer } from './Drawer';
import { Icon } from '../Icon';
import { useStore } from '../../app/store';
import { openDialog, toast, ui } from '../../app/state';
import { closeDocument, library, openFromLibrary, flushSave } from '../../app/actions';
import { timeAgo } from '../Landing';
import type { DocSummary } from '../../lib/storage/library';

const SOURCE_ICON: Record<string, string> = { github: 'github', file: 'file', folder: 'folder', paste: 'clipboard', sample: 'book', template: 'template', share: 'share', new: 'edit' };

/** Your documents: everything is saved in this browser, newest first. */
export default function LibraryPanel() {
  const current = useStore(ui, (s) => s.doc);
  const saveState = useStore(ui, (s) => s.saveState);
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(async () => {
    const lib = await library();
    setDocs(await lib.list());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, saveState, current?.title]);

  const shown = (docs ?? []).filter((d) => d.title.toLowerCase().includes(query.toLowerCase()));

  const rename = async (id: string) => {
    setRenaming(null);
    const lib = await library();
    await lib.rename(id, name);
    if (current?.id === id) ui.set({ doc: { ...current, title: name.trim() || current.title } });
    void refresh();
  };

  const duplicate = async (id: string) => {
    await flushSave();
    const lib = await library();
    const copy = await lib.duplicate(id);
    void refresh();
    if (copy) toast(`Duplicated as “${copy.title}”.`, 'success', { action: { label: 'Open', run: () => void openFromLibrary(copy.id) } });
  };

  const remove = async (d: DocSummary) => {
    const lib = await library();
    await lib.remove(d.id);
    if (current?.id === d.id) await closeDocument();
    void refresh();
    toast(`Deleted “${d.title}”.`, 'info');
  };

  const clearAll = async () => {
    setConfirmClear(false);
    const lib = await library();
    await closeDocument();
    await lib.clear();
    void refresh();
    toast('All documents deleted from this browser.', 'info');
  };

  return (
    <Drawer title="Your documents" side="left" label="Your documents">
      <div className="lib-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => openDialog('templates')}>
          <Icon name="plus" size={15} /> New
        </button>
        <button type="button" className="btn btn-sm" onClick={() => openDialog('github')}>
          <Icon name="github" size={15} /> GitHub
        </button>
        <button type="button" className="btn btn-sm" onClick={() => openDialog('paste')}>
          <Icon name="clipboard" size={15} /> Paste
        </button>
      </div>
      <input className="input lib-search" placeholder="Search your documents" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search your documents" />
      <p className="muted small">
        <Icon name="lock" size={13} /> Saved only in this browser. Up to 60 recent documents are kept.
      </p>
      {docs === null && <p className="muted">Loading…</p>}
      {docs && !shown.length && <p className="muted">{query ? 'No documents match.' : 'Nothing here yet — open or write a README.'}</p>}
      <ul className="lib-list">
        {shown.map((d) => (
          <li key={d.id} className={`lib-item${current?.id === d.id ? ' is-current' : ''}`}>
            {renaming === d.id ? (
              <form
                className="lib-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  void rename(d.id);
                }}
              >
                <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} onBlur={() => void rename(d.id)} aria-label="New name" />
              </form>
            ) : (
              <button type="button" className="lib-open" onClick={() => void openFromLibrary(d.id)} aria-current={current?.id === d.id ? 'true' : undefined}>
                <Icon name={SOURCE_ICON[d.source.kind] ?? 'file'} size={16} />
                <span className="lib-title">{d.title}</span>
                <span className="lib-meta">
                  {timeAgo(d.updatedAt)}
                  {d.words ? ` · ${d.words.toLocaleString()} words` : ''}
                  {d.edited ? ' · edited' : ''}
                </span>
              </button>
            )}
            <div className="lib-tools">
              <button
                type="button"
                className="icon-btn sm"
                aria-label={`Rename ${d.title}`}
                onClick={() => {
                  setName(d.title);
                  setRenaming(d.id);
                }}
              >
                <Icon name="edit" size={14} />
              </button>
              <button type="button" className="icon-btn sm" aria-label={`Duplicate ${d.title}`} onClick={() => void duplicate(d.id)}>
                <Icon name="copy" size={14} />
              </button>
              <button type="button" className="icon-btn sm btn-danger" aria-label={`Delete ${d.title}`} onClick={() => void remove(d)}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {docs && docs.length > 0 && (
        <div className="lib-clear">
          {confirmClear ? (
            <>
              <span>Delete all {docs.length} documents and their images?</span>
              <button type="button" className="btn btn-sm" onClick={() => setConfirmClear(false)}>
                Keep them
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => void clearAll()}>
                Delete all
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => setConfirmClear(true)}>
              <Icon name="trash" size={14} /> Clear all
            </button>
          )}
        </div>
      )}
    </Drawer>
  );
}
