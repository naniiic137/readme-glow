import { useState } from 'react';
import { Dialog } from './Dialog';
import { settings, toast, ui } from '../../app/state';
import { useStore } from '../../app/store';
import { readmeGlowBadge } from '../../lib/editor/badge';
import { parseGitHubInput } from '../../lib/github';
import { insertMarkdownBlock } from './SectionsDialog';
import { closeDialog } from '../../app/state';

/** Generates the "View with ReadmeGlow" badge people add to their own README. */
export default function ViewBadgeDialog() {
  const current = useStore(ui, (s) => s.doc);
  const s = useStore(settings, (x) => x);
  const initial = current?.source.kind === 'github' ? `${current.source.owner}/${current.source.repo}` : '';
  const [repo, setRepo] = useState(initial);
  const [style, setStyle] = useState<'shields' | 'custom'>('custom');
  const parsed = parseGitHubInput(repo);
  const badge = parsed ? readmeGlowBadge({ owner: parsed.owner, repo: parsed.repo, theme: s.theme, layout: s.layout, style }) : null;
  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => toast(`${what} copied.`, 'success'));
  return (
    <Dialog
      title="“View with ReadmeGlow” badge"
      description="Add it to your README so visitors can open it in this theme and layout."
      icon="badge"
      size="wide"
      footer={
        badge ? (
          <>
            <button type="button" className="btn" onClick={() => copy(badge.html, 'HTML')}>
              Copy HTML
            </button>
            <button type="button" className="btn" onClick={() => copy(badge.markdown, 'Markdown')}>
              Copy Markdown
            </button>
            {current && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  closeDialog();
                  setTimeout(() => insertMarkdownBlock(badge.markdown), 40);
                }}
              >
                Insert in this README
              </button>
            )}
          </>
        ) : undefined
      }
    >
      <div className="vb-grid">
        <label className="field">
          <span>Repository</span>
          <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" spellCheck={false} />
        </label>
        <div className="field">
          <span>Badge style</span>
          <div className="seg">
            <button type="button" aria-pressed={style === 'custom'} onClick={() => setStyle('custom')}>
              ReadmeGlow
            </button>
            <button type="button" aria-pressed={style === 'shields'} onClick={() => setStyle('shields')}>
              shields.io
            </button>
          </div>
        </div>
      </div>
      <p className="muted small">
        Opens with the current theme (<strong>{s.theme}</strong>) and layout (<strong>{s.layout}</strong>). Change them first if you want another look.
      </p>
      {badge ? (
        <>
          <div className="vb-preview">
            <img src={style === 'custom' ? `${import.meta.env.BASE_URL}badge.svg` : badge.url} alt="View with ReadmeGlow" />
          </div>
          <pre className="te-preview">{badge.markdown}</pre>
        </>
      ) : (
        <p className="muted">Type a repository like owner/repo to generate the badge.</p>
      )}
    </Dialog>
  );
}
