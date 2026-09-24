import { githubResolver } from '../github';
import { localResolver } from '../localFiles';
import type { UrlResolver } from './types';

/**
 * A serialisable description of how to resolve relative URLs, so rendering
 * can happen in a Web Worker (functions can't cross the worker boundary).
 */
export type ResolverConfig =
  | { kind: 'github'; owner: string; repo: string; ref: string; path: string }
  | { kind: 'local'; assets: Array<[string, string]>; baseDir: string; fallbackBase?: string }
  | { kind: 'none' };

export function buildResolver(config: ResolverConfig): UrlResolver | undefined {
  switch (config.kind) {
    case 'github':
      return githubResolver(config);
    case 'local':
      return localResolver(new Map(config.assets), config.baseDir, config.fallbackBase);
    default:
      return undefined;
  }
}
