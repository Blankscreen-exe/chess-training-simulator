// The main process, as the page reaches it: the only module that touches `window.api`, so the
// rest of the renderer can be tested with a stand-in.
import type { RendererApi } from '@shared/ipc'

export const api: RendererApi = window.api
