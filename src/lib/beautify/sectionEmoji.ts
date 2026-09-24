import { normaliseName } from './util';

/**
 * One emoji per kind of section, keyed by normalised heading text
 * (lower case, no emoji or punctuation). Installing gets 📦, getting started
 * gets 🏁, usage 🚀 and examples 💡, and so on.
 */
const GROUPS: Array<[emoji: string, names: string[]]> = [
  ['📦', ['installation', 'install', 'installing', 'setup', 'set up']],
  ['🏁', ['getting started', 'get started', 'quick start', 'quickstart']],
  ['🚀', ['usage', 'how to use', 'basic usage']],
  ['💡', ['examples', 'example', 'usage examples']],
  ['✨', ['features', 'key features', 'highlights']],
  ['🛠️', ['tech stack', 'built with', 'technologies', 'tech', 'stack', 'technology stack']],
  ['📸', ['screenshots', 'screenshot', 'preview']],
  ['🎬', ['demo', 'live demo', 'demos']],
  ['🤝', ['contributing', 'contribute', 'contribution', 'contributions', 'how to contribute']],
  ['📄', ['license', 'licence', 'licensing']],
  ['🗺️', ['roadmap']],
  ['❓', ['faq', 'faqs', 'frequently asked questions']],
  ['🧪', ['tests', 'testing', 'running tests', 'running the tests']],
  ['⚙️', ['configuration', 'config', 'options', 'settings']],
  ['📚', ['documentation', 'docs']],
  ['🙏', ['acknowledgements', 'acknowledgments', 'credits', 'thanks']],
  ['📬', ['contact']],
  ['💬', ['support', 'community', 'help']],
  ['📋', ['requirements', 'prerequisites', 'dependencies']],
  ['📝', ['changelog', 'change log', 'changes', 'release notes', 'history', 'version history']],
  ['🔒', ['security']],
  ['👤', ['authors', 'author', 'maintainers', 'team']],
  ['ℹ️', ['about', 'about the project', 'about this project']],
  ['🔌', ['api', 'api reference']],
  ['🚢', ['deployment', 'deploy', 'deploying']],
  ['🩺', ['troubleshooting']],
  ['🔭', ['overview', 'introduction']],
];

const EMOJI_BY_NAME = new Map<string, string>(GROUPS.flatMap(([emoji, names]) => names.map((n) => [n, emoji] as const)));

/** The emoji for a known section name ("Getting Started" → 🏁), or null. */
export function emojiForSection(title: string): string | null {
  return EMOJI_BY_NAME.get(normaliseName(title)) ?? null;
}
