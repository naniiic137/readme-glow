/**
 * Badge detection. A "badge" is a small status image from one of the usual
 * badge services, or any image whose URL path ends in badge.svg.
 */
const BADGE_HOSTS = [
  'img.shields.io',
  'shields.io',
  'badgen.net',
  'badge.fury.io',
  'travis-ci.org',
  'travis-ci.com',
  'app.travis-ci.com',
  'circleci.com',
  'dl.circleci.com',
  'codecov.io',
  'coveralls.io',
  'img.badgesize.io',
  'badges.gitter.im',
  'snyk.io',
  'api.netlify.com',
  'readthedocs.org',
  'forthebadge.com',
  'visitor-badge.laobi.icu',
  'komarev.com',
  'deepsource.io',
  'app.deepsource.com',
  'sonarcloud.io',
  'api.codeclimate.com',
  'codeclimate.com',
  'static.pepy.tech',
  'pepy.tech',
  'packagephobia.com',
  'img.badgesize.io',
  'bestpractices.coreinfrastructure.org',
  'www.bestpractices.dev',
  'api.securityscorecards.dev',
  'hitcount.itsvg.in',
  'hits.seeyoufarm.com',
  'github.com/badges',
  'awesome.re',
  'cdn.rawgit.com/sindresorhus/awesome',
  'www.codefactor.io',
  'app.codacy.com',
  'api.codacy.com',
  'ci.appveyor.com',
  'dev.azure.com',
  'discordapp.com/api/guilds',
  'discord.com/api/guilds',
  'img.buymeacoffee.com',
  'ko-fi.com/img',
  'liberapay.com',
  'opencollective.com',
  'api.star-history.com/svg?style=badge',
];

export function isBadgeUrl(src: string): boolean {
  let url: URL;
  try {
    url = new URL(src, 'https://example.invalid/');
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (host === 'example.invalid') return /(^|\/)badge[^/]*\.svg$/.test(path);
  const full = `${host}${path}`;
  if (/\/badge(\.svg)?$/.test(path) || /\/badges?\//.test(path) || /badge[^/]*\.svg$/.test(path)) return true;
  if (/\/workflows\/.+\/badge\.svg$/.test(path)) return true;
  return BADGE_HOSTS.some((h) => (h.includes('/') ? full.startsWith(h) : host === h || host.endsWith(`.${h}`)));
}

/** Best-effort split of a shields.io static badge URL into label / message / colour. */
export function parseShieldsUrl(src: string): { label: string; message: string; color: string | null } | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (!url.hostname.endsWith('shields.io')) return null;
  const m = /^\/badge\/(.+)$/.exec(url.pathname);
  if (!m) return null;
  const raw = m[1]!.replace(/\.(svg|png)$/i, '');
  // Dashes separate parts; "--" is a literal dash and "__" a literal underscore.
  const parts = raw
    .replace(/--/g, '\u0000')
    .split('-')
    .map((p) => decodeURIComponent(p.replace(/\u0000/g, '-')).replace(/__/g, '\u0001').replace(/_/g, ' ').replace(/\u0001/g, '_'));
  if (parts.length >= 3) {
    return { label: parts.slice(0, -2).join('-'), message: parts[parts.length - 2]!, color: parts[parts.length - 1]! };
  }
  if (parts.length === 2) return { label: '', message: parts[0]!, color: parts[1]! };
  return null;
}
