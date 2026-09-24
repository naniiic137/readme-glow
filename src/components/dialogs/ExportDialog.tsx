import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { Icon } from '../Icon';
import { closeDialog, doc, settings, ui } from '../../app/state';
import { useStore } from '../../app/store';
import * as ex from '../../app/exporters';
import { MAX_HASH_CHARS, encodeMarkdown } from '../../lib/share';

export default function ExportDialog() {
  const s = useStore(settings, (x) => x);
  const current = useStore(ui, (x) => x.doc);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [keepBg, setKeepBg] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const tooLong = current?.source.kind !== 'github' && encodeMarkdown(doc.text).length > MAX_HASH_CHARS;

  useEffect(() => {
    if (canvas.current) void ex.renderSocialCard(canvas.current);
  }, [s.theme, s.mode, s.accent, s.background]);

  const run = async (id: string, fn: () => Promise<unknown> | unknown) => {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const localImages = current?.blobs.size ?? 0;

  return (
    <Dialog title="Export" description="Take your README anywhere. Everything is generated in your browser." size="xwide" icon="download">
      <div className="export-grid">
        <section className="export-card feature-card">
          <div className="ec-head">
            <Icon name="image" />
            <div>
              <h3>Social card</h3>
              <p>1200×630 PNG in this theme — perfect as your GitHub social preview.</p>
            </div>
          </div>
          <div className="card-preview">
            <canvas ref={canvas} width={1200} height={630} aria-label="Social card preview" role="img" />
          </div>
          <button type="button" className="btn btn-primary" disabled={busy === 'png'} onClick={() => void run('png', () => ex.exportPng(canvas.current ?? undefined))}>
            <Icon name="download" size={16} /> Download PNG
          </button>
        </section>
        <div className="export-list">
          <button type="button" className="export-card" disabled={busy === 'html'} onClick={() => void run('html', ex.exportHtml)}>
            <Icon name="fileCode" />
            <div>
              <h3>Standalone HTML</h3>
              <p>One file, this exact design, fonts and local images embedded. Works offline.</p>
            </div>
          </button>
          <div className="export-card">
            <Icon name="printer" />
            <div>
              <h3>Print or save as PDF</h3>
              <p>A clean print layout: no app chrome, good page breaks, links shown.</p>
              <label className="switch small-switch">
                <span>Keep the theme background (uses more ink)</span>
                <input type="checkbox" checked={keepBg} onChange={(e) => setKeepBg(e.target.checked)} />
              </label>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                closeDialog();
                ex.printPdf(keepBg);
              }}
            >
              Print…
            </button>
          </div>
          <button type="button" className="export-card" onClick={() => ex.downloadMarkdown()}>
            <Icon name="download" />
            <div>
              <h3>README.md</h3>
              <p>The Markdown, including every edit you made.</p>
            </div>
          </button>
          <button type="button" className="export-card" onClick={() => void ex.copyMarkdown()}>
            <Icon name="copy" />
            <div>
              <h3>Copy Markdown</h3>
              <p>Straight to the clipboard, ready to paste into GitHub.</p>
            </div>
          </button>
          <button type="button" className="export-card" disabled={busy === 'zip'} onClick={() => void run('zip', ex.exportZip)}>
            <Icon name="archive" />
            <div>
              <h3>.zip with images</h3>
              <p>{localImages ? `README.md plus ${localImages} local image${localImages === 1 ? '' : 's'} in images/, paths rewritten.` : 'README.md plus any images you dropped or pasted, in images/.'}</p>
            </div>
          </button>
          <button type="button" className="export-card" onClick={() => void ex.copyShareLink()}>
            <Icon name="share" />
            <div>
              <h3>Copy share link</h3>
              <p>
                {current?.source.kind === 'github'
                  ? 'Links to the repository, so it always shows the latest README in this look.'
                  : tooLong
                    ? 'Too long to fit in a link. Share it from GitHub (?repo=owner/repo) or export HTML instead.'
                    : 'The README is compressed into the link itself — nothing is uploaded.'}
              </p>
            </div>
          </button>
        </div>
      </div>
    </Dialog>
  );
}
