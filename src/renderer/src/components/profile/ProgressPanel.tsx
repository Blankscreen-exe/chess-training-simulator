import {
  GAME_PHASES,
  weakestAndStrongest,
  type GamePhase,
  type GamesRecord,
  type MistakeRecord,
  type PlayerProfile,
  type PuzzleRecord,
  type ThemeRecord,
  type Weakness,
} from '@shared/profile'
import { themeName, type PuzzleTheme } from '@shared/training'
import { api } from '../../lib/api'
import { describeRating, describeSolved, timesNoted } from '../../lib/profile'
import { dayName } from '../../lib/words'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

/** How many themes are listed as the player's hardest, and as their easiest. */
const LISTED_THEMES = 3

const PHASE_NAMES: Record<GamePhase, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
}

/** How the player is doing: at puzzles, in their games, and the weaknesses the coach has noted. */
export function ProgressPanel({ profile }: { profile: PlayerProfile | undefined }) {
  if (!profile) return <p className="p-4 text-sm text-stone-500">Loading…</p>
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <PuzzleProgress puzzles={profile.puzzles} weakSpots={profile.weakSpots} />
      <GameProgress games={profile.games} mistakes={profile.mistakes} />
      <Weaknesses weaknesses={profile.weaknesses} />
    </div>
  )
}

function PuzzleProgress({
  puzzles,
  weakSpots,
}: {
  puzzles: PuzzleRecord
  weakSpots: readonly PuzzleTheme[]
}) {
  const solved = describeSolved(puzzles)
  const { weakest, strongest } = weakestAndStrongest(puzzles.themes, LISTED_THEMES)
  return (
    <Card title="Puzzles">
      <p
        className={
          puzzles.rating === null ? 'text-stone-300' : 'text-lg font-semibold text-stone-100'
        }
      >
        {describeRating(puzzles)}
      </p>
      {solved ? (
        <p className="text-stone-300">{solved}</p>
      ) : (
        <p className="text-stone-400">Solve puzzles in the Training tab to see how you do.</p>
      )}
      {(weakest.length > 0 || strongest.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <ThemeList title="Hardest for you" themes={weakest} />
          <ThemeList title="Easiest for you" themes={strongest} />
        </div>
      )}
      {weakSpots.length > 0 && (
        <p className="text-xs text-stone-400">
          Puzzles for your weak spots come from: {weakSpots.map((t) => themeName(t)).join(', ')}.
        </p>
      )}
    </Card>
  )
}

function ThemeList({ title, themes }: { title: string; themes: readonly ThemeRecord[] }) {
  if (themes.length === 0) return <div />
  return (
    <div className="space-y-1">
      <h4 className="text-xs text-stone-400">{title}</h4>
      <ul className="space-y-0.5 text-stone-300">
        {themes.map(({ theme, tries, solved }) => (
          <li key={theme} className="flex justify-between gap-2">
            <span>{themeName(theme)}</span>
            <span className="text-stone-400 tabular-nums">
              {solved} of {tries}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function GameProgress({ games, mistakes }: { games: GamesRecord; mistakes: MistakeRecord }) {
  const { won, drawn, lost, unfinished } = games
  const played = won + drawn + lost + unfinished
  return (
    <Card title="Games">
      <p className="text-stone-300">
        {played === 0
          ? 'No games finished yet.'
          : `Won ${won} · Drawn ${drawn} · Lost ${lost}${unfinished > 0 ? ` · Left ${unfinished}` : ''}`}
      </p>
      {mistakes.games > 0 ? (
        <table className="w-full text-left text-stone-300 tabular-nums">
          <caption className="caption-bottom pt-1.5 text-left text-xs text-stone-500">
            Your moves, from the engine&apos;s review of your last{' '}
            {mistakes.games === 1 ? 'game' : `${mistakes.games} games`}.
          </caption>
          <thead className="text-xs text-stone-400">
            <tr>
              <th className="font-normal">Phase</th>
              <th className="text-right font-normal">Moves</th>
              <th className="text-right font-normal" title="Inaccuracies">
                ?!
              </th>
              <th className="text-right font-normal" title="Mistakes">
                ?
              </th>
              <th className="text-right font-normal" title="Blunders">
                ??
              </th>
            </tr>
          </thead>
          <tbody>
            {GAME_PHASES.map((phase) => {
              const record = mistakes.byPhase[phase]
              return (
                <tr key={phase}>
                  <th className="font-normal">{PHASE_NAMES[phase]}</th>
                  <td className="text-right">{record.moves}</td>
                  <td className="text-right">{record.inaccuracies}</td>
                  <td className="text-right">{record.mistakes}</td>
                  <td className="text-right">{record.blunders}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-stone-500">
          The engine reviews each game as it ends; where your mistakes come will show here.
        </p>
      )}
    </Card>
  )
}

function Weaknesses({ weaknesses }: { weaknesses: readonly Weakness[] }) {
  return (
    <Card title="Weaknesses">
      {weaknesses.length === 0 ? (
        <p className="text-stone-400">
          None noted yet. The coach notes patterns it sees in your mistakes, and puzzles are then
          aimed at them.
        </p>
      ) : (
        <ul className="space-y-3">
          {weaknesses.map((weakness) => (
            <li key={weakness.id} className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="font-medium text-stone-100">{weakness.pattern}</p>
                <p className="text-xs text-stone-400">
                  Noted {timesNoted(weakness.seen)}, last on {dayName(weakness.lastSeen)}
                  {weakness.theme && ` · trained by ${themeName(weakness.theme)} puzzles`}
                </p>
                {weakness.note && <p className="text-xs text-stone-400 italic">{weakness.note}</p>}
              </div>
              <Button
                onClick={() => void api.profile.forgetWeakness(weakness.id)}
                title="Stop aiming training at this"
              >
                Forget
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
