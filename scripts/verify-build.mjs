// Checks the built app for a mistake the bundler makes silently. The engine's process
// (out/engine/host.js) must stand alone: built together with the main process, it would load the
// whole main process, which crashes it. That is why it has a build of its own
// (vite.engine-host.config.mts); this keeps it that way. Run after every build.
import { readFileSync } from 'node:fs'

const HOST = 'out/engine/host.js'
const host = readFileSync(HOST, 'utf8')
const loaded = [...host.matchAll(/require\(["'](\.[^"']+)["']\)/g)].map((match) => match[1])

if (loaded.length > 0) {
  console.error(
    `${HOST} loads ${loaded.join(', ')}; it must load nothing else from the build.\n` +
      'See vite.engine-host.config.mts.',
  )
  process.exit(1)
}
