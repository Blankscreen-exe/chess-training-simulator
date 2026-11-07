// Which addresses count as the app's own pages. Only those may call the main process or be
// navigated to; anything else is refused.

/**
 * Where the app's own pages live: the development server in development, or the folder of the
 * built renderer files otherwise.
 */
export function appBaseUrl(devServerUrl: string | undefined, rendererDirUrl: string): string {
  if (devServerUrl) {
    return new URL('/', devServerUrl).href
  }
  return rendererDirUrl.endsWith('/') ? rendererDirUrl : `${rendererDirUrl}/`
}

/**
 * Whether a page at `url` is one of the app's own. For the development server that means the same
 * origin; for built files, a file inside the renderer's folder.
 */
export function isAppUrl(url: string | undefined, baseUrl: string): boolean {
  if (!url) {
    return false
  }
  let page: URL
  let base: URL
  try {
    page = new URL(url)
    base = new URL(baseUrl)
  } catch {
    return false
  }
  if (base.protocol === 'file:') {
    return page.protocol === 'file:' && page.href.startsWith(base.href)
  }
  return page.origin === base.origin
}

/** Whether a link may be opened in the system's browser: only ordinary web pages. */
export function isExternalWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
