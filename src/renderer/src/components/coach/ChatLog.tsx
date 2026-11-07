import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@shared/coach'

/** The conversation, newest at the bottom, kept scrolled to the latest message. */
export function ChatLog({ messages }: { messages: readonly ChatMessage[] }) {
  const end = useRef<HTMLDivElement>(null)
  const latest = messages.at(-1)?.id
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [latest])

  return (
    <div className="space-y-3" role="log" aria-live="polite" aria-label="Chat with the coach">
      {messages.map((message) => {
        const mine = message.from === 'player'
        return (
          <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <p
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap select-text ${
                mine ? 'bg-amber-500/20 text-amber-50' : 'bg-stone-800 text-stone-100'
              }`}
            >
              {message.text}
            </p>
          </div>
        )
      })}
      <div ref={end} />
    </div>
  )
}
