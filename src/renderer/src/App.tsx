import { useMemo, useState } from 'react'
import { AppShell } from './components/AppShell'
import { BoardArea } from './components/board/BoardArea'
import { BoardEditor } from './components/BoardEditor'
import { CoachPanel } from './components/coach/CoachPanel'
import { NewGameDialog } from './components/NewGameDialog'
import { ProgressPanel } from './components/profile/ProgressPanel'
import { AnalysisPanel } from './components/sidebar/AnalysisPanel'
import { GameTab } from './components/sidebar/GameTab'
import { HistoryPanel } from './components/sidebar/HistoryPanel'
import { Sidebar } from './components/sidebar/Sidebar'
import type { SidebarTab } from './components/sidebar/tabs'
import { TrainingPanel } from './components/training/TrainingPanel'
import { Button } from './components/ui/Button'
import { DEFAULT_ANALYSIS_SETTINGS, useAnalysis } from './hooks/useAnalysis'
import { useBoardView } from './hooks/useBoardView'
import { useCoach } from './hooks/useCoach'
import { useCoachCommands } from './hooks/useCoachCommands'
import { useLibrary } from './hooks/useLibrary'
import { useLiveGame } from './hooks/useLiveGame'
import { useMoveKeys } from './hooks/useMoveKeys'
import { useNotice } from './hooks/useNotice'
import { useOpening } from './hooks/useOpening'
import { useOrientation } from './hooks/useOrientation'
import { useProfile } from './hooks/useProfile'
import { usePuzzle } from './hooks/usePuzzle'
import { useTrainerActions } from './hooks/useTrainerActions'
import { useUnread } from './hooks/useUnread'
import { candidateArrows, hintCircle, lineArrows } from './lib/chessground'
import { isAnalysable } from './state/boardView'

export function App() {
  const game = useLiveGame()
  const puzzle = usePuzzle()
  const library = useLibrary()
  const profile = useProfile()
  const coach = useCoach()
  const board = useBoardView(game, puzzle)
  const { view, dispatch, position } = board
  const { orientation, setOrientation, flip } = useOrientation(game, puzzle)
  const opening = useOpening(game, library?.contents?.installedAt ?? null)
  const { notice, notify } = useNotice()
  const [tab, setTab] = useState<SidebarTab>('game')
  /** The new game dialog, when open, with the position it starts from if not the standard one. */
  const [newGame, setNewGame] = useState<{ fen?: string } | null>(null)
  const [analysisSettings, setAnalysisSettings] = useState(DEFAULT_ANALYSIS_SETTINGS)
  const latestFromCoach = coach?.messages.findLast((message) => message.from === 'coach')?.id ?? 0
  const coachUnread = useUnread(latestFromCoach, tab === 'coach')

  const analysing = analysisSettings.enabled && isAnalysable(view)
  const { analysis, running, error } = useAnalysis(
    analysing ? position.fen : null,
    analysisSettings.lines,
  )
  const score = analysing ? (analysis?.lines[0]?.score ?? null) : undefined
  // The coach's arrows show only on the position it drew them for.
  const coachCandidates = coach?.candidates?.fen === position.fen ? coach.candidates.moves : null
  const hint = view.kind === 'puzzle' ? (puzzle?.hint ?? null) : null
  const arrows = useMemo(
    () => [
      ...(analysing && analysis ? lineArrows(analysis.lines) : []),
      ...(coachCandidates ? candidateArrows(coachCandidates) : []),
      ...(hint ? [hintCircle(hint)] : []),
    ],
    [analysing, analysis, coachCandidates, hint],
  )
  useCoachCommands(dispatch)

  const actions = useTrainerActions({
    position,
    dispatch,
    notify,
    showTab: setTab,
    showAnalysis: () => setAnalysisSettings((settings) => ({ ...settings, enabled: true })),
    setOrientation,
  })

  useMoveKeys({
    enabled: newGame === null,
    range: board.range,
    onGo: board.goTo,
    ...(view.kind === 'preview' ? { onEscape: () => dispatch({ type: 'leave-preview' }) } : {}),
  })

  const dialog = newGame && (
    <NewGameDialog
      fen={newGame.fen}
      onStart={async (options) => {
        const problem = await actions.startGame(options)
        if (problem === null) setNewGame(null)
        return problem
      }}
      onClose={() => setNewGame(null)}
    />
  )

  if (view.kind === 'editor') {
    return (
      <AppShell>
        <main className="flex min-h-0 flex-1 p-5">
          <BoardEditor
            fen={view.fen}
            orientation={orientation}
            onFlip={flip}
            onPlay={(fen) => setNewGame({ fen })}
            onAnalyse={actions.openAnalysis}
            onClose={() => dispatch({ type: 'show-live' })}
          />
        </main>
        {dialog}
      </AppShell>
    )
  }

  return (
    <AppShell
      actions={
        <>
          <Button onClick={() => setNewGame({})}>New game</Button>
          <Button onClick={() => dispatch({ type: 'open-editor', fen: position.fen })}>
            Set up position
          </Button>
          <Button onClick={flip} title="Flip board">
            ⇅ Flip
          </Button>
        </>
      }
    >
      <main className="flex min-h-0 flex-1 gap-5 p-5">
        <BoardArea
          board={board}
          game={game}
          puzzle={puzzle}
          orientation={orientation}
          score={score}
          arrows={arrows}
          notice={notice}
          notify={notify}
        />
        <Sidebar tab={tab} onTabChange={setTab} marked={coachUnread ? ['coach'] : []}>
          {tab === 'game' && (
            <GameTab
              view={view}
              game={game}
              opening={opening}
              onGo={board.selectMove}
              onNewGame={() => setNewGame({})}
              onResign={() => void actions.resign()}
              onRetryEngine={() => void actions.retryOpponent()}
              onAnalyse={() => void actions.analyseShown()}
              onReview={
                coach?.status === 'connected' ? () => void actions.askForReview() : undefined
              }
            />
          )}
          {tab === 'training' && (
            <TrainingPanel
              library={library}
              profile={profile}
              puzzle={puzzle}
              puzzleOnBoard={view.kind === 'puzzle'}
              onShowPuzzle={() => dispatch({ type: 'show-puzzle' })}
            />
          )}
          {tab === 'progress' && <ProgressPanel profile={profile} />}
          {tab === 'analysis' && (
            <AnalysisPanel
              settings={analysisSettings}
              onSettingsChange={setAnalysisSettings}
              analysis={analysis}
              running={running}
              error={error}
              available={isAnalysable(view)}
              onPreview={(line) => void actions.previewLine(line)}
            />
          )}
          {tab === 'history' && <HistoryPanel onOpen={(id) => void actions.openReplay(id)} />}
          {tab === 'coach' && <CoachPanel coach={coach} />}
        </Sidebar>
      </main>
      {dialog}
    </AppShell>
  )
}
