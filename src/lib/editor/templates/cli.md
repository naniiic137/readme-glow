# tool-name

> One sentence that says what the command does and who it is for.

[![Version](https://img.shields.io/badge/version-0.1.0-8B5CF6)](https://github.com/your-name/tool-name/releases)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-0EA5E9)](#installation)
[![Licence](https://img.shields.io/badge/licence-MIT-F59E0B)](LICENSE)

<!-- A short terminal recording sells a CLI better than any paragraph: ![Demo](docs/demo.gif) -->

## Installation

```bash
# macOS and Linux (Homebrew)
brew install your-name/tap/tool-name

# Any platform with Node.js 20+
npm install --global tool-name
```

Or download a binary from the [releases page](https://github.com/your-name/tool-name/releases).

## Quick start

```console
$ tool-name init
✔ Created tool-name.toml

$ tool-name run --watch
Watching 12 files… press Ctrl+C to stop
```

## Commands

| Command            | Description                            |
| :----------------- | :------------------------------------- |
| `tool-name init`   | Create a configuration file            |
| `tool-name run`    | Run the tool once                      |
| `tool-name doctor` | Check your setup and explain problems  |

## Options

| Flag              | Description                        | Default |
| :---------------- | :--------------------------------- | :------ |
| `-w`, `--watch`   | Re-run when files change           | off     |
| `-q`, `--quiet`   | Only print errors                  | off     |
| `-c`, `--config`  | Path to a configuration file       | `tool-name.toml` |

## Configuration

```toml title="tool-name.toml"
[run]
include = ["src/**/*.md"]
exclude = ["node_modules"]
```

> [!TIP]
> Every option can also be set with an environment variable, e.g. `TOOL_NAME_QUIET=1`.

## Exit codes

| Code | Meaning                  |
| ---: | :----------------------- |
|    0 | Success                  |
|    1 | Problems were found      |
|    2 | Invalid configuration    |

## Licence

MIT © 2026 Your Name
