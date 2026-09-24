import { strToU8, zipSync } from 'fflate';
import docBaseCss from '../styles/doc-base.css?inline';
import layoutsCss from '../styles/layouts.css?inline';
import { doc, settings, toast, ui } from './state';
import { sync } from './sync';
import { getTheme, loadThemeCss, resolveMode, tokensFor } from '../themes/registry';
import { fontFaceCss, ARABIC_FONTS } from '../themes/fonts';
import { buildStandaloneHtml, fileSlug } from '../lib/export/html';
import { paintCard } from '../lib/export/card';
import { planZip } from '../lib/editor/zip';
import { buildShareUrl } from '../lib/share';
import { ensureFonts } from './themeStyles';
import { flushSave, library } from './actions';

export type ExportKind = 'html' | 'pdf' | 'png' | 'md' | 'copy' | 'zip' | 'share';

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function title(): string {
  return ui.get().doc?.title ?? 'README';
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await blobToDataUrl(await res.blob());
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Markdown, copy, zip

export function downloadMarkdown(): void {
  download('README.md', new Blob([doc.text], { type: 'text/markdown;charset=utf-8' }));
  toast('README.md downloaded.', 'success');
}

export async function copyMarkdown(): Promise<void> {
  try {
    await navigator.clipboard.writeText(doc.text);
    toast('Markdown copied to the clipboard.', 'success');
  } catch {
    toast('Your browser blocked clipboard access.', 'error');
  }
}

/** README.md plus every local image in images/, with the Markdown's paths rewritten. */
export async function exportZip(): Promise<void> {
  const current = ui.get().doc;
  if (!current) return;
  const base = current.baseDir ? `${current.baseDir}/` : '';
  const local = new Map<string, Blob>();
  for (const [path, blob] of current.blobs) {
    if (!base || path.startsWith(base)) local.set(path.slice(base.length), blob);
  }
  const plan = planZip(doc.text, [...local.keys()]);
  const files: Record<string, Uint8Array> = { 'README.md': strToU8(plan.markdown) };
  for (const f of plan.files) {
    const blob = local.get(f.from);
    if (blob) files[f.to] = new Uint8Array(await blob.arrayBuffer());
  }
  const zipped = zipSync(files, { level: 6 });
  download(`${fileSlug(current.title)}.zip`, new Blob([zipped as BlobPart], { type: 'application/zip' }));
  toast(plan.files.length ? `Zip downloaded with ${plan.files.length} image${plan.files.length === 1 ? '' : 's'}.` : 'Zip downloaded (this README has no local images).', 'success');
}

// ------------------------------------------------------------------ standalone HTML

export async function exportHtml(): Promise<void> {
  const live = sync.preview?.element()?.closest('.rg-doc') as HTMLElement | null;
  const current = ui.get().doc;
  const render = ui.get().render;
  if (!live || !current || !render) {
    toast('Open the preview first — the export uses exactly what you see.', 'error');
    return;
  }
  const s = settings.get();
  const theme = getTheme(s.theme);
  const mode = resolveMode(theme, s.mode, prefersDark());
  const clone = live.cloneNode(true) as HTMLElement;
  clone.classList.remove('in-pane', 'reveal-on');
  clone.style.removeProperty('--rg-viewport');
  clone.querySelectorAll('.ve-ui, .rg-particles').forEach((el) => el.remove());
  clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  clone.querySelectorAll('.is-source-active, .is-editing').forEach((el) => el.classList.remove('is-source-active', 'is-editing'));
  clone.querySelectorAll('[data-reveal]').forEach((el) => {
    el.removeAttribute('data-reveal');
    el.classList.remove('is-visible');
  });
  clone.querySelectorAll('[data-src], [data-inner], [data-line], [data-block]').forEach((el) => {
    el.removeAttribute('data-src');
    el.removeAttribute('data-inner');
    el.removeAttribute('data-line');
    el.removeAttribute('data-block');
  });
  // Local images become data: URIs; everything else keeps its URL.
  const images = Array.from(clone.querySelectorAll<HTMLImageElement>('img[src^="blob:"], img[src^="/"], img[src^="./"]'));
  for (const img of images) {
    const data = await urlToDataUrl(img.src);
    if (data) img.setAttribute('src', data);
  }
  const hasArabic = /[\u0600-\u06ff]/.test(doc.text);
  const fontUrls = new Map<string, string>();
  const keys = [...theme.fontKeys, ...(hasArabic ? ARABIC_FONTS : [])];
  const subsets: Array<'latin' | 'arabic'> = hasArabic ? ['latin', 'arabic'] : ['latin'];
  const faces = fontFaceCss(keys, { subsets });
  for (const m of faces.matchAll(/url\("([^"]+)"\)/g)) {
    const url = m[1]!;
    if (!fontUrls.has(url)) fontUrls.set(url, (await urlToDataUrl(url)) ?? url);
  }
  const embeddedFonts = faces.replace(/url\("([^"]+)"\)/g, (_m, url: string) => `url("${fontUrls.get(url) ?? url}")`);
  const themeCss = await loadThemeCss(theme);
  const html = buildStandaloneHtml({
    title: current.title,
    description: render.meta.description,
    docHtml: clone.outerHTML,
    css: [embeddedFonts, docBaseCss, layoutsCss, themeCss],
    math: render.features.math,
    themeColor: tokensFor(theme, mode).bg,
  });
  download(`${fileSlug(current.title)}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
  toast('Standalone HTML downloaded — it works offline.', 'success');
}

// ------------------------------------------------------------------ print / PDF

export function printPdf(keepBackground = settings.get().mode !== 'light'): void {
  document.body.classList.toggle('print-exact', keepBackground);
  const after = () => {
    document.body.classList.remove('print-exact');
    window.removeEventListener('afterprint', after);
  };
  window.addEventListener('afterprint', after);
  setTimeout(() => window.print(), 50);
}

// ------------------------------------------------------------------ social card

export async function renderSocialCard(canvas: HTMLCanvasElement): Promise<void> {
  const s = settings.get();
  const theme = getTheme(s.theme);
  const mode = resolveMode(theme, s.mode, prefersDark());
  const tokens = tokensFor(theme, mode);
  const render = ui.get().render;
  const current = ui.get().doc;
  ensureFonts(theme.fontKeys);
  const family = (stack: string) => stack;
  try {
    await Promise.all([
      document.fonts.load(`700 64px ${theme.fonts.heading}`),
      document.fonts.load(`400 30px ${theme.fonts.body}`),
      document.fonts.load(`600 22px ${theme.fonts.mono}`),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  const repo = current?.source.kind === 'github' ? `github.com/${current.source.owner}/${current.source.repo}` : null;
  const description = current?.meta?.description ?? render?.meta.description ?? null;
  paintCard(canvas, {
    title: render?.meta.title ?? current?.title ?? 'README',
    description,
    badges: render?.meta.badges ?? [],
    footer: repo ?? `${render?.stats.readingMinutes ?? 1} min read · ${render?.stats.words.toLocaleString() ?? 0} words`,
    tokens,
    accent: s.accent ?? tokens.accent,
    background: s.background === 'none' ? 'plain' : theme.card.background,
    fonts: { heading: family(theme.fonts.heading), body: family(theme.fonts.body), mono: family(theme.fonts.mono) },
    upperTitle: theme.card.titleCase === 'upper',
  });
}

export async function exportPng(canvas?: HTMLCanvasElement): Promise<void> {
  const c = canvas ?? document.createElement('canvas');
  if (!canvas) await renderSocialCard(c);
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
  if (!blob) {
    toast('Could not create the image.', 'error');
    return;
  }
  download(`${fileSlug(title())}-card.png`, blob);
  toast('Social card downloaded (1200×630). Use it as your repository’s social preview.', 'success');
}

// ------------------------------------------------------------------ share link

export async function copyShareLink(): Promise<boolean> {
  const current = ui.get().doc;
  if (!current) return false;
  await flushSave();
  const record = await (await library()).get(current.id);
  const repo =
    current.source.kind === 'github' && !record?.edited
      ? { owner: current.source.owner, repo: current.source.repo, ref: current.source.ref, file: current.source.path }
      : null;
  const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  const result = buildShareUrl(appUrl, settings.get(), { markdown: doc.text, repo });
  if (!result.ok) {
    toast(
      `This README is too long for a link (${Math.round(result.compressedLength / 1000)} k characters compressed). Push it to GitHub and share ?repo=owner/repo instead, or export the HTML.`,
      'error',
      { timeout: 12000 },
    );
    return false;
  }
  try {
    await navigator.clipboard.writeText(result.url);
    toast(result.kind === 'repo' ? 'Share link copied — it always shows the latest README from GitHub.' : 'Share link copied — the README travels inside the link.', 'success');
  } catch {
    window.prompt('Copy this link:', result.url);
  }
  return true;
}

export async function runExport(kind: ExportKind): Promise<void> {
  switch (kind) {
    case 'html':
      return exportHtml();
    case 'pdf':
      return printPdf();
    case 'png':
      return exportPng();
    case 'md':
      return downloadMarkdown();
    case 'copy':
      return copyMarkdown();
    case 'zip':
      return exportZip();
    case 'share':
      await copyShareLink();
  }
}
