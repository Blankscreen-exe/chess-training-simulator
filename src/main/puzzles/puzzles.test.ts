import { mkdtempSync, rmSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PuzzleTheme } from '@shared/training'
import type { LibraryStore } from '../library/database'
import { PUZZLE_ROWS, puzzlesOf, testLibrary } from '../library/test-support'
import { dayStart, PracticeStore } from '../profile/practice'
import { openDatabase } from '../storage/database'
import { AttemptStore } from './attempts'
import { Puzzle } from './puzzle'
import { NO_LIBRARY, PuzzleService } from './service'

const [rookWins, endgame, mateInOne] = puzzlesOf([
  PUZZLE_ROWS.rookWins,
  PUZZLE_ROWS.endgame,
  PUZZLE_ROWS.rarelyPlayed,
])
if (!rookWins || !endgame || !mateInOne) throw new Error('fixtures')

function started(source = rookWins!): Puzzle {
  const result = Puzzle.start(source)
  if (!result.ok) throw new Error(result.error)
  return result.puzzle
}

describe('Puzzle', () => {
  it("starts after the opponent's move, with the player to find the answer", () => {
    const state = started().state()
    expect(state).toMatchObject({
      playerColor: 'white',
      status: 'solving',
      solutionLength: 3,
      found: 0,
      mistakes: 0,
      hint: null,
    })
    expect(state.moves.map((m) => m.san)).toEqual(['Bxg3'])
    expect(state.position.lastMove).toEqual(['f2', 'g3'])
  })

  it('plays the right move, then the reply when asked, through to the end', () => {
    const puzzle = started()
    expect(puzzle.tryMove({ from: 'e6', to: 'e7' })).toEqual({
      ok: true,
      attempt: 'right',
      san: 'Rxe7',
    })
    expect(puzzle.replyDue).toBe(true)
    expect(puzzle.tryMove({ from: 'h6', to: 'g6' })).toEqual({
      ok: false,
      error: 'It is not your move',
    })
    puzzle.playReply()
    puzzle.tryMove({ from: 'b3', to: 'c1' })
    puzzle.playReply()
    puzzle.tryMove({ from: 'h6', to: 'c1' })
    expect(puzzle.state()).toMatchObject({ status: 'solved', found: 3 })
    expect(puzzle.state().moves.map((m) => m.san)).toEqual([
      'Bxg3',
      'Rxe7',
      'Qb1+',
      'Nc1',
      'Qxc1+',
      'Qxc1',
    ])
  })

  it('does not play a wrong move, and counts it', () => {
    const puzzle = started()
    expect(puzzle.tryMove({ from: 'h6', to: 'g6' })).toEqual({
      ok: true,
      attempt: 'wrong',
      san: 'Qg6',
    })
    expect(puzzle.state()).toMatchObject({ mistakes: 1, wrongMove: 'Qg6', found: 0 })
    expect(puzzle.state().moves).toHaveLength(1)
    expect(puzzle.tryMove({ from: 'a1', to: 'a8' })).toEqual({
      ok: false,
      error: 'That move is not legal here',
    })
    puzzle.tryMove({ from: 'e6', to: 'e7' })
    expect(puzzle.state().wrongMove).toBeNull()
  })

  it('counts a mate as right, the one move of a mate in one', () => {
    const puzzle = started(mateInOne)
    expect(puzzle.tryMove({ from: 'd5', to: 'g2' })).toMatchObject({
      attempt: 'right',
      san: 'Qg2#',
    })
    expect(puzzle.state()).toMatchObject({ status: 'solved', found: 1, solutionLength: 1 })
  })

  it('points at the piece to move, and plays the answer out when asked', () => {
    const puzzle = started()
    expect(puzzle.giveHint()).toEqual({ ok: true, square: 'e6' })
    expect(puzzle.state()).toMatchObject({ hint: 'e6', hints: 1 })
    puzzle.reveal()
    expect(puzzle.state()).toMatchObject({ status: 'revealed', found: 0, hint: null })
    expect(puzzle.state().moves).toHaveLength(6)
    expect(puzzle.giveHint().ok).toBe(false)
  })

  it('refuses a puzzle whose moves cannot be played', () => {
    expect(Puzzle.start({ ...rookWins, moves: ['f2g3', 'e6e8'] })).toEqual({
      ok: false,
      error: 'Puzzle 00008 cannot be played',
    })
    expect(Puzzle.start({ ...rookWins, moves: ['f2g3'] }).ok).toBe(false)
  })
})

