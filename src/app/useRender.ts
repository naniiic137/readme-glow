import { useEffect, useRef, useState } from 'react';
import type { RenderOutput } from '../lib/markdown/pipeline';
import type { UrlResolver } from '../lib/markdown/types';

let pipeline: Promise<typeof import('../lib/markdown/pipeline')> | null = null;
export function loadPipeline() {
  pipeline ??= import('../lib/markdown/pipeline');
  return pipeline;
}

/**
 * Renders Markdown off the React render path, debounced while typing.
 * Keeps showing the previous result until the new one is ready (no flicker).
 */
export function useRender(markdown: string | null, resolve: UrlResolver | undefined, key: unknown = null): { result: RenderOutput | null; pending: boolean; error: string | null } {
  const [state, setState] = useState<{ result: RenderOutput | null; pending: boolean; error: string | null }>({ result: null, pending: markdown !== null, error: null });
  const first = useRef(true);
  useEffect(() => {
    if (markdown === null) return;
    let cancelled = false;
    setState((s) => (s.pending ? s : { ...s, pending: true }));
    const delay = first.current ? 0 : Math.min(400, 90 + markdown.length / 400);
    first.current = false;
    const t = setTimeout(async () => {
      try {
        const { renderMarkdown } = await loadPipeline();
        const result = await renderMarkdown(markdown, { resolve });
        if (!cancelled) setState({ result, pending: false, error: null });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, pending: false, error: (err as Error).message || 'Rendering failed' }));
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `resolve` identity is tied to `key` (document + asset version).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, key]);
  return state;
}
