import { describe, expect, it } from 'vitest'
import { Listeners } from './listeners'

describe('Listeners', () => {
  it('calls each listener until it is removed', () => {
    const listeners = new Listeners<number>()
    const heard: string[] = []
    const removeA = listeners.add((value) => heard.push(`a${value}`))
    listeners.add((value) => heard.push(`b${value}`))
    listeners.emit(1)
    removeA()
    listeners.emit(2)
    expect(heard).toEqual(['a1', 'b1', 'b2'])
  })
})
