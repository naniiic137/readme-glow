import { useEffect, useState } from 'react';
import { ThemedDoc } from './ThemedDoc';
import { THEMES } from '../themes/registry';
import { SHOWCASE } from '../samples';
import { loadPipeline } from '../app/useRender';
import { openSample } from '../app/actions';
import { setSettings } from '../app/state';
import { localResolver } from '../lib/localFiles';
import type { ThemeId } from '../themes/types';

const ORDER: ThemeId[] = ['aurora', 'editorial', 'pixel', 'synthwave', 'terminal', 'blueprint', 'notebook', 'swiss', 'midnight', 'brutalist', 'zen', 'manuscript', 'frost', 'comic', 'github'];

let showcaseHtml: Promise<string> | null = null;
export function showcaseMarkup(): Promise<string> {
  showcaseHtml ??= loadPipeline().then(({ renderMarkdown }) =>
    renderMarkdown(SHOWCASE.markdown, { resolve: localResolver(new Map(), '', `${import.meta.env.BASE_URL}${SHOWCASE.assetBase}`) }).then((r) => r.html),
  );
  return showcaseHtml;
}

/** The landing page carousel: the same README in every theme, gently drifting. */
export function ThemeCarousel() {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void showcaseMarkup().then((h) => alive && setHtml(h));
    return () => {
      alive = false;
    };
  }, []);

  const themes = ORDER.map((id) => THEMES.find((t) => t.id === id)!).filter(Boolean);
  const open = (id: ThemeId) => {
    setSettings({ theme: id, layout: 'document', mode: 'default' });
    void openSample('nebula');
  };

  return (
    <div className="carousel" role="region" aria-label="Theme previews">
      <ul className="carousel-track">
        {[...themes, ...themes].map((t, i) => {
          const clone = i >= themes.length;
          return (
            <li key={`${t.id}-${i}`} className="carousel-item" aria-hidden={clone || undefined}>
              <button type="button" className="theme-card" onClick={() => open(t.id)} tabIndex={clone ? -1 : 0} aria-label={`Open a sample in the ${t.name} theme`}>
                <div className="theme-card-shot">{html ? <ThemedDoc html={html} themeId={t.id} height={250} scale={0.34} width={920} /> : <div className="shot-skeleton" />}</div>
                <div className="theme-card-meta">
                  <strong>{t.name}</strong>
                  <span>{t.tagline}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
