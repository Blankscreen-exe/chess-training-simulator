import type { CoachState } from '@shared/coach'
import { api } from '../../lib/api'
import { CandidateList } from './CandidateList'
import { ChatInput } from './ChatInput'
import { ChatLog } from './ChatLog'
import { CoachSettingsBar } from './CoachSettingsBar'
import { CoachSetup } from './CoachSetup'
import { COACH_STATUS } from './coachStatus'

async function send(text: string): Promise<string | null> {
  const result = await api.coach.send(text)
  return result.ok ? null : result.error
}

/**
 * Talking with the coach. Until Claude Code has connected and the conversation has begun, it
 * shows how to connect; after that, the chat.
 */
export function CoachPanel({ coach }: { coach: CoachState | undefined }) {
  if (!coach) return <p className="p-4 text-sm text-stone-500">Loading…</p>

  const status = COACH_STATUS[coach.status]
  const note = coach.problem ?? status.note

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-stone-800 px-4 py-3">
        <span className={`size-2 rounded-full ${status.dot}`} aria-hidden="true" />
        <h2 className="text-sm font-medium">Coach</h2>
        <span className="ml-auto text-xs text-stone-500" aria-live="polite">
          {status.label}
        </span>
      </div>
      <CoachSettingsBar settings={coach.settings} />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {note && (
          <p className="rounded-md bg-stone-800/60 px-3 py-2 text-xs text-stone-300">{note}</p>
        )}
        {coach.candidates && <CandidateList candidates={coach.candidates} />}
        <Conversation coach={coach} />
      </div>

      <ChatInput disabled={coach.status === 'unavailable'} onSend={send} />
    </div>
  )
}

function Conversation({ coach }: { coach: CoachState }) {
  if (coach.messages.length > 0) return <ChatLog messages={coach.messages} />
  if (coach.status === 'connected') {
    return (
      <p className="text-sm text-stone-400">
        The coach is listening. Say hello, or ask about the game.
      </p>
    )
  }
  return <CoachSetup port={coach.port} />
}
