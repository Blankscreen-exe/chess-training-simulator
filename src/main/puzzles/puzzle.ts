// One puzzle being solved: the opponent's move that sets it, then the player finding each move of
// the answer, with the opponent's replies between. A move that is not the answer is not played;
// the player is told and tries again. Any move that mates is right, as Lichess counts it.
import { Chess, type Move } from 'chess.js'
import type { Color, MoveInput, PlayedMove, Result } from '@shared/chess'
import type { PracticeOrigin, PuzzleState, PuzzleStatus } from '@shared/training'
import { parseUci, toUci, uciSquares } from '@shared/notation'
import { colorOf, describePosition, replay, sanLine, toPlayedMove, tryMove } from '../chess/rules'
import type { LibraryPuzzle } from '../library/puzzles'

/** What a puzzle is made from: one from the library, or a position the player is practising. */
export type PuzzleSource = Pick<LibraryPuzzle, 'id' | 'fen' | 'moves' | 'themes'> & {
  rating: number | null
}

/** How a puzzle is presented. */
export interface PuzzleSetting {
  /** Where it comes from, when the coach chose it: "Bishop tricks, 2 of 3". */
  title?: string | null
  /** Where the position comes from, when the player is practising it. */
  practice?: PracticeOrigin | null
}

/** Whether a move the player tried was the answer. */
export type Attempt = 'right' | 'wrong'

export class Puzzle {
  readonly playerColor: Color
  private readonly chess: Chess
  private readonly played: PlayedMove[] = []
  private lastMove: Move | undefined
  private status: PuzzleStatus = 'solving'
  private found = 0
  private mistakes = 0
  private hints = 0
  private hint: string | null = null
  private wrongMove: string | null = null

  private constructor(
    readonly source: PuzzleSource,
    readonly title: string | null,
    readonly practice: PracticeOrigin | null,
  ) {
    this.chess = new Chess(source.fen)
    this.playNext()
    this.playerColor = colorOf(this.chess.turn())
  }

  /** The puzzle, ready for the player's first move; refused if its moves cannot be played. */
  static start(source: PuzzleSource, setting: PuzzleSetting = {}): Result<{ puzzle: Puzzle }> {
    if (!isPlayable(source)) return { ok: false, error: `Puzzle ${source.id} cannot be played` }
    return {
      ok: true,
      puzzle: new Puzzle(source, setting.title ?? null, setting.practice ?? null),
    }
  }

  /** The answer, after the opponent's setting move, in standard notation. */
  get answer(): string[] {
    return sanLine(this.source.fen, this.source.moves).slice(1)
  }

  get isSolving(): boolean {
    return this.status === 'solving'
  }

  /** Whether the opponent's reply is the next move, as after each right move but the last. */
  get replyDue(): boolean {
    return this.isSolving && this.played.length % 2 === 0
  }

  /** Tries a move of the player's: played if it is the answer, else counted as a mistake. */
  tryMove(input: MoveInput): Result<{ attempt: Attempt; san: string }> {
    if (!this.isSolving || this.replyDue) return { ok: false, error: 'It is not your move' }
    const trial = new Chess(this.chess.fen())
    const move = tryMove(trial, input)
    if (!move) return { ok: false, error: 'That move is not legal here' }

    if (toUci(move) !== this.expected() && !trial.isCheckmate()) {
      this.mistakes++
      this.wrongMove = move.san
      return { ok: true, attempt: 'wrong', san: move.san }
    }
    this.play(toUci(move))
    this.found++
    this.hint = null
    this.wrongMove = null
    if (trial.isCheckmate() || this.played.length === this.source.moves.length)
      this.status = 'solved'
    return { ok: true, attempt: 'right', san: move.san }
  }

  /** Plays the opponent's reply, when it is due. */
  playReply(): void {
    if (this.replyDue) this.playNext()
  }

  /** Marks the piece the player should move next, and returns its square. */
  giveHint(): Result<{ square: string }> {
    if (!this.isSolving || this.replyDue)
      return { ok: false, error: 'There is no move to find now' }
    this.hint ??= uciSquares(this.expected())[0]
    this.hints++
    return { ok: true, square: this.hint }
  }

  /** Plays the rest of the answer out. */
  reveal(): void {
    if (!this.isSolving) return
    while (this.played.length < this.source.moves.length) this.playNext()
    this.hint = null
    this.wrongMove = null
    this.status = 'revealed'
  }

  state(): PuzzleState {
    return {
      id: this.source.id,
      rating: this.source.rating,
      themes: this.source.themes,
      title: this.title,
      practice: this.practice,
      playerColor: this.playerColor,
      initialFen: this.source.fen,
      moves: [...this.played],
      position: describePosition(this.chess, this.lastMove),
      status: this.status,
      solutionLength: this.source.moves.length / 2,
      found: this.found,
      mistakes: this.mistakes,
      wrongMove: this.wrongMove,
      hint: this.hint,
      hints: this.hints,
    }
  }

  /** The answer's next move, in UCI. */
  private expected(): string {
    return this.source.moves[this.played.length] ?? ''
  }

  private playNext(): void {
    this.play(this.expected())
  }

  private play(uci: string): void {
    const input = parseUci(uci)
    const move = input && tryMove(this.chess, input)
    if (!move) return
    this.played.push(toPlayedMove(move))
    this.lastMove = move
  }
}

/**
 * Whether a puzzle's moves can all be played: the opponent's first, then the player's and the
 * opponent's in turn, ending with the player's.
 */
function isPlayable(source: PuzzleSource): boolean {
  if (source.moves.length < 2 || source.moves.length % 2 !== 0) return false
  try {
    return !replay(new Chess(source.fen), source.moves).refused
  } catch {
    // chess.js refuses the position itself.
    return false
  }
}
