import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, session, shell } from 'electron'
import { emit, registerIpc } from './ipc/register'
import { appBaseUrl, isAppUrl, isExternalWebUrl } from './security'
import { startServices, type Services } from './services'

// electron-vite sets this while developing. A packaged app ignores it, so nothing in its
// surroundings can point it at another page.
const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
const baseUrl = appBaseUrl(devServerUrl, pathToFileURL(join(__dirname, '../renderer/')).href)

let services: Services | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0c0a09',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

// Every page the app opens stays on the app's own pages: links to websites open in the system's
// browser, and nothing can open new windows or embed other pages.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, baseUrl)) {
      event.preventDefault()
    }
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
})

// One copy of the app at a time: a second would compete for the game and the coach's connection.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) {
        window.restore()
      }
      window.focus()
    }
  })

  void app.whenReady().then(() => {
    // The app needs no camera, microphone, notifications or the like: only to copy text, such as
    // a game's PGN, to the clipboard.
    const allowed = (permission: string) => permission === 'clipboard-sanitized-write'
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
      callback(allowed(permission)),
    )
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed(permission))

    const started = startServices((event, payload) => {
      for (const window of BrowserWindow.getAllWindows()) emit(window.webContents, event, payload)
    })
    services = started
    registerIpc(baseUrl, started.handlers)
    started.games.resume()

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  // Closing the coach's server and the engines takes a moment; quit once they have.
  app.on('will-quit', (event) => {
    if (!services) return
    event.preventDefault()
    const closing = services
    services = null
    void closing.close().finally(() => app.quit())
  })
}
