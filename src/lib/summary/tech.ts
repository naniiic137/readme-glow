/**
 * Technology dictionary for the "tech stack" facts: names, categories, the
 * patterns that find them in prose, and the aliases used by badges, icon
 * sets, code-fence languages, package names and install commands.
 *
 * `strict` patterns run on all prose and are chosen to avoid false positives
 * (e.g. "React" only capitalised, Go only as "Golang"/"written in Go").
 * `loose` patterns only run where a tech name is expected anyway: "Tech stack"
 * / "Built with" sections, badge text and image alt text.
 */
export type TechCategory =
  | 'Language'
  | 'Framework'
  | 'Library'
  | 'Runtime'
  | 'Database'
  | 'Cloud'
  | 'Tool'
  | 'Platform'
  | 'AI'
  | 'Game engine'
  | 'Hardware';

export interface TechEntry {
  name: string;
  category: TechCategory;
  strict: RegExp | null;
  loose: RegExp | null;
  /** Only shown when nothing else was found (shell, JSON, YAML, ...). */
  weak: boolean;
}

interface Def {
  n: string;
  c: TechCategory;
  /** Strict pattern source. */
  s?: string;
  /** Case-insensitive strict pattern. */
  i?: boolean;
  /** Loose pattern source (case-insensitive). */
  l?: string;
  /** Extra alias keys (badge logos, icon slugs, fence languages, packages). */
  a?: string[];
  weak?: boolean;
}

