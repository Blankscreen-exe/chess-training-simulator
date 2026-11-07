import { Board } from './components/Board'
import { CoachPanel } from './components/CoachPanel'
import { StatusBar } from './components/StatusBar'

export function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-stone-800 px-5 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Chess Training Simulator</h1>
        <span className="text-xs text-stone-500">Powered by Claude</span>
      </header>

      <main className="flex min-h-0 flex-1 gap-5 p-5">
        <section className="flex min-w-0 flex-1 items-center justify-center">
          <Board />
        </section>
        <CoachPanel />
      </main>

      <StatusBar />
    </div>
  )
}
