import { useMemo, useState } from 'react'
import { AppShell } from './components/AppShell'
import { BoardArea } from './components/board/BoardArea'
import { BoardEditor } from './components/BoardEditor'
import { CoachPanel } from './components/CoachPanel'
import { NewGameDialog } from './components/NewGameDialog'
import { AnalysisPanel } from './components/sidebar/AnalysisPanel'
import { GameTab } from './components/sidebar/GameTab'
import { HistoryPanel } from './components/sidebar/HistoryPanel'
import { Sidebar } from './components/sidebar/Sidebar'
import type { SidebarTab } from './components/sidebar/tabs'
import { Button } from './components/ui/Button'
import { DEFAULT_ANALYSIS_SETTINGS, useAnalysis } from './hooks/useAnalysis'
import { useBoardView } from './hooks/useBoardView'
import { useLiveGame } from './hooks/useLiveGame'
import { useMoveKeys } from './hooks/useMoveKeys'
import { useNotice } from './hooks/useNotice'
import { useOrientation } from './hooks/useOrientation'
import { useTrainerActions } from './hooks/useTrainerActions'
import { lineArrows } from './lib/chessground'
import { isAnalysable } from './state/boardView'

export function App() {
  const game = useLiveGame()
  const board = useBoardView(game)
  const { view, dispatch, position } = board
  const { orientation, setOrientation, flip } = useOrientation(game)
  const { notice, notify } = useNotice()
  const [tab, setTab] = useState<SidebarTab>('game')
  /** The new game dialog, when open, with the position it starts from if not the standard one. */
  const [newGame, setNewGame] = useState<{ fen?: string } | null>(null)
  const [analysisSettings, setAnalysisSettings] = useState(DEFAULT_ANALYSIS_SETTINGS)

  const analysing = analysisSettings.enabled && isAnalysable(view)
  const { analysis, running, error } = useAnalysis(
    analysing ? position.fen : null,
    analysisSettings.lines,
  )
  const evaluation = useMemo(
    () =>
      analysing
        ? {
            score: analysis?.lines[0]?.score ?? null,
            arrows: analysis ? lineArrows(analysis.lines) : [],
          }
        : null,
    [analysing, analysis],
  )

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
          orientation={orientation}
          evaluation={evaluation}
          notice={notice}
          notify={notify}
        />
        <Sidebar tab={tab} onTabChange={setTab}>
          {tab === 'game' && (
            <GameTab
              view={view}
              game={game}
              onGo={board.selectMove}
              onNewGame={() => setNewGame({})}
              onResign={() => void actions.resign()}
              onRetryEngine={() => void actions.retryEngine()}
              onAnalyse={() => void actions.analyseShown()}
            />
          )}
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
          {tab === 'coach' && <CoachPanel />}
        </Sidebar>
      </main>
      {dialog}
    </AppShell>
  )
}
