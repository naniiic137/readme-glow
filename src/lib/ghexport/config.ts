import { THEME_IDS, type ThemeId } from '../../themes/types';
import { LAYOUTS, MODES, normaliseAccent, type LayoutId, type Settings } from '../settings';

/**
 * "The theme travels with the README": an invisible HTML comment at the top of
 * an exported README, e.g.
 *   <!-- readmeglow theme="aurora" layout="landing" accent="#7c5cff" -->
 * GitHub and ReadmeGlow's renderer both drop HTML comments, so it never shows.
 * When ReadmeGlow opens the README it uses the author's look by default.
 */
export interface ReadmeConfig {
  theme?: ThemeId;
  layout?: LayoutId;
  accent?: string;
  mode?: Settings['mode'];
}

// Only at the very top of the file (after blank lines), so a README that talks
// about the syntax in a code block is never misread.
// One line, and "readmeglow" followed by a space: never the export's "readmeglow:begin" markers.
const COMMENT = /^(?:[ \t]*\r?\n)*[ \t]*<!--\s*readmeglow(\s[^>\r\n]*?)?\s*-->[ \t]*(?:\r?\n)?/i;
const ATTR = /([a-z-]+)\s*=\s*"([^"]*)"/gi;

function withoutBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Reads the config comment (only from the very top of the file). */
export function readConfig(markdown: string): ReadmeConfig | null {
  const m = COMMENT.exec(withoutBom(markdown));
  if (!m) return null;
  const out: ReadmeConfig = {};
  for (const [, key, value] of (m[1] ?? '').matchAll(ATTR)) {
    const v = value!.trim();
    switch (key!.toLowerCase()) {
      case 'theme':
        if ((THEME_IDS as readonly string[]).includes(v)) out.theme = v as ThemeId;
        break;
      case 'layout':
        if ((LAYOUTS as readonly string[]).includes(v)) out.layout = v as LayoutId;
        break;
      case 'accent': {
        const a = normaliseAccent(v);
        if (a) out.accent = a;
        break;
      }
      case 'mode':
        if ((MODES as readonly string[]).includes(v)) out.mode = v as Settings['mode'];
        break;
      default:
        break;
    }
  }
  return Object.keys(out).length ? out : null;
}

export function formatConfig(config: ReadmeConfig): string {
  const parts: string[] = [];
  if (config.theme) parts.push(`theme="${config.theme}"`);
  if (config.layout) parts.push(`layout="${config.layout}"`);
  if (config.accent) parts.push(`accent="${config.accent}"`);
  if (config.mode && config.mode !== 'default') parts.push(`mode="${config.mode}"`);
  return `<!-- readmeglow ${parts.join(' ')} -->`;
}

/** Removes the config comment, if any. */
export function stripConfig(markdown: string): string {
  const text = withoutBom(markdown);
  return COMMENT.test(text) ? text.replace(COMMENT, '') : markdown;
}

/** Adds (or replaces) the config comment at the very top. Idempotent. */
export function writeConfig(markdown: string, config: ReadmeConfig): string {
  const body = stripConfig(markdown);
  return `${formatConfig(config)}\n${body}`;
}

export function configFromSettings(s: Pick<Settings, 'theme' | 'layout' | 'accent' | 'mode'>): ReadmeConfig {
  return { theme: s.theme, layout: s.layout, accent: s.accent ?? undefined, mode: s.mode };
}

/**
 * Settings to apply for a README with a config comment: URL parameters win,
 * then the README's own config, then whatever the reader had before.
 */
export function settingsFromConfig(config: ReadmeConfig | null, current: Settings, locked: ReadonlySet<string> = new Set()): Partial<Settings> {
  if (!config) return {};
  const patch: Partial<Settings> = {};
  if (config.theme && !locked.has('theme')) patch.theme = config.theme;
  if (config.layout && !locked.has('layout')) patch.layout = config.layout;
  if (!locked.has('accent')) {
    // A theme without an accent means "the theme's own accent".
    if (config.accent) patch.accent = config.accent;
    else if (config.theme) patch.accent = null;
  }
  if (config.mode && !locked.has('mode')) patch.mode = config.mode;
  for (const k of Object.keys(patch) as Array<keyof Settings>) {
    if (patch[k] === current[k]) delete patch[k];
  }
  return patch;
}
