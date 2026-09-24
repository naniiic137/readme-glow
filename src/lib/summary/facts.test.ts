import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../markdown/parse';
import { buildModel } from './sections';
import { classifyCommand, detectLicences, extractFacts, findVersionRequirements, type Fact, type FactContext } from './facts';
import { ARABIC, GODOT_GAME, NODE_APP, PROFILE, PYTHON_LIB, RUST_CLI, TINY } from './testFixtures';

const factsOf = (md: string, ctx: FactContext = {}) => extractFacts(buildModel(md, parseMarkdown(md)), ctx);
const values = (facts: Fact[]) => facts.map((f) => f.value);
const lineOf = (md: string, line: number) => md.split('\n')[line - 1] ?? '';

describe('classifyCommand', () => {
  it.each([
    ['npm install', 'install', 'npm'],
    ['npm i -D vitest', 'install', 'npm'],
    ['yarn', 'install', 'yarn'],
    ['yarn add react', 'install', 'yarn'],
    ['pnpm add three', 'install', 'pnpm'],
    ['pip install requests', 'install', 'pip'],
    ['python -m pip install -e .', 'install', 'pip'],
    ['pipx install httpie', 'install', 'pipx'],
    ['cargo install ripgrep', 'install', 'cargo'],
    ['go install example.com/tool@latest', 'install', 'go'],
    ['brew install jq', 'install', 'brew'],
    ['sudo apt-get install -y ffmpeg', 'install', 'apt'],
    ['gem install rails', 'install', 'gem'],
    ['composer require laravel/framework', 'install', 'composer'],
    ['docker pull nginx', 'install', 'docker'],
    ['git clone https://github.com/a/b.git', 'install', 'git'],
    ['npx create-next-app@latest my-app', 'install', 'npx'],
    ['npm create vite@latest', 'install', 'npm'],
    ['npm run dev', 'run', 'npm'],
    ['npm start', 'run', 'npm'],
    ['npm test', 'run', 'npm'],
    ['npx prettier --write .', 'run', 'npx'],
    ['yarn dev', 'run', 'yarn'],
    ['pnpm dev', 'run', 'pnpm'],
    ['python main.py --verbose', 'run', 'python'],
    ['python -m http.server', 'run', 'python'],
    ['uvicorn app.main:app --reload', 'run', 'uvicorn'],
    ['flask run', 'run', 'flask'],
    ['cargo run -- --help', 'run', 'cargo'],
    ['go run ./cmd/server', 'run', 'go'],
    ['docker run -p 8080:80 app', 'run', 'docker'],
    ['docker compose up -d', 'run', 'docker'],
    ['make build', 'run', 'make'],
    ['./scripts/setup.sh', 'run', 'script'],
    ['java -jar target/app.jar', 'run', 'java'],
    ['dotnet run', 'run', 'dotnet'],
    ['NODE_ENV=production node server.js', 'run', 'node'],
  ])('%s → %s (%s)', (cmd, kind, tool) => {
    expect(classifyCommand(cmd)).toEqual({ kind, tool });
  });

  it('ignores things that are not commands', () => {
    for (const cmd of ['cd my-app', 'const x = require("y")', 'node v20.10.0', 'echo hello', 'Hello world']) {
      expect(classifyCommand(cmd)).toBeNull();
    }
  });
});

describe('detectLicences', () => {
  it.each([
    ['MIT', ['MIT']],
    ['Apache License, Version 2.0', ['Apache-2.0']],
    ['GNU General Public License v3.0', ['GPL-3.0']],
    ['GPLv2', ['GPL-2.0']],
    ['AGPL-3.0', ['AGPL-3.0']],
    ['LGPL-2.1', ['LGPL-2.1']],
    ['BSD 3-Clause', ['BSD-3-Clause']],
    ['2-Clause BSD', ['BSD-2-Clause']],
    ['ISC', ['ISC']],
    ['Mozilla Public License 2.0', ['MPL-2.0']],
    ['The Unlicense', ['Unlicense']],
    ['CC0', ['CC0-1.0']],
    ['CC BY-NC-SA 4.0', ['CC-BY-NC-SA-4.0']],
    ['either of Apache License, Version 2.0 or MIT license', ['Apache-2.0', 'MIT']],
    ['Permission is hereby granted, free of charge, to any person', ['MIT']],
    ['nothing to see here', []],
  ])('%s', (text, ids) => {
    expect(detectLicences(text)).toEqual(ids);
  });
});

