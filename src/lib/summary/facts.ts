import type { Code } from 'mdast';
import { parseShieldsUrl } from '../markdown/badges';
import type { BlockInfo, DocModel, SectionKind, TextUnit } from './sections';
import { BREAK, F_CODE, flatSlice, stripDecor, truncate, type Flat, type FlatImage, type FlatLink } from './text';
import { splitSentences } from './sentences';
import {
  FILE_TECH,
  TECH_BY_NAME,
  matchTech,
  techByAlias,
  techForLanguage,
  techForPackage,
  techForTool,
  type TechEntry,
} from './tech';

export type FactKind = 'tech' | 'install' | 'run' | 'requirement' | 'link' | 'licence' | 'author';

export interface Fact {
  kind: FactKind;
  label: string;
  value: string;
  /** 1-based source line, so the UI can scroll there. */
  line: number;
  href?: string;
  source?: 'badge' | 'code' | 'text' | 'heading' | 'file';
}

export interface FactContext {
  repo?: { owner: string; name: string; description?: string | null };
}

export interface Feature {
  /** Plain text. */
  text: string;
  /** The item's original Markdown (inline formatting kept, on one line). */
  markdown: string;
  line: number;
}

export interface Facts {
  tech: Fact[];
  install: Fact[];
  run: Fact[];
  requirements: Fact[];
  links: Fact[];
  licence: Fact | null;
  authors: Fact[];
  features: Feature[];
}

// ---------------------------------------------------------------------------- collection

const keyOf = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** De-duplicates case-insensitively; keeps the earliest occurrence; lists in document order. */
class FactList {
  private readonly byKey = new Map<string, { fact: Fact; seq: number }>();
  private seq = 0;

  add(fact: Fact, keys: string[] = [fact.value]): void {
    const ks = keys.map(keyOf).filter(Boolean);
    if (!ks.length || !fact.value.trim()) return;
    const existing = ks.map((k) => this.byKey.get(k)).find((e) => e !== undefined);
    if (existing) {
      if (fact.line < existing.fact.line) existing.fact = fact;
      for (const k of ks) if (!this.byKey.has(k)) this.byKey.set(k, existing);
      return;
    }
    const entry = { fact, seq: this.seq++ };
    for (const k of ks) this.byKey.set(k, entry);
  }

  get size(): number {
    return new Set(this.byKey.values()).size;
  }

  list(): Fact[] {
    return [...new Set(this.byKey.values())].sort((a, b) => a.fact.line - b.fact.line || a.seq - b.seq).map((e) => e.fact);
  }
}

const has = (block: BlockInfo, ...kinds: SectionKind[]): boolean => kinds.some((k) => block.kinds.has(k));
const nearest = (block: BlockInfo, kind: SectionKind): boolean => block.heading?.kinds.includes(kind) ?? false;

function lineIn(flat: Flat, index: number, fallback: number): number {
  return flat.lines[Math.min(Math.max(index, 0), flat.lines.length - 1)] ?? fallback;
}

function unitLine(unit: TextUnit): number {
  return unit.flat.lines[0] ?? unit.node.position?.start.line ?? 1;
}

/** Spans of consecutive inline-code characters in a flat. */
function codeSpans(flat: Flat): Array<{ text: string; start: number }> {
  const spans: Array<{ text: string; start: number }> = [];
  let start = -1;
  for (let i = 0; i <= flat.text.length; i++) {
    const inCode = i < flat.text.length && (flat.flags[i]! & F_CODE) !== 0 && flat.text[i] !== BREAK;
    if (inCode && start < 0) start = i;
    if (!inCode && start >= 0) {
      spans.push({ text: flat.text.slice(start, i).trim(), start });
      start = -1;
    }
  }
  return spans;
}

/** Flat text with inline code blanked out (same length, so indexes still line up). */
function proseOnly(flat: Flat): string {
  let out = '';
  for (let i = 0; i < flat.text.length; i++) out += (flat.flags[i]! & F_CODE) !== 0 ? ' ' : flat.text[i]!;
  return out;
}

// ---------------------------------------------------------------------------- shell commands

