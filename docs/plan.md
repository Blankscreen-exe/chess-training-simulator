# Chess training simulator: plan

A desktop chess trainer (Electron, React, Tailwind) where Claude coaches you while you play, review
games, solve puzzles and study openings. Claude connects from your own Claude Code, using your own
Claude plan: no API key, and chats stay in Claude Code's transcripts on your computer.

## Principles

- **The LLM is never the chess engine.** chess.js decides what is legal and holds the game.
  Stockfish plays and evaluates. Claude coaches, and every chess claim it makes comes from a tool.
- **The app has the last word.** Every board action Claude asks for is checked by chess.js, and by
  Stockfish where it is a claim about chess, before it is shown.
- **The live game is never touched by a preview.** Replays and "what if" lines play on a separate
  layer, and the board returns to the game afterwards.
- **Claude knows only what it is told.** Chat history is not memory: game state and the player's
  profile come from tools every time.

## Architecture

```
┌─ Renderer (React + Tailwind) ────────────────────────────┐
│  Board (chessground) · coach chat panel · review screen  │
└──────────────────── IPC (preload / contextBridge) ───────┘
┌─ Electron main process (Node) ───────────────────────────┐
│  GameService     chess.js, the only source of truth      │
│  EngineService   Stockfish WASM over UCI                 │
│  CoachServer     MCP over HTTP on 127.0.0.1  ◄── the user's own Claude Code
│  Storage         SQLite: games, puzzles, openings, profile │
└──────────────────────────────────────────────────────────┘
```

### How Claude connects

The same pattern as the duel-masters project's local player:

- The main process serves MCP tools over stateless Streamable HTTP, on `127.0.0.1` only, and
  refuses requests from other sites' pages or naming any other host.
- The repository ships `.mcp.json`. For an installed app, onboarding shows the command
  `claude mcp add --transport http chess-coach http://127.0.0.1:8765/mcp`.
- The user runs `claude`, approves `chess-coach` and allows `mcp__chess-coach`, then says something
  like "let's train".
- The server's instructions carry the coaching rules: use the tools for every chess claim, match
  the player's level, follow the current mode.
- `wait_for_event` waits up to about 40 seconds for something to happen: a move, a chat message, a
  change of mode or a new game. Claude calls it again when it returns empty. After about 10 quiet
  minutes it tells Claude to stop, and the app shows the coach as paused.
- Each tool call records contact, so the app can show whether the coach is connected.
- The app never handles a login. Anthropic does not allow third-party apps to offer claude.ai login
  without approval; here, people use their own Claude Code as they always do.
- The product must not be named "Claude Code …"; "… Powered by Claude" is allowed.

### Talking to Claude

The app's chat panel is the main place. Messages typed there reach Claude through `wait_for_event`,
and Claude answers with `say`. The Claude Code terminal also works.

## Tools

| Tool                    | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `wait_for_event`        | Waits for the player's move, chat message, mode change or new game   |
| `get_game_state`        | FEN, PGN, side to move, mode, player level                           |
| `analyze_position`      | Stockfish's best moves for a position, with evaluation and lines     |
| `show_candidates`       | Arrows and highlights on the board, with a short note for each move  |
| `play_preview`          | Plays a line on the preview layer, then returns to the live game     |
| `set_position`          | Opens an analysis board on a position                                |
| `new_game` / `end_game` | Starts a game; ends one as finished, resigned or abandoned           |
| `make_move`             | Only when Claude picks the opponent's move: one of the engine's list |
| `get_puzzle`            | A puzzle by theme and rating; the app checks the answers             |
| `get_openings`          | Opening names and lines from the openings database                   |
| `get_player_profile`    | The player's level, history and weaknesses                           |
| `log_weakness`          | Records a mistake pattern for later training                         |
| `say`                   | Writes in the coach panel                                            |

Built-in Claude Code tools are not needed. The instructions tell Claude to use only these.

## Modes

A mode is a rule for when Claude is told about the game and what it may say.

| Mode                     | When Claude speaks                                                     |
| ------------------------ | ---------------------------------------------------------------------- |
| Guided                   | Before each of your moves, with candidates; after it, with what it did |
| Casual                   | Before your move, describing the options only; never judges your move  |
| Coach on blunder         | Only when the evaluation drops past a threshold                        |
| Silent                   | Never, except a review after the game if asked                         |
| Puzzle, lesson, analysis | When you ask                                                           |

You can change mode in the chat ("just let me play now") or with a toggle.

**Opponent**, a toggle: Stockfish at a chosen Elo, which answers at once without Claude; or Claude
picking among Stockfish's best few moves, to make the game more human or to set up a lesson.

