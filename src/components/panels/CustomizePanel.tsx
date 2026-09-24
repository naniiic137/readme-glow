import { useEffect, useState } from 'react';
import { Drawer } from './Drawer';
import { Icon } from '../Icon';
import { ThemedDoc } from '../ThemedDoc';
import { useStore } from '../../app/store';
import { setSettings, settings, ui } from '../../app/state';
import { THEMES, availableModes, getTheme, tokensFor } from '../../themes/registry';
import { CODE_THEMES } from '../../themes/codeThemes';
import { BACKGROUNDS, DEFAULT_SETTINGS, HEADING_STYLES, LAYOUTS, LAYOUT_INFO, type LayoutId } from '../../lib/settings';
import { loadPipeline } from '../../app/useRender';
import type { Root } from 'hast';

const ACCENTS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#65a30d', '#d97706', '#ea580c', '#dc2626', '#db2777', '#9333ea', '#0f172a'];
const LAYOUT_ICON: Record<LayoutId, string> = { document: 'file', docs: 'panelLeft', landing: 'rocket', slides: 'presentation', magazine: 'newspaper' };
const BG_LABEL: Record<string, string> = { theme: 'Theme', none: 'None', grain: 'Grain', gradient: 'Glow', particles: 'Particles' };
const HS_LABEL: Record<string, string> = { theme: 'Theme default', plain: 'Plain', underline: 'Underlined', bar: 'Accent bar', numbered: 'Numbered', caps: 'Small caps' };