const SHELL_LANGS = new Set([
  'sh', 'bash', 'shell', 'zsh', 'fish', 'console', 'shellsession', 'shell-session', 'sh-session', 'terminal', 'cmd', 'bat',
  'batch', 'powershell', 'ps', 'ps1', 'pwsh', 'posh', 'doscon', 'nu', 'shell-script', 'bash-session',
]);
const PLAIN_LANGS = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'none']);
const PROMPT = /^\s*(?:\$|%|>|❯|➜|#(?=\s+(?:sudo|apt|yum|dnf|pacman)\b)|PS(?: [A-Za-z]:\\[^>]*)?>|[A-Za-z]:\\[^>]*>)\s+/;

type CommandKind = 'install' | 'run';

const COMMANDS: Array<[RegExp, CommandKind, string?]> = [
  // Install / scaffold
  [/^npx\s+(?:-y\s+|--yes\s+)?create-[\w.@/-]+/, 'install', 'npx'],
  [/^npm\s+(?:create|init)\s+(?!-)\S+/, 'install', 'npm'],
  [/^(yarn|pnpm|bun)\s+create\s+\S+/, 'install'],
  [/^pnpm\s+dlx\s+create-/, 'install', 'pnpm'],
  [/^npm\s+(?:i|install|ci|add)(?:\s|$)/, 'install', 'npm'],
  [/^yarn(?:\s*$|\s+(?:install|add|global\s+add)(?:\s|$))/, 'install', 'yarn'],
  [/^pnpm(?:\s*$|\s+(?:add|install|i)(?:\s|$))/, 'install', 'pnpm'],
  [/^bun\s+(?:add|install|i)(?:\s|$)/, 'install', 'bun'],
  [/^deno\s+(?:install|add)\b/, 'install', 'deno'],
  [/^(?:python3?|py)\s+-m\s+pip\s+install\b/, 'install', 'pip'],
  [/^pip3?\s+install\b/, 'install', 'pip'],
  [/^pipx\s+install\b/, 'install', 'pipx'],
  [/^uv\s+(?:pip\s+install|add|sync|tool\s+install)\b/, 'install', 'uv'],
  [/^(poetry|pdm)\s+(?:add|install)\b/, 'install'],
  [/^pipenv\s+install\b/, 'install', 'pipenv'],
  [/^(?:conda|mamba|micromamba)\s+(?:install|env\s+create|create)\b/, 'install', 'conda'],
  [/^cargo\s+(?:install|add|binstall)\b/, 'install', 'cargo'],
  [/^go\s+(?:install|get)\b/, 'install', 'go'],
  [/^go\s+mod\s+(?:download|tidy)\b/, 'install', 'go'],
  [/^brew\s+(?:install|tap)\b/, 'install', 'brew'],
  [/^apt(?:-get)?\s+(?:-\S+\s+)*install\b/, 'install', 'apt'],
  [/^(dnf|yum|zypper)\s+(?:-\S+\s+)*install\b/, 'install'],
  [/^(pacman|yay|paru)\s+-S\w*\b/, 'install'],
  [/^apk\s+add\b/, 'install', 'apk'],
  [/^(snap|flatpak|choco|scoop|winget)\s+install\b/, 'install'],
  [/^nix(?:-env\s+-i|\s+profile\s+install)\b/, 'install', 'nix'],
  [/^gem\s+install\b/, 'install', 'gem'],
  [/^bundle(?:\s+install\b|\s*$)/, 'install', 'bundler'],
  [/^composer\s+(?:require|install|create-project)\b/, 'install', 'composer'],
  [/^docker\s+pull\b/, 'install', 'docker'],
  [/^git\s+clone\b/, 'install', 'git'],
  [/^gh\s+repo\s+clone\b/, 'install', 'gh'],
  [/^dotnet\s+(?:add\s+(?:\S+\s+)?package|tool\s+install|restore)\b/, 'install', 'dotnet'],
  [/^(?:Install-Package|nuget\s+install)\b/i, 'install', 'nuget'],
  [/^(flutter|dart)\s+pub\s+(?:get|add)\b/, 'install'],
  [/^(curl|wget)\b.*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/, 'install'],
  [/^(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b.*\|\s*iex\b/i, 'install', 'powershell'],
  [/^(?:mvn|\.\/mvnw)\s+(?:clean\s+)?install\b/, 'install', 'maven'],
  [/^helm\s+install\b/, 'install', 'helm'],
  [/^(?:code|cursor|codium)\s+--install-extension\b/, 'install', 'code'],
  [/^arduino-cli\s+(?:lib|core)\s+install\b/, 'install', 'arduino-cli'],
  // Run
  [/^npm\s+(?:run(?:-script)?\s+\S+|start|test|t|exec\s+\S+)(?:\s|$)/, 'run', 'npm'],
  [/^npx\s+\S+/, 'run', 'npx'],
  [/^bunx\s+\S+/, 'run', 'bunx'],
  [/^yarn\s+(?!add\b|install\b|create\b|global\b|remove\b|upgrade\b|init\b|set\b|config\b|cache\b|why\b|info\b|link\b)[\w:.-]+/, 'run', 'yarn'],
  [/^pnpm\s+(?!add\b|install\b|i\b|create\b|remove\b|rm\b|up\b|update\b|init\b|config\b|store\b|link\b)[\w:.-]+/, 'run', 'pnpm'],
  [/^bun\s+(?:run\s+\S+|dev|start|test|build|x\s+\S+|[\w./-]+\.(?:ts|js|tsx|jsx|mjs))(?:\s|$)/, 'run', 'bun'],
  [/^deno\s+(?:run|task|serve)\b/, 'run', 'deno'],
  [/^(node|ts-node|tsx)\s+(?!v?\d)\S+/, 'run'],
  [/^(?:python3?|py)(?:\s+-[a-zA-Z]+)*\s+(?:-m\s+(?!pip\b|venv\b|virtualenv\b)[\w.]+|[\w./\\-]+\.py)\b/, 'run', 'python'],
  [/^(uvicorn|gunicorn|hypercorn|daphne)\s/, 'run'],
  [/^(flask|streamlit|gradio)\s+run\b/, 'run'],
  [/^jupyter(?:-lab|\s+(?:notebook|lab))\b/, 'run', 'jupyter'],
  [/^(uv|poetry|pipenv|pdm|hatch|rye)\s+run\b/, 'run'],
  [/^cargo\s+(?:run|test|build|watch|bench|tauri\s+dev)\b/, 'run', 'cargo'],
  [/^go\s+(?:run|test|build)\b/, 'run', 'go'],
  [/^docker[\s-]compose\s+(?:up|run|start|build)\b/, 'run', 'docker'],
  [/^docker\s+(?:run|build|start|exec)\b/, 'run', 'docker'],
  [/^podman\s+(?:run|build)\b/, 'run', 'podman'],
  [/^make(?:\s+[\w.=-]+)*\s*$/, 'run', 'make'],
  [/^just(?:\s+[\w.-]+)*\s*$/, 'run', 'just'],
  [/^(?:\.\/gradlew|gradle)\s+\w+/, 'run', 'gradle'],
  [/^(?:\.\/mvnw|mvn)\s+(?:spring-boot:run|exec:java|test|package|compile|verify)\b/, 'run', 'maven'],
  [/^java\s+(?:-\S+\s+)*(?:-jar\b|[\w.]+)/, 'run', 'java'],
  [/^dotnet\s+(?:run|watch|test|build)\b/, 'run', 'dotnet'],
  [/^php\s+(?:artisan\s+\S+|-S\s|\S+\.php)/, 'run', 'php'],
  [/^(?:bin\/)?rails\s+(?:s|server|console|c)\b/, 'run', 'rails'],
  [/^bundle\s+exec\b/, 'run', 'bundler'],
  [/^ruby\s+\S+\.rb\b/, 'run', 'ruby'],
  [/^mix\s+(?:phx\.server|run|test)\b/, 'run', 'mix'],
  [/^flutter\s+(?:run|test|build)\b/, 'run', 'flutter'],
  [/^dart\s+run\b/, 'run', 'dart'],
  [/^hugo(?:\s+server)?\b/, 'run', 'hugo'],
  [/^(vite|next|nuxt|nuxi|astro|ng)\s+(?:dev|build|preview|start|serve)\b/, 'run'],
  [/^(expo|tauri|electron|wrangler|vercel|netlify|firebase)\s+(?:start|dev|deploy|serve|\.)/, 'run'],
  [/^(kubectl)\s+apply\b|^(helm)\s+upgrade\b|^(terraform)\s+(?:apply|plan|init)\b/, 'run'],
  [/^(bash|sh|zsh|pwsh|powershell)\s+(?:-\S+\s+)*[\w./\\-]+\.(?:sh|ps1)\b/, 'run'],
  [/^\.{1,2}[/\\][\w./\\-]+/, 'run', 'script'],
  [/^(godot|mpremote|ampy|esptool(?:\.py)?|platformio|pio|arduino-cli)\b/, 'run'],
];

const NOISE_COMMANDS = /^(cd|export|set|setx|source|\.|echo|ls|dir|pwd|cat|type|mkdir|md|touch|rm|del|cp|copy|mv|move|clear|cls|exit|call|chmod|chown|alias|unset|which|where|env|history|open|start|code|nano|vim?|vi|notepad)$/i;

export interface CommandMatch {
  kind: CommandKind;
  tool: string;
}

/** Normalises a command for matching: drops `sudo`, env assignments and `time`. */
function commandCore(cmd: string): string {
  return cmd
    .replace(/^(?:(?:sudo|time|nohup)\s+(?:-\S+\s+)*)+/, '')
    .replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/, '')
    .trim();
}

/** Classifies a single shell command as an install or run step. */
export function classifyCommand(cmd: string): CommandMatch | null {
  const core = commandCore(cmd);
  for (const [re, kind, tool] of COMMANDS) {
    const m = re.exec(core);
    if (m) {
      const captured = m.slice(1).find((g) => g !== undefined);
      return { kind, tool: (tool ?? captured ?? core.split(/\s+/)[0] ?? '').toLowerCase() };
    }
  }
  return null;
}

/** Splits `a && b; c` into separate commands (quotes respected). */
function splitChain(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = null;
      current += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      current += c;
      continue;
    }
    if ((c === '&' && line[i + 1] === '&') || (c === '|' && line[i + 1] === '|')) {
      parts.push(current);
      current = '';
      i++;
      continue;
    }
    if (c === ';') {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function isCommandLike(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 200) return false;
  if (/^(import|from|const|let|var|def|class|fn|use|func|package|return|if|for|while|print|console|public|private|#include|\/\/|<|\{|\}|\[|\])/.test(t)) {
    return false;
  }
  if (/[;{}]\s*$/.test(t) || /^[\w.-]+\s*[=:(]/.test(t)) return false;
  return /^[\w./\\@~-][\w./\\@:~+-]*(\s|$)/.test(t);
}

function codeContentLine(code: Code, model: DocModel): number {
  const start = code.position?.start;
  if (!start) return 1;
  const offset = start.offset ?? 0;
  const head = model.source.slice(offset, offset + 64).trimStart();
  return head.startsWith('```') || head.startsWith('~~~') ? start.line + 1 : start.line;
}

interface CommandLine {
  text: string;
  line: number;
}

/** Commands in a code block, with their lines. `shell` is false for plain, unlabelled blocks. */
function commandsInCode(code: Code, model: DocModel): { commands: CommandLine[]; shell: boolean; allCommandLike: boolean } | null {
  const lang = (code.lang ?? '').toLowerCase();
  const shell = SHELL_LANGS.has(lang);
  if (!shell && !PLAIN_LANGS.has(lang)) return null;
  const first = codeContentLine(code, model);
  const raw = code.value.split('\n');
  const hasPrompts = raw.some((l) => PROMPT.test(l));
  const commands: CommandLine[] = [];
  let pending = '';
  let pendingLine = first;
  let nonEmpty = 0;
  let commandLike = 0;
  raw.forEach((rawLine, i) => {
    let l = rawLine;
    if (!pending) {
      if (hasPrompts) {
        if (!PROMPT.test(l)) return; // output line
        l = l.replace(PROMPT, '');
      }
      pendingLine = first + i;
    }
    const continued = /(?:\s\\|\s`|\s\^)\s*$/.test(l);
    pending += `${pending ? ' ' : ''}${l.replace(/(?:\s\\|\s`|\s\^)\s*$/, '').trim()}`;
    if (continued) return;
    let cmd = pending.trim();
    pending = '';
    if (!cmd || /^(#|\/\/|REM\s|::)/i.test(cmd)) return;
    cmd = cmd.replace(/\s+#\s.*$/, '').trim();
    nonEmpty++;
    if (isCommandLike(cmd)) commandLike++;
    for (const part of splitChain(cmd)) commands.push({ text: part, line: pendingLine });
  });
  if (pending.trim()) commands.push({ text: pending.trim(), line: pendingLine });
  return { commands, shell, allCommandLike: nonEmpty > 0 && commandLike === nonEmpty && nonEmpty <= 8 };
}

/** Package names given to an install command (`npm i react three` → react, three). */
function installedPackages(cmd: string): string[] {
  const core = commandCore(cmd);
  const m =
    /^(?:npm\s+(?:i|install|add)|yarn\s+(?:global\s+)?add|pnpm\s+(?:add|i|install)|bun\s+(?:add|i|install)|(?:python3?\s+-m\s+)?pip3?\s+install|pipx\s+install|uv\s+(?:pip\s+install|add)|poetry\s+add|pdm\s+add|conda\s+install|cargo\s+(?:add|install)|gem\s+install|composer\s+require|dotnet\s+add\s+package|deno\s+add)\s+(.*)$/.exec(
      core,
    );
  if (!m) {
    const create = /^(?:npx\s+(?:-y\s+|--yes\s+)?(create-[\w.-]+)|(?:npm|yarn|pnpm|bun)\s+create\s+([\w@./-]+))/.exec(core);
    if (!create) return [];
    const name = (create[1] ?? `create-${create[2] ?? ''}`).replace(/@[\w.^~-]*$/, '');
    return [name, name.replace(/^create-/, '')];
  }
  return m[1]!
    .split(/\s+/)
    .filter((t) => t && !t.startsWith('-') && !/^[./~]|:\/\/|^git\+|\.(txt|toml|whl|tar\.gz)$/.test(t))
    .map((t) => t.replace(/^['"]|['"]$/g, ''))
    .map((t) => (t.startsWith('@') ? t.replace(/(?<=.)@[^/]*$/, '') : t.replace(/@.*$/, '')))
    .map((t) => t.replace(/\[.*\]/, '').replace(/[<>=!~^].*$/, ''))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------- tech

const ICON_PATTERNS: RegExp[] = [
  /\/icons\/([a-z0-9.+#-]+)\/[a-z0-9.+#-]+-(?:original|plain|line)(?:-wordmark)?\.svg$/i, // devicon
  /simple-?icons[^/]*\/icons\/([a-z0-9.+-]+)\.svg$/i, // simple-icons package
  /\/topics\/([a-z0-9.+-]+)\/[a-z0-9.+-]+\.png$/i, // github/explore topics
];

const BADGE_PATH_TECH: Array<[RegExp, string]> = [
  [/^\/pypi\//, 'Python'],
  [/^\/crates\//, 'Rust'],
  [/^\/gem\//, 'Ruby'],
  [/^\/packagist\//, 'PHP'],
  [/^\/nuget\//, '.NET'],
  [/^\/pub\//, 'Dart'],
  [/^\/docker\//, 'Docker'],
];

function techFromImage(img: FlatImage, techSection: boolean): TechEntry[] {
  const out: TechEntry[] = [];
  const push = (e: TechEntry | null | undefined) => {
    if (e && !out.includes(e)) out.push(e);
  };
  let url: URL | null = null;
  try {
    url = new URL(img.src);
  } catch {
    url = null;
  }
  let iconish = false;
  if (url) {
    const host = url.hostname.toLowerCase();
    const logo = url.searchParams.get('logo');
    if (logo) push(techByAlias(logo));
    if (host.endsWith('skillicons.dev') || host.endsWith('skills.syvixor.com')) {
      iconish = true;
      for (const s of (url.searchParams.get('i') ?? url.searchParams.get('icons') ?? url.searchParams.get('skills') ?? '').split(',')) push(techByAlias(s));
    }
    if (host === 'cdn.simpleicons.org') {
      iconish = true;
      push(techByAlias(url.pathname.split('/')[1] ?? ''));
    }
    for (const re of ICON_PATTERNS) {
      const m = re.exec(url.pathname);
      if (m) {
        iconish = true;
        push(techByAlias(m[1]!));
      }
    }
    if (img.badge && /shields\.io$/.test(host)) {
      for (const [re, name] of BADGE_PATH_TECH) if (re.test(url.pathname)) push(TECH_BY_NAME.get(name));
      const shield = parseShieldsUrl(img.src);
      if (shield) {
        push(techByAlias(shield.label));
        push(techByAlias(shield.message));
        for (const h of matchTech(`${shield.label} ${shield.message}`, true)) push(h.entry);
      }
    }
  }
  if (img.alt) {
    const context = img.badge || iconish || techSection;
    if (context) push(techByAlias(img.alt));
    for (const h of matchTech(img.alt, context)) push(h.entry);
  }
  return out;
}

const JS_LANGS = /^(js|jsx|ts|tsx|javascript|typescript|mjs|cjs|mts|vue|svelte|astro)$/;
const PY_LANGS = /^(py|python|python3|ipython|pycon)$/;

function extractTech(model: DocModel, commandFacts: Array<{ cmd: string; tool: string; line: number }>): Fact[] {
  const strong = new FactList();
  const weak = new FactList();
  const add = (entry: TechEntry | null | undefined, line: number, source: Fact['source']) => {
    if (!entry) return;
    (entry.weak ? weak : strong).add({ kind: 'tech', label: entry.category, value: entry.name, line, source });
  };

  // Prose, headings, table cells, HTML: keyword dictionary; badges and icons.
  for (const unit of model.units) {
    // "Ports", "Related projects", "Alternatives": other projects' tech, not this one's.
    if (has(unit.block, 'related')) continue;
    const loose = has(unit.block, 'tech');
    const source = unit.kind === 'heading' ? 'heading' : 'text';
    for (const hit of matchTech(unit.flat.text, loose)) add(hit.entry, lineIn(unit.flat, hit.start, unitLine(unit)), source);
    for (const img of unit.flat.images) for (const e of techFromImage(img, loose)) add(e, img.line, 'badge');
  }

  // Code blocks: languages and imports.
  for (const { node, block } of model.codes) {
    if (has(block, 'related')) continue;
    const line = node.position?.start.line ?? 1;
    add(techForLanguage(node.lang), line, 'code');
    const lang = (node.lang ?? '').toLowerCase();
    const first = codeContentLine(node, model);
    if (JS_LANGS.test(lang) || PY_LANGS.test(lang)) {
      node.value.split('\n').forEach((l, i) => {
        const names: string[] = [];
        if (JS_LANGS.test(lang)) {
          for (const m of l.matchAll(/(?:\bfrom\s+|\brequire\(\s*|\bimport\s+|\bimport\(\s*)['"]([^'"\s]+)['"]/g)) names.push(m[1]!);
        } else {
          const m = /^\s*(?:from|import)\s+([A-Za-z_][\w]*)/.exec(l);
          if (m) names.push(m[1]!);
        }
        for (const n of names) add(techForPackage(n), first + i, 'code');
      });
    }
  }

  // Tools and packages from install / run commands.
  for (const c of commandFacts) {
    add(techForTool(c.tool), c.line, 'code');
    for (const p of installedPackages(c.cmd)) add(techForPackage(p), c.line, 'code');
  }

  // Dependency files mentioned anywhere.
  const mentions: Array<{ index: number; names: string[] }> = [];
  for (const [re, names] of FILE_TECH) {
    const m = new RegExp(`(?<![\\w.-])(?:${re.source})(?![\\w-])`).exec(model.source);
    if (m) mentions.push({ index: m.index, names });
  }
  for (const { index, names } of mentions.sort((a, b) => a.index - b.index)) {
    for (const n of names) add(TECH_BY_NAME.get(n), model.lineAt(index), 'file');
  }

  return strong.size ? strong.list() : weak.list();
}

// ---------------------------------------------------------------------------- install / run

function extractCommands(model: DocModel): { install: Fact[]; run: Fact[]; all: Array<{ cmd: string; tool: string; line: number }> } {
  const install = new FactList();
  const run = new FactList();
  const all: Array<{ cmd: string; tool: string; line: number }> = [];
  const push = (kind: CommandKind, tool: string, cmd: string, line: number, source: Fact['source']) => {
    const value = cmd.replace(/\s+/g, ' ').trim();
    if (!value || value.length > 300) return;
    const fact: Fact = { kind, label: tool, value, line, source };
    (kind === 'install' ? install : run).add(fact);
    all.push({ cmd: value, tool, line });
  };

  for (const { node, block } of model.codes) {
    const found = commandsInCode(node, model);
    if (!found) continue;
    const installSection = has(block, 'install');
    const runSection = has(block, 'run');
    const fallbackKind: CommandKind | null = nearest(block, 'run') && !nearest(block, 'install')
      ? 'run'
      : installSection
        ? 'install'
        : runSection
          ? 'run'
          : null;
    // Unlabelled blocks are often program output or benchmarks: trust them only
    // when every line looks like a command or the section is about setup / usage.
    const trusted = found.shell || found.allCommandLike || installSection || runSection;
    if (!trusted || has(block, 'related')) continue;
    for (const c of found.commands) {
      const match = classifyCommand(c.text);
      if (match) {
        push(match.kind, match.tool, c.text, c.line, 'code');
        continue;
      }
      if (!fallbackKind || !(found.shell || found.allCommandLike)) continue;
      const first = commandCore(c.text).split(/\s+/)[0] ?? '';
      if (!first || NOISE_COMMANDS.test(first) || /activate(\.\w+)?$/i.test(first) || !isCommandLike(c.text)) continue;
      const tool = first.replace(/^.*[/\\]/, '').toLowerCase();
      push(fallbackKind, tool, c.text, c.line, 'code');
    }
  }

  // Inline code in prose: "Run `npm run dev` to start".
  for (const unit of model.units) {
    if (unit.kind === 'heading') continue;
    for (const span of codeSpans(unit.flat)) {
      const match = classifyCommand(span.text);
      if (match && span.text.includes(' ')) push(match.kind, match.tool, span.text.replace(/^\$\s+/, ''), lineIn(unit.flat, span.start, unitLine(unit)), 'text');
    }
  }
  return { install: install.list(), run: run.list(), all };
}

// ---------------------------------------------------------------------------- requirements

const REQ_TOOL =
  "Node(?:\\.?js)?|NodeJS|Python|Java|JDK|OpenJDK|Golang|Go|Rust|rustc|Ruby|PHP|\\.NET(?:\\s?(?:Core|SDK|Framework))?|Deno|Bun|npm|pnpm|Yarn|Docker|PostgreSQL|Postgres|MySQL|Redis|MongoDB|Unity|Godot|Flutter|Dart|Kotlin|Swift|Xcode|CMake|GCC|Clang|Elixir|Erlang|Perl|Android(?: SDK| API)?|iOS|macOS|Windows|Ubuntu|Git|Chrome|Firefox|Lua|Julia|Scala|Gradle|Maven|Terraform|Kubernetes|TypeScript|Angular|React|Vue|Qt|LLVM|CUDA|Visual Studio|Electron|Arduino IDE|MicroPython|Django|Rails|Laravel|Spring Boot|Next\\.js|Unreal Engine|MSRV";
const VERSION_RE = new RegExp(
  `(?<![\\p{L}\\p{N}_.])(${REQ_TOOL})(?:\\s*(?:version|ver\\.?|v(?=\\d))(?:\\s+(?:is|of)|\\s*[:=])?)?\\s*(>=|=>|≥|>|\\^|~>?|==?)?\\s*v?(\\d+(?:\\.\\d+){0,2}(?:\\.x)?)(\\s*\\+|\\s*(?:or|and)\\s+(?:higher|later|newer|above|up|greater)|\\s*or\\s+newer)?(?![\\p{L}\\p{N}_]|\\.\\d)`,
  'giu',
);
const REQ_CONTEXT = /\b(requires?|required|requirements?|need(s|ed)?|minimum|min\.?|at least|supports?|supported|compatible with|tested (on|with)|works with|built (for|with)|runs on|install(ed)?)\b/i;
const REQ_NEGATIVE = /\b(not|no longer|drop(ped)?|deprecated|removed|except|unsupported|until)\b/i;

const TOOL_NAMES: Record<string, string> = {
  node: 'Node.js',
  nodejs: 'Node.js',
  'node.js': 'Node.js',
  golang: 'Go',
  jdk: 'Java',
  openjdk: 'Java',
  rustc: 'Rust',
  msrv: 'Rust',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  php: 'PHP',
  ios: 'iOS',
  macos: 'macOS',
  gcc: 'GCC',
  llvm: 'LLVM',
  cuda: 'CUDA',
  cmake: 'CMake',
  typescript: 'TypeScript',
  micropython: 'MicroPython',
  npm: 'npm',
  pnpm: 'pnpm',
  'next.js': 'Next.js',
};

function canonicalTool(raw: string): string {
  const k = raw.toLowerCase().replace(/\s+/g, ' ');
  if (TOOL_NAMES[k]) return TOOL_NAMES[k];
  if (k.startsWith('.net')) return '.NET';
  return raw.replace(/\s+/g, ' ').replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

export interface VersionHit {
  tool: string;
  value: string;
  index: number;
  end: number;
}

/** "Node.js 18+", "Python >= 3.10", "requires Java 17", "Go 1.22" ... */
export function findVersionRequirements(text: string, assumeContext = false): VersionHit[] {
  const out: VersionHit[] = [];
  VERSION_RE.lastIndex = 0;
  for (const m of text.matchAll(VERSION_RE)) {
    const rawTool = m[1]!;
    const lower = rawTool.toLowerCase();
    if ((lower === 'go' && rawTool !== 'Go') || (lower === 'rust' && rawTool !== 'Rust') || (lower === 'git' && rawTool !== 'Git')) continue;
    const op = m[2];
    const version = m[3]!;
    const plus = m[4];
    const index = m.index ?? 0;
    const before = text.slice(Math.max(0, index - 60), index);
    const sentenceBefore = before.split(/[.!?]\s|\u{2029}/u).pop() ?? '';
    const context = assumeContext || REQ_CONTEXT.test(sentenceBefore) || REQ_CONTEXT.test(text.slice(index, index + 80).split(/[.!?]\s/)[0] ?? '');
    if (!op && !plus && !version.includes('.') && !context) continue;
    const sentenceAfter = text.slice(index + m[0].length, index + m[0].length + 40).split(/[.!?;]\s|\u{2029}/u)[0] ?? '';
    if (REQ_NEGATIVE.test(sentenceBefore.slice(-30)) || /\b(was|were|is|has been)\s+(dropped|removed|deprecated)|\b(no longer|not|isn['’]t|unsupported)\b/i.test(sentenceAfter)) continue;
    const tool = canonicalTool(rawTool);
    const normOp = op === '=>' || op === '≥' ? '>=' : op === '==' || op === '=' ? '' : op;
    // "The minimum supported Rust version is 1.74", "MSRV 1.70", "at least Python 3.9" mean "or later".
    const minimum = !normOp && (/\b(minimum|min\.?|at least)\b/i.test(sentenceBefore) || lower === 'msrv');
    const value = `${tool} ${normOp ? `${normOp} ` : ''}${version}${plus || minimum ? '+' : ''}`;
    out.push({ tool, value, index, end: index + m[0].length });
  }
  return out;
}

/** The single version requirement a short text consists of ("Node.js 18 or later" → "Node.js 18+"). */
function wholeRequirement(text: string): VersionHit | null {
  const trimmed = text.trim().replace(/[.;,]$/, '');
  const hits = findVersionRequirements(trimmed, true);
  const only = hits.length === 1 ? hits[0]! : null;
  return only && only.end - only.index >= trimmed.length - 2 ? only : null;
}

function extractRequirements(model: DocModel): Fact[] {
  const list = new FactList();
  const seenItems = new Set<unknown>();
  for (const unit of model.units) {
    const inSection = has(unit.block, 'requirements') && !has(unit.block, 'licence');
    const hits = findVersionRequirements(unit.flat.text, inSection);
    if (inSection && unit.kind !== 'heading') {
      if (unit.kind === 'list') {
        if (unit.item && seenItems.has(unit.item)) continue;
        if (unit.item) seenItems.add(unit.item);
      }
      if (unit.kind === 'cell') {
        if (unit.row === 0 || unit.cell !== 0) continue;
        const row = model.units.filter((u) => u.kind === 'cell' && u.block === unit.block && u.row === unit.row && u.node !== unit.node);
        const value = [unit, ...row].map((u) => flatSlice(u.flat, 0, u.flat.text.length)).filter(Boolean).join(' ');
        const rowHits = findVersionRequirements(value, true);
        list.add(
          { kind: 'requirement', label: rowHits[0]?.tool ?? labelFor(value), value: truncate(value, 160), line: unitLine(unit), source: 'text' },
          [value, ...rowHits.map((h) => h.value)],
        );
        continue;
      }
      const sentences = unit.kind === 'list' ? [unit.flat.text] : splitSentences(unit.flat.text).map((s) => unit.flat.text.slice(s.start, s.end));
      let offset = 0;
      for (const raw of sentences) {
        const at = unit.flat.text.indexOf(raw, offset);
        offset = at + raw.length;
        const value = stripDecor(raw.split(BREAK).join(' ')).replace(/[.;,]$/, '');
        if (!value || /:$/.test(value) || value.split(/\s+/).length > 30) continue;
        const own = findVersionRequirements(raw, true);
        const whole = wholeRequirement(value);
        list.add(
          {
            kind: 'requirement',
            label: own[0]?.tool ?? labelFor(value),
            value: whole ? whole.value : truncate(value, 160),
            line: lineIn(unit.flat, at, unitLine(unit)),
            source: 'text',
          },
          [value, ...own.map((h) => h.value)],
        );
      }
      continue;
    }
    if (has(unit.block, 'licence', 'boilerplate')) continue;
    for (const h of hits) {
      list.add({ kind: 'requirement', label: h.tool, value: h.value, line: lineIn(unit.flat, h.index, unitLine(unit)), source: unit.kind === 'heading' ? 'heading' : 'text' });
    }
    // Static badges such as "node >= 18" or "python 3.10+". A "React 18" badge is a
    // tech-stack badge, so plain versions only count for runtimes and engines.
    for (const img of unit.flat.images) {
      if (!img.badge) continue;
      const shield = parseShieldsUrl(img.src);
      const text = shield ? `${shield.label} ${shield.message}` : img.alt;
      for (const h of findVersionRequirements(text, true)) {
        if (/[-|,/]\s*\d/.test(text.slice(h.index))) continue; // "3.8 | 3.9 | 3.10" is a version list, not a minimum
        if (!/[+>≥^~]/.test(h.value) && !BADGE_RUNTIMES.has(h.tool)) continue;
        list.add({ kind: 'requirement', label: h.tool, value: h.value, line: img.line, source: 'badge' });
      }
    }
  }
  return list.list();
}

const BADGE_RUNTIMES = new Set(['Node.js', 'Python', 'Java', 'Go', 'Rust', 'Ruby', 'PHP', 'Deno', 'Bun', '.NET', 'Unity', 'Godot', 'Flutter', 'Dart', 'Kotlin', 'Swift', 'Elixir', 'Unreal Engine']);

function labelFor(text: string): string {
  const hit = matchTech(text, true)[0];
  return hit ? hit.entry.name : 'Requirement';
}

// ---------------------------------------------------------------------------- links

type LinkLabel = 'Live demo' | 'Documentation' | 'Website' | 'Repository' | 'Package' | 'Community' | 'Changelog';

const DEMO_HOSTS = /(?:^|\.)(github\.io|netlify\.app|vercel\.app|pages\.dev|onrender\.com|fly\.dev|herokuapp\.com|web\.app|firebaseapp\.com|surge\.sh|glitch\.me|itch\.io|streamlit\.app|replit\.app|railway\.app|deno\.dev|workers\.dev|codesandbox\.io|stackblitz\.com|gitlab\.io|codeberg\.page)$/;
const PACKAGE_URLS = /^(?:www\.)?(?:npmjs\.(?:com|org)\/package\/|pypi\.org\/project\/|crates\.io\/crates\/|pkg\.go\.dev\/|rubygems\.org\/gems\/|packagist\.org\/packages\/|(?:www\.)?nuget\.org\/packages\/|pub\.dev\/packages\/|hub\.docker\.com\/r\/|marketplace\.visualstudio\.com\/items|open-vsx\.org\/extension\/|addons\.mozilla\.org\/|chromewebstore\.google\.com\/|chrome\.google\.com\/webstore\/|microsoftedge\.microsoft\.com\/addons\/|apps\.apple\.com\/|play\.google\.com\/store\/apps\/|assetstore\.unity\.com\/|jsr\.io\/@|anaconda\.org\/|formulae\.brew\.sh\/|snapcraft\.io\/|flathub\.org\/apps\/|aur\.archlinux\.org\/packages\/|marketplace\.visualstudio\.com\/)/i;
const COMMUNITY_URLS = /^(?:www\.)?(?:discord\.gg\/|discord\.com\/invite\/|(?:app\.)?gitter\.im\/|join\.slack\.com\/|[\w-]+\.slack\.com\/|t\.me\/|matrix\.to\/|reddit\.com\/r\/|github\.com\/[^/]+\/[^/]+\/discussions)/i;
const CODE_HOSTS = /^(?:www\.)?(github\.com|gitlab\.com|codeberg\.org|bitbucket\.org|sr\.ht|git\.sr\.ht)$/;

function hostPath(url: string): { host: string; path: string; full: string } {
  try {
    const u = new URL(url, 'https://relative.invalid/');
    const host = u.hostname === 'relative.invalid' ? '' : u.hostname.toLowerCase().replace(/^www\./, '');
    return { host, path: u.pathname, full: `${host}${u.pathname}` };
  } catch {
    return { host: '', path: url, full: url };
  }
}

function slugOf(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

interface LinkContext {
  repo?: FactContext['repo'];
  title: string | null;
  /** Section index → true once a link there has been labelled from its heading. */
  headingUsed: Set<number>;
}

const COMMON_TITLE_WORDS = new Set([
  'about', 'awesome', 'simple', 'modern', 'super', 'basic', 'project', 'projects', 'template', 'starter', 'library', 'plugin',
  'client', 'server', 'framework', 'engine', 'toolkit', 'tools', 'utils', 'server', 'website', 'github', 'readme', 'welcome',
]);

/** Whether a URL plausibly belongs to this project (its name or owner appears in it). */
function relatesToProject(host: string, path: string, block: BlockInfo, ctx: LinkContext): boolean {
  if (!host) return true; // relative link: a file in this repository
  const names = [ctx.title, ctx.repo?.name, ctx.repo?.owner].filter((k): k is string => !!k);
  // Long titles ("Pixel Quest: The Clockwork Isles") also match on a distinctive word.
  const words = (ctx.title ?? '').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 5 && !COMMON_TITLE_WORDS.has(w.toLowerCase()));
  const keys = [...names, ...words].map(slugOf).filter((k) => k.length >= 3);
  if (!keys.length) return block.section === 0;
  const hay = slugOf(`${host}${path}`);
  return keys.some((k) => hay.includes(k));
}

function classifyLink(url: string, text: string, before: string, block: BlockInfo, ctx: LinkContext): LinkLabel | null {
  const { host, path, full } = hostPath(url);
  const generic = !text || /^(here|this|link|click here|this link|url|see here|there)$/i.test(text) || /^(https?:\/\/|www\.)/i.test(text);
  // What the link says it is ("Live demo", "Docs"), or the words just before a bare URL ("Docs: https://...").
  const t = (generic ? `${before} ${/^(https?:\/\/|www\.)/i.test(text) ? '' : text}` : text).toLowerCase();
  if (/\b(demo|live|try (it|now|online|out)|playground|launch (the )?app|play (now|online|it|the game|in (your|the) browser)|open (the )?app|web ?app|online version)\b/.test(t)) {
    return 'Live demo';
  }
  if (/\b(changelog|change log|release notes|what'?s new)\b/.test(t)) return 'Changelog';
  if (/\b(docs?|documentation|wiki|user guide|guide|manual|handbook|read the docs)\b/.test(t) && !/\b(contribut\w*|code of conduct|security)\b/.test(t)) {
    return 'Documentation';
  }
  if (/\b(discord|community|chat|forum|slack|gitter|matrix (room|chat|space)|telegram|discussions?)\b/.test(t)) return 'Community';
  if (/\b(website|homepage|home page|official site|landing page|web site)\b/.test(t)) return 'Website';

  const related = relatesToProject(host, path, block, ctx);
  if (COMMUNITY_URLS.test(full) && (related || block.section === 0 || block.kinds.has('community'))) return 'Community';
  if (!related) return null;
  if (PACKAGE_URLS.test(full)) return 'Package';
  if (/(^|\/)(changelog|changes|history)(\.md)?$/i.test(path) || (host === 'github.com' && /^\/[^/]+\/[^/]+\/releases\/?$/.test(path))) return 'Changelog';
  if (/^docs?\./.test(host) || /(readthedocs\.(io|org)|gitbook\.io|docs\.rs)$/.test(host) || /\/wiki(\/|$)/.test(path) || (!host && /^\/?docs?\//i.test(path))) {
    return 'Documentation';
  }
  const repo = CODE_HOSTS.test(host) ? /^\/([^/]+)\/([^/]+?)(?:\.git)?\/?(?:tree\/[^/]+\/?)?$/.exec(path) : null;
  if (repo) {
    const [, owner, name] = repo;
    if (ctx.repo) {
      return owner!.toLowerCase() === ctx.repo.owner.toLowerCase() && name!.toLowerCase() === ctx.repo.name.toLowerCase() ? 'Repository' : null;
    }
    if (ctx.title && slugOf(name!) === slugOf(ctx.title)) return 'Repository';
    if (/\b(repo(sitory)?|source( code)?|github|gitlab|codeberg|view on|star|fork)\b/i.test(t)) return 'Repository';
    return null;
  }
  if (DEMO_HOSTS.test(host) || /^huggingface\.co\/spaces\//.test(full)) return 'Live demo';
  // "## Live demo" followed by a bare link: only the first link of such a section.
  if (!host || ctx.headingUsed.has(block.section)) return null;
  const heading = block.heading?.kinds ?? [];
  let label: LinkLabel | null = null;
  if (heading.includes('demo')) label = 'Live demo';
  else if (/^(documentation|docs)$/i.test(block.heading?.text.trim() ?? '')) label = 'Documentation';
  else if (/\b(website|homepage)\b/i.test(block.heading?.text ?? '')) label = 'Website';
  if (label) ctx.headingUsed.add(block.section);
  return label;
}

function linkText(flat: Flat, link: FlatLink): string {
  const text = link.end > link.start ? flatSlice(flat, link.start, link.end) : (link.images.find((i) => i.alt)?.alt ?? '');
  return stripDecor(text);
}

function displayUrl(url: string): string {
  const { host, path } = hostPath(url);
  return `${host}${path === '/' ? '' : path}`.replace(/\/$/, '') || url;
}

function extractLinks(model: DocModel, ctx: FactContext): Fact[] {
  const list = new FactList();
  const linkCtx: LinkContext = { repo: ctx.repo, title: model.title?.text ?? null, headingUsed: new Set() };
  for (const unit of model.units) {
    if (has(unit.block, 'authors', 'credits', 'licence', 'related')) continue;
    const boilerplate = has(unit.block, 'boilerplate');
    for (const link of unit.flat.links) {
      const url = link.url.trim();
      if (!url || url.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(url)) continue;
      const textless = link.end <= link.start;
      if (textless && link.images.length && link.images.every((i) => i.badge)) continue; // badge links
      const text = linkText(unit.flat, link);
      const before = unit.flat.text.slice(Math.max(0, link.start - 30), link.start).split(BREAK).pop() ?? '';
      const label = classifyLink(url, text, before, unit.block, linkCtx);
      if (!label) continue;
      if (boilerplate && label !== 'Community' && label !== 'Changelog' && label !== 'Documentation') continue;
      const value = text && !/^(https?:\/\/|www\.)/i.test(text) ? truncate(text, 80) : displayUrl(url);
      const normalised = url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '').replace(/\.git$/, '');
      list.add({ kind: 'link', label, value, line: link.line, href: url, source: 'text' }, [normalised]);
    }
  }
  return list.list();
}

// ---------------------------------------------------------------------------- licence

const LICENCE_PATTERNS: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/\b(?:0BSD|Zero[- ]Clause BSD|BSD[- ]Zero[- ]Clause)\b/i, () => '0BSD'],
  [/\b(?:AGPL|GNU Affero(?: General Public License)?|Affero GPL)(?:[\s,-]*(?:v|version\s*)?(\d)(?:\.0)?)?/i, (m) => `AGPL-${m[1] ?? '3'}.0`],
  [/\b(?:LGPL|GNU Lesser General Public License|Lesser GPL)(?:[\s,-]*(?:v|version\s*)?(\d(?:\.\d)?))?/i, (m) => (m[1] ? `LGPL-${m[1].includes('.') ? m[1] : `${m[1]}.0`}` : 'LGPL')],
  [/\b(?:GPL|GNU General Public License|GNU GPL)(?:[\s,-]*(?:v|version\s*)?(\d)(?:\.0)?)?/i, (m) => (m[1] ? `GPL-${m[1]}.0` : 'GPL')],
  [/\bApache(?:[\s-]+Licen[cs]e)?(?:[\s,-]*(?:v|version\s*)?(\d)(?:\.\d)?)?/i, (m) => `Apache-${m[1] ?? '2'}.0`],
  [/\bMIT\b|Permission is hereby granted, free of charge/, () => 'MIT'],
  [/\b(?:BSD[\s-]*(\d)[\s-]*(?:Clause)?|(\d)[\s-]*Clause[\s-]*BSD)\b/i, (m) => `BSD-${m[1] ?? m[2]}-Clause`],
  [/\bBSD\b/, () => 'BSD'],
  [/\bISC\b/, () => 'ISC'],
  [/\b(?:MPL|Mozilla Public License)(?:[\s,-]*(?:v|version\s*)?(\d)(?:\.\d)?)?/i, (m) => `MPL-${m[1] ?? '2'}.0`],
  [/\b(?:The\s+)?Unlicen[cs]e\b/i, () => 'Unlicense'],
  [/\bCC0\b|Creative Commons Zero|\bCC Zero\b/i, () => 'CC0-1.0'],
  [
    /\bCC[\s-]?BY((?:[\s-](?:NC|SA|ND))*)(?:[\s-](\d\.\d))?/i,
    (m) => `CC-BY${(m[1] ?? '').toUpperCase().replace(/\s/g, '-')}-${m[2] ?? '4.0'}`,
  ],
  [
    /Creative Commons Attribution((?:[\s-]+(?:NonCommercial|ShareAlike|NoDerivatives|NoDerivs))*)(?:[\s-]+(\d\.\d))?/i,
    (m) => {
      const parts = (m[1] ?? '').toLowerCase();
      const suffix = `${parts.includes('noncommercial') ? '-NC' : ''}${parts.includes('sharealike') ? '-SA' : ''}${parts.includes('noderiv') ? '-ND' : ''}`;
      return `CC-BY${suffix}-${m[2] ?? '4.0'}`;
    },
  ],
  [/Boost Software License|\bBSL-1\.0\b/i, () => 'BSL-1.0'],
  [/\b(?:EPL|Eclipse Public License)(?:[\s,-]*(?:v|version\s*)?(\d)(?:\.0)?)?/i, (m) => `EPL-${m[1] ?? '2'}.0`],
  [/\bWTFPL\b/i, () => 'WTFPL'],
  [/\bzlib(?:\/libpng)? licen[cs]e\b/i, () => 'Zlib'],
];

/** Licence identifiers in text, in order of appearance (e.g. "Apache-2.0", "MIT"). */
export function detectLicences(text: string): string[] {
  const found: Array<{ id: string; index: number; end: number }> = [];
  for (const [re, toId] of LICENCE_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(g)) {
      const index = m.index ?? 0;
      const end = index + m[0].length;
      if (found.some((f) => index < f.end && end > f.index)) continue; // "GPL" inside "LGPL" / "AGPL"
      found.push({ id: toId(m as unknown as RegExpExecArray), index, end });
    }
  }
  const ids: string[] = [];
  for (const f of found.sort((a, b) => a.index - b.index)) if (!ids.includes(f.id)) ids.push(f.id);
  return ids.slice(0, 3);
}

const PROPRIETARY = 'All rights reserved (proprietary)';

function extractLicence(model: DocModel): Fact | null {
  const units = model.units;
  const licenceHref = (block: BlockInfo | null): string | undefined => {
    for (const u of units) {
      if (!block || u.block.section !== block.section || !has(u.block, 'licence')) continue;
      const l = u.flat.links.find((x) => /licen[cs]e|copying/i.test(x.url));
      if (l) return l.url;
    }
    // Otherwise any link to the LICENSE file (often the licence badge's link).
    for (const u of units) {
      const l = u.flat.links.find((x) => /(^|\/)(licen[cs]e|copying)(\.(md|txt|rst))?$/i.test(x.url.split(/[?#]/)[0] ?? ''));
      if (l) return l.url;
    }
    return undefined;
  };

  // 1. The Licence section (heading text included, e.g. "## License: MIT").
  const sectionUnits = units.filter((u) => has(u.block, 'licence') && !has(u.block, 'boilerplate'));
  for (const u of sectionUnits.slice(0, 8)) {
    const ids = detectLicences(u.flat.text);
    if (ids.length) {
      return { kind: 'licence', label: 'Licence', value: ids.join(' OR '), line: unitLine(u), href: licenceHref(u.block), source: u.kind === 'heading' ? 'heading' : 'text' };
    }
  }
  const licenceHeading = model.headings.find((h) => h.kinds.includes('licence'));
  if (licenceHeading) {
    const ids = detectLicences(licenceHeading.text);
    if (ids.length) return { kind: 'licence', label: 'Licence', value: ids.join(' OR '), line: licenceHeading.line, href: licenceHref(null), source: 'heading' };
  }

  // 2. A licence badge.
  for (const u of units) {
    for (const img of u.flat.images) {
      if (!img.badge) continue;
      const shield = parseShieldsUrl(img.src);
      const label = `${img.alt} ${shield?.label ?? ''}`;
      if (!/licen[cs]e/i.test(label) && !/\/license\b/i.test(img.src)) continue;
      const ids = detectLicences(`${img.alt} ${shield?.message ?? ''}`);
      if (ids.length) return { kind: 'licence', label: 'Licence', value: ids.join(' OR '), line: img.line, href: img.link ?? undefined, source: 'badge' };
    }
  }

  // 3. "Released under the MIT licence", "MIT-licensed".
  for (const u of units) {
    const text = proseOnly(u.flat);
    const phrase =
      /(?:licen[cs]ed|released|distributed|available|published|provided|open[- ]sourced?|shared|covered)\s+under\s+(?:the\s+)?(?:terms\s+of\s+(?:the\s+)?)?([^.\u{2029}]{0,100})/iu.exec(text) ??
      /\b([\w.-]+(?:[\s-][\w.-]+)?)[\s-]licen[cs]ed\b/i.exec(text);
    if (phrase) {
      const ids = detectLicences(phrase[1] ?? '');
      if (ids.length) return { kind: 'licence', label: 'Licence', value: ids.join(' OR '), line: lineIn(u.flat, phrase.index, unitLine(u)), href: licenceHref(null), source: 'text' };
    }
    // "Code under the MIT Licence; art © 2026 ...": any clause naming a licence.
    const clause = /[^.;\u{2029}]*\blicen[cs]e\b[^.;\u{2029}]*/iu.exec(text);
    if (clause) {
      const ids = detectLicences(clause[0]);
      if (ids.length) return { kind: 'licence', label: 'Licence', value: ids.join(' OR '), line: lineIn(u.flat, clause.index, unitLine(u)), href: licenceHref(null), source: 'text' };
    }
  }

  // 4. "All rights reserved".
  for (const u of units) {
    const i = u.flat.text.search(/all rights reserved/i);
    if (i >= 0) return { kind: 'licence', label: 'Licence', value: PROPRIETARY, line: lineIn(u.flat, i, unitLine(u)), source: 'text' };
  }

  // 5. A Licence section without a recognisable identifier: its first sentence.
  const firstProse = sectionUnits.find((u) => u.kind !== 'heading' && u.flat.text.trim());
  if (firstProse) {
    const span = splitSentences(firstProse.flat.text)[0];
    if (span) {
      const value = stripDecor(firstProse.flat.text.slice(span.start, span.end));
      if (value) return { kind: 'licence', label: 'Licence', value: truncate(value, 120), line: unitLine(firstProse), href: licenceHref(firstProse.block), source: 'text' };
    }
  }

  // 6. A bare copyright line and no licence anywhere.
  for (const u of units) {
    const i = u.flat.text.search(/©|\(c\)\s*\d{4}|\bcopyright\b\s*(?:©|\(c\))?\s*\d{4}/i);
    if (i >= 0) return { kind: 'licence', label: 'Licence', value: PROPRIETARY, line: lineIn(u.flat, i, unitLine(u)), source: 'text' };
  }
  return null;
}

// ---------------------------------------------------------------------------- authors

const PROFILE_RESERVED = /^(sponsors|orgs|features|topics|marketplace|about|pricing|login|signup|settings|apps|collections|explore|trending|site|security|readme|enterprise|team|customer-stories|intent|share|home|search|hashtag|i|notifications|messages|compose)$/i;

function profileOf(url: string): { platform: string; handle: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const segs = u.pathname.split('/').filter(Boolean);
  const one = segs.length === 1 ? segs[0]! : null;
  if (host === 'github.com' && one && !PROFILE_RESERVED.test(one)) return { platform: 'GitHub', handle: `@${one}` };
  if (host === 'gitlab.com' && one) return { platform: 'GitLab', handle: `@${one}` };
  if ((host === 'twitter.com' || host === 'x.com') && one && !PROFILE_RESERVED.test(one)) return { platform: 'X (Twitter)', handle: `@${one}` };
  if (host === 'linkedin.com' && (segs[0] === 'in' || segs[0] === 'company') && segs[1]) return { platform: 'LinkedIn', handle: segs[1] };
  if (host === 'bsky.app' && segs[0] === 'profile' && segs[1]) return { platform: 'Bluesky', handle: `@${segs[1]}` };
  if (host === 'medium.com' && one) return { platform: 'Medium', handle: one.startsWith('@') ? one : `@${one}` };
  if (host === 'youtube.com' && one?.startsWith('@')) return { platform: 'YouTube', handle: one };
  if (host === 'instagram.com' && one) return { platform: 'Instagram', handle: `@${one}` };
  if (host === 'dev.to' && one) return { platform: 'DEV', handle: `@${one}` };
  if (host === 'kaggle.com' && one) return { platform: 'Kaggle', handle: one };
  if (host === 'huggingface.co' && one) return { platform: 'Hugging Face', handle: one };
  if (host === 'leetcode.com' && (one || segs[0] === 'u')) return { platform: 'LeetCode', handle: segs[segs.length - 1]! };
  if (host === 'codepen.io' && one) return { platform: 'CodePen', handle: one };
  if (host === 'stackoverflow.com' && segs[0] === 'users' && segs[2]) return { platform: 'Stack Overflow', handle: segs[2] };
  if (host === 't.me' && one) return { platform: 'Telegram', handle: `@${one}` };
  if (one && /^@[\w.]+$/.test(one)) return { platform: 'Mastodon', handle: `${one}@${host}` };
  return null;
}

const PLATFORM_WORDS = /^(github|gitlab|linkedin|twitter|x|x \(twitter\)|bluesky|medium|youtube|instagram|dev\.?to|kaggle|hugging ?face|leetcode|codepen|stack ?overflow|telegram|mastodon|mail|e-?mail|gmail|website|portfolio|blog|profile|follow|follow me|connect|discord|reddit|twitch)$/i;
const NAME_WORD = "[\\p{Lu}@][\\p{L}\\p{M}\\p{N}.'’_-]*";
const PARTICLES = '(?:de|van|von|der|den|da|di|du|dos|das|le|la|bin|ben|ibn|al|el|y)';
const NAME_RE = new RegExp(`^(?:the\\s+)?${NAME_WORD}(?:\\s+(?:${NAME_WORD}|${PARTICLES}(?=\\s+\\p{Lu})))*(?:\\s+(?:team|authors|contributors|developers|community|studio|games|labs))?`, 'u');
const NOT_NAMES = /^(the community|community|contributors|you|us|me|many|people|humans|developers|the team|github|all rights reserved|mit|apache|gpl)$/i;

/** A person or team name at the start of `text` (capitalised words, particles allowed). */
function nameAt(text: string): string | null {
  const m = NAME_RE.exec(text.trimStart());
  if (!m) return null;
  const words: string[] = [];
  for (const word of m[0].split(/\s+/).slice(0, 6)) {
    words.push(word);
    // A full stop after a word (not an initial like "J.") ends the name.
    if (/[\p{L}\p{N}]{2,}[.!?]$/u.test(word)) break;
  }
  let name = words.join(' ').replace(/\s+(All|Licensed|Released)$/i, '');
  name = name.replace(/[.,;:!?)'’]+$/, '').replace(/\s+\d{4}$/, '').trim();
  if (!name || NOT_NAMES.test(name) || name.length < 2) return null;
  return name;
}

const MADE_BY = /\b(?:made|created|developed|built|written|designed|maintained|crafted|hand-?crafted|coded|authored|programmed|brought to you|réalisé|créé|développé|conçu)(?:\s+with\s+(?:\S{1,4}|love|care|passion|coffee)(?:\s+(?:and|&)\s+\S{1,12})?)?(?:\s+(?:in|at|from)\s+\p{Lu}[\p{L}-]+)?\s+(?:by|par)\s+/giu;
const COPYRIGHT = /(?:©|\(c\)|\bcopyright\b)(?:\s*(?:©|\(c\)))?\s*(?:\d{4}(?:\s*[-–—]\s*(?:\d{4}|present|now))?,?\s*)?/giu;
const IAM = /\b(?:I['’]?m|I am|my name is|je suis|je m['’]appelle)\s+/giu;
const EMAIL = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?![\w-])/gi;
const FAKE_EMAIL = /^(?:you|your[._-]?(?:name|email)|user(?:name)?|name|email|me|someone|foo|test|git|noreply|no-reply)@|@(?:example\.(?:com|org|net)|domain\.com|email\.com|yourdomain\.\w+|company\.com|test\.com|users\.noreply\.github\.com)$/i;
const HANDLE = /(?<![\w@.])@([A-Za-z0-9_](?:[A-Za-z0-9_-]{0,38}))(?![\w@.-])/g;

function extractAuthors(model: DocModel): Fact[] {
  const list = new FactList();
  const add = (label: string, value: string, line: number, source: Fact['source'], href?: string) => {
    const v = value.replace(/\s+/g, ' ').trim();
    if (!v) return;
    list.add(href ? { kind: 'author', label, value: v, line, source, href } : { kind: 'author', label, value: v, line, source });
  };
  const nameAfter = (unit: TextUnit, end: number): { name: string; href?: string; index: number } | null => {
    const link = unit.flat.links.find((l) => l.start >= end && l.start <= end + 2 && l.end > l.start);
    if (link) {
      const text = stripDecor(flatSlice(unit.flat, link.start, link.end));
      if (text && !PLATFORM_WORDS.test(text)) return { name: text, href: link.url, index: link.start };
    }
    const rest = unit.flat.text.slice(end).split(BREAK)[0] ?? '';
    const name = nameAt(rest);
    return name ? { name, index: end } : null;
  };
  const roleOf = (block: BlockInfo): string => {
    const h = (block.heading?.text ?? '').toLowerCase();
    if (has(block, 'credits') && !has(block, 'authors')) return 'Credit';
    if (/maintainer/.test(h)) return 'Maintainer';
    if (/contact|connect|reach|touch|social|find me/.test(h)) return 'Contact';
    return 'Author';
  };

  for (const unit of model.units) {
    const flat = unit.flat;
    const fallback = unitLine(unit);
    const inAuthors = has(unit.block, 'authors', 'credits');
    const role = roleOf(unit.block);
    const prose = proseOnly(flat);

    // Emails (mailto links anywhere, plain addresses in prose).
    for (const link of flat.links) {
      const m = /^mailto:([^?]+)/i.exec(link.url.trim());
      if (m) {
        const email = decodeURIComponent(m[1]!).trim();
        if (!FAKE_EMAIL.test(email)) add('Email', email, link.line, 'text', `mailto:${email}`);
      }
    }
    for (const m of prose.matchAll(EMAIL)) {
      if (!FAKE_EMAIL.test(m[0])) add('Email', m[0], lineIn(flat, m.index ?? 0, fallback), 'text', `mailto:${m[0]}`);
    }

    // "Made with ❤️ by X", "© 2026 X", "by X" at the top, "I'm X" in the intro.
    if (unit.kind !== 'heading' || unit.block.section === 0 || unit.flat.headings.length) {
      for (const re of [MADE_BY, COPYRIGHT]) {
        re.lastIndex = 0;
        for (const m of prose.matchAll(re)) {
          const found = nameAfter(unit, (m.index ?? 0) + m[0].length);
          if (found && !/^(the\s+)?(mit|apache|gnu|bsd)\b/i.test(found.name)) add(inAuthors && role !== 'Credit' ? role : 'Author', found.name, lineIn(flat, m.index ?? 0, fallback), 'text', found.href);
        }
      }
    }
    if (unit.block.section === 0 || inAuthors || unit.block.node === model.blocks[0]?.node) {
      const by = /^\s*by\s+/i.exec(prose);
      if (by && (unit.kind === 'paragraph' || unit.kind === 'html')) {
        const found = nameAfter(unit, by[0].length);
        if (found) add('Author', found.name, fallback, 'text', found.href);
      }
      IAM.lastIndex = 0;
      for (const m of prose.matchAll(IAM)) {
        const found = nameAfter(unit, (m.index ?? 0) + m[0].length);
        if (found) add('Author', found.name, lineIn(flat, m.index ?? 0, fallback), unit.kind === 'heading' ? 'heading' : 'text', found.href);
      }
    }

    if (!inAuthors) continue;

    // Author / Contact / Maintainers / Credits sections. A "Role | Name" table or a
    // "Music: Jane Doe" list item labels the person with their role.
    let unitRole = role;
    if (unit.kind === 'cell') {
      if (unit.row === 0) continue;
      const row = model.units.filter((u) => u.kind === 'cell' && u.block === unit.block && u.row === unit.row);
      if (row.length > 1) {
        if (unit.cell === 0) continue;
        const roleText = stripDecor(flatSlice(row[0]!.flat, 0, row[0]!.flat.text.length));
        if (roleText && roleText.length <= 40) unitRole = roleText;
      }
    } else if (unit.kind === 'list') {
      const m = /^([^:]{2,30}):\s/.exec(stripDecor(flat.text));
      if (m && !/https?|@/.test(m[1]!)) unitRole = m[1]!.trim();
    }
    const roleFromText = unit.kind === 'list' && unitRole !== role;
    let linked = false;
    for (const link of flat.links) {
      const url = link.url.trim();
      if (!/^https?:/i.test(url)) continue;
      const profile = profileOf(url);
      const text = linkText(flat, link);
      // Icon-only links (a LinkedIn logo whose alt is a handle) show the platform instead.
      const iconOnly = link.end <= link.start;
      const meaningful = !iconOnly && text && !PLATFORM_WORDS.test(text) && !/^(https?:\/\/|www\.)/i.test(text) && text.length <= 60;
      if (profile) {
        linked = true;
        if (meaningful) add(unitRole, text, link.line, 'text', url);
        else add(profile.platform, profile.handle, link.line, link.images.length ? 'badge' : 'text', url);
      } else if (role !== 'Credit' && meaningful && !has(unit.block, 'boilerplate')) {
        linked = true;
        add(unitRole, text, link.line, 'text', url);
      }
    }
    if (unit.kind === 'heading') continue;
    for (const m of prose.matchAll(HANDLE)) add(unitRole, `@${m[1]}`, lineIn(flat, m.index ?? 0, fallback), 'text');
    if (!linked && (unit.kind === 'list' || unit.kind === 'paragraph' || unit.kind === 'cell')) {
      let text = stripDecor(flat.text.split(BREAK)[0] ?? '');
      if (roleFromText) text = text.slice(text.indexOf(':') + 1).trim();
      const head = text.split(/\s+[-–—|:(]\s*|\s*[(,]\s*/)[0] ?? '';
      const name = nameAt(head);
      if (name && name === head.trim().replace(/[.,;:!?]+$/, '') && name.split(/\s+/).length <= 5 && !/@/.test(name)) add(unitRole, name, fallback, 'text');
    }
  }
  return list.list().slice(0, MAX_AUTHORS);
}

const MAX_AUTHORS = 20;

// ---------------------------------------------------------------------------- features

function extractFeatures(model: DocModel): Feature[] {
  const firstBlock = model.blocks.find((b) => b.path.some((h) => h.kinds.includes('features')));
  if (!firstBlock) return [];
  const heading = firstBlock.path.find((h) => h.kinds.includes('features'))!;
  const units = model.units.filter((u) => u.block.section === firstBlock.section && u.block.path.includes(heading));
  const out: Feature[] = [];
  const oneLine = (node: TextUnit['node']): string => {
    const s = node.position?.start.offset;
    const e = node.position?.end.offset;
    return s !== undefined && e !== undefined ? model.source.slice(s, e).replace(/\s*\n\s*/g, ' ').trim() : '';
  };
  const seen = new Set<unknown>();
  for (const u of units) {
    if (u.kind !== 'list' || u.listDepth !== 1 || !u.item || seen.has(u.item)) continue;
    seen.add(u.item);
    const text = stripDecor(flatSlice(u.flat, 0, u.flat.text.length));
    if (text) out.push({ text, markdown: oneLine(u.node) || text, line: unitLine(u) });
  }
  if (!out.length) {
    for (const u of units) {
      if (u.kind !== 'cell' || u.row === 0 || u.cell !== 0) continue;
      const row = units.filter((x) => x.kind === 'cell' && x.block === u.block && x.row === u.row);
      const cells = row.map((x) => stripDecor(flatSlice(x.flat, 0, x.flat.text.length))).filter(Boolean);
      if (cells.length) out.push({ text: cells.join(' — '), markdown: cells.length > 1 ? `**${cells[0]}** — ${cells.slice(1).join(' — ')}` : cells[0]!, line: unitLine(u) });
    }
  }
  if (!out.length) {
    for (const h of model.headings) {
      if (h.depth > heading.depth && h.line > heading.line && units.some((u) => u.kind === 'heading' && unitLine(u) === h.line)) {
        const text = stripDecor(h.text);
        if (text) out.push({ text, markdown: text, line: h.line });
      }
    }
  }
  return out.slice(0, 12);
}

// ---------------------------------------------------------------------------- entry point

export function extractFacts(model: DocModel, ctx: FactContext = {}): Facts {
  const commands = extractCommands(model);
  return {
    tech: extractTech(model, commands.all),
    install: commands.install,
    run: commands.run,
    requirements: extractRequirements(model),
    links: extractLinks(model, ctx),
    licence: extractLicence(model),
    authors: extractAuthors(model),
    features: extractFeatures(model),
  };
}
