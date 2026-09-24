/**
 * Guesses the language of an unlabelled code block, but only when it is
 * obvious. Returns null when unsure, so a fence is never mislabelled.
 */

/** Shell commands people paste into READMEs (optionally after a `$ ` prompt). */
const SHELL =
  /^(?:\$\s+\S|(?:sudo\s+)?(?:npm|npx|pnpm|pip3?|pipx|git|cd|docker|docker-compose|curl|wget|brew|apt|apt-get|cargo|go|bun|deno|mkdir|poetry|conda|rustup|kubectl|helm|python3? -m)\s|(?:yarn|make)(?:\s|$))/;

const PYTHON = [
  /^(?:async\s+)?def \w+\s*\(.*\)\s*(?:->\s*[^:]+)?:\s*$/,
  /^class \w+(?:\(.*\))?:\s*$/,
  /^import [\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*\s*$/,
  /^from [\w.]+ import [\w*., ()]+$/,
  /^print\(/,
];

const JAVASCRIPT = [
  /^\s*(?:export\s+)?(?:const|let|var)\s+[\w{[]/,
  /^\s*import\s.+\sfrom\s+['"]/,
  /^\s*import\s+['"]/,
  /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\b/,
  /^\s*export\s+(?:default|class|interface|type)\b/,
  /(?:\)|\b\w+)\s*=>\s*[{(\w'"`[]/,
  /\brequire\(\s*['"]/,
  /\bconsole\.(?:log|error|warn)\(/,
];

const TYPESCRIPT = [
  /^\s*(?:export\s+)?(?:interface|type)\s+\w+/,
  /\b(?:const|let|var)\s+\w+\s*:\s*[\w<[{]/,
  /\)\s*:\s*(?:string|number|boolean|void|Promise|unknown|any)\b/,
  /\(\s*\w+\s*:\s*(?:string|number|boolean|unknown|any|[A-Z]\w*)\b/,
  /\bas const\b/,
];

function isJson(text: string): boolean {
  const first = text[0];
  const last = text[text.length - 1];
  if (!((first === '{' && last === '}') || (first === '[' && last === ']'))) return false;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null;
  } catch {
    return false;
  }
}

export function detectLanguage(code: string): string | null {
  const text = code.trim();
  if (!text) return null;
  const lines = text.split('\n').map((l) => l.trimEnd());
  const first = lines[0]!;

  if (first.startsWith('#!')) {
    if (/\b(?:ba|z)?sh\b/.test(first)) return 'bash';
    if (/python/.test(first)) return 'python';
    if (/\b(?:node|deno|bun)\b/.test(first)) return 'js';
    return null;
  }
  if (isJson(text)) return 'json';

  const firstCommand = lines.find((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  if (firstCommand !== undefined && SHELL.test(firstCommand.trim())) return 'bash';

  if (/^<\?php\b/.test(text)) return 'php';
  if (/^<\?xml\b/.test(text)) return 'xml';
  if (/^<(?:!doctype|!--|[a-z][\w-]*)[\s>/]/i.test(text)) return 'html';

  if (lines.some((l) => JAVASCRIPT.some((re) => re.test(l)))) {
    return lines.some((l) => TYPESCRIPT.some((re) => re.test(l))) ? 'ts' : 'js';
  }
  if (lines.some((l) => PYTHON.some((re) => re.test(l)))) return 'python';

  const content = lines.filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  const keyLine = /^\s*(?:- )?[\w.-]+:(?:\s|$)/;
  const yamlLike = content.every((l) => keyLine.test(l) || /^\s*- \S/.test(l) || /^\s+\S/.test(l));
  if (yamlLike && content.filter((l) => keyLine.test(l)).length >= 2 && keyLine.test(content[0]!)) return 'yaml';

  return null;
}
