# Chess Training Simulator

A desktop chess trainer where Claude coaches you: it shows you your options before a move, tells
you what went right or wrong after it, replays "what if" lines on the board, and gives you puzzles,
openings and reviews. Claude connects from your own Claude Code and uses your own Claude plan, so
there is no API key, and your chats stay in Claude Code's transcripts on your computer.

Stockfish plays and judges the chess; Claude never acts as the engine.

**Status:** early. You can play Stockfish at eight strengths from the start or from a position
you set up, see its best lines with arrows and watch them played out, try moves on an analysis
board, and step back through your games, which are kept on your computer. Claude connects and
talks with you in the app, and follows the game; its coaching tools (the engine's view, showing
moves on the board) come next. See [the plan](docs/plan.md).

## Connecting the coach

The coach is Claude, in your own [Claude Code](https://code.claude.com/docs/en/overview). The
app runs a small MCP server on your computer, at `http://127.0.0.1:8765/mcp`, which only this
computer can reach and which refuses requests from web pages.

1. Start the app.
2. In a terminal, start Claude Code in this project's folder; its `.mcp.json` points Claude Code
   at the app. From any other folder, add the coach once:

   ```sh
   claude mcp add --transport http chess-coach http://127.0.0.1:8765/mcp
   ```

3. Approve the `chess-coach` server, and allow its tools when asked, or all at once with
   `/permissions` and the rule `mcp__chess-coach`.
4. Say "let's train". The Coach tab in the app shows it connected, and you chat with it there.

Claude waits for you through a tool call that returns every 40 seconds or so; each return is a
small turn on your plan. After ten quiet minutes it stops waiting, and the app shows the coach as
paused; say "continue" in Claude Code to bring it back. Set `CHESS_COACH_PORT` to run the app on
another port (and change `.mcp.json` to match).

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

| Folder              | What is in it                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared`        | The vocabulary both sides use: chess types and their allowed values, engine levels, notation helpers, and the IPC contract       |
| `src/main/chess`    | The rules, through chess.js: legal moves, checking positions, how games end                                                      |
| `src/main/games`    | A game, its storage in SQLite, and the service that plays it against the engine                                                  |
| `src/main/engine`   | Stockfish: the UCI protocol, strength levels, and running it in its own process                                                  |
| `src/main/analysis` | The engine's best lines for a position                                                                                           |
| `src/main/coach`    | The coach's MCP server: who may connect, its tools and instructions, and the chat and events it passes between player and Claude |
| `src/main/ipc`      | Checking every request from the page against a schema, and answering it                                                          |
| `src/preload`       | `window.api`, built from the contract                                                                                            |
| `src/renderer/src`  | The React app: `state` (what the board shows, as a reducer), `hooks`, `components`, and `lib` (pure helpers)                     |

Adding a request from the page means three edits, each checked by the compiler: the channel in
`src/shared/ipc.ts`, its argument schema in `src/main/ipc/schemas.ts`, and its handler in
`src/main/services.ts`.

## Licence

GPL-3.0. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
