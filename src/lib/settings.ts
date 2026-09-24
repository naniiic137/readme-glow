import { THEME_IDS, type ThemeId } from '../themes/types';
import type { ModePreference } from '../themes/registry';

export const LAYOUTS = ['document', 'docs', 'landing', 'slides', 'magazine'] as const;
export type LayoutId = (typeof LAYOUTS)[number];

export const LAYOUT_INFO: Record<LayoutId, { name: string; description: string }> = {
  document: { name: 'Document', description: 'A classic, beautifully set article' },
  docs: { name: 'Docs', description: 'Sticky contents sidebar with scroll-spy' },
  landing: { name: 'Landing', description: 'A hero from your title, sections as cards' },
  slides: { name: 'Slides', description: 'One slide per section — present it' },
  magazine: { name: 'Magazine', description: 'Editorial columns and big type' },
};

export const WIDTHS = { narrow: 640, normal: null, wide: 1000, full: 1400 } as const;
export type WidthId = keyof typeof WIDTHS;
export const HEADING_STYLES = ['theme', 'plain', 'underline', 'bar', 'numbered', 'caps'] as const;
export type HeadingStyle = (typeof HEADING_STYLES)[number];
export const BACKGROUNDS = ['theme', 'none', 'grain', 'gradient', 'particles'] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number];
export const MODES = ['default', 'light', 'dark', 'system'] as const;
export const DIRS = ['auto', 'ltr', 'rtl'] as const;
export type DirId = (typeof DIRS)[number];
export const VIEWS = ['preview', 'split', 'editor'] as const;
export type ViewId = (typeof VIEWS)[number];
export const EDITOR_THEMES = ['match', 'light', 'dark'] as const;
export type EditorTheme = (typeof EDITOR_THEMES)[number];

export interface Settings {
  theme: ThemeId;
  mode: ModePreference;
  layout: LayoutId;
  /** Hex accent override, or null for the theme's own. */
  accent: string | null;
  /** 0.85 – 1.3 */
  fontScale: number;
  width: WidthId;
  headingStyle: HeadingStyle;
  /** 'theme' or a code theme id. */
  codeTheme: string;
  lineNumbers: boolean;
  background: BackgroundId;
  reveal: boolean;
  dir: DirId;
  // editor
  view: ViewId;
  splitRatio: number;
  syncScroll: boolean;
  wrap: boolean;
  editorTheme: EditorTheme;
  editorLineNumbers: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'aurora',
  mode: 'default',
  layout: 'document',
  accent: null,
  fontScale: 1,
  width: 'normal',
  headingStyle: 'theme',
  codeTheme: 'theme',
  lineNumbers: false,
  background: 'theme',
  reveal: true,
  dir: 'auto',
  view: 'preview',
  splitRatio: 0.5,
  syncScroll: true,
  wrap: true,
  editorTheme: 'match',
  editorLineNumbers: true,
};

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === '1' || value === 'true' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'off') return false;
  return fallback;
}

export function normaliseAccent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  if (/^[0-9a-f]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  return null;
}

/** Validates an untrusted object (localStorage, URL) into complete Settings. */
export function sanitiseSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    theme: oneOf(THEME_IDS, o.theme, base.theme),
    mode: oneOf(MODES, o.mode, base.mode),
    layout: oneOf(LAYOUTS, o.layout, base.layout),
    accent: 'accent' in o ? normaliseAccent(o.accent) : base.accent,
    fontScale: Math.round(clamp(o.fontScale, 0.85, 1.3, base.fontScale) * 100) / 100,
    width: oneOf(Object.keys(WIDTHS) as WidthId[], o.width, base.width),
    headingStyle: oneOf(HEADING_STYLES, o.headingStyle, base.headingStyle),
    codeTheme: typeof o.codeTheme === 'string' && /^[a-z0-9-]{1,32}$/.test(o.codeTheme) ? o.codeTheme : base.codeTheme,
    lineNumbers: bool(o.lineNumbers, base.lineNumbers),
    background: oneOf(BACKGROUNDS, o.background, base.background),
    reveal: bool(o.reveal, base.reveal),
    dir: oneOf(DIRS, o.dir, base.dir),
    view: oneOf(VIEWS, o.view, base.view),
    splitRatio: clamp(o.splitRatio, 0.2, 0.8, base.splitRatio),
    syncScroll: bool(o.syncScroll, base.syncScroll),
    wrap: bool(o.wrap, base.wrap),
    editorTheme: oneOf(EDITOR_THEMES, o.editorTheme, base.editorTheme),
    editorLineNumbers: bool(o.editorLineNumbers, base.editorLineNumbers),
  };
}

const STORAGE_KEY = 'readme-glow:settings:v1';

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeLocalStorage()): Settings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitiseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings, storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Short URL parameter names for the look settings (what a share link carries). */
const PARAMS: Array<[keyof Settings, string]> = [
  ['theme', 'theme'],
  ['mode', 'mode'],
  ['layout', 'layout'],
  ['accent', 'accent'],
  ['fontScale', 'font'],
  ['width', 'width'],
  ['headingStyle', 'headings'],
  ['codeTheme', 'code'],
  ['lineNumbers', 'lines'],
  ['background', 'bg'],
  ['reveal', 'reveal'],
  ['dir', 'dir'],
];

/** Look settings that differ from the defaults, as URL parameters. */
export function settingsToParams(settings: Settings, params = new URLSearchParams()): URLSearchParams {
  for (const [key, name] of PARAMS) {
    const value = settings[key];
    // The theme and layout are always written so a link opens exactly as shared.
    if (key !== 'theme' && key !== 'layout' && value === DEFAULT_SETTINGS[key]) continue;
    if (value === null) continue;
    params.set(name, typeof value === 'boolean' ? (value ? '1' : '0') : key === 'accent' ? String(value).replace('#', '') : String(value));
  }
  return params;
}

/** Look settings found in URL parameters, merged over `base`. Unknown values are ignored. */
export function settingsFromParams(params: URLSearchParams, base: Settings): Settings {
  const partial: Record<string, unknown> = {};
  let found = false;
  for (const [key, name] of PARAMS) {
    const v = params.get(name);
    if (v !== null) {
      partial[key] = v;
      found = true;
    }
  }
  if (!found) return base;
  const merged = sanitiseSettings({ ...base, ...partial }, base);
  if (params.has('accent') && !normaliseAccent(params.get('accent'))) merged.accent = base.accent;
  return merged;
}
