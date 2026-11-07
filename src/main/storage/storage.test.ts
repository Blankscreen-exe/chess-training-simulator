import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { START_FEN } from '@shared/chess'
import { GameStore } from '../games/store'
import { MIGRATIONS, openDatabase } from './database'
import { SettingsStore } from './settings'

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'chess-')), 'games.db')
const version = (db: DatabaseSync) =>
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version

describe('openDatabase', () => {
  it('brings a new database up to date', () => {
    expect(version(openDatabase(':memory:'))).toBe(MIGRATIONS.length)
  })

  it('keeps its data between openings, without migrating twice', () => {
    const path = tempFile()
    const first = openDatabase(path)
    const game = new GameStore(first).create({
      playerColor: 'white',
      engineLevel: 3,
      opponent: 'coach',
      initialFen: START_FEN,
      startedAt: '2026-11-07',
    })
    first.close()
    const second = openDatabase(path)
    expect(new GameStore(second).get(game.id)?.opponent).toBe('coach')
    second.close()
  })

  it('upgrades a database from the first version, its games against the engine', () => {
    const path = tempFile()
    const old = new DatabaseSync(path)
    old.exec(MIGRATIONS[0] ?? '')
    old.exec('PRAGMA user_version = 1')
    old.exec(
      `INSERT INTO games (started_at, player_color, engine_level, initial_fen, status)
       VALUES ('2026-11-01', 'black', 5, '${START_FEN}', 'in_progress')`,
    )
    old.close()

    const upgraded = openDatabase(path)
    expect(version(upgraded)).toBe(MIGRATIONS.length)
    expect(new GameStore(upgraded).get(1)).toMatchObject({ engineLevel: 5, opponent: 'engine' })
    upgraded.close()
  })
})

describe('SettingsStore', () => {
  const Mode = z.enum(['guided', 'silent'])

  it('keeps values, replacing them when set again', () => {
    const settings = new SettingsStore(openDatabase(':memory:'))
    expect(settings.get('mode', Mode, 'guided')).toBe('guided')
    settings.set('mode', 'silent')
    settings.set('mode', 'guided')
    expect(settings.get('mode', Mode, 'silent')).toBe('guided')
  })

  it('falls back to the default for a value that no longer fits, or is not JSON', () => {
    const db = openDatabase(':memory:')
    const settings = new SettingsStore(db)
    settings.set('mode', 'loud')
    expect(settings.get('mode', Mode, 'guided')).toBe('guided')
    db.prepare("INSERT INTO settings (key, value) VALUES ('broken', '{')").run()
    expect(settings.get('broken', Mode, 'silent')).toBe('silent')
  })
})
