/** Where you will talk with the coach. Claude connects in a later phase. */
export function CoachPanel() {
  return (
    <aside className="flex w-80 shrink-0 flex-col rounded-md border border-stone-800 bg-stone-900">
      <div className="flex items-center gap-2 border-b border-stone-800 px-4 py-3">
        <span className="size-2 rounded-full bg-stone-600" aria-hidden="true" />
        <h2 className="text-sm font-medium">Coach</h2>
        <span className="ml-auto text-xs text-stone-500">Offline</span>
      </div>
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-stone-500">
        The coach connects from your own Claude Code. That arrives in a later version.
      </div>
    </aside>
  )
}
