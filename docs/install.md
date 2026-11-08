# Installing Chess Training Simulator

Download the installer for your system from the
[releases page](https://github.com/Blankscreen-exe/chess-training-simulator/releases), then
connect the coach from your own Claude Code.

| System               | Download                                                   |
| -------------------- | ---------------------------------------------------------- |
| Windows 10 or 11     | `chess-training-simulator-<version>-win-x64.exe`           |
| macOS, Apple silicon | `chess-training-simulator-<version>-mac-arm64.dmg`         |
| macOS, Intel         | `chess-training-simulator-<version>-mac-x64.dmg`           |
| Linux, any           | `chess-training-simulator-<version>-linux-<arch>.AppImage` |
| Debian, Ubuntu       | `chess-training-simulator-<version>-linux-<arch>.deb`      |

To check a download, compare its SHA-256 with the line for it in `SHA256SUMS.txt`, on the same
page: `certutil -hashfile <file> SHA256` on Windows, `shasum -a 256 <file>` on macOS,
`sha256sum <file>` on Linux.

## The first run: your system's warning

The app is not signed yet, as signing costs money each year. Your system therefore cannot tell
who made it, and warns once before the first run. The code is all in this repository, and you can
[run it from source](../README.md#running-it-from-source) instead.

- **Windows.** SmartScreen says "Windows protected your PC". Choose **More info**, then
  **Run anyway**. The installer lets you choose where the app goes.
- **macOS.** Open the `.dmg` and drag the app to Applications. The first time you open it, macOS
  says it cannot check it for malicious software. Open **System Settings → Privacy & Security**,
  scroll down to the message about Chess Training Simulator, and choose **Open Anyway**. Or, in
  Terminal: `xattr -dr com.apple.quarantine "/Applications/Chess Training Simulator.app"`.
- **Linux, AppImage.** Make it runnable, then run it:
  `chmod +x chess-training-simulator-*.AppImage && ./chess-training-simulator-*.AppImage`. On
  Ubuntu 22.04 and later, AppImages need FUSE 2 first: `sudo apt install libfuse2t64` (or
  `libfuse2` before 24.04).
- **Linux, .deb.** `sudo apt install ./chess-training-simulator-*.deb`, then start it from your
  applications menu.

## Connecting the coach

The coach is Claude, in [Claude Code](https://code.claude.com/docs/en/overview), on your own
Claude plan. You need Claude Code installed and signed in.

1. Start the app. Its Coach tab shows these steps until Claude Code connects.
2. In a terminal, add the coach to Claude Code, once:

   ```sh
   claude mcp add --transport http --scope user chess-coach http://127.0.0.1:8765/mcp
   ```

   `--scope user` adds it for every folder; without it, Claude Code adds it only for the folder
   you are in.

3. Start `claude` in any folder, and allow the coach's tools when asked. To allow them all at
   once, run `/permissions` and add the rule `mcp__chess-coach`.
4. Say "let's train". The app's Coach tab shows the coach connected, and you chat with it there.

The coach waits for you through a tool call that returns every 40 seconds or so; each return is a
small turn on your plan. After ten quiet minutes it stops waiting, and the app shows it as paused:
say "continue" in Claude Code to bring it back.

## The puzzle library

Puzzles and openings come from Lichess's free databases. In the Training tab, **Install library**
downloads about 300 MB once and keeps the best 200,000 or so puzzles, in about 40 MB. It takes a
few minutes; the app stays usable meanwhile. **Update library** fetches the latest, and your own
progress is kept.

## Your data

Everything stays on your computer, in the app's folder:

| System  | Folder                                                   |
| ------- | -------------------------------------------------------- |
| Windows | `%APPDATA%\Chess Training Simulator`                     |
| macOS   | `~/Library/Application Support/Chess Training Simulator` |
| Linux   | `~/.config/Chess Training Simulator`                     |

- `games.db`: your games and their reviews, puzzle tries, positions to practise, the weaknesses
  the coach noted, and settings.
- `library.db`: the puzzles and openings, which can be installed again at any time.

The app goes online only to install the library, from `database.lichess.org` and
`raw.githubusercontent.com`. Its coach server listens on `127.0.0.1` only, so no other computer
can reach it, and it refuses requests from web pages. Your chats with the coach stay in Claude
Code's transcripts on your computer.

## Uninstalling

- **Windows:** Settings → Apps → Chess Training Simulator → Uninstall.
- **macOS:** drag the app from Applications to the Bin (Trash).
- **Linux:** delete the AppImage, or `sudo apt remove chess-training-simulator`.

Your data stays, in case you come back; delete the folder above to remove it too. To remove the
coach from Claude Code: `claude mcp remove --scope user chess-coach`.

## When something goes wrong

- **"Port 8765 is in use by another program"** (Coach tab): another program, or a second copy of
  the app run from source, holds the port. Close it, or start the app with `CHESS_COACH_PORT` set
  to a free port and add the coach with that port instead.
- **The coach shows as paused:** say "continue" in Claude Code.
- **Claude Code does not list `chess-coach`** (`claude mcp list`): add it again with the command
  above, with `--scope user`.
- **The library install fails:** the Training tab says why. Check your connection, then choose
  **Install library** again; a failed install leaves the library you had as it was.
