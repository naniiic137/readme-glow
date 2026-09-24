/// <reference lib="webworker" />
import { renderMarkdown } from './pipeline';
import { buildResolver, type ResolverConfig } from './resolvers';

/**
 * Renders Markdown off the main thread, so typing in the editor stays smooth
 * even for very long READMEs. Messages: { id, markdown, resolver } → { id, result } | { id, error }.
 */
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<{ id: number; markdown: string; resolver: ResolverConfig }>) => {
  const { id, markdown, resolver } = event.data;
  try {
    const result = await renderMarkdown(markdown, { resolve: buildResolver(resolver) });
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: (err as Error)?.message ?? 'Rendering failed' });
  }
};
