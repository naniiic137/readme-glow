/** Friendly names for code fence languages, and aliases highlight.js understands. */
const LABELS: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  json: 'JSON',
  jsonc: 'JSON',
  json5: 'JSON5',
  sh: 'Shell',
  bash: 'Bash',
  shell: 'Shell',
  zsh: 'Zsh',
  console: 'Console',
  terminal: 'Terminal',
  powershell: 'PowerShell',
  ps1: 'PowerShell',
  ps: 'PowerShell',
  bat: 'Batch',
  cmd: 'Batch',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  ruby: 'Ruby',
  go: 'Go',
  golang: 'Go',
  rs: 'Rust',
  rust: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  kotlin: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  h: 'C',
  cpp: 'C++',
  'c++': 'C++',
  cc: 'C++',
  hpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  'c#': 'C#',
  fs: 'F#',
  php: 'PHP',
  html: 'HTML',
  xml: 'XML',
  svg: 'SVG',
  vue: 'Vue',
  svelte: 'Svelte',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  sql: 'SQL',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  ini: 'INI',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  makefile: 'Makefile',
  make: 'Makefile',
  md: 'Markdown',
  markdown: 'Markdown',
  diff: 'Diff',
  patch: 'Diff',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  lua: 'Lua',
  r: 'R',
  dart: 'Dart',
  scala: 'Scala',
  perl: 'Perl',
  pl: 'Perl',
  elixir: 'Elixir',
  ex: 'Elixir',
  erlang: 'Erlang',
  haskell: 'Haskell',
  hs: 'Haskell',
  clojure: 'Clojure',
  ocaml: 'OCaml',
  nim: 'Nim',
  zig: 'Zig',
  solidity: 'Solidity',
  sol: 'Solidity',
  asm: 'Assembly',
  nasm: 'Assembly',
  wasm: 'WebAssembly',
  objectivec: 'Objective-C',
  objc: 'Objective-C',
  vb: 'Visual Basic',
  vbnet: 'VB.NET',
  pascal: 'Pascal',
  delphi: 'Delphi',
  text: 'Text',
  txt: 'Text',
  plaintext: 'Text',
  env: 'dotenv',
  dotenv: 'dotenv',
  nginx: 'Nginx',
  apache: 'Apache',
  http: 'HTTP',
  mermaid: 'Mermaid',
  math: 'Math',
  latex: 'LaTeX',
  tex: 'LaTeX',
  csv: 'CSV',
  properties: 'Properties',
  gradle: 'Gradle',
  groovy: 'Groovy',
  arduino: 'Arduino',
  ino: 'Arduino',
  cmake: 'CMake',
  proto: 'Protobuf',
  protobuf: 'Protobuf',
  hcl: 'HCL',
  terraform: 'Terraform',
  tf: 'Terraform',
  julia: 'Julia',
  matlab: 'MATLAB',
  vim: 'Vim script',
  prisma: 'Prisma',
};

/** Aliases for highlight.js grammar names (lowlight "common" set + a few). */
const HLJS_ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  jsonc: 'json',
  json5: 'json',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  terminal: 'bash',
  py: 'python',
  rb: 'ruby',
  golang: 'go',
  rs: 'rust',
  kt: 'kotlin',
  h: 'c',
  'c++': 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  html: 'xml',
  svg: 'xml',
  vue: 'xml',
  svelte: 'xml',
  yml: 'yaml',
  toml: 'ini',
  env: 'bash',
  dotenv: 'bash',
  docker: 'dockerfile',
  make: 'makefile',
  md: 'markdown',
  patch: 'diff',
  gql: 'graphql',
  pl: 'perl',
  objc: 'objectivec',
  ps1: 'powershell',
  ps: 'powershell',
  bat: 'dos',
  cmd: 'dos',
  txt: 'plaintext',
  text: 'plaintext',
  ino: 'arduino',
  proto: 'protobuf',
  tf: 'hcl',
  terraform: 'hcl',
};

export function languageLabel(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const key = lang.toLowerCase();
  return LABELS[key] ?? (lang.length <= 14 ? lang : lang.slice(0, 14));
}

export function hljsName(lang: string): string {
  const key = lang.toLowerCase();
  return HLJS_ALIASES[key] ?? key;
}

/**
 * Splits a fence info string into language and filename.
 * Supports ```js title="app.js"```, ```js filename=app.js```, ```js:app.js``` and ```app.js``` (a bare filename).
 */
export function parseFenceInfo(lang: string | null, meta: string | null): { lang: string | null; filename: string | null } {
  let language = lang;
  let filename: string | null = null;
  if (language && language.includes(':') && !language.startsWith('http')) {
    const [l, ...rest] = language.split(':');
    language = l || null;
    filename = rest.join(':') || null;
  }
  if (meta) {
    const match = /(?:^|\s)(?:title|filename|file|name)=(?:"([^"]+)"|'([^']+)'|(\S+))/i.exec(meta);
    if (match) filename = match[1] ?? match[2] ?? match[3] ?? null;
    else if (!filename && /^[\w./-]+\.\w+$/.test(meta.trim())) filename = meta.trim();
  }
  if (language && !filename && /^[\w-]+\.[\w.]+$/.test(language) && language.split('.').pop()!.length <= 10) {
    const ext = language.split('.').pop()!.toLowerCase();
    if (LABELS[ext] || ext === 'md') {
      filename = language;
      language = ext;
    }
  }
  return { lang: language, filename };
}
