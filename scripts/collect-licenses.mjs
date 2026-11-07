// Writes out/THIRD_PARTY_LICENSES.txt: the licence of every package the build bundled into the
// app, read from the build itself, so the list can never fall behind the dependencies. The
// bundler marks each module it includes with a comment naming its file under node_modules;
// those marks are the list. electron-builder ships the result beside the app. Run after every
// build; it fails if a bundled package has no licence to show.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'out'
const TARGET = join(OUT, 'THIRD_PARTY_LICENSES.txt')
const MARK = /^\/\/ node_modules\/\.pnpm\/([^/]+)\/node_modules\/((?:@[^/]+\/)?[^/]+)\//gm
const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i

function builtFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return builtFiles(path)
    return entry.name.endsWith('.js') ? [path] : []
  })
}

/** Each bundled package, by the folder it was read from. */
const packages = new Map()
for (const file of builtFiles(OUT)) {
  for (const [, store, name] of readFileSync(file, 'utf8').matchAll(MARK)) {
    packages.set(join('node_modules', '.pnpm', store, 'node_modules', name), name)
  }
}

const missing = []
const sections = [...packages]
  .sort(([, a], [, b]) => a.localeCompare(b))
  .map(([folder, name]) => {
    const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
    const licenseFile = readdirSync(folder).find((entry) => LICENSE_FILE.test(entry))
    if (!licenseFile) missing.push(`${name}@${manifest.version}`)
    const text = licenseFile ? readFileSync(join(folder, licenseFile), 'utf8').trim() : ''
    return `${name} ${manifest.version} (${manifest.license})\n${'-'.repeat(72)}\n${text}`
  })

if (missing.length > 0) {
  console.error(`No licence file in: ${missing.join(', ')}`)
  process.exit(1)
}

writeFileSync(
  TARGET,
  'Chess Training Simulator includes the following packages. Their licences follow.\n' +
    'Stockfish and Electron are not listed here: their licences come with the app in\n' +
    'resources/engine/Copying.txt and LICENSES.chromium.html.\n\n' +
    sections.join('\n\n\n') +
    '\n',
)
console.log(`${TARGET}: ${packages.size} packages`)
