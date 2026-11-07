import { useEffect, useRef, useState } from 'react'
import type { NewGameOptions, OpponentKind, SideChoice } from '@shared/chess'
import { OPPONENTS, SIDE_CHOICES, START_FEN } from '@shared/chess'
import { ENGINE_LEVELS, engineLevelDescription, engineLevelName } from '@shared/engine-levels'
import { loadNewGameChoices, saveNewGameChoices } from '../lib/preferences'
import { Button } from './ui/Button'

const SIDE_LABELS: Record<SideChoice, string> = { white: 'White', random: 'Random', black: 'Black' }

const OPPONENT_LABELS: Record<OpponentKind, { name: string; detail: string }> = {
  engine: { name: 'Stockfish', detail: 'At the strength chosen above' },
  coach: {
    name: 'Your coach',
    detail: "Chooses each move from Stockfish's best, to suit you; Stockfish plays if it is away",
  },
}

/** Choosing a side, the engine's strength and where to start. */
export function NewGameDialog({
  fen,
  onStart,
  onClose,
}: {
  /** A position to start from, set up on the board; the standard start if left out. */
  fen?: string | undefined
  /** Starts the game; resolves to why it could not, or null once it has. */
  onStart: (options: NewGameOptions) => Promise<string | null>
  onClose: () => void
}) {
  const [choices, setChoices] = useState(() => loadNewGameChoices())
  const [custom, setCustom] = useState(fen !== undefined && fen !== START_FEN)
  const [customFen, setCustomFen] = useState(fen ?? START_FEN)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  async function start() {
    setBusy(true)
    setError(null)
    saveNewGameChoices(choices)
    const problem = await onStart(custom ? { ...choices, fen: customFen } : choices)
    setBusy(false)
    if (problem) setError(problem)
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto w-[30rem] rounded-xl border border-stone-700 bg-stone-900 p-0 text-stone-100 shadow-2xl backdrop:bg-black/60"
      aria-labelledby="new-game-title"
    >
      <form
        className="space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault()
          void start()
        }}
      >
        <h2 id="new-game-title" className="text-lg font-semibold">
          New game
        </h2>

        <fieldset>
          <legend className="mb-2 text-sm text-stone-400">You play</legend>
          <div className="flex gap-2">
            {SIDE_CHOICES.map((side) => (
              <Button
                key={side}
                variant={choices.playerColor === side ? 'primary' : 'secondary'}
                aria-pressed={choices.playerColor === side}
                onClick={() => setChoices({ ...choices, playerColor: side })}
                className="flex-1 py-2"
              >
                {SIDE_LABELS[side]}
              </Button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm text-stone-400">Stockfish&apos;s strength</legend>
          <div className="grid max-h-60 gap-1 overflow-y-auto pr-1">
            {ENGINE_LEVELS.map(({ id }) => (
              <label
                key={id}
                className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 ${
                  choices.engineLevel === id ? 'bg-stone-800' : 'hover:bg-stone-800/60'
                }`}
              >
                <input
                  type="radio"
                  name="level"
                  className="accent-amber-500"
                  checked={choices.engineLevel === id}
                  onChange={() => setChoices({ ...choices, engineLevel: id })}
                />
                <span className="w-16 text-sm font-medium">{engineLevelName(id)}</span>
                <span className="text-sm text-stone-400">{engineLevelDescription(id)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-stone-400">Your opponent</legend>
          {OPPONENTS.map((opponent) => (
            <label key={opponent} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-0.5 accent-amber-500"
                checked={choices.opponent === opponent}
                onChange={() => setChoices({ ...choices, opponent })}
              />
              <span>
                {OPPONENT_LABELS[opponent].name}
                <span className="block text-xs text-stone-500">
                  {OPPONENT_LABELS[opponent].detail}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-stone-400">Start from</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              className="accent-amber-500"
              checked={!custom}
              onChange={() => setCustom(false)}
            />
            The standard position
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              className="accent-amber-500"
              checked={custom}
              onChange={() => setCustom(true)}
            />
            A position (FEN)
          </label>
          {custom && (
            <input
              type="text"
              value={customFen}
              onChange={(event) => setCustomFen(event.target.value)}
              spellCheck={false}
              aria-label="Starting position in FEN"
              className="w-full rounded-md bg-stone-800 px-3 py-2 font-mono text-xs text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          )}
        </fieldset>

        {error && (
          <p className="rounded-md bg-red-900/40 px-3 py-2 text-sm text-red-200" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Start game
          </Button>
        </div>
      </form>
    </dialog>
  )
}
