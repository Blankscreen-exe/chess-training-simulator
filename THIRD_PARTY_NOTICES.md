# Third-party notices

Chess Training Simulator is licensed under the GNU General Public License, version 3 (see
`LICENSE`). It is built on the following software, under their own licences.

| Software                 | Licence          | Source                                                 |
| ------------------------ | ---------------- | ------------------------------------------------------ |
| Stockfish (Stockfish.js) | GPL-3.0          | https://github.com/nmrugg/stockfish.js                 |
| chessground              | GPL-3.0-or-later | https://github.com/lichess-org/chessground             |
| chess.js                 | BSD-2-Clause     | https://github.com/jhlywa/chess.js                     |
| MCP TypeScript SDK       | MIT              | https://github.com/modelcontextprotocol/typescript-sdk |
| Electron                 | MIT              | https://github.com/electron/electron                   |
| React, ReactDOM          | MIT              | https://github.com/facebook/react                      |
| Tailwind CSS             | MIT              | https://github.com/tailwindlabs/tailwindcss            |
| Zod                      | MIT              | https://github.com/colinhacks/zod                      |

## Where the licences are

- **Everything bundled into the app** (the packages above, and the packages they use, such as
  ajv and Hono): `THIRD_PARTY_LICENSES.txt`, beside the app. It is generated at every build
  by `scripts/collect-licenses.mjs`, from what the build actually bundled, with each package's
  own licence text, so it always matches the version shipped.
- **Stockfish** is the chess engine, by the Stockfish developers, built for WebAssembly by
  Nathan Rugg and Chess.com. The app ships it unchanged, as
  `resources/engine/stockfish-19-lite-single.js` and `.wasm`, with its licence beside it as
  `Copying.txt`. Its source is at the address above, at the version tagged `v19.0.1`.
- **Electron** includes Chromium and Node.js, whose licences are in `LICENSES.chromium.html`,
  beside the app.
- **Tailwind CSS** generates the app's stylesheet, which carries its licence notice.

The pieces are the Cburnett set, which comes with chessground.

## Used only to build the app

electron-vite, Vite, TypeScript, ESLint, Prettier, Vitest and electron-builder build and test
the app; they are not part of what is distributed.
