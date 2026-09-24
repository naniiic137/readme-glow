import { useMemo, useState } from 'react';
import { Dialog } from './Dialog';
import { closeDialog, doc, toast, ui } from '../../app/state';
import { useStore } from '../../app/store';
import { sync } from '../../app/sync';
import { BADGE_COLORS, BADGE_PRESETS, badgeMarkdown, repoBadges, shieldsUrl, type BadgeSpec, type BadgeStyle } from '../../lib/editor/badge';

const STYLES: BadgeStyle[] = ['flat', 'flat-square', 'for-the-badge', 'plastic', 'social'];

function insertInline(md: string) {
  closeDialog();
  setTimeout(() => {
    if (sync.editor) sync.editor.insertInline(md);
    else doc.commit(`${doc.text.replace(/\s*$/, '')}\n\n${md}\n`, { origin: 'insert' });
    toast('Badge inserted.', 'success');
  }, 40);
}

/** shields.io badge builder with popular presets and repository badges. */
export default function BadgeBuilderDialog() {
  const current = useStore(ui, (s) => s.doc);
  const [spec, setSpec] = useState<BadgeSpec>({ label: 'build', message: 'passing', color: '22c55e', style: 'flat' });
  const url = useMemo(() => shieldsUrl(spec), [spec]);
  const md = badgeMarkdown(spec);
  const repo = current?.source.kind === 'github' ? current.source : null;
  const set = (patch: Partial<BadgeSpec>) => setSpec((s) => ({ ...s, ...patch }));

  return (
    <Dialog
      title="Badge builder"
      description="Make shields.io badges without remembering the URL format."
      icon="badge"
      size="wide"
      footer={
        <>
          <code className="spacer badge-md">{md}</code>
          <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(md).then(() => toast('Badge Markdown copied.', 'success'))}>
            Copy
          </button>
          <button type="button" className="btn btn-primary" onClick={() => insertInline(md)} disabled={!spec.message.trim()}>
            Insert badge
          </button>
        </>
      }
    >
      <div className="badge-builder">
        <div className="bb-form">
          <label className="field">
            <span>Label</span>
            <input className="input" value={spec.label} onChange={(e) => set({ label: e.target.value })} />
          </label>
          <label className="field">
            <span>Message</span>
            <input className="input" value={spec.message} onChange={(e) => set({ message: e.target.value })} />
          </label>
          <div className="field">
            <span>Colour</span>
            <div className="swatches">
              {BADGE_COLORS.map((c) => (
                <button key={c.hex} type="button" className={`sw${spec.color === c.hex ? ' is-on' : ''}`} style={{ background: `#${c.hex}` }} aria-label={c.name} onClick={() => set({ color: c.hex })} />
              ))}
              <input className="input hex" value={spec.color} onChange={(e) => set({ color: e.target.value.replace('#', '') })} aria-label="Colour (hex or name)" />
            </div>
          </div>
          <label className="field">
            <span>Logo (Simple Icons name, optional)</span>
            <input className="input" value={spec.logo ?? ''} placeholder="react, typescript, github…" onChange={(e) => set({ logo: e.target.value || undefined })} />
          </label>
          <label className="field">
            <span>Style</span>
            <select className="select" value={spec.style ?? 'flat'} onChange={(e) => set({ style: e.target.value as BadgeStyle })}>
              {STYLES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Link (optional)</span>
            <input className="input" value={spec.link ?? ''} placeholder="https://…" onChange={(e) => set({ link: e.target.value || undefined })} />
          </label>
        </div>
        <div className="bb-side">
          <div className="bb-preview" aria-label="Preview">
            <img src={url} alt={`${spec.label}: ${spec.message}`} />
          </div>
          <p className="section-title">Popular</p>
          <div className="bb-presets">
            {BADGE_PRESETS.map((p) => (
              <button key={p.name} type="button" className="bb-preset" onClick={() => setSpec(p.spec)} aria-label={`Use the ${p.name} badge`}>
                <img src={shieldsUrl(p.spec)} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          {repo && (
            <>
              <p className="section-title">For {repo.owner}/{repo.repo}</p>
              <div className="bb-repo">
                {repoBadges(repo.owner, repo.repo).map((b) => (
                  <button key={b.name} type="button" className="chip" onClick={() => insertInline(b.markdown)}>
                    {b.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
