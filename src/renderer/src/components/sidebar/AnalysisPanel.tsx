import type { Analysis, AnalysisLine } from '@shared/chess'
import { MAX_ANALYSIS_LINES } from '@shared/chess'
import { numberedLine } from '@shared/notation'
import type { AnalysisSettings } from '../../hooks/useAnalysis'
import { formatScore } from '../../lib/score'

/** How many moves of each line are written out; the board shows the rest when it is played. */
const SHOWN_MOVES = 10
const LINE_COUNTS = Array.from({ length: MAX_ANALYSIS_LINES }, (_, index) => index + 1)

/** The engine's best lines for the position on the board; clicking one plays it out. */
export function AnalysisPanel({
  settings,
  onSettingsChange,
  analysis,
  running,
  error,
  available,
  onPreview,
}: {
  settings: AnalysisSettings
  onSettingsChange: (settings: AnalysisSettings) => void
  analysis: Analysis | null
  running: boolean
  error: string | null
  /** Whether the board shows a position that can be analysed now. */
  available: boolean
  onPreview: (line: AnalysisLine) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-stone-800 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-amber-500"
            checked={settings.enabled}
            onChange={(event) => onSettingsChange({ ...settings, enabled: event.target.checked })}
          />
          Show engine lines
        </label>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-stone-400">
          Lines
          <select
            className="rounded bg-stone-800 px-1.5 py-1 text-stone-200"
            value={settings.lines}
            onChange={(event) =>
              onSettingsChange({ ...settings, lines: Number(event.target.value) })
            }
          >
            {LINE_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Lines
          enabled={settings.enabled}
          available={available}
          analysis={analysis}
          running={running}
          error={error}
          onPreview={onPreview}
        />
      </div>
    </div>
  )
}

function Lines({
  enabled,
  available,
  analysis,
  running,
  error,
  onPreview,
}: {
  enabled: boolean
  available: boolean
  analysis: Analysis | null
  running: boolean
  error: string | null
  onPreview: (line: AnalysisLine) => void
}) {
  const say = (text: string, tone = 'text-stone-500') => <p className={`text-sm ${tone}`}>{text}</p>
  if (!enabled) {
    return say(
      "Turn on engine lines to see Stockfish's best moves for the position on the board, with arrows. Click a line to watch it played out.",
    )
  }
  if (!available) return say('Nothing to analyse on this board.')
  if (error) return say(error, 'text-red-300')
  if (!analysis) return say(running ? 'Thinking…' : 'No moves to analyse.', 'text-stone-400')
  if (analysis.lines.length === 0)
    return say('The game is over in this position.', 'text-stone-400')

  return (
    <ul className="space-y-1.5">
      {analysis.lines.map((line) => (
        <li key={line.rank}>
          <button
            type="button"
            onClick={() => onPreview(line)}
            className="flex w-full items-start gap-3 rounded-md bg-stone-800/60 px-3 py-2 text-left hover:bg-stone-800"
            title="Play this line out on the board"
          >
            <span
              className={`w-14 shrink-0 font-mono text-sm font-semibold ${
                line.rank === 1 ? 'text-emerald-300' : 'text-sky-300'
              }`}
            >
              {formatScore(line.score)}
            </span>
            <span className="min-w-0 text-sm leading-relaxed text-stone-300">
              {numberedLine(analysis.fen, line.san.slice(0, SHOWN_MOVES))}
              {line.san.length > SHOWN_MOVES ? ' …' : ''}
            </span>
          </button>
        </li>
      ))}
      <li className="pt-1 text-xs text-stone-500">
        Depth {analysis.depth}
        {running ? ' · thinking…' : ''}
      </li>
    </ul>
  )
}
