/** Realistic README fixtures for the summary tests. */

export const NODE_APP = `<p align="center">
  <img src="docs/logo.svg" alt="Taskly logo" width="96">
</p>

# Taskly

[![CI](https://github.com/jane-doe/taskly/actions/workflows/ci.yml/badge.svg)](https://github.com/jane-doe/taskly/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

Taskly is a fast, keyboard-first task manager for small teams. It keeps your to-dos, notes and deadlines in one tidy board that syncs in real time.

**[Live demo](https://taskly-demo.netlify.app)** · [Documentation](https://docs.taskly.dev) · [Discord](https://discord.gg/taskly)

## Features

- ⚡ **Instant search** across every board, e.g. by tag or assignee
- 🔄 Real-time sync powered by Supabase
- 🌙 Dark mode and a high-contrast theme
- 📱 Works offline as a progressive web app

## Tech stack

- React 18 with TypeScript
- Vite and Tailwind CSS
- Supabase (PostgreSQL) for storage and auth

## Requirements

- Node.js 18+
- npm 9 or later

## Installation

\`\`\`bash
git clone https://github.com/jane-doe/taskly.git
cd taskly
npm install
cp .env.example .env
\`\`\`

## Usage

\`\`\`bash
npm run dev
\`\`\`

Then open http://localhost:5173 in your browser. Run \`npm test\` to run the unit tests.

## Contributing

Pull requests are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

MIT © [Jane Doe](https://github.com/jane-doe)

Made with ❤️ by [Jane Doe](https://github.com/jane-doe)
`;

export const PYTHON_LIB = `# pyfetchly

[![PyPI](https://img.shields.io/pypi/v/pyfetchly)](https://pypi.org/project/pyfetchly/)
[![Python versions](https://img.shields.io/pypi/pyversions/pyfetchly)](https://pypi.org/project/pyfetchly/)

> A tiny, typed HTTP client for Python with retries, caching and async support built in.

pyfetchly wraps \`httpx\` with sensible defaults, i.e. timeouts, exponential back-off and an on-disk cache. It is designed for scripts and data pipelines that call flaky APIs. Get the package from [PyPI](https://pypi.org/project/pyfetchly/).

## Installation

Requires Python 3.10+.

\`\`\`console
$ pip install pyfetchly
Successfully installed pyfetchly-1.4.0
\`\`\`

## Quick start

\`\`\`python
import pyfetchly
from pandas import DataFrame

client = pyfetchly.Client(retries=3)
data = client.get_json("https://api.example.com/items")
\`\`\`

You can also run it from the command line with \`python -m pyfetchly https://example.com\`.

## Documentation

Full documentation is available at [pyfetchly.readthedocs.io](https://pyfetchly.readthedocs.io).

## License

Distributed under the Apache License, Version 2.0. See \`LICENSE\` for details.

## Contact

Maintained by Ada Lovelace – [ada@pyfetchly.dev](mailto:ada@pyfetchly.dev)
`;

export const RUST_CLI = `# rgl

\`rgl\` is a line-oriented search tool written in Rust. It recursively searches directories for a regex pattern while respecting your \`.gitignore\` rules.

It is roughly 2.5x faster than GNU grep on large repositories (see the benchmarks below). Binaries are published for Linux, macOS and Windows.

## Install

\`\`\`sh
cargo install rgl
# or, with Homebrew
brew install rgl
\`\`\`

The minimum supported Rust version is 1.74.

## Usage

\`\`\`
rgl [OPTIONS] PATTERN [PATH ...]
rgl -i "todo" src/
\`\`\`

## Building from source

\`\`\`sh
git clone https://github.com/ferris/rgl
cd rgl && cargo build --release
\`\`\`

Crate: [crates.io/crates/rgl](https://crates.io/crates/rgl) · [Changelog](CHANGELOG.md)

## License

Licensed under either of Apache License, Version 2.0 or MIT license at your option.
`;

export const GODOT_GAME = `# Starfall Drift

![Gameplay screenshot](media/screenshot.png)

Starfall Drift is a cosy 2D space-exploration game made in Godot 4. Pilot a tiny ship through procedurally generated nebulae, trade with alien outposts and uncover the story of a lost fleet.

🎮 **[Play it in your browser on itch.io](https://pixelforge.itch.io/starfall-drift)**

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Space | Boost |

## Running the project

1. Install [Godot 4.2](https://godotengine.org/download) or newer.
2. Open \`project.godot\` in the editor and press F5.

Scripts are written in GDScript, with a few shaders.

## Credits

- Code and design: [Mia Chen](https://github.com/miachen)
- Music: [Kenji Ito](https://soundcloud.com/kenjiito)
- Fonts by [Kenney](https://kenney.nl)

© 2026 Pixel Forge Studio. All rights reserved.
`;

export const PROFILE = `<h1 align="center">Hi 👋, I'm Sara Ahmed</h1>
<h3 align="center">A full-stack developer who loves building accessible web apps</h3>

<p align="left"> <img src="https://komarev.com/ghpvc/?username=sara-ahmed&label=Profile%20views&color=0e75b6&style=flat" alt="sara-ahmed" /> </p>

- 🔭 I’m currently working on **an open-source design system**
- 🌱 I’m currently learning **Rust and WebAssembly**
- 💬 Ask me about **React, Node.js and PostgreSQL**
- 📫 How to reach me **sara@ahmed.dev**

<h3 align="left">Connect with me:</h3>
<p align="left">
<a href="https://linkedin.com/in/sara-ahmed" target="blank"><img align="center" src="https://raw.githubusercontent.com/rahuldkjain/github-profile-readme-generator/master/src/images/icons/Social/linked-in-alt.svg" alt="sara-ahmed" height="30" width="40" /></a>
<a href="https://twitter.com/sara_codes" target="blank"><img align="center" src="https://raw.githubusercontent.com/rahuldkjain/github-profile-readme-generator/master/src/images/icons/Social/twitter.svg" alt="sara_codes" height="30" width="40" /></a>
</p>

<h3 align="left">Languages and Tools:</h3>
<p align="left">
<a href="https://www.typescriptlang.org/" target="_blank" rel="noreferrer"> <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/typescript/typescript-original.svg" alt="typescript" width="40" height="40"/> </a>
<img src="https://skillicons.dev/icons?i=react,nodejs,postgres,docker" alt="skills" />
</p>

![Sara's GitHub stats](https://github-readme-stats.vercel.app/api?username=sara-ahmed&show_icons=true)
`;

export const TINY = '# tiny-thing\n';

export const ARABIC = `# مُحوِّل النصوص

مُحوِّل النصوص هو أداة مفتوحة المصدر لتحويل ملفات Markdown إلى صفحات ويب جميلة. يعمل بالكامل داخل المتصفح دون الحاجة إلى خادم. هل تريد تجربته؟ جرّب النسخة الحية الآن.

## المميزات

- دعم كامل للغة العربية والكتابة من اليمين إلى اليسار
- تصدير إلى HTML و PDF
- وضع داكن مريح للعين

## التثبيت

\`\`\`bash
npm install
npm run dev
\`\`\`

## الترخيص

هذا المشروع مرخّص بموجب رخصة MIT.
`;

export const FRENCH = `# Outil

Bonjour ! Cet outil convertit vos fichiers, p. ex. les images et les PDF... Voir M. Dupont pour plus d'infos. Il est écrit en Python 3.12 et fonctionne partout.
`;