const DEFS: Def[] = [
  // Languages
  { n: 'TypeScript', c: 'Language', s: 'TypeScript', i: true, l: 'TS', a: ['ts', 'tsx', 'mts', 'cts', 'typescript'] },
  { n: 'JavaScript', c: 'Language', s: 'JavaScript|ECMAScript', i: true, l: 'JS', a: ['js', 'jsx', 'mjs', 'cjs', 'javascript', 'es6'] },
  { n: 'Python', c: 'Language', s: 'Python[23]?', i: true, a: ['py', 'python3', 'py3', 'pyw', 'ipython'] },
  { n: 'Rust', c: 'Language', s: 'Rust(?:lang)?', l: 'rust', a: ['rs', 'rustlang'] },
  {
    n: 'Go',
    c: 'Language',
    s: 'Golang|(?<=\\b(?:[Ii]n|[Ww]ith|[Uu]sing|[Ff]or)\\s)Go(?!\\s+(?:to|back|ahead|through|further|live|online|for|on|out|up|over)\\b)|Go(?=\\s+1\\.\\d)',
    l: 'Go|Golang',
    a: ['golang'],
  },
  { n: 'Java', c: 'Language', s: 'Java', a: ['openjdk', 'jdk'] },
  { n: 'Kotlin', c: 'Language', s: 'Kotlin', i: true, a: ['kt', 'kts'] },
  { n: 'Swift', c: 'Language', s: 'Swift(?!UI)', l: 'swift' },
  { n: 'C#', c: 'Language', s: 'C#|C-[Ss]harp|CSharp', a: ['cs', 'csharp', 'c#'] },
  { n: 'C++', c: 'Language', s: 'C\\+\\+|CPP', a: ['cpp', 'cplusplus', 'c++', 'cc', 'cxx', 'hpp', 'hxx'] },
  { n: 'C', c: 'Language', a: ['c', 'h'] },
  { n: 'Objective-C', c: 'Language', s: 'Objective-C', i: true, a: ['objc', 'objectivec'] },
  { n: 'PHP', c: 'Language', s: 'PHP', a: ['php'] },
  { n: 'Ruby', c: 'Language', s: 'Ruby(?! on Rails)', l: 'ruby', a: ['rb'] },
  { n: 'Dart', c: 'Language', s: 'Dart', l: 'dart' },
  { n: 'Lua', c: 'Language', s: 'Lua(?:JIT)?', l: 'lua', a: ['luau'] },
  { n: 'Elixir', c: 'Language', s: 'Elixir', a: ['ex', 'exs'] },
  { n: 'Haskell', c: 'Language', s: 'Haskell', i: true, a: ['hs'] },
  { n: 'Scala', c: 'Language', s: 'Scala' },
  { n: 'R', c: 'Language', a: ['r', 'rlang'] },
  { n: 'Julia', c: 'Language', l: 'julia', a: ['jl'] },
  { n: 'Zig', c: 'Language', s: 'Zig' },
  { n: 'Perl', c: 'Language', s: 'Perl', a: ['pl'] },
  { n: 'Clojure', c: 'Language', s: 'Clojure', i: true, a: ['clj', 'cljs'] },
  { n: 'Solidity', c: 'Language', s: 'Solidity', i: true, a: ['sol'] },
  { n: 'GDScript', c: 'Language', s: 'GDScript', i: true, a: ['gd'] },
  { n: 'HTML', c: 'Language', s: 'HTML5?', a: ['html', 'html5', 'htm', 'xhtml'] },
  { n: 'CSS', c: 'Language', s: 'CSS3?', a: ['css', 'css3'] },
  { n: 'Sass', c: 'Language', s: 'Sass|SCSS', a: ['scss', 'sass'] },
  { n: 'SQL', c: 'Language', s: 'SQL', a: ['sql', 'plsql', 'tsql'] },
  { n: 'Assembly', c: 'Language', s: 'Assembly language', a: ['asm', 'nasm', 'assembly'] },
  { n: 'Shell', c: 'Language', a: ['bash', 'sh', 'shell', 'zsh', 'fish', 'gnubash', 'shellscript'], weak: true },
  { n: 'PowerShell', c: 'Language', s: 'PowerShell', a: ['ps1', 'pwsh', 'powershell'], weak: true },
  { n: 'JSON', c: 'Language', a: ['json', 'jsonc', 'json5'], weak: true },
  { n: 'YAML', c: 'Language', a: ['yaml', 'yml'], weak: true },
  { n: 'TOML', c: 'Language', a: ['toml'], weak: true },
  { n: 'Markdown', c: 'Language', a: ['md', 'markdown', 'mdx'], weak: true },
  { n: 'XML', c: 'Language', a: ['xml'], weak: true },

  // Front-end frameworks and libraries
  { n: 'React', c: 'Framework', s: 'React(?:\\.js|JS)?', l: 'react', a: ['reactjs', 'react-dom'] },
  { n: 'React Native', c: 'Framework', s: 'React Native', i: true, a: ['reactnative'] },
  { n: 'Vue', c: 'Framework', s: 'Vue(?:\\.js|JS)?(?!\\s+(?:d[\'’]|de\\b|du\\b|des\\b))', l: 'vue', a: ['vuejs'] },
  { n: 'Svelte', c: 'Framework', s: 'Svelte', l: 'svelte' },
  { n: 'SvelteKit', c: 'Framework', s: 'SvelteKit', i: true },
  { n: 'Angular', c: 'Framework', s: 'Angular(?:JS)?', l: 'angular', a: ['angularjs', 'ng'] },
  { n: 'Next.js', c: 'Framework', s: 'Next\\.?js', i: true, a: ['next', 'nextjs'] },
  { n: 'Nuxt', c: 'Framework', s: 'Nuxt(?:\\.?js)?', a: ['nuxt', 'nuxtjs', 'nuxi'] },
  { n: 'Astro', c: 'Framework', s: 'Astro', l: 'astro' },
  { n: 'Remix', c: 'Framework', l: 'Remix' },
  { n: 'Gatsby', c: 'Framework', s: 'Gatsby' },
  { n: 'SolidJS', c: 'Framework', s: 'SolidJS|Solid\\.js', i: true, a: ['solid'] },
  { n: 'Preact', c: 'Framework', s: 'Preact' },
  { n: 'jQuery', c: 'Library', s: 'jQuery', i: true },
  { n: 'Bootstrap', c: 'Framework', s: 'Bootstrap\\s?[345]|Bootstrap CSS', l: 'Bootstrap' },
  { n: 'Tailwind CSS', c: 'Framework', s: 'Tailwind(?:\\s?CSS)?', i: true, a: ['tailwind', 'tailwindcss'] },
  { n: 'Redux', c: 'Library', s: 'Redux' },
  { n: 'Three.js', c: 'Library', s: 'Three\\.?js', i: true, a: ['three', 'threejs'] },
  { n: 'Babylon.js', c: 'Library', s: 'Babylon\\.?js', i: true },
  { n: 'p5.js', c: 'Library', s: 'p5\\.js', i: true, a: ['p5'] },
  { n: 'D3.js', c: 'Library', s: 'D3(?:\\.js)?', a: ['d3', 'd3js'] },
  { n: 'Socket.IO', c: 'Library', s: 'Socket\\.?IO', i: true, a: ['socketio', 'socket.io'] },
  { n: 'Vite', c: 'Tool', s: 'Vite', l: 'vite', a: ['vitejs'] },
  { n: 'Webpack', c: 'Tool', s: 'Webpack', i: true },
  { n: 'Jest', c: 'Tool', s: 'Jest' },
  { n: 'Vitest', c: 'Tool', s: 'Vitest', i: true },
  { n: 'Playwright', c: 'Tool', s: 'Playwright' },
  { n: 'Cypress', c: 'Tool', s: 'Cypress' },
  { n: 'Storybook', c: 'Tool', s: 'Storybook' },

  // Back-end, runtimes
  { n: 'Node.js', c: 'Runtime', s: '[Nn]ode\\.?[Jj][Ss]|Node(?=\\s*(?:>=?|≥|v?\\d))', l: 'node', a: ['node', 'nodejs', 'node.js'] },
  { n: 'Deno', c: 'Runtime', s: 'Deno' },
  { n: 'Bun', c: 'Runtime', s: 'Bun(?=\\s|\\.|,|\\)|$)(?!\\s+(?:is a|recipe))', l: 'bun' },
  { n: 'Express', c: 'Framework', s: 'Express\\.?js|ExpressJS', i: true, l: 'Express', a: ['express', 'expressjs'] },
  { n: 'NestJS', c: 'Framework', s: 'NestJS|Nest\\.js', i: true, a: ['nest', 'nestjs'] },
  { n: 'Django', c: 'Framework', s: 'Django', i: true },
  { n: 'Flask', c: 'Framework', s: 'Flask', l: 'flask' },
  { n: 'FastAPI', c: 'Framework', s: 'FastAPI', i: true },
  { n: 'Spring Boot', c: 'Framework', s: 'Spring\\s?Boot|Spring Framework|Spring MVC', i: true, l: 'Spring', a: ['spring', 'springboot'] },
  { n: 'Laravel', c: 'Framework', s: 'Laravel', i: true },
  { n: 'Rails', c: 'Framework', s: 'Ruby on Rails|Rails', a: ['rails', 'rubyonrails', 'ror'] },
  { n: '.NET', c: 'Framework', s: '(?:ASP)?\\.NET(?:\\s?(?:Core|MAUI|\\d+))?|dotnet', a: ['dotnet', 'net', 'aspnet', 'dotnetcore', 'netcore'] },
  { n: 'Blazor', c: 'Framework', s: 'Blazor' },
  { n: 'Phoenix', c: 'Framework', l: 'Phoenix' },
  { n: 'GraphQL', c: 'Tool', s: 'GraphQL', i: true, a: ['gql'] },
  { n: 'tRPC', c: 'Library', s: 'tRPC' },
  { n: 'Prisma', c: 'Tool', s: 'Prisma', a: ['prisma', '@prisma/client'] },
  { n: 'Drizzle ORM', c: 'Tool', s: 'Drizzle(?: ORM)?' },

  // Databases and back-end services
  { n: 'PostgreSQL', c: 'Database', s: 'PostgreSQL|Postgres(?:QL)?', i: true, a: ['postgres', 'postgresql', 'pg', 'psql'] },
  { n: 'MySQL', c: 'Database', s: 'MySQL', i: true },
  { n: 'MariaDB', c: 'Database', s: 'MariaDB', i: true },
  { n: 'SQLite', c: 'Database', s: 'SQLite3?', i: true, a: ['sqlite3'] },
  { n: 'MongoDB', c: 'Database', s: 'MongoDB|Mongo(?=\\s)', a: ['mongo', 'mongodb', 'mongoose'] },
  { n: 'Redis', c: 'Database', s: 'Redis', i: true, a: ['ioredis'] },
  { n: 'Elasticsearch', c: 'Database', s: 'Elasticsearch', i: true },
  { n: 'DynamoDB', c: 'Database', s: 'DynamoDB', i: true },
  { n: 'Neo4j', c: 'Database', s: 'Neo4j', i: true },
  { n: 'Supabase', c: 'Cloud', s: 'Supabase', i: true, a: ['@supabase/supabase-js'] },
  { n: 'Firebase', c: 'Cloud', s: 'Firebase|Firestore', i: true },
  { n: 'Appwrite', c: 'Cloud', s: 'Appwrite', i: true },

  // Cloud and DevOps
  { n: 'Docker', c: 'Tool', s: 'Docker(?:\\s?Compose)?', i: true, a: ['dockerfile', 'docker-compose', 'dockercompose'] },
  { n: 'Kubernetes', c: 'Tool', s: 'Kubernetes|K8s', i: true, a: ['k8s', 'kubectl', 'helm'] },
  { n: 'AWS', c: 'Cloud', s: 'AWS|Amazon Web Services', a: ['aws', 'amazonaws', 'amazonwebservices'] },
  { n: 'Google Cloud', c: 'Cloud', s: 'Google Cloud(?: Platform)?|GCP', a: ['gcp', 'googlecloud', 'gcloud'] },
  { n: 'Azure', c: 'Cloud', s: '(?:Microsoft )?Azure', a: ['azure', 'microsoftazure'] },
  { n: 'Cloudflare', c: 'Cloud', s: 'Cloudflare(?: Workers| Pages)?', i: true, a: ['wrangler'] },
  { n: 'Vercel', c: 'Cloud', s: 'Vercel', i: true },
  { n: 'Netlify', c: 'Cloud', s: 'Netlify', i: true },
  { n: 'Heroku', c: 'Cloud', s: 'Heroku', i: true },
  { n: 'GitHub Actions', c: 'Tool', s: 'GitHub Actions', i: true, a: ['githubactions'] },
  { n: 'GitHub Pages', c: 'Cloud', s: 'GitHub Pages', i: true, a: ['githubpages'] },
  { n: 'Terraform', c: 'Tool', s: 'Terraform', a: ['tf', 'hcl'] },
  { n: 'Ansible', c: 'Tool', s: 'Ansible' },
  { n: 'Nginx', c: 'Tool', s: 'Nginx', i: true },
  { n: 'Homebrew', c: 'Tool', s: 'Homebrew', a: ['brew'] },
  { n: 'CMake', c: 'Tool', s: 'CMake', i: true },
  { n: 'Maven', c: 'Tool', s: 'Maven', a: ['apachemaven', 'mvn'] },
  { n: 'Gradle', c: 'Tool', s: 'Gradle', i: true, a: ['gradlew'] },

  // Apps, mobile, desktop
  { n: 'Electron', c: 'Framework', s: 'Electron(?:\\.js)?', l: 'electron' },
  { n: 'Tauri', c: 'Framework', s: 'Tauri', i: true, a: ['@tauri-apps/api', '@tauri-apps/cli'] },
  { n: 'Flutter', c: 'Framework', s: 'Flutter', l: 'flutter' },
  { n: 'Expo', c: 'Framework', s: 'Expo(?=\\s(?:Go|SDK|Router|app))', l: 'Expo' },
  { n: 'Ionic', c: 'Framework', s: 'Ionic(?: Framework)?' },
  { n: 'SwiftUI', c: 'Framework', s: 'SwiftUI', i: true },
  { n: 'Jetpack Compose', c: 'Framework', s: 'Jetpack Compose', i: true },
  { n: 'Qt', c: 'Framework', s: 'Qt\\s?[56]?(?=\\s|,|\\.|\\)|$)', a: ['qt', 'pyqt', 'pyside'] },
  { n: 'Tkinter', c: 'Library', s: 'Tkinter', i: true },
  { n: 'PyQt', c: 'Library', s: 'PyQt[56]?|PySide[26]?', i: true, a: ['pyqt5', 'pyqt6', 'pyside6'] },

  // Games and graphics
  { n: 'Unity', c: 'Game engine', s: 'Unity(?:3D| Engine)?', l: 'unity', a: ['unity3d', 'unityengine'] },
  { n: 'Godot', c: 'Game engine', s: 'Godot(?:\\s?Engine)?', i: true, a: ['godotengine'] },
  { n: 'Unreal Engine', c: 'Game engine', s: 'Unreal(?:\\s?Engine)?(?:\\s?[45])?', a: ['unrealengine', 'unreal'] },
  { n: 'Pygame', c: 'Library', s: 'Pygame', i: true },
  { n: 'Phaser', c: 'Game engine', s: 'Phaser(?:\\s?[23]|\\.js)?', a: ['phaserjs'] },
  { n: 'Bevy', c: 'Game engine', s: 'Bevy' },
  { n: 'LÖVE', c: 'Game engine', s: 'LÖVE|LÖVE2D|Love2D', a: ['love2d'] },
  { n: 'MonoGame', c: 'Game engine', s: 'MonoGame', i: true },

  // AI and data
  { n: 'PyTorch', c: 'AI', s: 'PyTorch', i: true, a: ['torch'] },
  { n: 'TensorFlow', c: 'AI', s: 'TensorFlow(?:\\.js)?', i: true },
  { n: 'Keras', c: 'AI', s: 'Keras', i: true },
  { n: 'scikit-learn', c: 'AI', s: 'scikit-learn|sklearn', i: true, a: ['sklearn'] },
  { n: 'Hugging Face', c: 'AI', s: 'Hugging\\s?Face', i: true, a: ['transformers'] },
  { n: 'OpenAI', c: 'AI', s: 'OpenAI', i: true },
  { n: 'Anthropic Claude', c: 'AI', s: 'Anthropic|Claude API', a: ['anthropic', 'claude'] },
  { n: 'Google Gemini', c: 'AI', s: 'Gemini API|Google Gemini', a: ['gemini', 'googlegemini', '@google/genai', 'google-genai'] },
  { n: 'Ollama', c: 'AI', s: 'Ollama', i: true },
  { n: 'LangChain', c: 'AI', s: 'LangChain', i: true, a: ['@langchain/core'] },
  { n: 'LlamaIndex', c: 'AI', s: 'LlamaIndex', i: true, a: ['llama-index', 'llama_index'] },
  { n: 'OpenCV', c: 'AI', s: 'OpenCV', i: true, a: ['cv2', 'opencv-python'] },
  { n: 'NumPy', c: 'Library', s: 'NumPy', i: true },
  { n: 'pandas', c: 'Library', s: 'pandas', i: true },
  { n: 'Jupyter', c: 'Tool', s: 'Jupyter(?: Notebooks?| Lab)?', i: true, a: ['ipynb', 'jupyterlab'] },
  { n: 'Streamlit', c: 'Framework', s: 'Streamlit', i: true },
  { n: 'Gradio', c: 'Framework', s: 'Gradio', i: true },

  // Hardware
  { n: 'Arduino', c: 'Hardware', s: 'Arduino', a: ['ino', 'arduino-cli'] },
  { n: 'Raspberry Pi', c: 'Hardware', s: 'Raspberry\\s?Pi(?:\\s?(?:Pico|\\d))?', i: true, a: ['raspberrypi', 'rpi'] },
  { n: 'ESP32', c: 'Hardware', s: 'ESP32|ESP8266', i: true, a: ['esp8266', 'espressif'] },
  { n: 'MicroPython', c: 'Language', s: 'MicroPython', i: true, a: ['mpremote', 'ampy'] },
  { n: 'CircuitPython', c: 'Language', s: 'CircuitPython', i: true },
];

