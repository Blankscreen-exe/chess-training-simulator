import type { ReactNode } from 'react'

/** A titled box, as the panels beside the board are made of. */
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 rounded-md border border-stone-800 bg-stone-900/60 p-3 text-sm">
      <h3 className="text-xs font-medium tracking-wide text-stone-400 uppercase">{title}</h3>
      {children}
    </section>
  )
}
