import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Dialog } from './Dialog';
import { Icon } from '../Icon';
import { doc, settings, toast, ui } from '../../app/state';
import { useStore } from '../../app/store';
import { THEMES, getTheme, availableModes } from '../../themes/registry';
import type { ThemeId } from '../../themes/types';
import { buildResolver } from '../../lib/markdown/resolvers';
import { resolverFor } from '../Workspace';
import { normalisePath } from '../../lib/editor/zip';
import { DEFAULT_GH_OPTIONS, buildGitHubExport, configFromSettings, type GhExportOptions, type GhExportResult } from '../../lib/ghexport';
import type { BadgeStyle } from '../../lib/ghexport/transform';
import { buildGitHubZip, byteSize, formatBytes, type ExtraFile } from '../../lib/ghexport/zip';
import { renderGitHubPreview, scopeGitHubCss } from '../../lib/ghexport/githubHtml';
import { emojiTable } from '../../lib/markdown/emoji';
import lightCss from 'github-markdown-css/github-markdown-light.css?inline';
import darkCss from 'github-markdown-css/github-markdown-dark.css?inline';

type Options = Omit<GhExportOptions, 'config' | 'emoji'>;

const BADGE_STYLES: Array<{ id: BadgeStyle; label: string }> = [
  { id: 'for-the-badge', label: 'For the badge' },
  { id: 'flat-square', label: 'Flat square' },
  { id: 'flat', label: 'Flat' },
  { id: 'plastic', label: 'Plastic' },
  { id: 'keep', label: 'Keep as they are' },
];

function ensureGitHubCss(): void {
  if (document.getElementById('rg-gh-markdown-css')) return;
  const style = document.createElement('style');
  style.id = 'rg-gh-markdown-css';
  style.textContent = scopeGitHubCss(lightCss, 'light') + scopeGitHubCss(darkCss, 'dark');
  document.head.appendChild(style);
}

function revokeAll(urls: Map<string, string>): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
}

function downloadBlob(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`switch ghx-switch${disabled ? ' is-disabled' : ''}`}>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/**
 * GitHub export: the README rewritten so its theme shows on github.com
 * (SVG header and section images, light/dark <picture>, themed badges,
 * alerts, <details>), with a live preview in GitHub's own styles.
 */
