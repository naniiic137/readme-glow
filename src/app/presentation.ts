import { useSyncExternalStore } from 'react';
import { getTheme, resolveMode, themeVars } from '../themes/registry';
import type { Mode, ThemeDef } from '../themes/types';
import { WIDTHS, type Settings, type LayoutId } from '../lib/settings';

const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const motionQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      darkQuery?.addEventListener('change', cb);
      return () => darkQuery?.removeEventListener('change', cb);
    },
    () => darkQuery?.matches ?? true,
    () => true,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      motionQuery?.addEventListener('change', cb);
      return () => motionQuery?.removeEventListener('change', cb);
    },
    () => motionQuery?.matches ?? false,
    () => false,
  );
}

export function prefersReducedMotion(): boolean {
  return motionQuery?.matches ?? false;
}

export interface Presentation {
  theme: ThemeDef;
  mode: Mode;
  layout: LayoutId;
  className: string;
  style: Record<string, string>;
}

/** Classes and CSS variables for a `.rg-doc` element. */
export function presentation(s: Settings, prefersDark: boolean, extra: { layout?: LayoutId; inPane?: boolean; reduceMotion?: boolean } = {}): Presentation {
  const theme = getTheme(s.theme);
  const mode = resolveMode(theme, s.mode, prefersDark);
  const layout = extra.layout ?? s.layout;
  const measure = WIDTHS[s.width];
  const style = themeVars(theme, mode, { accent: s.accent, codeTheme: s.codeTheme, fontScale: s.fontScale, measure });
  const className = [
    'rg-doc',
    `t-${theme.id}`,
    `mode-${mode}`,
    `layout-${layout}`,
    `hs-${s.headingStyle}`,
    `bg-${s.background}`,
    s.lineNumbers ? 'lines-on' : '',
    s.reveal && !extra.reduceMotion && layout !== 'slides' ? 'reveal-on' : '',
    extra.inPane ? 'in-pane' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { theme, mode, layout, className, style };
}

/** Section grouping each layout needs from the pipeline. */
export function sectionMode(layout: LayoutId): 'flat' | 'sections' | 'slides' {
  if (layout === 'slides') return 'slides';
  if (layout === 'document') return 'flat';
  return 'sections';
}