describe('findVersionRequirements', () => {
  it.each([
    ['Node.js 18+', ['Node.js 18+']],
    ['Node >= 20', ['Node.js >= 20']],
    ['Python 3.10+ is recommended', ['Python 3.10+']],
    ['This requires Java 17 to build.', ['Java 17']],
    ['Built with Go 1.22 and friends.', ['Go 1.22']],
    ['You need Node.js 20.11 or newer', ['Node.js 20.11+']],
    ['The minimum supported Rust version is 1.74.', ['Rust 1.74+']],
    ['Java 17 is a nice number', []],
    ['Support for Python 3.8 was dropped', []],
    ['go 1.22 lower-case is a verb', []],
  ])('%s', (text, expected) => {
    expect(findVersionRequirements(text).map((h) => h.value)).toEqual(expected);
  });
});

describe('extractFacts: Node web app', () => {
  const f = factsOf(NODE_APP);

  it('finds the tech stack from badges, prose, the tech section and commands', () => {
    expect(values(f.tech)).toEqual(['TypeScript', 'Supabase', 'React', 'Vite', 'Tailwind CSS', 'PostgreSQL', 'Node.js']);
    expect(f.tech.find((t) => t.value === 'TypeScript')).toMatchObject({ source: 'badge', label: 'Language', line: 9 });
    expect(values(f.tech)).not.toContain('Go');
  });

  it('finds install and run commands with their tools and lines, skipping cd/cp', () => {
    expect(f.install.map((x) => [x.label, x.value])).toEqual([
      ['git', 'git clone https://github.com/jane-doe/taskly.git'],
      ['npm', 'npm install'],
    ]);
    expect(f.run.map((x) => [x.label, x.value])).toEqual([
      ['npm', 'npm run dev'],
      ['npm', 'npm test'],
    ]);
    for (const fact of [...f.install, ...f.run]) expect(lineOf(NODE_APP, fact.line)).toContain(fact.value);
  });

  it('reads requirements and normalises versions', () => {
    expect(f.requirements.map((x) => [x.label, x.value, x.line])).toEqual([
      ['Node.js', 'Node.js 18+', 30],
      ['npm', 'npm 9+', 31],
    ]);
  });

  it('labels the demo, docs and community links but not contributing or badge links', () => {
    expect(f.links.map((x) => [x.label, x.href])).toEqual([
      ['Live demo', 'https://taskly-demo.netlify.app'],
      ['Documentation', 'https://docs.taskly.dev'],
      ['Community', 'https://discord.gg/taskly'],
    ]);
  });

  it('reads the licence and the author', () => {
    expect(f.licence).toMatchObject({ kind: 'licence', value: 'MIT', line: 56, href: 'LICENSE' });
    expect(f.authors).toEqual([{ kind: 'author', label: 'Author', value: 'Jane Doe', line: 56, source: 'text', href: 'https://github.com/jane-doe' }]);
  });

  it('keeps the Features list with its Markdown', () => {
    expect(f.features.map((x) => x.markdown)).toEqual([
      '⚡ **Instant search** across every board, e.g. by tag or assignee',
      '🔄 Real-time sync powered by Supabase',
      '🌙 Dark mode and a high-contrast theme',
      '📱 Works offline as a progressive web app',
    ]);
    expect(f.features[0]).toMatchObject({ text: 'Instant search across every board, e.g. by tag or assignee', line: 17 });
  });
});

