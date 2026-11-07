import { addCoachCommand, COACH_SERVER_NAME } from '@shared/coach'
import { CopyableCommand } from '../ui/CopyableCommand'
import { ExternalLink } from '../ui/ExternalLink'

const CLAUDE_CODE_DOCS = 'https://code.claude.com/docs/en/overview'

/** How to connect the coach: Claude Code, with this app's server added and allowed. */
export function CoachSetup({ port }: { port: number }) {
  const steps = [
    {
      title: 'Install Claude Code',
      body: (
        <>
          Install <ExternalLink href={CLAUDE_CODE_DOCS}>Claude Code</ExternalLink> and sign in. The
          coach uses your own Claude plan; this app never sees your account.
        </>
      ),
    },
    {
      title: 'Add the coach',
      body: (
        <>
          <p>
            Running Claude Code in this project&apos;s folder finds the coach by itself. Anywhere
            else, add it once:
          </p>
          <CopyableCommand command={addCoachCommand(port)} />
        </>
      ),
    },
    {
      title: 'Start Claude Code and allow the coach',
      body: (
        <>
          Run <code className="text-stone-200">claude</code>, approve the{' '}
          <code className="text-stone-200">{COACH_SERVER_NAME}</code> server, and allow its tools
          when asked, or all at once with <code className="text-stone-200">/permissions</code> and
          the rule <code className="text-stone-200">mcp__{COACH_SERVER_NAME}</code>.
        </>
      ),
    },
    {
      title: 'Say "let\'s train"',
      body: <>The coach connects, and this panel turns into your chat with it.</>,
    },
  ]

  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-stone-800 text-xs font-semibold text-stone-300">
            {index + 1}
          </span>
          <div className="min-w-0 space-y-1.5 text-sm text-stone-400">
            <p className="font-medium text-stone-200">{step.title}</p>
            <div className="space-y-2">{step.body}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}
