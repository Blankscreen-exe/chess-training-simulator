// Small pieces of wording the screens share.

/** A count with its noun: "no hints", "1 hint", "3 hints". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n === 0 ? 'no' : n} ${n === 1 ? one : many}`
}

/** A day, in the player's own words and time: "Monday 9 November". */
export function dayName(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}
