import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { DropZone } from './DropZone';
import { ThemeCarousel } from './ThemeCarousel';
import { openFiles, openGitHub, openSample, openFromLibrary, library, newDocument } from '../app/actions';
import { openDialog, setSettings, ui } from '../app/state';
import { useStore } from '../app/store';
import { SAMPLES } from '../samples';
import type { DocSummary } from '../lib/storage/library';
import { STARTER_TEMPLATES } from '../lib/editor/templates';

const FEATURES: Array<{ icon: string; title: string; text: string }> = [
  { icon: 'palette', title: '15 hand-crafted themes', text: 'Aurora, Editorial, Terminal, Pixel Arcade, Synthwave, Blueprint… each with its own type, colour and soul.' },
  { icon: 'layout', title: '5 layouts', text: 'Document, Docs with a sticky contents sidebar, Landing page, Slides you can present, and Magazine.' },
  { icon: 'edit', title: 'Edit both sides', text: 'A real code editor with a formatting toolbar — or click any paragraph on the page and type.' },
  { icon: 'wand', title: 'Beautify', text: 'One click tidies headings, badges, tables and code fences, adds a contents list — with a diff first.' },
  { icon: 'lightbulb', title: 'Summary & insights', text: 'An offline summary plus the tech stack, install commands, links and licence, each one clickable.' },
  { icon: 'health', title: 'README health check', text: 'A score with friendly suggestions and one-click fixes for missing sections and alt text.' },
  { icon: 'download', title: 'Export anything', text: 'Standalone HTML, print-ready PDF, a 1200×630 social card, a .zip with images, or a share link.' },
  { icon: 'github', title: 'Your theme on GitHub', text: 'The GitHub export draws the header and section titles as light and dark SVG images, themes the badges and adds alerts.' },
  { icon: 'link', title: 'Pretty links', text: 'Put the ReadmeGlow address in front of any repository: /readme-glow/owner/repo. Plus a badge and a bookmarklet.' },
  { icon: 'palette', title: 'Remembers the look', text: 'Exports carry an invisible comment with the theme and layout, so the README opens the way its author styled it.' },
  { icon: 'type', title: 'Right-to-left ready', text: 'Arabic and Hebrew READMEs flip to right-to-left automatically, and Arabic gets fonts made for it.' },
  { icon: 'shield', title: 'Private by design', text: 'Your README is rendered in your browser and saved on your device. Nothing is uploaded.' },
];

