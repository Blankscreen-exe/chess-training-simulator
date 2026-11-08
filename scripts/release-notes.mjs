// Prints the notes for a release: its section of CHANGELOG.md, then where to read how to install
// it. The release workflow drafts the GitHub release with them.
//   node scripts/release-notes.mjs 0.1.0
import { readFileSync } from 'node:fs'

const version = process.argv[2]
if (!version) throw new Error('Give the version, as 0.1.0')

const lines = readFileSync('CHANGELOG.md', 'utf8').split(/\r?\n/)
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`))
if (start === -1) throw new Error(`CHANGELOG.md has no section for ${version}`)
const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
const section = lines
  .slice(start + 1, end === -1 ? undefined : end)
  .join('\n')
  .trim()

console.log(`${section}

---

How to install it, and why your system warns about it the first time: [docs/install.md](https://github.com/Blankscreen-exe/chess-training-simulator/blob/v${version}/docs/install.md). Check a download against \`SHA256SUMS.txt\`.`)
