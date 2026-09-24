import { useEffect, useRef, useState } from 'react';
import type { RenderOutput } from '../lib/markdown/pipeline';
import type { ResolverConfig } from '../lib/markdown/resolvers';

let pipeline: Promise<typeof import('../lib/markdown/pipeline')> | null = null;
export function loadPipeline() {
  pipeline ??= import('../lib/markdown/pipeline');
  return pipeline;
}

let katexCss: Promise<unknown> | null = null;
function ensureKatexCss(): void {
  katexCss ??= import('katex/dist/katex.min.css');
}

// ------------------------------------------------------------------ worker

type Pending = { resolve: (r: RenderOutput) => void; reject: (e: Error) => void };
let worker: Worker | null = null;
let workerBroken = typeof Worker === 'undefined';
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../lib/markdown/worker.ts', import.meta.url), { type: 'module', name: 'readme-glow-render' });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: RenderOutput; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.result) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error ?? 'Rendering failed'));
    };
    worker.onerror = () => {
      // The worker could not start (old browser, blocked): render on the main thread from now on.
      workerBroken = true;
      worker?.terminate();
      worker = null;
      for (const [id, p] of pending) {
        pending.delete(id);
        p.reject(new Error('worker-failed'));
      }
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

async function renderOnMain(markdown: string, config: ResolverConfig): Promise<RenderOutput> {
  const [{ renderMarkdown }, { buildResolver }] = await Promise.all([loadPipeline(), import('../lib/markdown/resolvers')]);
  return renderMarkdown(markdown, { resolve: buildResolver(config) });
}

/** Renders Markdown in a Web Worker when possible, falling back to the main thread. */
export async function renderInBackground(markdown: string, config: ResolverConfig): Promise<RenderOutput> {
  const w = getWorker();
  if (!w) return renderOnMain(markdown, config);
  const id = ++nextId;
  try {
    return await new Promise<RenderOutput>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, markdown, resolver: config });
    });
  } catch (err) {
    if ((err as Error).message === 'worker-failed') return renderOnMain(markdown, config);
    throw err;
  }
}

/**
 * Renders Markdown off the React render path, debounced while typing.
 * Keeps showing the previous result until the new one is ready (no flicker).
 */
export function useRender(markdown: string | null, config: ResolverConfig, key: unknown = null): { result: RenderOutput | null; pending: boolean; error: string | null } {
  const [state, setState] = useState<{ result: RenderOutput | null; pending: boolean; error: string | null }>({ result: null, pending: markdown !== null, error: null });
  const first = useRef(true);
  const latest = useRef(0);
  useEffect(() => {
    if (markdown === null) return;
    let cancelled = false;
    const ticket = ++latest.current;
    setState((s) => (s.pending ? s : { ...s, pending: true }));
    const delay = first.current ? 0 : Math.min(260, 70 + markdown.length / 800);
    first.current = false;
    const t = setTimeout(async () => {
      try {
        const result = await renderInBackground(markdown, config);
        if (result.features.math) ensureKatexCss();
        if (!cancelled && ticket === latest.current) setState({ result, pending: false, error: null });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, pending: false, error: (err as Error).message || 'Rendering failed' }));
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `config` identity is tied to `key` (document + asset version).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, key]);
  return state;
}
