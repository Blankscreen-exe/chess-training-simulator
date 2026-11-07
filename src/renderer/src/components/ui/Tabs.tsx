/** A row of tabs; the panel for the chosen one is drawn by the caller. */
export function Tabs<T extends string>({
  tabs,
  current,
  onChange,
  marked = [],
}: {
  tabs: readonly { id: T; label: string }[]
  current: T
  onChange: (id: T) => void
  /** Tabs with something new in them, shown with a dot. */
  marked?: readonly T[]
}) {
  return (
    <nav className="flex border-b border-stone-800" role="tablist">
      {tabs.map((tab) => {
        const isMarked = marked.includes(tab.id)
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={current === tab.id}
            aria-label={isMarked ? `${tab.label}, something new` : tab.label}
            onClick={() => onChange(tab.id)}
            className={`relative flex-1 px-3 py-2.5 text-sm font-medium ${
              current === tab.id
                ? 'border-b-2 border-amber-500 text-stone-100'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            {tab.label}
            {isMarked && (
              <span
                className="absolute top-2 ml-1 inline-block size-1.5 rounded-full bg-amber-400"
                aria-hidden="true"
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
