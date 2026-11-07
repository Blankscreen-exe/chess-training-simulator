import type { Api } from '@lichess-org/chessground/api'
import type { Role } from '@lichess-org/chessground/types'
import { useRef, useState, type RefObject } from 'react'
import type { Color, Position } from '@shared/chess'
import { COLORS, START_FEN } from '@shared/chess'
import { joinFen, splitFen, type FenFields } from '@shared/notation'
import { useQuery } from '../hooks/useQuery'
import { api } from '../lib/api'
import { ChessBoard } from './board/ChessBoard'
import { PieceIcon } from './board/PieceIcon'
import { Button } from './ui/Button'

const ROLES: readonly Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']
const EMPTY_BOARD = '8/8/8/8/8/8/8/8'
const CASTLING_RIGHTS = [
  { right: 'K', label: 'White O-O' },
  { right: 'Q', label: 'White O-O-O' },
  { right: 'k', label: 'Black O-O' },
  { right: 'q', label: 'Black O-O-O' },
] as const
/** Checking is quick, but there is no need to check every keystroke. */
const CHECK_AFTER_MS = 120

/** Setting up a position, to play from or analyse. */
export function BoardEditor({
  fen,
  orientation,
  onFlip,
  onPlay,
  onAnalyse,
  onClose,
}: {
  fen: string
  orientation: Color
  onFlip: () => void
  onPlay: (fen: string) => void
  onAnalyse: (position: Position) => void
  onClose: () => void
}) {
  const [setup, setSetup] = useState<FenFields>(() => splitFen(fen))
  // What is typed in the FEN box, which may be part-way through an edit.
  const [typed, setTyped] = useState(() => joinFen(splitFen(fen)))
  const [revision, setRevision] = useState(0)
  const board = useRef<Api | null>(null)
  const current = joinFen(setup)

  /** Changes the position; `redraw` puts the pieces on the board as well, when they did not move there. */
  function update(next: FenFields, { redraw = false } = {}) {
    setSetup(next)
    setTyped(joinFen(next))
    if (redraw) setRevision((value) => value + 1)
  }

  const { data: checked } = useQuery(`fen:${current}`, () => api.position.describe(current), {
    delayMs: CHECK_AFTER_MS,
  })
  const legal = checked?.ok ? checked.position : null

  function toggleCastling(right: string) {
    const rights = setup.castling.includes(right)
      ? setup.castling.replace(right, '')
      : CASTLING_RIGHTS.map((known) => known.right)
          .filter((known) => known === right || setup.castling.includes(known))
          .join('')
    update({ ...setup, castling: rights })
  }

  return (
    <div className="flex min-h-0 flex-1 gap-5">
      <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2">
        <div className="flex aspect-[8/9.6] h-full max-w-full flex-col gap-2">
          <Palette color={orientation === 'white' ? 'black' : 'white'} board={board} />
          <ChessBoard
            fen={setup.placement}
            orientation={orientation}
            turnColor={setup.turn}
            revision={revision}
            freeEdit={{
              // A piece moved by hand may leave an en passant square that no longer applies.
              onChange: (placement) => update({ ...setup, placement, enPassant: '-' }),
            }}
            onReady={(ready) => {
              board.current = ready
            }}
            label="Board editor"
          />
          <Palette color={orientation} board={board} />
        </div>
      </section>

      <aside className="flex w-80 shrink-0 flex-col gap-4 rounded-md border border-stone-800 bg-stone-900 p-4">
        <h2 className="text-sm font-semibold">Set up a position</h2>
        <p className="text-xs leading-relaxed text-stone-400">
          Drag pieces from above and below the board. Drag a piece off the board to remove it.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => update(splitFen(START_FEN), { redraw: true })}>
            Starting position
          </Button>
          <Button
            onClick={() => update({ ...splitFen(EMPTY_BOARD), turn: setup.turn }, { redraw: true })}
          >
            Clear
          </Button>
          <Button onClick={onFlip}>Flip board</Button>
        </div>

        <fieldset>
          <legend className="mb-1 text-xs text-stone-400">To move</legend>
          {COLORS.map((color) => (
            <label key={color} className="mr-4 inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                className="accent-amber-500"
                checked={setup.turn === color}
                onChange={() => update({ ...setup, turn: color })}
              />
              {color === 'white' ? 'White' : 'Black'}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-xs text-stone-400">Castling still allowed</legend>
          <div className="grid grid-cols-2 gap-1 text-sm">
            {CASTLING_RIGHTS.map(({ right, label }) => (
              <label key={right} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-amber-500"
                  checked={setup.castling.includes(right)}
                  onChange={() => toggleCastling(right)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="space-y-1">
          <span className="text-xs text-stone-400">FEN</span>
          <textarea
            value={typed}
            rows={2}
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
            onBlur={() => {
              if (typed.trim() !== current) update(splitFen(typed), { redraw: true })
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              update(splitFen(typed), { redraw: true })
            }}
            className="w-full resize-none rounded-md bg-stone-800 px-3 py-2 font-mono text-xs text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
          />
        </label>

        <p className={`text-xs ${legal ? 'text-emerald-300' : 'text-red-300'}`} role="status">
          {checked === undefined
            ? ' '
            : checked.ok
              ? 'A legal position.'
              : `Not a legal position: ${checked.error}`}
        </p>

        <div className="mt-auto flex flex-wrap gap-2">
          <Button variant="primary" disabled={!legal} onClick={() => legal && onPlay(legal.fen)}>
            Play from here
          </Button>
          <Button disabled={!legal} onClick={() => legal && onAnalyse(legal)}>
            Analyse
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </aside>
    </div>
  )
}

/** One side's pieces, to drag onto the board. */
function Palette({ color, board }: { color: Color; board: RefObject<Api | null> }) {
  return (
    <div
      className="flex justify-center gap-1 rounded-md bg-stone-900 p-1"
      aria-label={`${color} pieces`}
    >
      {ROLES.map((role) => (
        <PieceIcon
          key={role}
          role={role}
          color={color}
          title={`Drag a ${color} ${role} onto the board`}
          className="size-11 cursor-grab rounded hover:bg-stone-800"
          onMouseDown={(event) =>
            board.current?.dragNewPiece({ role, color }, event.nativeEvent, true)
          }
          onTouchStart={(event) =>
            board.current?.dragNewPiece({ role, color }, event.nativeEvent, true)
          }
        />
      ))}
    </div>
  )
}
