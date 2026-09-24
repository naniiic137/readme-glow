import { Dialog } from './Dialog';
import { closeDialog } from '../../app/state';
import { newDocument } from '../../app/actions';
import { STARTER_TEMPLATES } from '../../lib/editor/templates';
import { setSettings, settings } from '../../app/state';

export default function TemplatesDialog() {
  const start = async (markdown: string, id: string | null) => {
    closeDialog();
    if (settings.get().view === 'preview') setSettings({ view: 'split' });
    await newDocument(markdown, id ? { kind: 'template', id } : { kind: 'new' });
  };
  return (
    <Dialog title="Start a new README" description="Pick a starter — every section is a placeholder you can rewrite." size="wide" icon="template">
      <div className="template-grid">
        <button type="button" className="template-card blank" onClick={() => void start('# Project name\n\nOne sentence that says what it does and who it is for.\n', null)}>
          <span className="template-emoji" aria-hidden="true">
            ✍️
          </span>
          <strong>Blank</strong>
          <span>A title and a sentence. Just write.</span>
        </button>
        {STARTER_TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="template-card" onClick={() => void start(t.markdown, t.id)}>
            <span className="template-emoji" aria-hidden="true">
              {t.emoji}
            </span>
            <strong>{t.name}</strong>
            <span>{t.description}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