const LEFT = '(?<![\\p{L}\\p{N}_#+.@-])';
const RIGHT = '(?![\\p{L}\\p{N}_#+]|\\.[\\p{L}\\p{N}])';

function compile(source: string | undefined, insensitive: boolean): RegExp | null {
  return source ? new RegExp(`${LEFT}(?:${source})${RIGHT}`, insensitive ? 'giu' : 'gu') : null;
}

export const TECH: TechEntry[] = DEFS.map((d) => ({
  name: d.n,
  category: d.c,
  strict: compile(d.s, d.i ?? false),
  loose: compile(d.l, true),
  weak: d.weak ?? false,
}));

/** Alias key: lower case, `dotjs` → `js`, punctuation other than # and + removed. */
export function aliasKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/dot(?=js$|net$)/, '.')
    .replace(/[^a-z0-9#+]/g, '');
}

const BY_ALIAS = new Map<string, TechEntry>();
DEFS.forEach((d, i) => {
  const entry = TECH[i]!;
  for (const key of [d.n, ...(d.a ?? [])]) {
    const k = aliasKey(key);
    if (k && !BY_ALIAS.has(k)) BY_ALIAS.set(k, entry);
  }
});

export const TECH_BY_NAME = new Map(TECH.map((t) => [t.name, t]));

/** Exact alias lookup ("nodedotjs", "ts", "python3", "C#" ...). */
export function techByAlias(value: string): TechEntry | null {
  const k = aliasKey(value);
  return k ? (BY_ALIAS.get(k) ?? null) : null;
}

export interface TechHit {
  entry: TechEntry;
  start: number;
  end: number;
}

/** Finds tech names in text; longer matches win ("React Native" over "React"). */
export function matchTech(text: string, loose = false): TechHit[] {
  const hits: TechHit[] = [];
  for (const entry of TECH) {
    for (const re of [entry.strict, loose ? entry.loose : null]) {
      if (!re) continue;
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) hits.push({ entry, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
  }
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: TechHit[] = [];
  for (const h of hits) if (!kept.some((k) => h.start < k.end && h.end > k.start)) kept.push(h);
  return kept.sort((a, b) => a.start - b.start);
}

/** Code fence language → tech (e.g. `ts` → TypeScript). */
export function techForLanguage(lang: string | null | undefined): TechEntry | null {
  if (!lang) return null;
  const l = lang.toLowerCase().split(/[\s{:]/)[0] ?? '';
  if (!l || /^(text|txt|plain|plaintext|console|shellsession|terminal|output|log|diff|patch|ansi|none|mermaid|math|csv|ini|env|dotenv|gitignore|http)$/.test(l)) {
    return null;
  }
  return techByAlias(l);
}

/** Package names (npm / PyPI / crates) → tech, for install commands and imports. */
const PACKAGES: Record<string, string> = {
  react: 'React',
  'react-dom': 'React',
  'create-react-app': 'React',
  'react-native': 'React Native',
  vue: 'Vue',
  'create-vue': 'Vue',
  svelte: 'Svelte',
  '@sveltejs/kit': 'SvelteKit',
  'create-svelte': 'Svelte',
  '@angular/core': 'Angular',
  '@angular/cli': 'Angular',
  next: 'Next.js',
  'create-next-app': 'Next.js',
  nuxt: 'Nuxt',
  nuxi: 'Nuxt',
  astro: 'Astro',
  'create-astro': 'Astro',
  vite: 'Vite',
  'create-vite': 'Vite',
  tailwindcss: 'Tailwind CSS',
  typescript: 'TypeScript',
  express: 'Express',
  '@nestjs/core': 'NestJS',
  '@nestjs/cli': 'NestJS',
  three: 'Three.js',
  electron: 'Electron',
  '@tauri-apps/api': 'Tauri',
  '@tauri-apps/cli': 'Tauri',
  'create-tauri-app': 'Tauri',
  prisma: 'Prisma',
  '@prisma/client': 'Prisma',
  graphql: 'GraphQL',
  '@supabase/supabase-js': 'Supabase',
  firebase: 'Firebase',
  'firebase-admin': 'Firebase',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  '@anthropic-ai/sdk': 'Anthropic Claude',
  '@google/genai': 'Google Gemini',
  'google-genai': 'Google Gemini',
  'google-generativeai': 'Google Gemini',
  langchain: 'LangChain',
  '@langchain/core': 'LangChain',
  ollama: 'Ollama',
  mongoose: 'MongoDB',
  mongodb: 'MongoDB',
  pg: 'PostgreSQL',
  'psycopg2': 'PostgreSQL',
  'psycopg2-binary': 'PostgreSQL',
  redis: 'Redis',
  ioredis: 'Redis',
  'socket.io': 'Socket.IO',
  jquery: 'jQuery',
  bootstrap: 'Bootstrap',
  redux: 'Redux',
  '@reduxjs/toolkit': 'Redux',
  'd3': 'D3.js',
  django: 'Django',
  flask: 'Flask',
  fastapi: 'FastAPI',
  torch: 'PyTorch',
  tensorflow: 'TensorFlow',
  keras: 'Keras',
  numpy: 'NumPy',
  pandas: 'pandas',
  'scikit-learn': 'scikit-learn',
  sklearn: 'scikit-learn',
  transformers: 'Hugging Face',
  streamlit: 'Streamlit',
  gradio: 'Gradio',
  pygame: 'Pygame',
  tkinter: 'Tkinter',
  pyqt5: 'PyQt',
  pyqt6: 'PyQt',
  pyside6: 'PyQt',
  'opencv-python': 'OpenCV',
  cv2: 'OpenCV',
  bevy: 'Bevy',
  jest: 'Jest',
  vitest: 'Vitest',
  playwright: 'Playwright',
  '@playwright/test': 'Playwright',
  cypress: 'Cypress',
  'phaser': 'Phaser',
  'p5': 'p5.js',
  'drizzle-orm': 'Drizzle ORM',
  '@trpc/server': 'tRPC',
  jupyter: 'Jupyter',
  jupyterlab: 'Jupyter',
  expo: 'Expo',
  'create-expo-app': 'Expo',
};

export function techForPackage(name: string): TechEntry | null {
  const clean = name.toLowerCase().replace(/^(?:npm:|jsr:)/, '');
  const base = clean.startsWith('@') ? clean.split('/').slice(0, 2).join('/') : (clean.split('/')[0] ?? '');
  const hit = PACKAGES[clean] ?? PACKAGES[base];
  return hit ? (TECH_BY_NAME.get(hit) ?? null) : null;
}

/** Command-line tool → tech (npm → Node.js, cargo → Rust, ...). */
const TOOLS: Record<string, string> = {
  npm: 'Node.js',
  npx: 'Node.js',
  yarn: 'Node.js',
  pnpm: 'Node.js',
  node: 'Node.js',
  'ts-node': 'Node.js',
  tsx: 'Node.js',
  bun: 'Bun',
  bunx: 'Bun',
  deno: 'Deno',
  pip: 'Python',
  pipx: 'Python',
  uv: 'Python',
  poetry: 'Python',
  pipenv: 'Python',
  pdm: 'Python',
  hatch: 'Python',
  conda: 'Python',
  python: 'Python',
  uvicorn: 'Python',
  gunicorn: 'Python',
  jupyter: 'Jupyter',
  flask: 'Flask',
  streamlit: 'Streamlit',
  cargo: 'Rust',
  go: 'Go',
  gem: 'Ruby',
  bundler: 'Ruby',
  ruby: 'Ruby',
  rails: 'Rails',
  composer: 'PHP',
  php: 'PHP',
  docker: 'Docker',
  brew: 'Homebrew',
  dotnet: '.NET',
  nuget: '.NET',
  flutter: 'Flutter',
  dart: 'Dart',
  maven: 'Maven',
  gradle: 'Gradle',
  java: 'Java',
  mix: 'Elixir',
  kubectl: 'Kubernetes',
  helm: 'Kubernetes',
  terraform: 'Terraform',
  godot: 'Godot',
  'arduino-cli': 'Arduino',
  mpremote: 'MicroPython',
  ampy: 'MicroPython',
  ng: 'Angular',
  vite: 'Vite',
  next: 'Next.js',
  nuxt: 'Nuxt',
  nuxi: 'Nuxt',
  astro: 'Astro',
  expo: 'Expo',
  tauri: 'Tauri',
  electron: 'Electron',
  wrangler: 'Cloudflare',
  vercel: 'Vercel',
  netlify: 'Netlify',
  firebase: 'Firebase',
};

export function techForTool(tool: string): TechEntry | null {
  const hit = TOOLS[tool.toLowerCase()];
  return hit ? (TECH_BY_NAME.get(hit) ?? null) : null;
}

/** Dependency / project files → tech. */
export const FILE_TECH: Array<[RegExp, string[]]> = [
  [/package\.json/, ['Node.js']],
  [/requirements(?:[-_.][\w-]+)?\.txt|pyproject\.toml|setup\.py|setup\.cfg|Pipfile|environment\.ya?ml/, ['Python']],
  [/Cargo\.toml/, ['Rust']],
  [/go\.mod/, ['Go']],
  [/pom\.xml/, ['Maven', 'Java']],
  [/build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?/, ['Gradle']],
  [/Gemfile/, ['Ruby']],
  [/composer\.json/, ['PHP']],
  [/pubspec\.yaml/, ['Dart']],
  [/Dockerfile|docker-compose\.ya?ml|compose\.ya?ml/, ['Docker']],
  [/CMakeLists\.txt/, ['CMake']],
  [/[\w.-]+\.(?:csproj|sln|fsproj)/, ['.NET']],
  [/deno\.jsonc?/, ['Deno']],
  [/bun\.lockb?/, ['Bun']],
  [/project\.godot/, ['Godot']],
  [/ProjectSettings\/ProjectVersion\.txt/, ['Unity']],
  [/platformio\.ini/, ['Arduino']],
];
