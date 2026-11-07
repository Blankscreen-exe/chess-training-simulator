# Chess Training Simulator

A desktop chess trainer where Claude coaches you: it shows you your options before a move, tells
you what went right or wrong after it, replays "what if" lines on the board, and gives you puzzles,
openings and reviews. Claude connects from your own Claude Code and uses your own Claude plan, so
there is no API key, and your chats stay in Claude Code's transcripts on your computer.

Stockfish plays and judges the chess; Claude never acts as the engine.

**Status:** early. The chess works, without the coach yet: play Stockfish at eight strengths from
the start or from a position you set up, see its best lines with arrows and watch them played
out, try moves on an analysis board, and step back through your games, which are kept on your
computer. Claude's coaching comes next; see [the plan](docs/plan.md).

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

Every package is bundled into the app by Vite, for the main process as for the page, so all of
them go in `devDependencies`. `dependencies` is only for a package that cannot be bundled, which
electron-builder would then copy into the app whole; there are none. Stockfish is the exception to
both: it runs in its own process, and `electron-builder.yml` copies just the one build of it the
app uses.

## How the code is organised

The main process decides everything about the chess; the page only shows it and asks. They meet
through one typed contract.

| Folder              | What is in it                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/shared`        | The vocabulary both sides use: chess types and their allowed values, engine levels, notation helpers, and the IPC contract |
| `src/main/chess`    | The rules, through chess.js: legal moves, checking positions, how games end                                                |
| `src/main/games`    | A game, its storage in SQLite, and the service that plays it against the engine                                            |
| `src/main/engine`   | Stockfish: the UCI protocol, strength levels, and running it in its own process                                            |
| `src/main/analysis` | The engine's best lines for a position                                                                                     |
| `src/main/ipc`      | Checking every request from the page against a schema, and answering it                                                    |
| `src/preload`       | `window.api`, built from the contract                                                                                      |
| `src/renderer/src`  | The React app: `state` (what the board shows, as a reducer), `hooks`, `components`, and `lib` (pure helpers)               |

Adding a request from the page means three edits, each checked by the compiler: the channel in
`src/shared/ipc.ts`, its argument schema in `src/main/ipc/schemas.ts`, and its handler in
`src/main/services.ts`.

## Licence

GPL-3.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
