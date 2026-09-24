<div align="center">

<a id="readme-top"></a>

<img src="public/favicon.svg" alt="ReadmeGlow logo: a glowing sparkle" width="88" height="88">

# ReadmeGlow

**Drop any README.md and it becomes a stunning, designed web page.**<br>
Edit it on the page or in a real editor, beautify it, summarise it and export it. Nothing leaves your browser.

[![Open ReadmeGlow](https://img.shields.io/badge/Open-ReadmeGlow-8B5CF6?style=for-the-badge&logo=markdown&logoColor=white)](https://naniiic137.github.io/readme-glow/)
[![CI](https://github.com/naniiic137/readme-glow/actions/workflows/ci.yml/badge.svg)](https://github.com/naniiic137/readme-glow/actions/workflows/ci.yml)
[![Deploy](https://github.com/naniiic137/readme-glow/actions/workflows/pages.yml/badge.svg)](https://github.com/naniiic137/readme-glow/actions/workflows/pages.yml)
![Tests](https://img.shields.io/badge/tests-1251%20passing-22C55E)
![Themes](https://img.shields.io/badge/themes-15-EC4899)
![Privacy](https://img.shields.io/badge/uploads-none-0EA5E9)

**Live:** https://naniiic137.github.io/readme-glow/

</div>

![ReadmeGlow's start page: a large drop zone for README files, a GitHub box and sample READMEs, on a dark background with violet and pink light](docs/screenshots/hero.png)

## Contents

- [Why](#why)
- [15 themes](#15-themes)
- [5 layouts](#5-layouts)
- [Features](#features)
- [Add a “View with ReadmeGlow” badge](#add-a-view-with-readmeglow-badge)
- [How it works](#how-it-works)
- [Privacy and security](#privacy-and-security)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Tech stack](#tech-stack)
- [Run it locally](#run-it-locally)
- [Tests](#tests)

## Why

Every README on GitHub looks the same: the same white page, the same grey code blocks. A README is often the first thing people see of a project, and it deserves better.

ReadmeGlow turns any README into a page that feels designed: pick one of 15 hand-crafted themes and 5 layouts, fix it up with one click, edit it right on the page, and share or export the result. It is a single-page app with no server; your files never leave your browser.

## 15 themes

Each theme has its own fonts, palette, headings, links, callouts, tables, code blocks, image frames, list markers, rules and background. Every one is checked by tests for WCAG AA contrast (4.5:1 for body text, links, callouts and code).

| | | |
|:---:|:---:|:---:|
| ![Aurora theme: a gradient mesh behind a frosted glass page](docs/screenshots/theme-aurora.png)<br>**Aurora**: northern lights and frosted glass | ![Editorial theme: magazine serif type with a drop cap](docs/screenshots/theme-editorial.png)<br>**Editorial**: a luxury long-read | ![Terminal theme: green phosphor text on a CRT with scanlines](docs/screenshots/theme-terminal.png)<br>**Terminal**: phosphor green on a humming CRT |
| ![Pixel Arcade theme: 8-bit fonts, neon colours and stepped borders](docs/screenshots/theme-pixel.png)<br>**Pixel Arcade**: insert coin | ![Synthwave theme: neon pink and cyan with a striped sun and grid](docs/screenshots/theme-synthwave.png)<br>**Synthwave**: neon nights on an endless grid | ![Blueprint theme: white technical drawing on blue grid paper](docs/screenshots/theme-blueprint.png)<br>**Blueprint**: a technical drawing |
| ![Notebook theme: handwritten headings on lined paper with taped images](docs/screenshots/theme-notebook.png)<br>**Notebook**: lined paper and highlighter | ![Swiss theme: huge black type, strict grid and a red accent](docs/screenshots/theme-swiss.png)<br>**Swiss**: the International Typographic Style | ![Midnight theme: elegant serif on deep navy with stars](docs/screenshots/theme-midnight.png)<br>**Midnight**: gold on a starry night |
| ![Neo-Brutalist theme: thick borders, hard shadows and raw colours](docs/screenshots/theme-brutalist.png)<br>**Neo-Brutalist**: loud and proud | ![Zen Garden theme: calm washi paper with sakura petals](docs/screenshots/theme-zen.png)<br>**Zen Garden**: calm, soft and airy | ![Manuscript theme: parchment with an illuminated capital](docs/screenshots/theme-manuscript.png)<br>**Manuscript**: an illuminated page |
| ![Frost theme: light glassmorphism on an icy gradient](docs/screenshots/theme-frost.png)<br>**Frost**: light glass | ![Comic Book theme: halftone dots, ink outlines and speech-bubble callouts](docs/screenshots/theme-comic.png)<br>**Comic Book**: POW! | ![GitHub Classic theme: the familiar github.com look](docs/screenshots/theme-github.png)<br>**GitHub Classic**: the familiar look, done right |

Themes that make sense in both have light and dark variants (GitHub, Aurora, Editorial, Pixel Arcade as a Game Boy, Blueprint as a whiteprint, Notebook as a chalkboard, Swiss, Neo-Brutalist, Zen, Frost). With *prefers-reduced-motion*, every animation stops and the page still looks finished.

## 5 layouts

| Layout | What it does |
|---|---|
| **Document** | A classic, beautifully set article. |
| **Docs** | A sticky contents sidebar with scroll-spy; a floating “Contents” drawer on phones. |
| **Landing** | Your title, tagline and badges become a hero; sections become cards, short lists become a card grid. |
| **Slides** | One slide per section (H2 or `---`), keyboard and swipe navigation, progress bar, full screen. |
| **Magazine** | Big editorial title and deck, two columns on wide screens, drop caps. |

| Landing (Aurora) | Docs (Editorial) |
|---|---|
| ![The Nebula Board sample in the Aurora theme with the Landing layout: a centred hero and sections as glass cards](docs/screenshots/layout-landing.png) | ![The Quanta sample in the Editorial theme with the Docs layout: a contents sidebar and serif text with maths](docs/screenshots/layout-docs.png) |
| **Slides (Synthwave)** | **Magazine (Swiss)** |
| ![A slide from the Nebula Board sample in the Synthwave theme, with the progress bar and slide controls](docs/screenshots/layout-slides.png) | ![The Quanta sample in the Swiss theme with the Magazine layout: huge title and two columns](docs/screenshots/layout-magazine.png) |

## Features

### Bring your README
- **Drop** a `.md`, `.markdown` or `.txt` file anywhere, or click the drop zone to pick one.
- **Drop a whole project folder** (or a README with its images): relative image paths just work, served from local object URLs.
- **Paste** Markdown anywhere on the start page, or in the paste box.
- **Load from GitHub**: `owner/repo`, any github.com link (`/tree/…`, `/blob/…`), `git@github.com:…` or a raw URL. Relative images point to raw.githubusercontent.com and links to github.com. Missing repositories and the API rate limit get friendly messages.
- **Samples** that use every feature: Nebula Board (web app), Quanta (library with maths), Pixel Quest (game, with an Arabic section) and a fully Arabic README.
- **Deep links**: `?repo=owner/repo&theme=aurora&layout=docs` opens straight into a README; `#md=…` links carry a small README inside the URL.

### Edit it, both ways
![Split view: the Markdown editor with its toolbar on the left, and the Quanta README in the Editorial theme on the right with a paragraph being edited on the page](docs/screenshots/editor.png)

- **A real Markdown editor** (CodeMirror 6, loaded only when you open it): syntax highlighting for Markdown and the code inside it, line numbers, soft wrap, find and replace, multiple cursors, bracket and emphasis auto-pairs, list continuation and Tab indentation.
- **Formatting toolbar and shortcuts**: bold, italic, strikethrough, headings 1–6, quotes, bullet/numbered/task lists, links, images, inline code, code blocks with a language picker, tables, rules, GitHub alerts, `<details>`, footnotes and emoji.
- **Builders**: a table builder (pick a size, fill in the cells, choose alignment), a shields.io badge builder with presets and repository badges, 16 ready-made sections (Installation, Usage, FAQ, Licence…) and 6 starter templates (web app, library, CLI, game, GitHub profile, minimal).
- **Images**: paste or drop an image into the editor; it is saved with the document and inserted as `images/…`, so the .zip export includes it.
- **Edit on page**: switch it on, click any paragraph, heading, list item, table cell or code block in the themed page and type. Only the block you touched changes in the Markdown, byte for byte. Block handles add new blocks, drag or move them (Alt+↑/↓) and delete them; a floating toolbar formats selected text. Enter splits a block, Backspace at the start joins it with the one above.
- **One undo history** shared by the editor, on-page editing, Beautify, health-check fixes and inserts.
- **Two-way navigation**: click a block in the preview to jump to its source line; the editor and preview scroll together (you can turn it off).
- **Views**: preview, split (resizable), editor only, tabs on phones, and a distraction-free writing mode.
- **Your documents**: everything autosaves to your browser (IndexedDB) — several documents, rename, duplicate, delete, and your last document reopens after a reload. A dot in the top bar shows unsaved changes, and leaving the page warns you while a save is pending.

### Make it better
<table>
<tr>
<td width="50%"><img src="docs/screenshots/beautify.png" alt="The Beautify dialog: options on the left and a before/after diff with per-change checkboxes on the right"></td>
<td width="50%"><img src="docs/screenshots/insights.png" alt="The Insights panel: a one-line description, an extractive summary, the tech stack and install commands"></td>
</tr>
</table>

- **Beautify** tidies the README itself: consistent headings and list markers, blank lines, aligned tables, languages on code fences, one H1 and no skipped heading levels, scattered badges grouped into one centred row, an optional centred header, a table of contents with working anchors, back-to-top links, section emoji, long changelogs folded into `<details>`, and placeholders for missing essentials. You see a before/after diff and can apply everything, only the changes you tick, or nothing. Beautifying twice changes nothing the second time.
- **README health check**: a score and grade with friendly suggestions (missing title, description, installation or usage section, screenshots, licence, broken heading order, images without alt text, very long lines, empty links, broken anchors, placeholder text, code fences without a language). Many have a one-click fix, and every issue can take you to its line.
- **Summary and key insights**, offline: a one-line “what is this”, a 3–5 sentence extractive summary (TextRank), and the key facts — project name, tagline, tech stack (from badges, code languages, dependency files and a dictionary of ~150 technologies), install and run commands, requirements, links (demo, docs, website, package), licence, authors — each one clickable to scroll to where it came from. Copy it as Markdown, or insert an “Overview” or “Key features” section.
- **Optional AI summary** (off by default, bring your own key): Google Gemini, any OpenAI-compatible service (OpenAI, OpenRouter, Groq, Mistral, DeepSeek, Together) or a local Ollama. Keys stay in this tab unless you tick “remember on this device”, requests only happen when you press the button, can be cancelled, time out after 45 s, and the answer is validated before it is shown. If anything fails, the offline summary is still there.

### Make it yours
Theme gallery with live thumbnails of *your* README, light/dark variant, accent colour, font size, content width, heading style (theme, plain, underlined, accent bar, numbered, small caps), code theme (match the page, GitHub light/dark, Dracula, Nord, One Dark, Solarized, Monokai, Night Owl), code line numbers, background effect (theme, none, grain, glow, particles), scroll-reveal animations and text direction (automatic per block, so Arabic paragraphs are right-to-left). Settings are remembered and travel in share links.

### Take it anywhere
![The Export dialog with a 1200×630 social card preview in the Synthwave theme and the other export options](docs/screenshots/export.png)

- **Standalone HTML**: one file with this exact design; the theme’s CSS is inlined, its fonts are embedded (latin subset, woff2, base64) and local images become data URIs, so it works offline. Documents with maths link KaTeX’s stylesheet from jsDelivr, because its twenty font files would triple the size.
- **Print / PDF** with a real print stylesheet: no app chrome, sensible page breaks, link addresses shown, slides one per page. Dark themes print on white by default; tick “keep the theme background” to print exactly what you see.
- **Social card**: a 1200×630 PNG drawn in the theme’s colours and fonts (title, description, badges), ideal as your GitHub social preview.
- **README.md**, **copy Markdown**, and a **.zip** with `README.md` plus your images in `images/` (paths rewritten).
- **Share link**: small READMEs are compressed into the link itself (lz-string); for long ones ReadmeGlow explains why and suggests sharing the GitHub link instead.

### Built for everyone
- **Keyboard everywhere**: a command palette (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>) for every action, theme, layout and heading, a shortcuts overlay (<kbd>?</kbd>), find in the document with highlighting, focus management in every dialog.
- **Accessible**: landmarks, labelled controls, visible focus, live announcements, reduced motion respected, contrast tested.
- **Right-to-left**: `dir="auto"` on every block, logical CSS everywhere, Arabic fonts (Noto Sans / Naskh Arabic) for every theme, and alert titles in Arabic.
- **Responsive** from a 390 px phone to a 4K screen.

<p align="center"><img src="docs/screenshots/phones.png" alt="Three phone screenshots: the start page, the Pixel Arcade theme and the editor with Edit and Preview tabs" width="820"></p>

## Add a “View with ReadmeGlow” badge

Let visitors open your README in your favourite look. In the app, open **⋯ → “View with ReadmeGlow” badge**, or copy this and replace `owner/repo`:

```markdown
[![View with ReadmeGlow](https://naniiic137.github.io/readme-glow/badge.svg)](https://naniiic137.github.io/readme-glow/?repo=owner/repo&theme=aurora&layout=landing)
```

[![View with ReadmeGlow](https://naniiic137.github.io/readme-glow/badge.svg)](https://naniiic137.github.io/readme-glow/?repo=naniiic137/readme-glow&theme=aurora&layout=landing)

## How it works

```mermaid
flowchart LR
  A[README.md] --> B[remark: parse with positions<br/>GFM · math · footnotes]
  B --> C[mdast → hast<br/>raw HTML parsed by rehype-raw]
  C --> D[rehype-sanitize<br/>GitHub allow-list]
  D --> E[trusted enhancements<br/>alerts · anchors · code figures<br/>badges · link resolution]
  E --> F[lazy extras<br/>highlight.js · KaTeX]
  F --> G[themed page<br/>15 themes × 5 layouts]
  G --> H[exports<br/>HTML · PDF · PNG · zip · link]
```

1. **Parse once, keep positions.** The Markdown is parsed with remark (GFM, footnotes, maths) in a Web Worker. Every rendered block remembers the exact source range it came from; that is what makes on-page editing, click-to-source and scroll sync possible.
2. **Sanitise before anything else.** Raw HTML is parsed into the tree and cleaned with rehype-sanitize (GitHub’s own allow-list, minus a few things). Only then do trusted steps add alerts, heading anchors, code headers with copy buttons, badge rows, lightbox hooks and repository-relative URLs.
3. **Load heavy extras on demand.** Syntax highlighting, KaTeX, Mermaid, the emoji table, the code editor and each theme’s fonts are separate chunks, loaded only when a document or a theme needs them.
4. **Edit the source, never re-serialise it.** Every edit — typed, on the page, from Beautify or a fix — becomes a splice into the Markdown with one shared undo history, so untouched text stays byte-identical.

## Privacy and security

- **No server, no uploads.** Files are read and rendered in your browser and saved in its own storage (IndexedDB). The only network requests are the ones you ask for: a public README from the GitHub API, the images your README links to, and — only if you enable it with your own key — an AI summary.
- **XSS-proof rendering.** All README HTML goes through rehype-sanitize; scripts, event handlers, `javascript:`/`vbscript:`/`data:` links, frames, objects, SVG, forms and style attributes are removed, and ids are prefixed so they cannot clobber globals. 37 classic attack vectors are covered by tests. Mermaid runs with `securityLevel: 'strict'` and its SVG is sanitised again with DOMPurify.
- **Strict Content-Security-Policy** in the built page: scripts only from the site itself (no inline scripts, no `eval`), images from `https:`/`data:`/`blob:`, network access only to the GitHub API, raw.githubusercontent.com and the optional AI providers. Inline styles are allowed because KaTeX and Mermaid output needs them; user-supplied styles are stripped by the sanitiser.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd> | Command palette |
| <kbd>?</kbd> | All shortcuts |
| <kbd>Ctrl</kbd> <kbd>F</kbd> or <kbd>/</kbd> | Find in the document |
| <kbd>Alt</kbd> <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> | Preview / split / editor |
| <kbd>Alt</kbd> <kbd>E</kbd> | Edit on page |
| <kbd>Alt</kbd> <kbd>T</kbd> · <kbd>Alt</kbd> <kbd>L</kbd> | Next theme · next layout |
| <kbd>Alt</kbd> <kbd>Z</kbd> | Distraction-free writing |
| <kbd>Ctrl</kbd> <kbd>Z</kbd> / <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Z</kbd> | Undo / redo (shared by both editors) |
| <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>E</kbd> | Export |
| <kbd>Ctrl</kbd> <kbd>B</kbd> · <kbd>I</kbd> · <kbd>E</kbd> | Bold · italic · inline code |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>1</kbd>–<kbd>6</kbd> | Heading 1–6 |
| <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>L</kbd> | Link |
| <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>8</kbd> / <kbd>7</kbd> / <kbd>9</kbd> | Bullet / numbered / task list |
| <kbd>→</kbd> <kbd>←</kbd> <kbd>F</kbd> | Slides: next, previous, full screen |

## Tech stack

- **React 18**, **TypeScript** (strict) and **Vite**, deployed to GitHub Pages by GitHub Actions.
- **unified / remark / rehype**: remark-gfm, remark-math, rehype-raw, **rehype-sanitize**, rehype-katex, lowlight (highlight.js grammars), github-slugger, gemoji.
- **CodeMirror 6** for the editor, **Mermaid** + **DOMPurify** for diagrams, **KaTeX** for maths.
- **@fontsource** for 32 self-hosted font families (loaded only when a theme uses them), **lz-string** for share links, **fflate** for zip files, **zod** to validate AI answers.
- **Vitest**, Testing Library, jsdom and fake-indexeddb for tests.

## Run it locally

```bash
git clone https://github.com/naniiic137/readme-glow.git
cd readme-glow
npm ci
npm run dev        # http://localhost:3751/readme-glow/
npm test           # the whole test suite
npm run build      # typecheck + production build in dist/
```

## Tests

1,251 tests in 40 files (Vitest), run on every push by CI. They cover:

- **Markdown pipeline**: GFM, alerts, footnotes, headings and GitHub-compatible slugs, code blocks, maths, badges, source mapping.
- **Sanitisation**: 37 XSS vectors (script tags, `onerror`, `javascript:` URLs, SVG `onload`, iframes, style injection, mXSS, DOM clobbering…).
- **GitHub**: every URL form, relative link and image resolution, rate-limit and 404 handling.
- **Editing**: formatting commands, table and badge builders, templates, zip path rewriting, the shared undo history, autosave and restore, the visual editor’s block operations — including a fuzz test over the sample READMEs proving that editing one block leaves every other byte untouched.
- **Beautify** (idempotence over randomised READMEs), **health check** rules and fixes, **summary and facts** extractors, the **AI client** (with a fake fetch), **share links**, **settings persistence**, and the **theme registry** (every theme defines every token and passes the contrast rules).
- **Components**: drop zone and file input, command palette, dialogs and focus trapping, the editor, Beautify, table builder, find bar, global shortcuts, landing page and workspace.

---

<p align="center">© 2026 Hamza Ben Ismail. All rights reserved.</p>
<p align="center"><a href="#readme-top">Back to top ↑</a></p>
