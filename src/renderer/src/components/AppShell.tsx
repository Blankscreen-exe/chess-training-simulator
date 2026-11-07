import type { ReactNode } from 'react'
import { StatusBar } from './StatusBar'

/** The window's frame: the title and its buttons, the content, and the status bar. */
export function AppShell({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-stone-800 px-5 py-2.5">
        <h1 className="text-lg font-semibold tracking-tight">Chess Training Simulator</h1>
        <span className="text-xs text-stone-500">Powered by Claude</span>
        <div className="ml-auto flex gap-2">{actions}</div>
      </header>
      {children}
      <StatusBar />
    </div>
  )
}