export default function CustomizePanel() {
  const s = useStore(settings, (x) => x);
  const render = useStore(ui, (x) => x.render);
  const [thumbHtml, setThumbHtml] = useState<string | null>(null);
  const theme = getTheme(s.theme);
  const modes = availableModes(theme);

  // Thumbnails show the top of *your* README in each theme.
  useEffect(() => {
    if (!render) return;
    let alive = true;
    void loadPipeline().then(({ htmlFor }) => {
      const children = render.tree.children.filter((c) => c.type === 'element').slice(0, 10);
      if (alive) setThumbHtml(htmlFor({ type: 'root', children } as Root, 'flat'));
    });
    return () => {
      alive = false;
    };
  }, [render]);

  return (
    <Drawer title="Customise" label="Customise the look">
      <p className="section-title">Theme</p>
      <div className="theme-gallery" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => {
          const tk = tokensFor(t, t.defaultMode);
          return (
            <button key={t.id} type="button" role="radio" aria-checked={s.theme === t.id} className={`gallery-card${s.theme === t.id ? ' is-on' : ''}`} onClick={() => setSettings({ theme: t.id })}>
              <span className="gallery-shot">
                {thumbHtml ? <ThemedDoc html={thumbHtml} themeId={t.id} width={860} scale={0.2} height={112} /> : <span className="gallery-swatch" style={{ background: `linear-gradient(135deg, ${tk.bg} 50%, ${tk.accent} 50%)` }} />}
              </span>
              <span className="gallery-name">{t.name}</span>
            </button>
          );
        })}
      </div>
      <p className="theme-tagline">
        <strong>{theme.name}</strong> — {theme.tagline}
      </p>

      <p className="section-title">Variant</p>
      <div className="seg full" role="group" aria-label="Light or dark variant">
        {(['default', 'light', 'dark', 'system'] as const).map((m) => {
          const disabled = (m === 'light' || m === 'dark') && !modes.includes(m);
          return (
            <button key={m} type="button" aria-pressed={s.mode === m} disabled={disabled} onClick={() => setSettings({ mode: m })} title={disabled ? `${theme.name} only comes in ${modes[0]}` : undefined}>
              {m === 'default' ? 'Theme' : m === 'system' ? 'System' : m[0]!.toUpperCase() + m.slice(1)}
            </button>
          );
        })}
      </div>

      <p className="section-title">Layout</p>
      <div className="layout-grid" role="radiogroup" aria-label="Layout">
        {LAYOUTS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={s.layout === l} className={`layout-card${s.layout === l ? ' is-on' : ''}`} onClick={() => setSettings({ layout: l })}>
            <Icon name={LAYOUT_ICON[l]} size={18} />
            <strong>{LAYOUT_INFO[l].name}</strong>
            <small>{LAYOUT_INFO[l].description}</small>
          </button>
        ))}
      </div>

      <p className="section-title">Accent colour</p>
      <div className="swatches">
        <button type="button" className={`sw sw-theme${!s.accent ? ' is-on' : ''}`} onClick={() => setSettings({ accent: null })} aria-label="Theme accent" data-tip="Theme accent">
          <span style={{ background: tokensFor(theme, theme.defaultMode).accent }} />
        </button>
        {ACCENTS.map((c) => (
          <button key={c} type="button" className={`sw${s.accent === c ? ' is-on' : ''}`} style={{ background: c }} aria-label={`Accent ${c}`} onClick={() => setSettings({ accent: c })} />
        ))}
        <label className="sw sw-custom" data-tip="Custom colour">
          <input type="color" value={s.accent ?? tokensFor(theme, theme.defaultMode).accent} onChange={(e) => setSettings({ accent: e.target.value })} aria-label="Custom accent colour" />
        </label>
      </div>

      <p className="section-title">Text</p>
      <label className="field">
        <span>
          Font size <output>{Math.round(s.fontScale * 100)}%</output>
        </span>
        <input className="range" type="range" min={0.85} max={1.3} step={0.05} value={s.fontScale} onChange={(e) => setSettings({ fontScale: Number(e.target.value) })} />
      </label>
      <div className="field">
        <span>Content width</span>
        <div className="seg full" role="group" aria-label="Content width">
          {(['narrow', 'normal', 'wide', 'full'] as const).map((w) => (
            <button key={w} type="button" aria-pressed={s.width === w} onClick={() => setSettings({ width: w })}>
              {w[0]!.toUpperCase() + w.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Headings</span>
        <select className="select" value={s.headingStyle} onChange={(e) => setSettings({ headingStyle: e.target.value as never })}>
          {HEADING_STYLES.map((h) => (
            <option key={h} value={h}>
              {HS_LABEL[h]}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Text direction</span>
        <div className="seg full" role="group" aria-label="Text direction">
          {(['auto', 'ltr', 'rtl'] as const).map((d) => (
            <button key={d} type="button" aria-pressed={s.dir === d} onClick={() => setSettings({ dir: d })}>
              {d === 'auto' ? 'Automatic' : d === 'ltr' ? 'Left to right' : 'Right to left'}
            </button>
          ))}
        </div>
      </div>

      <p className="section-title">Code</p>
      <label className="field">
        <span>Code theme</span>
        <select className="select" value={s.codeTheme} onChange={(e) => setSettings({ codeTheme: e.target.value })}>
          <option value="theme">Match the page theme</option>
          {CODE_THEMES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="switch">
        <span>Line numbers in code blocks</span>
        <input type="checkbox" checked={s.lineNumbers} onChange={(e) => setSettings({ lineNumbers: e.target.checked })} />
      </label>

      <p className="section-title">Background & motion</p>
      <div className="seg full" role="group" aria-label="Background effect">
        {BACKGROUNDS.map((b) => (
          <button key={b} type="button" aria-pressed={s.background === b} onClick={() => setSettings({ background: b })}>
            {BG_LABEL[b]}
          </button>
        ))}
      </div>
      <label className="switch">
        <span>Scroll-reveal animations</span>
        <input type="checkbox" checked={s.reveal} onChange={(e) => setSettings({ reveal: e.target.checked })} />
      </label>
      <p className="muted small">Animations switch off automatically when your system asks for reduced motion.</p>

      <button
        type="button"
        className="btn btn-ghost reset-look"
        onClick={() =>
          setSettings({
            mode: DEFAULT_SETTINGS.mode,
            accent: null,
            fontScale: 1,
            width: 'normal',
            headingStyle: 'theme',
            codeTheme: 'theme',
            lineNumbers: false,
            background: 'theme',
            reveal: true,
            dir: 'auto',
          })
        }
      >
        <Icon name="refresh" size={15} /> Reset to the theme’s defaults
      </button>
    </Drawer>
  );
}
