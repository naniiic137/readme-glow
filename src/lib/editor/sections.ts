/**
 * Ready-made README sections for the editor's "Insert section" menu.
 * Every section starts with an H2 and ends with a single newline.
 */

export interface SectionTemplate {
  id: string;
  title: string;
  emoji: string;
  description: string;
  markdown: string;
}

const F = '```';

export const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    id: 'installation',
    title: 'Installation',
    emoji: '📦',
    description: 'Prerequisites and the commands to get the project running.',
    markdown: `## Installation

### Prerequisites

- [Node.js](https://nodejs.org) 20 or newer
- npm, pnpm or yarn

### Steps

${F}bash
git clone https://github.com/your-name/project-name.git
cd project-name
npm install
npm run dev
${F}

Then open <http://localhost:5173> in your browser.
`,
  },
  {
    id: 'usage',
    title: 'Usage',
    emoji: '🚀',
    description: 'A short, copy-pasteable example of the most common task.',
    markdown: `## Usage

${F}ts
import { createClient } from 'project-name';

const client = createClient({ apiKey: process.env.API_KEY });
const result = await client.run('hello');

console.log(result);
${F}

> [!TIP]
> Show the one thing most people come for first. Link to the full documentation for everything else.
`,
  },
  {
    id: 'features',
    title: 'Features',
    emoji: '✨',
    description: 'What the project does, as a scannable list.',
    markdown: `## Features

- **Fast**: explain what is fast and how fast
- **Simple**: one command to install, zero configuration
- **Accessible**: keyboard and screen-reader friendly
- **Open source**: free to use, change and share
`,
  },
  {
    id: 'screenshots',
    title: 'Screenshots',
    emoji: '🖼️',
    description: 'A captioned hero image and a small gallery.',
    markdown: `## Screenshots

![The main screen](docs/screenshot.png "The main screen")

| Light mode | Dark mode |
| :--------: | :-------: |
| ![Light mode](docs/light.png) | ![Dark mode](docs/dark.png) |
`,
  },
  {
    id: 'tech-stack',
    title: 'Tech stack',
    emoji: '🛠️',
    description: 'Badges for the languages, frameworks and tools you use.',
    markdown: `## Tech stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
`,
  },
  {
    id: 'roadmap',
    title: 'Roadmap',
    emoji: '🗺️',
    description: 'A task list of what is done and what is next.',
    markdown: `## Roadmap

- [x] First public release
- [x] Documentation website
- [ ] Plugin system
- [ ] Mobile app

See the [open issues](https://github.com/your-name/project-name/issues) for the full list of ideas.
`,
  },
  {
    id: 'contributing',
    title: 'Contributing',
    emoji: '🤝',
    description: 'How to propose changes, step by step.',
    markdown: `## Contributing

Contributions make open source great, and every one is appreciated.

1. Fork the repository
2. Create a branch: \`git checkout -b feature/amazing-idea\`
3. Commit your changes: \`git commit -m "Add an amazing idea"\`
4. Push the branch: \`git push origin feature/amazing-idea\`
5. Open a pull request

Please read the [contributing guide](CONTRIBUTING.md) and follow the [code of conduct](CODE_OF_CONDUCT.md).
`,
  },
  {
    id: 'faq',
    title: 'FAQ',
    emoji: '❓',
    description: 'Frequently asked questions as collapsible answers.',
    markdown: `## FAQ

<details>
<summary>Is it free?</summary>

Yes. The project is open source and free for personal and commercial use.

</details>

<details>
<summary>Which platforms are supported?</summary>

Windows, macOS and Linux, plus every modern browser.

</details>

<details>
<summary>How do I report a bug?</summary>

Open an [issue](https://github.com/your-name/project-name/issues) with the steps to reproduce it and what you expected to happen.

</details>
`,
  },
  {
    id: 'licence',
    title: 'Licence',
    emoji: '📜',
    description: 'An open-source licence or an all-rights-reserved notice.',
    markdown: `## Licence

<!-- Keep one of the two options below and delete the other. -->

Distributed under the [MIT Licence](LICENSE): anyone may use, copy, change and share this project, as long as the copyright notice stays with it.

© 2026 Your Name. All rights reserved.

> [!NOTE]
> Code without a licence is "all rights reserved" by default: people may read it, but not use, copy or change it. To let others build on your work, choose an open-source licence such as MIT, Apache 2.0 or GPL 3.0 at [choosealicense.com](https://choosealicense.com) and add it to the repository as a \`LICENSE\` file.
`,
  },
  {
    id: 'acknowledgements',
    title: 'Acknowledgements',
    emoji: '🙏',
    description: 'Thank the people, projects and resources that helped.',
    markdown: `## Acknowledgements

- [Shields.io](https://shields.io) for the badges
- [Simple Icons](https://simpleicons.org) for the brand icons
- Everyone who opened an issue, sent a pull request or shared the project
`,
  },
  {
    id: 'contact',
    title: 'Contact',
    emoji: '📬',
    description: 'Where people can reach you.',
    markdown: `## Contact

Your Name: [you@example.com](mailto:you@example.com)

[![GitHub](https://img.shields.io/badge/GitHub-your--username-181717?logo=github&logoColor=white)](https://github.com/your-username)
[![Website](https://img.shields.io/badge/Website-example.com-8B5CF6)](https://example.com)

Project link: <https://github.com/your-name/project-name>
`,
  },
  {
    id: 'configuration',
    title: 'Configuration',
    emoji: '⚙️',
    description: 'Environment variables in a table, with a sample .env file.',
    markdown: `## Configuration

Copy \`.env.example\` to \`.env\` and adjust the values:

| Variable       | Description                        | Required | Default |
| :------------- | :--------------------------------- | :------: | :------ |
| \`PORT\`         | Port the server listens on         |    No    | \`3000\`  |
| \`DATABASE_URL\` | Connection string for the database |   Yes    | none    |
| \`API_KEY\`      | Key for the external API           |   Yes    | none    |
| \`LOG_LEVEL\`    | \`debug\`, \`info\`, \`warn\` or \`error\` |    No    | \`info\`  |

${F}dotenv title=".env"
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/app
API_KEY=replace-me
${F}

> [!WARNING]
> Never commit your \`.env\` file. Keep it in \`.gitignore\`.
`,
  },
  {
    id: 'tests',
    title: 'Running the tests',
    emoji: '🧪',
    description: 'How to run the test suite, linting and coverage.',
    markdown: `## Running the tests

${F}bash
npm test              # run the whole suite once
npm run test:watch    # re-run on every change
npm run coverage      # write a coverage report to coverage/
${F}

Please add a test for every bug you fix and every feature you add.
`,
  },
  {
    id: 'deployment',
    title: 'Deployment',
    emoji: '☁️',
    description: 'Build for production and ship it.',
    markdown: `## Deployment

Build the production bundle:

${F}bash
npm run build
${F}

The output in \`dist/\` is a static site, so it runs on any static host: GitHub Pages, Netlify, Vercel or Cloudflare Pages.

<details>
<summary>Deploy with Docker</summary>

${F}bash
docker build -t project-name .
docker run -p 8080:80 project-name
${F}

</details>
`,
  },
  {
    id: 'api-reference',
    title: 'API reference',
    emoji: '📖',
    description: 'Function signatures, parameters and return values.',
    markdown: `## API reference

### \`createClient(options)\`

Creates a new client.

| Parameter         | Type     | Default | Description                  |
| :---------------- | :------- | :------ | :--------------------------- |
| \`options.apiKey\`  | \`string\` | none    | Your API key (required)      |
| \`options.timeout\` | \`number\` | \`5000\`  | Request timeout in milliseconds |

**Returns** a \`Client\`.

### \`client.run(input)\`

Runs a job and resolves with its result. Rejects with an \`ApiError\` when the request fails.
`,
  },
  {
    id: 'changelog',
    title: 'Changelog',
    emoji: '📝',
    description: 'Notable changes per version, newest first.',
    markdown: `## Changelog

### 1.1.0 (2026-09-01)

- Added: dark mode
- Fixed: a crash when the configuration file is empty

### 1.0.0 (2026-06-15)

- First stable release

See [CHANGELOG.md](CHANGELOG.md) for older versions.
`,
  },
];

export function findSection(id: string): SectionTemplate | undefined {
  return SECTION_TEMPLATES.find((s) => s.id === id);
}
