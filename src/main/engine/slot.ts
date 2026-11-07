import { Engine, type UciTransport } from './engine'

/** Holds an engine, starting it when first asked for and again whenever the last one died. */
export class EngineSlot {
  private engine: Engine | null = null

  constructor(private readonly start: () => UciTransport) {}

  get(): Engine {
    if (!this.engine?.alive) {
      this.engine = new Engine(this.start())
    }
    return this.engine
  }

  close(): void {
    this.engine?.close()
    this.engine = null
  }
}
