import type { Dispatch } from 'react'
import type { AnalysisLine, Color, NewGameOptions, Position, ShownPosition } from '@shared/chess'
import { numberedLine } from '@shared/notation'
import type { SidebarTab } from '../components/sidebar/tabs'
import { api } from '../lib/api'
import { attempt } from '../lib/requests'
import type { BoardAction } from '../state/boardView'

/** How many moves of a previewed line its title names. */
const TITLE_MOVES = 4

/** What the player can ask for beyond moving pieces, each sent to the main process. */
export function useTrainerActions(options: {
  position: ShownPosition
  dispatch: Dispatch<BoardAction>
  notify: (message: string) => void
  showTab: (tab: SidebarTab) => void
  showAnalysis: () => void
  setOrientation: (color: Color) => void
}) {
  const { position, dispatch, notify, showTab, showAnalysis, setOrientation } = options

  function openAnalysis(start: Position) {
    dispatch({ type: 'open-analysis', start })
    showAnalysis()
    showTab('analysis')
  }

  return {
    openAnalysis,

    /** Opens the analysis board on the position shown. */
    analyseShown: async () => {
      const found = await attempt(api.position.describe(position.fen), notify)
      if (found) openAnalysis(found.position)
    },

    openReplay: async (id: number) => {
      const found = await attempt(api.games.get(id), notify)
      if (!found) return
      dispatch({ type: 'open-replay', game: found.game })
      setOrientation(found.game.playerColor)
    },

    /** Plays one of the engine's lines out from the position shown. */
    previewLine: async (line: AnalysisLine) => {
      const resolved = await attempt(api.line.resolve(position.fen, line.uci), notify)
      if (!resolved) return
      const named = numberedLine(position.fen, line.san.slice(0, TITLE_MOVES))
      dispatch({
        type: 'open-preview',
        title: `Engine line ${line.rank}: ${named}${line.san.length > TITLE_MOVES ? ' …' : ''}`,
        start: position,
        steps: resolved.steps,
      })
    },

    /** Starts a game; resolves to why it could not, for the dialog to show, or null. */
    startGame: async (gameOptions: NewGameOptions): Promise<string | null> => {
      const result = await api.game.start(gameOptions)
      if (!result.ok) return result.error
      dispatch({ type: 'show-live' })
      showTab('game')
      setOrientation(result.state.playerColor)
      return null
    },

    resign: async () => {
      await attempt(api.game.resign(), notify)
    },

    retryOpponent: async () => {
      await attempt(api.game.retryOpponent(), notify)
    },

    /** Asks the coach, in the chat, to go over the game just played. */
    askForReview: async () => {
      const sent = await attempt(api.coach.send('Could you review this game with me?'), notify)
      if (sent) showTab('coach')
    },
  }
}