describe('extractFacts: Python library', () => {
  const f = factsOf(PYTHON_LIB);

  it('reads Python tech from badges and imports, commands from console prompts and inline code', () => {
    expect(values(f.tech)).toEqual(['Python', 'pandas']);
    expect(values(f.install)).toEqual(['pip install pyfetchly']);
    expect(f.install[0]!.line).toBe(15);
    expect(values(f.run)).toEqual(['python -m pyfetchly https://example.com']);
  });

  it('finds the package page, docs, Apache licence, maintainer and email', () => {
    expect(f.links.map((x) => x.label)).toEqual(['Package', 'Documentation']);
    expect(values(f.requirements)).toEqual(['Python 3.10+']);
    expect(f.licence?.value).toBe('Apache-2.0');
    expect(f.authors.map((a) => [a.label, a.value])).toEqual([
      ['Email', 'ada@pyfetchly.dev'],
      ['Contact', 'Ada Lovelace'],
    ]);
  });
});

describe('extractFacts: Rust CLI', () => {
  const f = factsOf(RUST_CLI);

  it('reads commands from sh and unlabelled usage blocks and splits chained commands', () => {
    expect(values(f.install)).toEqual(['cargo install rgl', 'brew install rgl', 'git clone https://github.com/ferris/rgl']);
    expect(values(f.run)).toEqual(['rgl [OPTIONS] PATTERN [PATH ...]', 'rgl -i "todo" src/', 'cargo build --release']);
  });

  it('finds Rust, the MSRV, the crate, the changelog and a dual licence', () => {
    expect(values(f.tech)).toEqual(['Rust', 'Homebrew']);
    expect(values(f.requirements)).toEqual(['Rust 1.74+']);
    expect(f.links.map((x) => [x.label, x.href])).toEqual([
      ['Package', 'https://crates.io/crates/rgl'],
      ['Changelog', 'CHANGELOG.md'],
    ]);
    expect(f.licence?.value).toBe('Apache-2.0 OR MIT');
  });
});

describe('extractFacts: Godot game', () => {
  const f = factsOf(GODOT_GAME);

  it('finds the engine, its version, the browser demo and credits', () => {
    expect(values(f.tech)).toEqual(['Godot', 'GDScript']);
    expect(values(f.requirements)).toEqual(['Godot 4.2+']);
    expect(f.links).toEqual([
      { kind: 'link', label: 'Live demo', value: 'Play it in your browser on itch.io', line: 7, href: 'https://pixelforge.itch.io/starfall-drift', source: 'text' },
    ]);
    expect(f.authors.map((a) => [a.label, a.value])).toEqual([
      ['Code and design', 'Mia Chen'],
      ['Music', 'Kenji Ito'],
      ['Author', 'Pixel Forge Studio'],
    ]);
  });

  it('treats "All rights reserved" as a proprietary licence', () => {
    expect(f.licence).toMatchObject({ value: 'All rights reserved (proprietary)', line: 29 });
  });
});

describe('extractFacts: GitHub profile README', () => {
  const f = factsOf(PROFILE);

  it('reads tech from prose, devicons and skill icons', () => {
    expect(values(f.tech)).toEqual(['Rust', 'React', 'Node.js', 'PostgreSQL', 'TypeScript', 'Docker']);
  });

  it('finds the person, email and social profiles', () => {
    expect(f.authors.map((a) => [a.label, a.value])).toEqual([
      ['Author', 'Sara Ahmed'],
      ['Email', 'sara@ahmed.dev'],
      ['LinkedIn', 'sara-ahmed'],
      ['X (Twitter)', '@sara_codes'],
    ]);
    expect(f.links).toEqual([]);
    expect(f.licence).toBeNull();
  });
});

