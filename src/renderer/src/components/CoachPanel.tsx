/** Where you will talk with the coach. Claude connects in a later version. */
export function CoachPanel() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="size-2.5 rounded-full bg-stone-600" aria-hidden="true" />
      <p className="text-sm font-medium text-stone-300">Coach offline</p>
      <p className="text-sm text-stone-500">
        The coach connects from your own Claude Code. That arrives in a later version.
      </p>
    </div>
  )
}
