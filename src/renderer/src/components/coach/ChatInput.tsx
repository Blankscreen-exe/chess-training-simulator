import { useState } from 'react'
import { MAX_CHAT_LENGTH } from '@shared/coach'
import { Button } from '../ui/Button'

/** Writing to the coach: Enter sends, Shift+Enter starts a new line. */
export function ChatInput({
  disabled,
  onSend,
}: {
  disabled: boolean
  /** Sends the message; resolves to why it could not be sent, or null once it was. */
  onSend: (text: string) => Promise<string | null>
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function send() {
    if (!text.trim() || sending) return
    setSending(true)
    const problem = await onSend(text)
    setSending(false)
    setError(problem)
    if (problem === null) setText('')
  }

  return (
    <form
      className="space-y-1.5 border-t border-stone-800 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          rows={2}
          maxLength={MAX_CHAT_LENGTH}
          disabled={disabled}
          placeholder={disabled ? 'The coach cannot connect' : 'Ask your coach…'}
          aria-label="Message to the coach"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          className="min-w-0 flex-1 resize-none rounded-md bg-stone-800 px-3 py-2 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
        />
        <Button type="submit" variant="primary" disabled={disabled || sending || !text.trim()}>
          Send
        </Button>
      </div>
      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
