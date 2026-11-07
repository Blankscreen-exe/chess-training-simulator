/** A row of tabs; the panel for the chosen one is drawn by the caller. */
export function Tabs<T extends string>({
  tabs,
  current,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[]
  current: T
  onChange: (id: T) => void
}) {
  return (
    <nav className="flex border-b border-stone-800" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={current === tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 px-3 py-2.5 text-sm font-medium ${
            current === tab.id
              ? 'border-b-2 border-amber-500 text-stone-100'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
