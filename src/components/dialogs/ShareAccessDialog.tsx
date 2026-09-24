import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { Icon } from '../Icon';
import { closeDialog, settings, toast, ui } from '../../app/state';
import { useStore } from '../../app/store';
import { readmeGlowBadge } from '../../lib/editor/badge';
import { parseGitHubInput } from '../../lib/github';
import { appUrl, bookmarkletCode, prettyRepoUrl, redirectHtml } from '../../lib/access';
import { settingsToParams } from '../../lib/settings';
import { insertMarkdownBlock } from './SectionsDialog';

type Tab = 'link' | 'badge' | 'website' | 'redirect' | 'bookmarklet';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'link', label: 'Links', icon: 'link' },
  { id: 'badge', label: 'Badge', icon: 'badge' },
  { id: 'website', label: 'Repo website', icon: 'globe' },
  { id: 'redirect', label: 'Redirect page', icon: 'fileCode' },
  { id: 'bookmarklet', label: 'Bookmarklet', icon: 'zap' },
];

function copy(text: string, what: string): void {
  void navigator.clipboard
    ?.writeText(text)
    .then(() => toast(`${what} copied.`, 'success'))
    .catch(() => window.prompt('Copy this:', text));
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function CopyField({ label, value, what }: { label: string; value: string; what: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="copy-field">
        <input className="input mono" readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <button type="button" className="btn btn-sm" onClick={() => copy(value, what)}>
          <Icon name="copy" size={14} /> Copy
        </button>
      </div>
    </div>
  );
}

/** Bookmarklet link: the javascript: URL is set on the element directly (React refuses them) and clicks here do nothing. */
function BookmarkletLink({ href }: { href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute('href', href);
  }, [href]);
  return (
    <a
      ref={ref}
      className="bookmarklet"
      draggable
      onClick={(e) => {
        e.preventDefault();
        toast('Drag this button to your bookmarks bar, then click it on any GitHub repository.', 'info');
      }}
    >
      <Icon name="sparkles" size={16} /> Open in ReadmeGlow
    </a>
  );
}

