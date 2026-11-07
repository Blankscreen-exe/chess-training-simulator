import type { ReactNode } from 'react'
import { Tabs } from '../ui/Tabs'
import { SIDEBAR_TABS, type SidebarTab } from './tabs'

/** The panel beside the board: tabs, and the chosen tab's content. */
export function Sidebar({
  tab,
  onTabChange,
  children,
}: {
  tab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  children: ReactNode
}) {
  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-hidden rounded-md border border-stone-800 bg-stone-900">
      <Tabs tabs={SIDEBAR_TABS} current={tab} onChange={onTabChange} />
      {children}
    </aside>
  )
}
