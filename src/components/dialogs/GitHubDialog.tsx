import { useState } from 'react';
import { Dialog } from './Dialog';
import { Icon } from '../Icon';
import { closeDialog, ui } from '../../app/state';
import { useStore } from '../../app/store';
import { openGitHub } from '../../app/actions';
import { parseGitHubInput } from '../../lib/github';

const EXAMPLES = ['facebook/react', 'vitejs/vite', 'sindresorhus/awesome', 'naniiic137/readme-glow'];

export default function GitHubDialog() {
  const [value, setValue] = useState('');
  const loading = useStore(ui, (s) => s.loading);
  const parsed = value.trim() ? parseGitHubInput(value) : null;
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!parsed) return;
    const ok = await openGitHub(parsed);
    if (ok) closeDialog();
  };
  return (
    <Dialog
      title="Open a README from GitHub"
      description="Public repositories only. Relative images and links keep working."
      icon="github"
      initialFocus="#gh-input"
      footer={
        <>
          <span className="spacer">{value.trim() && !parsed ? 'Try owner/repo or a github.com link.' : 'Uses the public GitHub API (60 requests an hour).'}</span>
          <button type="button" className="btn btn-ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!parsed || !!loading} onClick={() => void submit()}>
            {loading ? 'Loading…' : 'Open'} <Icon name="arrowRight" size={16} />
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="field">
        <span>Repository or link</span>
        <input id="gh-input" className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="owner/repo or https://github.com/owner/repo" autoComplete="off" spellCheck={false} />
      </form>
      {parsed && (
        <p className="gh-preview">
          <Icon name="check" size={14} /> {parsed.owner}/{parsed.repo}
          {parsed.ref ? ` · ${parsed.ref}` : ''}
          {parsed.file ? ` · ${parsed.file}` : parsed.dir ? ` · ${parsed.dir}/` : ''}
        </p>
      )}
      <div className="chip-row">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip" onClick={() => setValue(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