/** One place for every way to share a README or reach it from GitHub. */
export default function ShareAccessDialog() {
  const current = useStore(ui, (s) => s.doc);
  const s = useStore(settings, (x) => x);
  const initial = current?.source.kind === 'github' ? `${current.source.owner}/${current.source.repo}` : '';
  const [repo, setRepo] = useState(initial);
  const [tab, setTab] = useState<Tab>(current?.source.kind === 'github' || !current ? 'link' : 'badge');
  const [withLook, setWithLook] = useState(false);
  const [style, setStyle] = useState<'shields' | 'custom'>('custom');
  const parsed = parseGitHubInput(repo);
  const app = appUrl(window.location.origin, import.meta.env.BASE_URL);
  const look = new URLSearchParams();
  if (withLook) {
    const all = settingsToParams(s);
    for (const key of ['theme', 'layout', 'mode', 'accent']) {
      const v = all.get(key);
      if (v) look.set(key, v);
    }
  }
  const query = look.toString() ? `?${look.toString()}` : '';
  const pretty = parsed ? `${prettyRepoUrl({ owner: parsed.owner, repo: parsed.repo }, app)}${query}` : null;
  const badge = parsed ? readmeGlowBadge({ owner: parsed.owner, repo: parsed.repo, theme: s.theme, layout: s.layout, style }) : null;
  const pagesUrl = parsed ? `https://${parsed.owner.toLowerCase()}.github.io/${parsed.repo}/` : null;

  const needRepo = <p className="muted">Type a repository (owner/repo) above.</p>;

  return (
    <Dialog
      title="Share & access"
      description="Links, a badge, your repository's Website field, a redirect page and a bookmarklet: every way into ReadmeGlow."
      icon="share"
      size="wide"
      className="share-dialog"
    >
      <label className="field">
        <span>Repository</span>
        <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo or a github.com link" spellCheck={false} />
      </label>
      <div className="share-tabs" role="tablist" aria-label="Ways to share">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`share-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="share-panel" className="share-tab" onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>
      <div className="share-panel" id="share-panel" role="tabpanel" aria-labelledby={`share-tab-${tab}`}>
        {tab === 'link' && (
          <>
            <p className="muted small">A pretty link opens the repository's README straight away, always the latest version from GitHub.</p>
            {pretty ? (
              <>
                <CopyField label="Pretty link" value={pretty} what="Link" />
                <p className="muted small">
                  Also works as <code>{app.replace(/^https?:\/\//, '')}github.com/{parsed!.owner}/{parsed!.repo}</code>: add the ReadmeGlow address in front of any GitHub link.
                </p>
              </>
            ) : (
              needRepo
            )}
            <label className="switch small-switch">
              <span>Open in my current look ({s.theme}, {s.layout})</span>
              <input type="checkbox" checked={withLook} onChange={(e) => setWithLook(e.target.checked)} />
            </label>
            {current && (
              <div className="share-block">
                <h3>This document</h3>
                <p className="muted small">
                  {current.source.kind === 'github' ? 'Links to the repository, so it always shows the latest README.' : 'Your README, compressed into the link itself. Nothing is uploaded.'}
                </p>
                <button type="button" className="btn btn-sm" onClick={() => void import('../../app/exporters').then((m) => m.copyShareLink())}>
                  <Icon name="share" size={14} /> Copy share link
                </button>
              </div>
            )}
          </>
        )}
        {tab === 'badge' && (
          <>
            <p className="muted small">Add a “View with ReadmeGlow” badge to your README so visitors can open it in the current theme and layout.</p>
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
            {badge ? (
              <>
                <div className="vb-preview">
                  <img src={style === 'custom' ? `${import.meta.env.BASE_URL}badge.svg` : badge.url} alt="View with ReadmeGlow" />
                </div>
                <pre className="te-preview">{badge.markdown}</pre>
                <div className="share-actions">
                  <button type="button" className="btn btn-sm" onClick={() => copy(badge.html, 'HTML')}>
                    Copy HTML
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => copy(badge.markdown, 'Markdown')}>
                    Copy Markdown
                  </button>
                  {current && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        closeDialog();
                        setTimeout(() => insertMarkdownBlock(badge.markdown), 40);
                      }}
                    >
                      Insert in this README
                    </button>
                  )}
                </div>
              </>
            ) : (
              needRepo
            )}
          </>
        )}
        {tab === 'website' && (
          <>
            <p className="muted small">Put the pretty link in your repository's About box, so the link under the description opens your README in ReadmeGlow.</p>
            {pretty ? <CopyField label="Website link" value={pretty} what="Link" /> : needRepo}
            <ol className="howto">
              <li>
                Open {parsed ? (
                  <a href={`https://github.com/${parsed.owner}/${parsed.repo}`} target="_blank" rel="noopener noreferrer">
                    github.com/{parsed.owner}/{parsed.repo}
                  </a>
                ) : (
                  'your repository on GitHub'
                )}
                .
              </li>
              <li>
                Click the <strong>⚙</strong> gear next to <strong>About</strong> (top right of the code tab).
              </li>
              <li>
                Paste the link into <strong>Website</strong> and press <strong>Save changes</strong>.
              </li>
            </ol>
            <p className="muted small">Only people with write access to the repository can edit its About box.</p>
          </>
        )}
        {tab === 'redirect' && (
          <>
            <p className="muted small">
              Want <code>{pagesUrl ?? 'owner.github.io/repo/'}</code> itself to open the README here? Publish this tiny page with GitHub Pages: it forwards visitors (meta refresh, a script and a plain link as fallback).
            </p>
            {parsed && pretty ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => download('index.html', redirectHtml(parsed, pretty), 'text/html;charset=utf-8')}>
                <Icon name="download" size={14} /> Download index.html
              </button>
            ) : (
              needRepo
            )}
            <ol className="howto">
              <li>
                Add the file to your repository as <code>docs/index.html</code>.
              </li>
              <li>
                On GitHub: <strong>Settings → Pages → Build and deployment</strong>, choose <strong>Deploy from a branch</strong>, your default branch and the <code>/docs</code> folder.
              </li>
              <li>
                After a minute, <code>{pagesUrl ?? 'https://owner.github.io/repo/'}</code> opens the README in ReadmeGlow. You can put that address in the About box too.
              </li>
            </ol>
            <p className="muted small">Skip this if the repository already has a GitHub Pages site: it would replace it.</p>
          </>
        )}
        {tab === 'bookmarklet' && (
          <>
            <p className="muted small">Drag the button to your bookmarks bar. On any github.com repository page, click it to open that README here. It does nothing anywhere else.</p>
            <div className="bookmarklet-row">
              <BookmarkletLink href={bookmarkletCode(app)} />
              <span className="muted small">← drag me to your bookmarks bar</span>
            </div>
            <p className="muted small">A browser extension could add a button to GitHub itself. That is a possible future addition, not something ReadmeGlow installs today.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