describe('PuzzleService', () => {
  let folder: string
  let library: LibraryStore | null
  let db: DatabaseSync
  let attempts: AttemptStore
  let clock: number
  let practice: PracticeStore
  let weakSpots: PuzzleTheme[]
  let ended: string[]

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'puzzles-'))
    library = testLibrary(join(folder, 'library.db'))
    db = openDatabase(':memory:')
    attempts = new AttemptStore(db)
    practice = new PracticeStore(db)
    weakSpots = []
    ended = []
    clock = Date.parse('2026-11-08T12:00:00Z')
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    library?.close()
    rmSync(folder, { recursive: true, force: true })
  })

  const service = () => {
    const puzzles = new PuzzleService({
      library: { installed: library },
      attempts,
      practice,
      ratings: () => ({ min: 1700, max: 1900 }),
      weakSpots: () => weakSpots,
      replyDelayMs: 300,
      now: () => new Date((clock += 1000)),
      random: () => 0,
    })
    puzzles.onTryEnded((result) => ended.push(result))
    return puzzles
  }
  /** The time the next day's practice is due by, from now. */
  const dayAfter = () => Date.parse(dayStart(new Date(clock), 1))

  it("chooses a puzzle in the player's range, or as asked", () => {
    expect(service().start({})).toMatchObject({ ok: true, state: { id: '00008' } })
    expect(service().start({ rating: { min: 1400, max: 1500 } })).toMatchObject({
      state: { id: '0000D' },
    })
    expect(service().start({ theme: 'mateIn1', rating: { min: 900, max: 1100 } })).toMatchObject({
      state: { id: '0000H' },
    })
    expect(service().start({ id: '0000D' }, 'Rook lessons, 1 of 2')).toMatchObject({
      state: { id: '0000D', title: 'Rook lessons, 1 of 2' },
    })
    expect(service().start({ id: 'none' })).toEqual({
      ok: false,
      error: 'There is no puzzle none in the library',
    })
    expect(service().start({ theme: 'zugzwang' }).ok).toBe(false)
  })

  it('offers puzzles not tried lately first', () => {
    const puzzles = service()
    puzzles.start({ id: '0000D' })
    const found = puzzles.find({ rating: { min: 1000, max: 2000 } }, 3)
    expect(found.ok && found.puzzles.map((p) => p.id).at(-1)).toBe('0000D')
  })

  it("plays the opponent's reply after a pause, and notes how the try went", () => {
    const puzzles = service()
    const states: (string | undefined)[] = []
    puzzles.onChange((state) => states.push(state?.moves.at(-1)?.san))
    puzzles.start({ id: '00008' })

    expect(puzzles.move({ from: 'h6', to: 'g6' })).toEqual({
      ok: false,
      error: 'Qg6 is not the answer. Try again.',
    })
    expect(puzzles.move({ from: 'e6', to: 'e7' }).ok).toBe(true)
    expect(puzzles.current()?.moves.at(-1)?.san).toBe('Rxe7')
    vi.advanceTimersByTime(300)
    expect(puzzles.current()?.moves.at(-1)?.san).toBe('Qb1+')
    expect(states).toEqual(['Bxg3', 'Bxg3', 'Rxe7', 'Qb1+'])

    puzzles.hint()
    puzzles.reveal()
    expect(puzzles.current()?.status).toBe('revealed')
    expect(attemptRows()).toEqual([
      { puzzle_id: '00008', result: 'revealed', mistakes: 1, hints: 1 },
    ])
  })

  it('notes a puzzle left unfinished, and takes it off the board', () => {
    const puzzles = service()
    puzzles.start({ id: '00008' })
    puzzles.move({ from: 'e6', to: 'e7' })
    puzzles.close()
    vi.advanceTimersByTime(300)
    expect(puzzles.current()).toBeNull()
    puzzles.start({ id: '0000H' })
    puzzles.move({ from: 'd5', to: 'g2' })
    expect(attemptRows()).toEqual([
      { puzzle_id: '00008', result: 'left', mistakes: 0, hints: 0 },
      { puzzle_id: '0000H', result: 'solved', mistakes: 0, hints: 0 },
    ])
  })

  it('says so when there is no library', () => {
    library?.close()
    library = null
    expect(service().start({})).toEqual({ ok: false, error: NO_LIBRARY })
  })

  it("aims at the player's weak spots, trying the next when one has no puzzle", () => {
    expect(service().start({ weakSpots: true }).ok).toBe(false)
    weakSpots = ['zugzwang', 'endgame']
    expect(service().start({ weakSpots: true, rating: { min: 1000, max: 2000 } })).toMatchObject({
      state: { id: '0000D' },
    })
  })

  it('keeps a missed puzzle to practise, and brings it back the next day', () => {
    const puzzles = service()
    puzzles.start({ id: '0000H' })
    puzzles.move({ from: 'd5', to: 'd4' })
    puzzles.move({ from: 'd5', to: 'g2' })
    expect(ended).toEqual(['solved'])
    expect(practice.next(new Date(clock))).toBeNull()
    const early = puzzles.start({ practice: true })
    expect(!early.ok && early.error).toMatch(
      /^Nothing is due for practice now: the next comes back in \d+ hours$/,
    )

    clock = dayAfter()
    expect(puzzles.start({ practice: true })).toMatchObject({
      ok: true,
      state: { id: 'puzzle:0000H', rating: 1032, practice: { from: 'puzzle' }, status: 'solving' },
    })
    puzzles.move({ from: 'd5', to: 'g2' })
    // Practice is not a first try, so it is not noted with them; the position moves up a box.
    expect(attemptRows()).toHaveLength(1)
    expect(practice.summary(new Date(clock))).toMatchObject({ due: 0, waiting: 1 })
    expect(practice.get(1)?.box).toBe(1)
  })

  it('does not count a position left untried in practice', () => {
    practice.add(
      {
        key: 'game:4:7',
        origin: { from: 'game', gameId: 4, played: '4. d3' },
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
        moves: ['g8f6', 'h5f7'],
        rating: null,
        themes: ['opening'],
      },
      new Date(clock),
    )
    clock = dayAfter()
    const puzzles = service()
    expect(puzzles.start({ practice: true })).toMatchObject({
      state: { practice: { from: 'game', played: '4. d3' }, rating: null, solutionLength: 1 },
    })
    puzzles.close()
    expect(practice.next(new Date(clock))).toMatchObject({ key: 'game:4:7', box: 0 })
    expect(ended).toEqual(['left'])
  })

  function attemptRows() {
    return db
      .prepare('SELECT puzzle_id, result, mistakes, hints FROM puzzle_attempts ORDER BY id')
      .all()
      .map((row) => ({ ...row }))
  }
})
