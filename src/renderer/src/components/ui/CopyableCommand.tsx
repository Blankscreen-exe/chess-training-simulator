import { useState } from 'react'

const COPIED_MS = 1500

/** A command to type in a terminal, with a button that copies it. */
export function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-start gap-2 rounded-md bg-stone-950 p-2">
      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-stone-200 select-text">
        {command}
      </code>
      <button
        type="button"
        className="shrink-0 rounded bg-stone-800 px-2 py-1 text-xs text-stone-300 hover:bg-stone-700"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), COPIED_MS)
          })
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
