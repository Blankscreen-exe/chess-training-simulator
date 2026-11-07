/** A list of functions to call with each value, as many parts of the app need. */
export class Listeners<T> {
  private readonly listeners = new Set<(value: T) => void>()

  /** Adds a listener; returns a function that removes it. */
  add(listener: (value: T) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(value: T): void {
    for (const listener of this.listeners) listener(value)
  }
}
