# Third-party notices

Chess Training Simulator is licensed under the GNU General Public License, version 3 (see
`LICENSE`). It includes the following software, under their own licences.

## Included in the app

| Software                 | Licence          | Source                                      |
| ------------------------ | ---------------- | ------------------------------------------- |
| Stockfish (Stockfish.js) | GPL-3.0          | https://github.com/nmrugg/stockfish.js      |
| chessground              | GPL-3.0-or-later | https://github.com/lichess-org/chessground  |
| chess.js                 | BSD-2-Clause     | https://github.com/jhlywa/chess.js          |
| Electron                 | MIT              | https://github.com/electron/electron        |
| React, ReactDOM          | MIT              | https://github.com/facebook/react           |
| Tailwind CSS             | MIT              | https://github.com/tailwindlabs/tailwindcss |
| Zod                      | MIT              | https://github.com/colinhacks/zod           |

- **Stockfish** is the chess engine, by the Stockfish developers, built for WebAssembly by Nathan
  Rugg and Chess.com. The app ships it unchanged, as `resources/engine/stockfish-19-lite-single.js`
  and `.wasm`, with its licence beside it as `Copying.txt`. Its source is at the address above, at
  the version tagged `v19.0.1`.
- **chessground** is the board, by the Lichess team.
- **Electron** includes Chromium and Node.js, whose licences are in the `LICENSES.chromium.html`
  file that comes with every packaged copy of the app.

The pieces are the Cburnett set, which comes with chessground.

## Licence texts

### chess.js (BSD-2-Clause)

```
Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

### Electron, React, ReactDOM, Tailwind CSS and Zod (MIT)

```
Copyright (c) Electron contributors
Copyright (c) Meta Platforms, Inc. and affiliates.
Copyright (c) Tailwind Labs, Inc.
Copyright (c) 2025 Colin McDonnell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Stockfish and chessground are under the GNU General Public License, version 3, the same as the
app; its text is in `LICENSE`.

## Used to build the app

electron-vite, Vite, TypeScript, ESLint, Prettier, Vitest and electron-builder are used to build
and test the app; they are not part of what is distributed.
