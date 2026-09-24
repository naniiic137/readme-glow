import { memo, useEffect, useState, type CSSProperties } from 'react';
import { ensureTheme } from '../app/themeStyles';
import { presentation } from '../app/presentation';
import { DEFAULT_SETTINGS, type Settings } from '../lib/settings';
import { getTheme } from '../themes/registry';

/**
 * A static, non-interactive rendering of a document in a theme, used for
 * gallery thumbnails and the landing page carousel.
 */
export const ThemedDoc = memo(function ThemedDoc({
  html,
  themeId,
  mode = 'default',
  width = 1000,
  scale = 0.3,
  height,
  label,
}: {
  html: string;
  themeId: string;
  mode?: Settings['mode'];
  width?: number;
  scale?: number;
  height: number;
  label?: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void ensureTheme(getTheme(themeId)).then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [themeId]);
  const p = presentation({ ...DEFAULT_SETTINGS, theme: getTheme(themeId).id, mode, reveal: false }, true, { layout: 'document' });
  const outer: CSSProperties = { width: width * scale, height, overflow: 'hidden', position: 'relative' };
  const inner: CSSProperties = {
    ...(p.style as CSSProperties),
    width,
    height: height / scale,
    transform: `scale(${scale})`,
    transformOrigin: '0 0',
    ['--rg-viewport' as string]: `${height / scale}px`,
    opacity: ready ? 1 : 0,
    transition: 'opacity .3s ease',
  };
  return (
    <div className="rg-thumb" style={outer} role="img" aria-label={label ?? `${getTheme(themeId).name} preview`}>
      <div className={`${p.className} is-thumb`} style={inner} aria-hidden="true" {...({ inert: '' } as object)}>
        <div className="rg-backdrop">
          <div className="rg-backdrop-inner" />
        </div>
        <div className="rg-frame">
          <article className="rg-body markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
});
