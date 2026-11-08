// Renders build/icon.svg to build/icon.png, at 1024 pixels, which electron-builder turns into each
// platform's icon. Run with Electron, which draws SVG as browsers do: `pnpm icon`.
import { readFileSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'

const SIZE = 1024

async function render() {
  const svg = readFileSync('build/icon.svg').toString('base64')
  // Drawn off screen, so the window may be larger than the screen.
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  })
  // An off-screen window hands over each frame as it paints; the first whole one is the icon.
  const painted = new Promise((resolve) =>
    window.webContents.on('paint', (_event, _dirty, frame) => {
      if (frame.getSize().width >= SIZE) resolve(frame)
    }),
  )
  const page = `<body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${svg}" width="${SIZE}" height="${SIZE}"></body>`
  await window.loadURL(`data:text/html;base64,${Buffer.from(page).toString('base64')}`)
  window.webContents.invalidate()
  const image = (await painted).resize({ width: SIZE, height: SIZE })
  writeFileSync('build/icon.png', image.toPNG())
  return image.getSize()
}

// Not a top-level await: Electron holds its ready event until the main module has loaded.
void app.whenReady().then(async () => {
  try {
    const { width, height } = await render()
    console.log(`build/icon.png: ${width}×${height}`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
  app.quit()
})
