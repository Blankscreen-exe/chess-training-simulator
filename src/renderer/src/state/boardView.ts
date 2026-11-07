// What the board is showing, and every way that can change. The live game is only ever changed
// by the main process; every other view is a separate layer, and leaving it puts the board back
// on the game. All of it is pure, so it is tested without React.
import type { GameRecord, GameState, LineStep, Position, ShownPosition } from '@shared/chess'
import { otherColor, START_FEN } from '@shared/chess'
import { splitFen, uciSquares } from '@shared/notation'

export type BoardView =
  /** The game being played; `ply` set means looking back at an earlier position in it. */
  | { kind: 'live'; ply: number | null }
  /** A game from the history. */
  | { kind: 'replay'; game: GameRecord; ply: number }
  /** A board to try moves on freely, for either side. */
  | { kind: 'analysis'; start: Position; steps: LineStep[]; ply: number }
  /** A line played out on the board, then left again. */
  | {
      kind: 'preview'
      title: string
      start: ShownPosition
      steps: LineStep[]
      ply: number
      playing: boolean
      returnTo: BaseView
    }
  /** Setting up a position. */
  | { kind: 'editor'; fen: string }

/** Any view but a preview: where a preview returns to. */
export type BaseView = Exclude<BoardView, { kind: 'preview' }>

export type BoardAction =
  | { type: 'show-live' }
  /** Steps to a ply; `liveMoves` is how many moves the live game has, as the view cannot know. */
  | { type: 'go-to'; ply: number; liveMoves: number }
  /** A move chosen from a move list: the position after it, leaving any preview first. */
  | { type: 'select-move'; ply: number; liveMoves: number }
  | { type: 'open-replay'; game: GameRecord }
  | { type: 'open-analysis'; start: Position }
  /** A move tried on the analysis board, replacing whatever came after the position shown. */
  | { type: 'analysis-move'; step: LineStep }
  | { type: 'open-editor'; fen: string }
  | { type: 'open-preview'; title: string; start: ShownPosition; steps: LineStep[] }
  /** The preview's clock: the next move, or back where it came from once it has lingered. */
  | { type: 'preview-tick' }
  | { type: 'preview-toggle-play' }
  | { type: 'leave-preview' }

export const LIVE: BaseView = { kind: 'live', ply: null }

export function boardReducer(view: BoardView, action: BoardAction): BoardView {
  switch (action.type) {
    case 'show-live':
      return LIVE
    case 'go-to':
      return goTo(view, action.ply, action.liveMoves)
    case 'select-move':
      return goTo(baseOf(view), action.ply, action.liveMoves)
    case 'open-replay':
      return { kind: 'replay', game: action.game, ply: action.game.moves.length }
    case 'open-analysis':
      return { kind: 'analysis', start: action.start, steps: [], ply: 0 }
    case 'analysis-move':
      if (view.kind !== 'analysis') return view
      return {
        ...view,
        steps: [...view.steps.slice(0, view.ply), action.step],
        ply: view.ply + 1,
      }
    case 'open-editor':
      return { kind: 'editor', fen: action.fen }
    case 'open-preview':
      return {
        kind: 'preview',
        title: action.title,
        start: action.start,
        steps: action.steps,
        ply: 0,
        playing: true,
        returnTo: baseOf(view),
      }
    case 'preview-tick':
      if (view.kind !== 'preview' || !view.playing) return view
      return view.ply >= view.steps.length ? view.returnTo : { ...view, ply: view.ply + 1 }
    case 'preview-toggle-play':
      if (view.kind !== 'preview') return view
      // Playing again from the end starts over.
      return view.playing
        ? { ...view, playing: false }
        : { ...view, playing: true, ply: view.ply >= view.steps.length ? 0 : view.ply }
    case 'leave-preview':
      return view.kind === 'preview' ? view.returnTo : view
  }
}

/** The view under a preview, or the view itself. */
export function baseOf(view: BoardView): BaseView {
  return view.kind === 'preview' ? view.returnTo : view
}

/** Whether the engine can be asked about what the board shows: not while it moves by itself. */
export function isAnalysable(view: BoardView): boolean {
  return view.kind !== 'editor' && view.kind !== 'preview'
}

/** How many moves a view can step through, and which it is on; null if it has none. */
export function stepRange(
  view: BoardView,
  liveMoves: number,
): { ply: number; count: number } | null {
  switch (view.kind) {
    case 'live':
      return { ply: view.ply ?? liveMoves, count: liveMoves }
    case 'replay':
      return { ply: view.ply, count: view.game.moves.length }
    case 'analysis':
    case 'preview':
      return { ply: view.ply, count: view.steps.length }
    case 'editor':
      return null
  }
}

function goTo(view: BoardView, ply: number, liveMoves: number): BoardView {
  const range = stepRange(view, liveMoves)
  if (!range) return view
  const target = Math.max(0, Math.min(range.count, ply))
  switch (view.kind) {
    case 'live':
      return { kind: 'live', ply: target === range.count ? null : target }
    case 'preview':
      // Stepping by hand stops the preview playing by itself.
      return { ...view, ply: target, playing: false }
    case 'replay':
    case 'analysis':
      return { ...view, ply: target }
    case 'editor':
      return view
  }
}

const START: ShownPosition = { fen: START_FEN, turn: 'white', check: false }

/**
 * The position the board shows, with the moves it allows if anyone may move there. Only the
 * live game's current position and the analysis board allow moves.
 */
export function shownPosition(view: BoardView, game: GameState | null): ShownPosition | Position {
  switch (view.kind) {
    case 'live':
      if (!game) return START
      return view.ply === null ? game.position : afterPly(game.initialFen, game.moves, view.ply)
    case 'replay':
      return afterPly(view.game.initialFen, view.game.moves, view.ply)
    case 'analysis':
      return view.steps[view.ply - 1]?.position ?? view.start
    case 'preview':
      // Shown, not played: its positions carry no moves.
      return withoutMoves(view.steps[view.ply - 1]?.position ?? view.start)
    case 'editor':
      return { fen: view.fen, turn: 'white', check: false }
  }
}

/** The position after `ply` moves of a game, 0 being its start. */
export function afterPly(
  initialFen: string,
  moves: GameRecord['moves'],
  ply: number,
): ShownPosition {
  const move = moves[ply - 1]
  if (ply <= 0 || !move) return { fen: initialFen, turn: splitFen(initialFen).turn, check: false }
  return {
    fen: move.fenAfter,
    turn: otherColor(move.color),
    check: move.check,
    lastMove: uciSquares(move.uci),
  }
}

/** Whether a position carries the moves that can be made in it. */
export function hasMoves(position: ShownPosition | Position): position is Position {
  return 'dests' in position
}

function withoutMoves(position: ShownPosition | Position): ShownPosition {
  const { fen, turn, check, lastMove } = position
  return lastMove ? { fen, turn, check, lastMove } : { fen, turn, check }
}
