import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { useEffect, useRef } from 'react'
import type { Color } from '@shared/chess'
import { useLatest } from '../../hooks/useLatest'
import { toDests, toKey } from '../../lib/chessground'

const EMPTY_DESTS = new Map<Key, Key[]>()

export interface ChessBoardProps {
  fen: string
  orientation: Color
  turnColor: Color
  check?: boolean
  lastMove?: readonly [string, string] | undefined
  /** Who may move, and where; leave out for a board that only shows. Keep it the same object
   * while it does not change (useMemo), as a new one resets the board. */
  movable?: { color: Color | 'both'; dests: Record<string, string[]> } | undefined
  onMove?: (from: string, to: string) => void
  /** Arrows and circles drawn on the board; keep it the same array while it does not change. */
  shapes?: readonly DrawShape[] | undefined
  /** Changing this puts the pieces back as `fen` says, after a move that did not go through. */
  revision?: number
  /** Lets pieces be moved anywhere and dropped off the board, for setting up a position. */
  freeEdit?: { onChange: (placement: string) => void } | undefined
  /** Receives the board's API, for things like dragging new pieces on. */
  onReady?: (api: Api | null) => void
  label?: string
}

/** Lichess's chessground, driven by props. */
export function ChessBoard(props: ChessBoardProps) {
  const element = useRef<HTMLDivElement>(null)
  const board = useRef<Api | null>(null)
  const latest = useLatest(props)

  useEffect(() => {
    if (!element.current) return
    const api = Chessground(element.current, {
      animation: { enabled: true, duration: 200 },
      highlight: { lastMove: true, check: true },
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true },
      premovable: { enabled: false },
      events: {
        move: (from, to) => latest.current.onMove?.(from, to),
        change: () => latest.current.freeEdit?.onChange(api.getFen()),
      },
    })
    board.current = api
    // Whoever was told of this board is told when it goes.
    const onReady = latest.current.onReady
    onReady?.(api)
    const resize = new ResizeObserver(() => api.redrawAll())
    resize.observe(element.current)
    return () => {
      resize.disconnect()
      api.destroy()
      board.current = null
      onReady?.(null)
    }
  }, [latest])

  const { fen, orientation, turnColor, check, lastMove, movable, shapes, revision } = props
  const free = Boolean(props.freeEdit)

  useEffect(() => {
    board.current?.set({
      fen: fen.split(' ')[0] ?? fen,
      orientation,
      turnColor,
      check: check ? turnColor : false,
      // chessground keeps the old last move unless told there is none.
      lastMove: lastMove ? lastMove.map(toKey) : [],
      // chessground cannot switch `viewOnly` after it starts, so a board that only shows is one
      // where no side may move. `undefined` is how chessground is told no side; the type does
      // not say so, hence the cast.
      movable: free
        ? { free: true, color: 'both', showDests: false, dests: EMPTY_DESTS }
        : {
            free: false,
            showDests: true,
            dests: movable ? toDests(movable.dests) : EMPTY_DESTS,
            color: movable?.color as Color | 'both',
          },
      draggable: { deleteOnDropOff: free },
      drawable: { autoShapes: shapes ? [...shapes] : [] },
    })
  }, [fen, orientation, turnColor, check, lastMove, movable, shapes, revision, free])

  return (
    <div
      ref={element}
      className="cg-wrap aspect-square w-full"
      role="application"
      aria-label={props.label ?? 'Chessboard'}
    />
  )
}
