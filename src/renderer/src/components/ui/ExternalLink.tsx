import type { ReactNode } from 'react'

/** A link to a web page, which opens in the system's browser rather than in the app. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-amber-300 underline decoration-dotted hover:text-amber-200"
    >
      {children}
    </a>
  )
}
