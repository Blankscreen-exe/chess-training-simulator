export const SIDEBAR_TABS = [
  { id: 'game', label: 'Game' },
  { id: 'training', label: 'Training' },
  { id: 'progress', label: 'Progress' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'history', label: 'History' },
  { id: 'coach', label: 'Coach' },
] as const

export type SidebarTab = (typeof SIDEBAR_TABS)[number]['id']
