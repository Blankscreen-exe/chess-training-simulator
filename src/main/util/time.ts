// Times in words, for the coach. Claude does not know the player's time zone, so a date would
// mislead it about what "today" is; how long until or since something does not.

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** How long until `iso`, from `now`: "within the hour", "in 20 hours", "in 3 days". */
export function timeUntil(iso: string, now: Date): string {
  const hours = (Date.parse(iso) - now.getTime()) / HOUR_MS
  if (hours < 1) return 'within the hour'
  if (hours < 36) return `in ${Math.round(hours)} hours`
  return `in ${Math.round(hours / 24)} days`
}

/** How long since `iso`, from `now`, in days: "today", "yesterday", "5 days ago". */
export function daysSince(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS)
  if (days <= 0) return 'today'
  return days === 1 ? 'yesterday' : `${days} days ago`
}
