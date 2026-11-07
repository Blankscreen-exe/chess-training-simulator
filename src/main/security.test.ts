import { describe, expect, it } from 'vitest'
import { appBaseUrl, isAppUrl, isExternalWebUrl } from './security'

describe('appBaseUrl', () => {
  it('uses the development server when there is one', () => {
    expect(appBaseUrl('http://localhost:5173/some/page', 'file:///app/out/renderer/')).toBe(
      'http://localhost:5173/',
    )
  })

  it('uses the renderer folder otherwise, ending in a slash', () => {
    expect(appBaseUrl(undefined, 'file:///app/out/renderer')).toBe('file:///app/out/renderer/')
    expect(appBaseUrl(undefined, 'file:///app/out/renderer/')).toBe('file:///app/out/renderer/')
  })
})

describe('isAppUrl', () => {
  const built = 'file:///C:/Program%20Files/Chess/resources/app.asar/out/renderer/'

  it('accepts the built pages', () => {
    expect(isAppUrl(`${built}index.html`, built)).toBe(true)
    expect(isAppUrl(`${built}index.html#/review`, built)).toBe(true)
  })

  it('refuses other files on the computer', () => {
    expect(isAppUrl('file:///C:/Users/someone/evil.html', built)).toBe(false)
    expect(isAppUrl('file:///C:/Program%20Files/Chess/resources/app.asar/out/main/', built)).toBe(
      false,
    )
  })

  it('refuses a folder that only starts with the same name', () => {
    expect(
      isAppUrl('file:///C:/Program%20Files/Chess/resources/app.asar/out/renderer-evil/x', built),
    ).toBe(false)
  })

  it('refuses websites when the app runs from files', () => {
    expect(isAppUrl('https://example.com/', built)).toBe(false)
  })

  it('accepts only the development server while developing', () => {
    const dev = 'http://localhost:5173/'
    expect(isAppUrl('http://localhost:5173/index.html', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5174/index.html', dev)).toBe(false)
    expect(isAppUrl('http://127.0.0.1:5173/', dev)).toBe(false)
    expect(isAppUrl('https://localhost:5173/', dev)).toBe(false)
  })

  it('refuses missing and malformed addresses', () => {
    expect(isAppUrl(undefined, built)).toBe(false)
    expect(isAppUrl('', built)).toBe(false)
    expect(isAppUrl('not a url', built)).toBe(false)
  })
})

describe('isExternalWebUrl', () => {
  it('allows web pages', () => {
    expect(isExternalWebUrl('https://lichess.org/')).toBe(true)
    expect(isExternalWebUrl('http://example.com/')).toBe(true)
  })

  it('refuses everything else', () => {
    expect(isExternalWebUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isExternalWebUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalWebUrl('ms-settings:')).toBe(false)
    expect(isExternalWebUrl('nonsense')).toBe(false)
  })
})
