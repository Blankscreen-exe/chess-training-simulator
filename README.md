# Chess Training Simulator

A desktop chess trainer where Claude coaches you: it shows you your options before a move, tells
you what went right or wrong after it, replays "what if" lines on the board, and gives you puzzles,
openings and reviews. Claude connects from your own Claude Code and uses your own Claude plan, so
there is no API key, and your chats stay in Claude Code's transcripts on your computer.

Stockfish plays and judges the chess; Claude never acts as the engine.

**Status:** early. This is the skeleton of the app; see [the plan](docs/plan.md) for what comes
next.

## Running it from source

You need [Node.js](https://nodejs.org/) 24 or later and [pnpm](https://pnpm.io/) 11.

```sh
pnpm install
pnpm dev
```

| Command            | What it does                                               |
| ------------------ | ---------------------------------------------------------- |
| `pnpm dev`         | Runs the app, reloading as you change the code             |
| `pnpm build`       | Builds the app into `out/`                                 |
| `pnpm package`     | Builds installers for this platform into `release/`        |
| `pnpm package:dir` | Builds an unpacked app into `release/`, without installers |
| `pnpm test`        | Runs the tests                                             |
| `pnpm lint`        | Checks the code with ESLint                                |
| `pnpm typecheck`   | Checks the types                                           |
| `pnpm format`      | Formats the code with Prettier                             |

Only packages the main process loads while running go in `dependencies`: they are copied into the
packaged app. Everything the renderer uses, React included, is bundled by Vite, so it goes in
`devDependencies` with the build tools.

## Licence

GPL-3.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
