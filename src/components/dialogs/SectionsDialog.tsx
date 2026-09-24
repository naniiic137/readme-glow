import { useState } from 'react';
import { Dialog } from './Dialog';
import { closeDialog, doc, setSettings, settings, toast } from '../../app/state';
import { sync } from '../../app/sync';
import { SECTION_TEMPLATES } from '../../lib/editor/sections';

/** Inserts a ready-made README section at the cursor (or at the end). */
export function insertMarkdownBlock(markdown: string): void {
  if (sync.editor) {
    sync.editor.insertBlock(markdown);
    return;
  }
  const text = doc.text.replace(/\s*$/, '');
  doc.commit(`${text}${text ? '\n\n' : ''}${markdown.replace(/\s*$/, '')}\n`, { origin: 'insert' });
}

export default function SectionsDialog() {
  const [query, setQuery] = useState('');
  const list = SECTION_TEMPLATES.filter((s) => `${s.title} ${s.description}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <Dialog title="Insert a section" description="Ready-made sections, written the way good READMEs do it." size="wide" icon="template" initialFocus="#section-search">
      <input id="section-search" className="input" placeholder="Search sections…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sections" />
      <div className="section-grid">
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            className="template-card small"
            onClick={() => {
              closeDialog();
              if (settings.get().view === 'preview') setSettings({ view: 'split' });
              setTimeout(() => {
                insertMarkdownBlock(s.markdown);
                toast(`${s.title} section added.`, 'success');
              }, 60);
            }}
          >
            <span className="template-emoji" aria-hidden="true">
              {s.emoji}
            </span>
            <strong>{s.title}</strong>
            <span>{s.description}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
