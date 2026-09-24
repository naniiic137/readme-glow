/**
 * shields.io badge builder for the "Insert badge" dialog, plus the
 * "View with ReadmeGlow" badge people can put in their own READMEs.
 */

export type BadgeStyle = 'flat' | 'flat-square' | 'for-the-badge' | 'plastic' | 'social';

export interface BadgeSpec {
  label: string;
  message: string;
  /** Hex without # (a leading # is tolerated) or a shields colour name. */
  color: string;
  /** simple-icons slug, e.g. "react" or "nodedotjs". */
  logo?: string;
  logoColor?: string;
  style?: BadgeStyle;
  link?: string;
}

export const DEFAULT_APP_URL = 'https://naniiic137.github.io/readme-glow/';
export const READMEGLOW_SHIELDS_URL =
  'https://img.shields.io/badge/View%20with-ReadmeGlow-8B5CF6?style=for-the-badge&logo=markdown&logoColor=white';
const READMEGLOW_ALT = 'View with ReadmeGlow';

/** Percent-encodes the characters encodeURIComponent leaves alone but Markdown or shields care about. */
function encodeExtra(value: string): string {
  return value.replace(/[()'!*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** One label/message segment of a shields static badge path. */
function shieldsSegment(text: string): string {
  // Shields reads "-" as a separator and "_" as a space: "--" and "__" are the literal forms.
  return encodeExtra(encodeURIComponent(text.replace(/-/g, '--').replace(/_/g, '__')));
}

function cleanColor(color: string): string {
  return encodeExtra(encodeURIComponent(color.trim().replace(/^#/, '')));
}

export function shieldsUrl(spec: BadgeSpec): string {
  let label = spec.label.trim();
  let message = spec.message.trim();
  if (!message) {
    message = label || 'badge';
    label = '';
  }
  const color = cleanColor(spec.color) || 'blue';
  const path = label ? `${shieldsSegment(label)}-${shieldsSegment(message)}-${color}` : `${shieldsSegment(message)}-${color}`;
  const params: string[] = [];
  const logo = spec.logo?.trim();
  if (logo) params.push(`logo=${encodeURIComponent(logo)}`);
  const logoColor = spec.logoColor ? cleanColor(spec.logoColor) : '';
  if (logoColor) params.push(`logoColor=${logoColor}`);
  if (spec.style) params.push(`style=${spec.style}`);
  return `https://img.shields.io/badge/${path}${params.length ? `?${params.join('&')}` : ''}`;
}

function altText(spec: BadgeSpec): string {
  const label = spec.label.trim();
  const message = spec.message.trim();
  if (label && message) return `${label}: ${message}`;
  return message || label || 'badge';
}

function escapeMarkdownText(text: string): string {
  return text.replace(/[\\[\]]/g, (c) => `\\${c}`);
}

/** A URL that is safe as a Markdown link destination (no spaces, parentheses or angle brackets). */
function markdownUrl(url: string): string {
  return url.trim().replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function badgeMarkdown(spec: BadgeSpec): string {
  const image = `![${escapeMarkdownText(altText(spec))}](${shieldsUrl(spec)})`;
  const link = spec.link?.trim();
  return link ? `[${image}](${markdownUrl(link)})` : image;
}

export function badgeHtml(spec: BadgeSpec): string {
  const image = `<img alt="${escapeAttr(altText(spec))}" src="${escapeAttr(shieldsUrl(spec))}">`;
  const link = spec.link?.trim();
  return link ? `<a href="${escapeAttr(link)}">${image}</a>` : image;
}

function tech(name: string, color: string, logo: string, logoColor = 'white'): { name: string; spec: BadgeSpec } {
  return { name, spec: { label: '', message: name, color, logo, logoColor, style: 'for-the-badge' } };
}

/** Popular technology badges (simple-icons slugs and brand colours). */
export const BADGE_PRESETS: Array<{ name: string; spec: BadgeSpec }> = [
  tech('React', '20232A', 'react', '61DAFB'),
  tech('TypeScript', '3178C6', 'typescript'),
  tech('JavaScript', 'F7DF1E', 'javascript', '000000'),
  tech('Node.js', '5FA04E', 'nodedotjs'),
  tech('Python', '3776AB', 'python'),
  tech('Rust', '000000', 'rust'),
  tech('Go', '00ADD8', 'go'),
  tech('Java', 'ED8B00', 'openjdk'),
  tech('Kotlin', '7F52FF', 'kotlin'),
  tech('Swift', 'F05138', 'swift'),
  tech('C#', '512BD4', 'dotnet'),
  tech('C++', '00599C', 'cplusplus'),
  tech('PHP', '777BB4', 'php'),
  tech('Vue.js', '4FC08D', 'vuedotjs'),
  tech('Svelte', 'FF3E00', 'svelte'),
  tech('Next.js', '000000', 'nextdotjs'),
  tech('Tailwind CSS', '06B6D4', 'tailwindcss'),
  tech('Vite', '646CFF', 'vite'),
  tech('Docker', '2496ED', 'docker'),
  tech('PostgreSQL', '4169E1', 'postgresql'),
  tech('MongoDB', '47A248', 'mongodb'),
  tech('Firebase', 'FFCA28', 'firebase', '000000'),
  tech('Godot', '478CBF', 'godotengine'),
  tech('Unity', '000000', 'unity'),
];

/** shields' named colours plus a few modern accents. `hex` has no leading #. */
export const BADGE_COLORS: Array<{ name: string; hex: string }> = [
  { name: 'Bright green', hex: '44CC11' },
  { name: 'Green', hex: '97CA00' },
  { name: 'Yellow green', hex: 'A4A61D' },
  { name: 'Yellow', hex: 'DFB317' },
  { name: 'Orange', hex: 'FE7D37' },
  { name: 'Red', hex: 'E05D44' },
  { name: 'Blue', hex: '007EC6' },
  { name: 'Light grey', hex: '9F9F9F' },
  { name: 'Violet', hex: '8B5CF6' },
  { name: 'Pink', hex: 'EC4899' },
  { name: 'Teal', hex: '14B8A6' },
  { name: 'Amber', hex: 'F59E0B' },
  { name: 'Indigo', hex: '4F46E5' },
  { name: 'Slate', hex: '334155' },
  { name: 'Black', hex: '000000' },
];

/** Live GitHub badges for a repository (shields' dynamic endpoints). */
export function repoBadges(owner: string, repo: string): Array<{ name: string; markdown: string }> {
  const o = encodeURIComponent(owner.trim().replace(/^@/, ''));
  const r = encodeURIComponent(repo.trim().replace(/\.git$/, ''));
  const gh = `https://github.com/${o}/${r}`;
  const item = (name: string, path: string, link: string) => ({
    name,
    markdown: `[![${name}](https://img.shields.io/${path})](${link})`,
  });
  return [
    item('Licence', `github/license/${o}/${r}`, `${gh}/blob/HEAD/LICENSE`),
    item('Stars', `github/stars/${o}/${r}`, `${gh}/stargazers`),
    item('Forks', `github/forks/${o}/${r}`, `${gh}/forks`),
    item('Last commit', `github/last-commit/${o}/${r}`, `${gh}/commits`),
    item('Issues', `github/issues/${o}/${r}`, `${gh}/issues`),
    item('Top language', `github/languages/top/${o}/${r}`, gh),
    item('CI', `github/actions/workflow/status/${o}/${r}/ci.yml`, `${gh}/actions/workflows/ci.yml`),
  ];
}

/**
 * The "View with ReadmeGlow" badge. `url` is the badge image, `link` the page
 * it opens: `${appUrl}?repo=owner/repo&theme=…&layout=…`.
 */
export function readmeGlowBadge(opts: {
  owner: string;
  repo: string;
  theme?: string;
  layout?: string;
  appUrl?: string;
  style?: 'shields' | 'custom';
}): { url: string; link: string; markdown: string; html: string } {
  const base = (opts.appUrl?.trim() || DEFAULT_APP_URL).replace(/\/*$/, '/');
  const params = [`repo=${encodeURIComponent(opts.owner.trim())}/${encodeURIComponent(opts.repo.trim())}`];
  if (opts.theme) params.push(`theme=${encodeURIComponent(opts.theme)}`);
  if (opts.layout) params.push(`layout=${encodeURIComponent(opts.layout)}`);
  const link = `${base}?${params.join('&')}`;
  const url = opts.style === 'custom' ? `${base}badge.svg` : READMEGLOW_SHIELDS_URL;
  return {
    url,
    link,
    markdown: `[![${READMEGLOW_ALT}](${url})](${markdownUrl(link)})`,
    html: `<a href="${escapeAttr(link)}"><img alt="${READMEGLOW_ALT}" src="${escapeAttr(url)}"></a>`,
  };
}