describe('extractFacts: edge cases', () => {
  it('returns nothing for a tiny or empty README', () => {
    for (const md of [TINY, '']) {
      const f = factsOf(md);
      expect([f.tech, f.install, f.run, f.requirements, f.links, f.authors, f.features].every((x) => x.length === 0)).toBe(true);
      expect(f.licence).toBeNull();
    }
  });

  it('reads an Arabic README', () => {
    const f = factsOf(ARABIC);
    expect(values(f.install)).toEqual(['npm install']);
    expect(values(f.run)).toEqual(['npm run dev']);
    expect(f.licence?.value).toBe('MIT');
    expect(f.features).toHaveLength(3);
  });

  it('avoids common false positives for Go, React, Rust and Vue', () => {
    const md = '# Tool\n\nGo to the settings page and react to changes. The rust-coloured theme looks great. Vue d\'ensemble du projet.\n';
    expect(factsOf(md).tech).toEqual([]);
  });

  it('prefers "React Native" over "React" and spots Go when written in it', () => {
    const md = '# App\n\nA mobile app built with React Native. The backend is written in Go.\n';
    expect(values(factsOf(md).tech)).toEqual(['React Native', 'Go']);
  });

  it('maps code fence languages, but only uses shell/JSON when nothing else is known', () => {
    expect(values(factsOf('# A\n\n```ts\nconst a = 1;\n```\n\n```json\n{}\n```\n').tech)).toEqual(['TypeScript']);
    expect(values(factsOf('# A\n\n```bash\nls\n```\n').tech)).toEqual(['Shell']);
  });

  it('finds tech from dependency files mentioned anywhere', () => {
    const md = '# A\n\nEdit `pyproject.toml`, then the Dockerfile, then `Cargo.toml`.\n';
    const tech = factsOf(md).tech;
    expect(values(tech)).toEqual(['Python', 'Docker', 'Rust']);
    expect(tech.every((t) => t.source === 'file' && t.line === 3)).toBe(true);
  });

  it('de-duplicates case-insensitively and keeps the first appearance', () => {
    const md = '# A\n\n```sh\nnpm install\n```\n\nRun `NPM INSTALL` again.\n\nBuilt with react? No: React and REACT.\n';
    const f = factsOf(md);
    expect(values(f.install)).toEqual(['npm install']);
    expect(f.install[0]!.line).toBe(4);
    expect(values(f.tech).filter((v) => v === 'React')).toHaveLength(1);
  });

  it('only counts links that belong to the project', () => {
    const md = '# Taskly\n\nSee the [npm docs](https://docs.npmjs.com/cli) and the [IndexedDB spec](https://w3c.github.io/IndexedDB/).\n\nTry [taskly.github.io](https://jane.github.io/taskly/).\n';
    const f = factsOf(md);
    expect(f.links.map((x) => [x.label, x.href])).toEqual([
      ['Documentation', 'https://docs.npmjs.com/cli'],
      ['Live demo', 'https://jane.github.io/taskly/'],
    ]);
  });

  it('uses the repository context to recognise the repository link', () => {
    const md = '# Thing\n\nSource: [GitHub](https://github.com/acme/thing). Also see [other](https://github.com/acme/other).\n';
    const f = factsOf(md, { repo: { owner: 'acme', name: 'thing' } });
    expect(f.links.map((x) => [x.label, x.href])).toEqual([['Repository', 'https://github.com/acme/thing']]);
  });

  it('reads licences from phrases and badges', () => {
    expect(factsOf('# A\n\nThis project is released under the BSD 3-Clause licence.\n').licence?.value).toBe('BSD-3-Clause');
    expect(factsOf('# A\n\n![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)\n').licence).toMatchObject({ value: 'GPL-3.0', source: 'badge' });
    expect(factsOf('# A\n\nCode under the MIT Licence; art © 2026 Studio.\n').licence?.value).toBe('MIT');
  });

  it('reads requirements from a Prerequisites section, including tables', () => {
    const md = '# A\n\n## Prerequisites\n\nYou will need:\n\n- Docker 24 or later\n- A free Supabase account\n\n| Tool | Version |\n| --- | --- |\n| Python | 3.11 |\n';
    const req = factsOf(md).requirements;
    expect(req.map((r) => [r.label, r.value])).toEqual([
      ['Docker', 'Docker 24+'],
      ['Supabase', 'A free Supabase account'],
      ['Python', 'Python 3.11'],
    ]);
  });

  it('ignores tech in "Ports" / "Related projects" sections', () => {
    const md = '# delaunay\n\nA fast triangulation library written in JavaScript.\n\n## Ports\n\n- [delaunator-rs](https://x.dev) in Rust\n- [delaunator-cpp](https://y.dev) in C++\n';
    expect(values(factsOf(md).tech)).toEqual(['JavaScript']);
  });
});
