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
  `claude mcp add --transport http --scope user chess-coach http://127.0.0.1:8765/mcp` (user
  scope, so every folder has it; Claude Code's default is the current folder only).
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
| `find_puzzles`          | Puzzles by theme, piece and rating, as examples for a lesson         |
| `start_puzzle`          | A puzzle on the board; the app checks the answers                    |
| `find_openings`         | Opening names and lines from the openings database                   |
| `check_line`            | Stockfish's verdict on each move of a line Claude wants to show      |
| `review_game`           | Every move of a game marked, and its turning points                  |
| `get_player_profile`    | Puzzle rating, hard themes, games, weaknesses, practice due          |
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
- **"Give me a puzzle"**: positions due for practice first, else from the puzzle database,
  often aimed at the player's weak spots.
- **"Show me some bishop tricks"**: a lesson made from real puzzles by theme and piece. A position
  Claude makes up itself is shown only once Stockfish confirms it works.
- **"Let's play casually and only tell me my options"**: Casual mode.
- **"That's enough of this game, start another"**: `end_game("abandoned")`, then `new_game`; the
  unfinished game stays in the history.

## Data

- **Puzzles:** the Lichess puzzle database (CC0), with rating and themes. Downloaded when the
  player installs the library from the Training tab (about 300 MB, once), and the best of it
  kept in `library.db`, as it is too large for the repository.
- **Openings:** the Lichess `chess-openings` dataset (CC0), installed with the puzzles.
- **Your data:** games and their reviews, puzzle tries, positions to practise, weaknesses and
  settings, in `games.db` under `app.getPath('userData')`, apart from the library, which can be
  replaced without touching them. Positions to practise keep their own copy of the puzzle, so
  they outlive a new library.

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

### 4. Training content (done)

- The library: Lichess's puzzles and openings, installed from the Training tab into a database
  of their own. The puzzle file is streamed, never saved: its zstd frames are read as they
  arrive (skipping pzstd's skippable frames, which Node's decompressor cannot), and the best
  puzzles kept, up to 10,000 in each band of 100 rating points: about 212,000 from the 2026 file, in a 39 MB
  library, installed in about seven minutes
- Puzzles on the board, from the Training tab or the coach: the app checks each move (any mate
  counts), plays the replies, gives hints and the answer, and notes every try, so puzzles do not
  come round again soon
- `find_puzzles`, `start_puzzle`, `find_openings`; lessons are real puzzles by theme or by the
  piece that wins
- `check_line`: Stockfish judges every move of a line Claude makes up before it is shown
- `review_game`: every move marked, and the turning points; a Review button once a game ends
- The game's opening, by name, in the Game tab and for the coach

### 5. The player's profile (done)

- Each game is reviewed as it ends, in the background, by a fourth engine of its own, so the
  coach never waits on it; the review is kept, so `review_game` answers at once, and games
  that ended before reviews were kept are caught up on at start
- A puzzle rating, an Elo estimate from first tries only (a puzzle seen before is easier),
  given after ten; once there is one, puzzles are rated around it rather than by level
- How the player does by theme, and where in their games (opening, middlegame, endgame) their
  mistakes come; weak spots are the themes of the weaknesses the coach notes with
  `log_weakness`, then the themes they solve least often. `get_player_profile`, and puzzles
  aimed at weak spots from the coach or the Training tab
- Practice: puzzles the player missed, and the worst mistakes in their games where one move
  was clearly best (by 15 points of winning chances over the next), set up as puzzles. A
  Leitner schedule brings each back after 1, 3, 7, 16 and 35 days, at the start of the
  player's day; a miss sends it back to the start, and solving it first time from the last
  box counts it learned
- The Progress tab: rating, hardest and easiest themes, results, mistakes by phase, and the
  weaknesses noted, which the player can forget

### 6. Release (done)

- An icon of the app's own (`build/icon.svg`, rendered by Electron with `pnpm icon`), and
  installers named alike on every platform: Windows (NSIS, x64), macOS (`.dmg` for Apple silicon
  and for Intel) and Linux (AppImage and `.deb`, x64)
- A release workflow: a `v*` tag runs CI's checks, builds the installers on each platform,
  and drafts a GitHub release with them, `SHA256SUMS.txt` and the version's notes from
  `CHANGELOG.md`; a person publishes it. Builds stay unsigned for now
- `docs/install.md`: downloads, getting past each system's first-run warning, connecting the
  coach, where data is kept, uninstalling and troubleshooting; the README rewritten around it,
  with screenshots
- The coach is added with `--scope user`: Claude Code's default scope is the current folder,
  so the command shown before did not reach other folders as it said
- **Not done: a terminal inside the app.** It would need `node-pty`, a native module, which
  breaks "no native modules" and needs building for each platform and Electron version; and
  Claude Code is at its best in the player's own terminal. The app shows the one command to run
  instead, with a copy button

## After the first release

- Sign the builds (an Apple Developer ID and notarisation; a Windows code-signing certificate)
  so systems stop warning, then add automatic updates, which need signed builds on macOS
- ARM builds for Windows and Linux

## Things to watch

- **Waiting uses the plan.** Each empty `wait_for_event` is a small turn for Claude, hence the idle
  cutoff.
- **Long sessions grow.** Tool results stay short (a FEN and a summary, not trees of moves) so a
  session lasts before Claude Code compacts it.
- **Claude Code can still reach the computer.** It keeps its usual file and shell access; the
  instructions keep it to the chess tools, but nothing outside the tools enforces that.
- **Speed.** Stockfish and arrows are instant; Claude's words follow a few seconds later, streamed
  into the panel.