export function Landing() {
  const loading = useStore(ui, (s) => s.loading);
  const [repo, setRepo] = useState('');
  const [recent, setRecent] = useState<DocSummary[]>([]);

  useEffect(() => {
    document.body.classList.add('is-landing');
    let alive = true;
    void library()
      .then((lib) => lib.list())
      .then((docs) => alive && setRecent(docs.slice(0, 4)))
      .catch(() => undefined);
    return () => {
      alive = false;
      document.body.classList.remove('is-landing');
    };
  }, []);

  const submitRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (repo.trim()) await openGitHub(repo);
  };

  return (
    <div className="landing" id="main">
      <div className="landing-bg" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="landing-grid" />
      </div>

      <header className="landing-nav">
        <a className="brand" href="./" aria-label="ReadmeGlow home">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="sparkles" size={18} />
          </span>
          <span className="brand-name">ReadmeGlow</span>
        </a>
        <nav className="landing-links" aria-label="Main">
          <a href="#themes">Themes</a>
          <a href="#features">Features</a>
          <a href="#privacy">Privacy</a>
          <a href="https://github.com/naniiic137/readme-glow" target="_blank" rel="noopener noreferrer">
            <Icon name="github" size={16} /> <span>GitHub</span>
          </a>
        </nav>
        <button type="button" className="btn btn-sm" onClick={() => openDialog('templates')} aria-label="Start writing a new README">
          <Icon name="edit" size={15} /> <span className="hide-xs">Start writing</span>
        </button>
      </header>

      <main className="hero">
        <p className="eyebrow">
          <span className="dot" aria-hidden="true" /> 15 themes · 5 layouts · 100% in your browser
        </p>
        <h1 className="hero-title">
          Your README,
          <br />
          <span className="glow-text">beautifully designed.</span>
        </h1>
        <p className="hero-lede">
          Drop any README.md and watch it become a stunning web page. Edit it on the page or in a real editor, beautify it, summarise it,
          and export it — nothing ever leaves your browser.
        </p>

        <DropZone onFiles={openFiles} onPaste={() => openDialog('paste')}>
          <form className="repo-form" onSubmit={submitRepo}>
            <label className="sr-only" htmlFor="repo-input">
              GitHub repository
            </label>
            <span className="repo-icon" aria-hidden="true">
              <Icon name="github" size={18} />
            </span>
            <input
              id="repo-input"
              className="repo-input"
              placeholder="owner/repo or a github.com link"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-glow" disabled={!repo.trim() || !!loading}>
              {loading ? 'Loading…' : 'Make it glow'} <Icon name="arrowRight" size={16} />
            </button>
          </form>
        </DropZone>

        <div className="samples" aria-label="Try a sample README">
          <span className="samples-label">No README handy? Try one:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              onClick={() => {
                setSettings({ theme: s.recommended.theme as never, layout: s.recommended.layout });
                void openSample(s.id);
              }}
            >
              <span aria-hidden="true">{s.emoji}</span> {s.title}
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <section className="recent" aria-labelledby="recent-title">
            <h2 id="recent-title">Continue where you left off</h2>
            <ul>
              {recent.map((d) => (
                <li key={d.id}>
                  <button type="button" className="recent-card" onClick={() => void openFromLibrary(d.id)}>
                    <Icon name={d.source.kind === 'github' ? 'github' : 'file'} size={16} />
                    <span className="recent-title">{d.title}</span>
                    <span className="recent-meta">{timeAgo(d.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <section className="showcase" id="themes" aria-labelledby="themes-title">
        <div className="section-head">
          <p className="kicker">Same README · fifteen personalities</p>
          <h2 id="themes-title">Pick a look. Change it any time.</h2>
          <p>Every theme is hand-crafted: its own fonts, palette, headings, code blocks, tables, callouts and background.</p>
        </div>
        <ThemeCarousel />
      </section>

      <section className="features" id="features" aria-labelledby="features-title">
        <div className="section-head">
          <p className="kicker">Everything a README deserves</p>
          <h2 id="features-title">More than a pretty face.</h2>
        </div>
        <ul className="feature-grid">
          {FEATURES.map((f) => (
            <li key={f.title} className="feature">
              <span className="feature-icon" aria-hidden="true">
                <Icon name={f.icon} size={20} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="how" aria-labelledby="how-title">
        <div className="section-head">
          <p className="kicker">Three steps</p>
          <h2 id="how-title">From plain Markdown to a page people remember.</h2>
        </div>
        <ol className="steps">
          <li>
            <span className="step-n">1</span>
            <h3>Bring your README</h3>
            <p>Drop a file or folder, paste Markdown, or type owner/repo to fetch it from GitHub.</p>
          </li>
          <li>
            <span className="step-n">2</span>
            <h3>Make it yours</h3>
            <p>Choose a theme and layout, tweak the accent colour, fonts and width, and edit right on the page.</p>
          </li>
          <li>
            <span className="step-n">3</span>
            <h3>Share it</h3>
            <p>Export a standalone page, a PDF, a social card or a link — or add a “View with ReadmeGlow” badge.</p>
          </li>
        </ol>
        <div className="templates-strip">
          <span>Or start from a template:</span>
          {STARTER_TEMPLATES.slice(0, 5).map((t) => (
            <button key={t.id} type="button" className="chip" onClick={() => void newDocument(t.markdown, { kind: 'template', id: t.id })}>
              <span aria-hidden="true">{t.emoji}</span> {t.name}
            </button>
          ))}
        </div>
      </section>

      <section className="privacy" id="privacy" aria-labelledby="privacy-title">
        <span className="privacy-icon" aria-hidden="true">
          <Icon name="lock" size={26} />
        </span>
        <div>
          <h2 id="privacy-title">Privacy: your file never leaves your browser.</h2>
          <p>
            ReadmeGlow has no server. Files you drop are read locally, rendered locally and saved in your browser’s own storage. The only
            network requests are the ones you ask for: fetching a public README from GitHub, the images your README links to, and — only if
            you switch it on with your own key — an AI summary.
          </p>
        </div>
      </section>

      <footer className="landing-foot">
        <span>© 2026 Hamza Ben Ismail. All rights reserved.</span>
        <span className="foot-links">
          <button type="button" className="linklike" onClick={() => openDialog('shortcuts')}>
            Keyboard shortcuts
          </button>
          <a href="https://github.com/naniiic137" target="_blank" rel="noopener noreferrer">
            @naniiic137
          </a>
        </span>
      </footer>
    </div>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString();
}
