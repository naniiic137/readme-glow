import type { Font } from 'opentype.js';
import { getTheme } from '../../themes/registry';
import type { ThemeId } from '../../themes/types';
import { emojiTable } from '../markdown/emoji';
import { GH_FONTS, type FontRef } from './fonts';
import { FONT_URLS } from './fontUrls';
import { createRenderer } from './renderer';
import { exportForGitHub, type GhExportOptions, type GhExportResult } from './transform';

export { DEFAULT_GH_OPTIONS, type GhExportOptions, type GhExportResult, type GhAsset } from './transform';
export { isExported, unexport } from './markers';
export { readConfig, writeConfig, stripConfig, configFromSettings, settingsFromConfig } from './config';

const fontCache = new Map<string, Promise<Font>>();

/** Fetches and parses one export font (cached; only ever fetched when exporting). */
export function loadFont(ref: FontRef): Promise<Font> {
  const key = `${ref.pkg}/${ref.file}`;
  let p = fontCache.get(key);
  if (!p) {
    p = (async () => {
      const url = FONT_URLS[key];
      if (!url) throw new Error(`No export font for ${key}`);
      const [{ parse }, buffer] = await Promise.all([
        import('opentype.js'),
        fetch(url).then((r) => {
          if (!r.ok) throw new Error(`Font request failed (${r.status})`);
          return r.arrayBuffer();
        }),
      ]);
      return parse(buffer);
    })();
    p.catch(() => fontCache.delete(key));
    fontCache.set(key, p);
  }
  return p;
}

export interface GitHubExportRequest {
  markdown: string;
  theme: ThemeId;
  accent: string | null;
  animate: boolean;
  options: Omit<GhExportOptions, 'emoji'>;
}

export async function buildGitHubExport(req: GitHubExportRequest): Promise<GhExportResult> {
  const theme = getTheme(req.theme);
  const refs = GH_FONTS[theme.id];
  const [heading, body, emoji] = await Promise.all([loadFont(refs.heading), loadFont(refs.body), emojiTable()]);
  const renderer = createRenderer(theme, req.accent, { heading, body }, req.animate);
  return exportForGitHub(req.markdown, { ...req.options, emoji }, renderer);
}
