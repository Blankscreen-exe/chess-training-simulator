import type { AppInfo } from '@shared/ipc'

/** The parts of Electron's `app` the app's information comes from. */
export interface AppDetails {
  getName(): string
  getVersion(): string
}

/** The parts of Node's `process` the app's information comes from. */
export interface ProcessDetails {
  platform: string
  versions: Partial<Record<'electron' | 'chrome' | 'node', string>>
}

/** The app's name and version, and the versions of Electron, Chromium and Node it runs on. */
export function appInfo(app: AppDetails, proc: ProcessDetails): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: proc.platform,
    versions: {
      electron: proc.versions.electron ?? 'unknown',
      chrome: proc.versions.chrome ?? 'unknown',
      node: proc.versions.node ?? 'unknown',
    },
  }
}
