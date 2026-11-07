import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'

/** The app's version and what it runs on, read from the main process. */
export function StatusBar() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    window.api.getAppInfo().then(
      (result) => {
        if (current) setInfo(result)
      },
      () => {
        if (current) setFailed(true)
      },
    )
    return () => {
      current = false
    }
  }, [])

  let text = 'Loading…'
  if (failed) {
    text = 'Could not reach the main process'
  } else if (info) {
    text = `v${info.version} · Electron ${info.versions.electron} · ${info.platform}`
  }

  return (
    <footer className="border-t border-stone-800 px-5 py-2 text-xs text-stone-500">{text}</footer>
  )
}
