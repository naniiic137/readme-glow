# package-name

One sentence that says what the library does and who it is for.

[![npm](https://img.shields.io/badge/npm-1.0.0-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/package-name)
[![Bundle size](https://img.shields.io/badge/minzipped-2.1%20kB-0EA5E9)](https://bundlephobia.com/package/package-name)
[![Types](https://img.shields.io/badge/types-included-3178C6?logo=typescript&logoColor=white)](#api)
[![Licence](https://img.shields.io/badge/licence-MIT-F59E0B)](LICENSE)

## Why?

Explain the problem in two sentences, and why this library is a better answer than writing it yourself or using the alternatives.

- **Tiny**: no dependencies, tree-shakeable
- **Typed**: written in TypeScript, with full type definitions
- **Tested**: 100% test coverage

## Installation

```bash
npm install package-name
```

<details>
<summary>pnpm, yarn and bun</summary>

```bash
pnpm add package-name
yarn add package-name
bun add package-name
```

</details>

## Usage

```ts
import { format } from 'package-name';

format(new Date(2026, 0, 31), { style: 'long' });
// → "31 January 2026"
```

## API

### `format(value, options?)`

Formats a value for display.

| Option   | Type                           | Default     | Description                |
| :------- | :----------------------------- | :---------- | :------------------------- |
| `style`  | `'short'`, `'medium'`, `'long'` | `'medium'` | How much detail to include |
| `locale` | `string`                       | `'en-GB'`   | Any BCP 47 language tag    |

Returns a `string`.

> [!NOTE]
> The library works in browsers, Node.js 18+, Deno and Bun.

## Contributing

Bug reports and pull requests are welcome. Run `npm test` and `npm run lint` before you open a pull request.

## Licence

MIT © 2026 Your Name