## What you can ask for

- **"Guide me through this game"**: Guided mode.
- **"Show me what happens if my rook goes to e7"**: `play_preview` on the preview layer, with
  captions, then back to the game.
- **"Show me a few good openings"**: names and lines from the openings database, chosen for the
  player and played through as previews.
- **"I have this position, what do I do?"**: board editor, pasted FEN, or a description Claude
  turns into a FEN for you to confirm; then analysis.
- **"Give me a puzzle"**: from the puzzle database, picked for the player's weaknesses.
- **"Show me some bishop tricks"**: a lesson made from real puzzles by theme and piece. A position
  Claude makes up itself is shown only once Stockfish confirms it works.
- **"Let's play casually and only tell me my options"**: Casual mode.
- **"That's enough of this game, start another"**: `end_game("abandoned")`, then `new_game`; the
  unfinished game stays in the history.

## Data

- **Puzzles:** the Lichess puzzle database (CC0), with rating and themes. Downloaded on first run and
  imported into SQLite, as it is too large for the repository.
- **Openings:** the Lichess `chess-openings` dataset (CC0).
- **Your data:** games, mistakes and settings, in SQLite under `app.getPath('userData')`.

## Platforms and licence

- Windows, macOS and Linux, with no native modules. Stockfish is its lite, single-threaded
  WebAssembly build: one 2 MB file that runs everywhere, without `SharedArrayBuffer`, in its own
  Electron utility process. SQLite is Node's own `node:sqlite`, which Electron includes.
- Packaged with electron-builder: Windows installer, macOS `.dmg`, Linux AppImage and `.deb`.
  Builds are unsigned at first, so the operating system warns once; running from source is also
  documented.
- **GPL-3.0**, as Stockfish and chessground are.

## Phases

### 0. Skeleton (done)

- electron-vite with React, TypeScript and Tailwind; `LICENSE` (GPL-3.0); `THIRD_PARTY_NOTICES.md`
- Main, preload and renderer with typed IPC; `contextIsolation` on, `nodeIntegration` off
- GitHub Actions: lint, test and build on all three platforms from the start

### 1. Chess without Claude (done)

- chessground board; chess.js in the main process
- Stockfish service: analysis of the best few moves, and play at a chosen Elo
- A whole game against Stockfish: new game, resign, abandon, history in SQLite
- Live and preview board layers, with playback controls for previews
- Board editor and FEN paste

### 2. MCP server and the coach's connection (done)

- Stateless Streamable HTTP MCP server on `127.0.0.1`, checking Origin and Host
- Server instructions
- `wait_for_event` with its queue of events and the idle cutoff
- Connected / offline / paused status
- Chat panel, through `wait_for_event` and `say`
- `get_game_state`, brought forward from phase 3 so the chat has true facts to talk about
- `.mcp.json`, the `claude mcp add` command, and setup steps shown until Claude Code connects
  (only the connection itself can be seen from the app, not each step)

### 3. Coaching tools and modes (done)

- `analyze_position`, `show_candidates`, `play_preview`, `set_position`, `new_game`, `end_game`,
  `make_move`, `set_mode`; moves accepted in standard notation or UCI
- Guided, Casual, Blunder watch and Silent modes, switched in chat or in the Coach tab; a third
  engine judges the player's moves by the winning chances they give away
- The opponent toggle: Stockfish, or the coach choosing from Stockfish's best moves (Stockfish
  plays for it if it is away or slow)
- Settings kept in the database: coaching mode and the player's level; the new-game dialog
  remembers side, strength and opponent

### 4. Training content

- Download and import of the puzzle and openings databases
- `get_puzzle`, `get_openings`
- Lessons from puzzles by theme and piece; Stockfish checks any position Claude makes up
- Review after a game

### 5. The player's profile

- `get_player_profile`, `log_weakness`; puzzles and coaching aimed at weaknesses
- Spaced repetition of past mistakes

### 6. Release

- Packages for all three platforms, README, setup guide, screenshots
- Perhaps a terminal inside the app that runs `claude`

## Things to watch

- **Waiting uses the plan.** Each empty `wait_for_event` is a small turn for Claude, hence the idle
  cutoff.
- **Long sessions grow.** Tool results stay short (a FEN and a summary, not trees of moves) so a
  session lasts before Claude Code compacts it.
- **Claude Code can still reach the computer.** It keeps its usual file and shell access; the
  instructions keep it to the chess tools, but nothing outside the tools enforces that.
- **Speed.** Stockfish and arrows are instant; Claude's words follow a few seconds later, streamed
  into the panel.
