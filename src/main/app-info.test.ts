import { describe, expect, it } from 'vitest'
import { appInfo } from './app-info'

const app = { getName: () => 'Chess Training Simulator', getVersion: () => '0.1.0' }

describe('appInfo', () => {
  it('reports the app and the versions it runs on', () => {
    expect(
      appInfo(app, {
        platform: 'win32',
        versions: { electron: '45.2.3', chrome: '146.0.0.0', node: '24.1.0' },
      }),
    ).toEqual({
      name: 'Chess Training Simulator',
      version: '0.1.0',
      platform: 'win32',
      versions: { electron: '45.2.3', chrome: '146.0.0.0', node: '24.1.0' },
    })
  })

  it('says unknown for a version it cannot find', () => {
    expect(appInfo(app, { platform: 'linux', versions: { node: '24.1.0' } }).versions).toEqual({
      electron: 'unknown',
      chrome: 'unknown',
      node: '24.1.0',
    })
  })
})