export default function GitHubExportDialog() {
  const s = useStore(settings, (x) => x);
  const current = useStore(ui, (x) => x.doc);
  const [theme, setTheme] = useState<ThemeId>(s.theme);
  const [animate, setAnimate] = useState(true);
  const [writeConfig, setWriteConfig] = useState(true);
  const [o, setO] = useState<Options>(() => ({ ...DEFAULT_GH_OPTIONS }));
  const [scheme, setScheme] = useState<'light' | 'dark'>(() => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop');
  const [result, setResult] = useState<GhExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [emoji, setEmoji] = useState<ReadonlyMap<string, string> | undefined>();
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const articleRef = useRef<HTMLElement>(null);
  const urlsRef = useRef<Map<string, string>>(new Map());
  const markdown = doc.text;
  const set = (patch: Partial<Options>) => setO((prev) => ({ ...prev, ...patch }));

  useEffect(ensureGitHubCss, []);
  useEffect(() => {
    void emojiTable().then(setEmoji);
  }, []);

  // Rebuild (debounced) whenever an option changes.
  useEffect(() => {
    let alive = true;
    setBusy(true);
    const timer = setTimeout(() => {
      buildGitHubExport({
        markdown,
        theme,
        accent: theme === s.theme ? s.accent : null,
        animate,
        options: { ...o, config: writeConfig ? { ...configFromSettings(s), theme, accent: theme === s.theme ? (s.accent ?? undefined) : undefined } : null },
      })
        .then((r) => {
          if (!alive) return;
          // New blob URLs arrive together with the result (one render, no broken images).
          const next = new Map(r.assets.map((a) => [a.path, URL.createObjectURL(new Blob([a.svg], { type: 'image/svg+xml' }))] as const));
          const old = urlsRef.current;
          urlsRef.current = next;
          setResult(r);
          setUrls(next);
          setError(null);
          setTimeout(() => revokeAll(old), 1000);
        })
        .catch((err: unknown) => {
          if (alive) setError(err instanceof Error ? err.message : 'The export failed.');
        })
        .finally(() => alive && setBusy(false));
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [markdown, theme, animate, writeConfig, o, s]);

  // Revoke the images' blob URLs when the dialog closes.
  useEffect(() => () => revokeAll(urlsRef.current), []);

  const docResolver = useMemo(() => (current ? buildResolver(resolverFor(current)) : undefined), [current]);
  const html = useMemo(() => {
    if (!result) return '';
    return renderGitHubPreview(result.markdown, {
      scheme,
      emoji,
      resolveImage: (src) => {
        const clean = src.replace(/^\.\//, '').split(/[?#]/)[0]!;
        const own = urls.get(clean);
        if (own) return own;
        const r = docResolver?.(src, 'image');
        return typeof r === 'string' ? r : null;
      },
    });
  }, [result, scheme, urls, emoji, docResolver]);

  const totals = useMemo(() => {
    const sizes = (result?.assets ?? []).map((a) => ({ path: a.path, bytes: byteSize(a.svg) }));
    return { sizes, total: sizes.reduce((n, x) => n + x.bytes, 0) };
  }, [result]);

  const themeDef = getTheme(theme);
  const single = availableModes(themeDef).length === 1;
  const info = result?.info;

  const onPreviewClick = (e: MouseEvent<HTMLElement>) => {
    const a = (e.target as Element).closest('a');
    const href = a?.getAttribute('href') ?? '';
    if (!href.startsWith('#')) return;
    e.preventDefault();
    const id = `user-content-${decodeURIComponent(href.slice(1))}`;
    articleRef.current?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const copyReadme = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      toast(
        result.assets.length
          ? `README copied. It points at ${result.assets.length} images in ${o.assetDir}/: download the .zip to get them, and commit both.`
          : 'README copied.',
        'success',
        { timeout: 9000 },
      );
    } catch {
      toast('Your browser blocked clipboard access. Use Download .zip instead.', 'error');
    }
  };

  const downloadZip = async () => {
    if (!result || !current) return;
    const extra: ExtraFile[] = [];
    // Local images the README already uses, at their paths relative to the README.
    const base = current.baseDir ? `${current.baseDir}/` : '';
    for (const [path, blob] of current.blobs) {
      if (base && !path.startsWith(base)) continue;
      const rel = normalisePath(path.slice(base.length));
      if (rel) extra.push({ path: rel, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const zip = buildGitHubZip(result.markdown, result.assets, extra);
    downloadBlob('readme-for-github.zip', zip as BlobPart, 'application/zip');
    toast('Zip downloaded: unzip it at the root of your repository, then commit README.md and the .github folder.', 'success', { timeout: 9000 });
  };

  return (
    <Dialog
      title="GitHub export"
      description="Your theme, on github.com: header and section images, light and dark, themed badges, alerts. GitHub shows no custom CSS, so everything is built from what it does allow."
      icon="github"
      size="xwide"
      className="ghx-dialog"
      footer={
        <>
          <span className="spacer">
            {busy ? 'Drawing…' : result ? `${result.assets.length} image${result.assets.length === 1 ? '' : 's'} · ${formatBytes(totals.total)}` : ''}
          </span>
          <button type="button" className="btn" disabled={!result} onClick={() => void copyReadme()}>
            <Icon name="copy" size={16} /> Copy README
          </button>
          <button type="button" className="btn btn-primary" disabled={!result} onClick={() => void downloadZip()}>
            <Icon name="archive" size={16} /> Download .zip
          </button>
        </>
      }
    >
      <div className="ghx">
        <div className="ghx-options">
          <label className="field">
            <span>Theme</span>
            <select className="select" value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {availableModes(t).length === 1 ? ` (${t.defaultMode} only)` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Header</span>
            <div className="seg full">
              {(['hero', 'centered', 'none'] as const).map((h) => (
                <button key={h} type="button" aria-pressed={o.header === h} onClick={() => set({ header: h })}>
                  {h === 'hero' ? 'Image' : h === 'centered' ? 'Text' : 'Off'}
                </button>
              ))}
            </div>
          </div>
          {o.header !== 'none' && (
            <>
              <label className="field">
                <span>Title</span>
                <input className="input" value={o.title ?? ''} placeholder={info?.titleSource && info.titleSource !== 'override' ? info.title ?? '' : 'Your project name'} onChange={(e) => set({ title: e.target.value || null })} />
              </label>
              <label className="field">
                <span>Tagline</span>
                <input
                  className="input"
                  value={o.tagline ?? ''}
                  placeholder={o.tagline === null ? (info?.tagline ?? 'One line about the project') : ''}
                  onChange={(e) => set({ tagline: e.target.value === '' ? null : e.target.value })}
                />
              </label>
              {!info?.title && result && <p className="ghx-hint">No title found. Add a “# Title” line to the README or type one above.</p>}
              {o.header === 'hero' && <Toggle label="Gentle motion" hint="Off for readers who ask for reduced motion" checked={animate} onChange={setAnimate} />}
            </>
          )}
          <Toggle label="Section header images" hint="Each ## heading, anchors kept" checked={o.sections} onChange={(v) => set({ sections: v })} />
          <Toggle label="Number the sections" checked={o.numbered} disabled={!o.sections} onChange={(v) => set({ numbered: v })} />
          <Toggle label="Themed dividers" hint="Replace --- lines" checked={o.dividers} onChange={(v) => set({ dividers: v })} />
          <div className="field">
            <span>Table of contents</span>
            <div className="seg full">
              {(['none', 'list', 'pills'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={o.toc === t} onClick={() => set({ toc: t })}>
                  {t === 'none' ? 'Off' : t === 'list' ? 'List' : 'Pills'}
                </button>
              ))}
            </div>
            {info?.toc === 'exists' && <p className="ghx-hint">This README already has a table of contents.</p>}
          </div>
          <label className="field">
            <span>Badges (shields.io)</span>
            <select className="select" value={o.badges} onChange={(e) => set({ badges: e.target.value as BadgeStyle })}>
              {BADGE_STYLES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <Toggle label="GitHub alerts" hint="“> **Note**” becomes a real callout" checked={o.alerts} onChange={(v) => set({ alerts: v })} />
          <Toggle label="Fold long sections" hint="Changelogs and FAQs go in <details>" checked={o.fold} onChange={(v) => set({ fold: v })} />
          <Toggle label="Remember the look" hint="Invisible comment: ReadmeGlow opens it in this theme" checked={writeConfig} onChange={setWriteConfig} />
          <label className="field">
            <span>Image folder</span>
            <input className="input mono" value={o.assetDir} onChange={(e) => set({ assetDir: e.target.value })} spellCheck={false} />
          </label>
          {result && (
            <details className="ghx-files">
              <summary>
                Files · {result.assets.length + 1} · {formatBytes(totals.total + byteSize(result.markdown))}
              </summary>
              <ul>
                <li>
                  <span>README.md</span>
                  <span>{formatBytes(byteSize(result.markdown))}</span>
                </li>
                {totals.sizes.map((f) => (
                  <li key={f.path}>
                    <span title={f.path}>{f.path.split('/').pop()}</span>
                    <span>{formatBytes(f.bytes)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="ghx-preview">
          <div className="ghx-bar">
            <div className="seg" role="group" aria-label="GitHub colour scheme">
              <button type="button" aria-pressed={scheme === 'light'} onClick={() => setScheme('light')}>
                <Icon name="sun" size={14} /> Light
              </button>
              <button type="button" aria-pressed={scheme === 'dark'} onClick={() => setScheme('dark')}>
                <Icon name="moon" size={14} /> Dark
              </button>
            </div>
            <div className="seg" role="group" aria-label="Preview width">
              <button type="button" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')}>
                Desktop
              </button>
              <button type="button" aria-pressed={width === 'phone'} onClick={() => setWidth('phone')}>
                Phone
              </button>
            </div>
          </div>
          <p className="ghx-note">
            <Icon name="info" size={14} /> Preview with GitHub's own stylesheet and HTML rules. Close to github.com, not identical: code colours, Mermaid and math may differ.
            {single && ` ${themeDef.name} has one variant, so the same images show in light and dark mode.`}
          </p>
          <div className={`gh-stage gh-stage-${scheme}`}>
            <div className={`gh-frame gh-${scheme} is-${width}`}>
              <div className="gh-frame-head">
                <Icon name="book" size={16} /> README
              </div>
              {error ? (
                <p className="ghx-error">{error}</p>
              ) : (
                <article ref={articleRef} className={`markdown-body gh-${scheme}${busy && !result ? ' is-loading' : ''}`} onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
