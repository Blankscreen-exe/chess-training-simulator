import { useQuery } from '../hooks/useQuery'
import { api } from '../lib/api'

/** The app's version and what it runs on, read from the main process. */
export function StatusBar() {
  const { data: info, error } = useQuery('app-info', () => api.app.info())

  let text = 'Loading…'
  if (error) text = 'Could not reach the main process'
  else if (info) text = `v${info.version} · Electron ${info.versions.electron} · ${info.platform}`

  return (
    <footer className="border-t border-stone-800 px-5 py-2 text-xs text-stone-500">{text}</footer>
  )
}
