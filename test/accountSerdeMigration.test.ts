/* eslint-disable @typescript-eslint/no-var-requires */
import type { LiberdusFlags as LiberdusFlagsType } from '../src/config'

/**
 * Each case needs its own module registry.
 *
 * `appliedMigrations` in src/versioning is private module state with no reset, so the first
 * onActiveVersionChange of a process marks every migration it ran as applied. A second call for an
 * earlier version then runs nothing, and a test asserting "2.5.2 does not set the flag" would pass
 * without executing a single migration.
 *
 * jest.resetModules alone is not enough: the re-imported versioning module would close over a fresh
 * src/config, so the migration would flip a different LiberdusFlags object than the test inspects.
 * Both have to come from the same fresh registry.
 *
 * The serde flag defaults to on for networks launched at 2.5.3, so it is cleared here to model a node on an
 * upgrading network before the 2.5.3 migration runs. enableAJVValidation defaults to off; it is set here too so
 * the AJV cases do not depend on the default.
 */
const loadFresh = (): { activate: (v: string) => Promise<void>; flags: typeof LiberdusFlagsType } => {
  jest.resetModules()
  const { onActiveVersionChange } = require('../src/versioning')
  const { LiberdusFlags } = require('../src/config')
  LiberdusFlags.versionFlags.correctAccountSerdeLayout = false
  LiberdusFlags.enableAJVValidation = false
  return { activate: (v: string) => onActiveVersionChange(v, { config: { p2p: {} } }), flags: LiberdusFlags }
}

describe('account serde layout migration', () => {
  test('2.5.2 runs its own migrations without enabling the serde flag', async () => {
    const { activate, flags } = loadFresh()
    expect(flags.versionFlags.correctAccountSerdeLayout).toBe(false)

    await activate('2.5.2')

    // Asserted together on purpose: the first line proves the 2.5.2 migrations actually executed,
    // so the second cannot pass merely because nothing ran.
    expect(flags.versionFlags.removeUnusedTxState).toBe(true)
    expect(flags.versionFlags.correctAccountSerdeLayout).toBe(false)
  })

  test('2.5.3 enables the serde flag', async () => {
    const { activate, flags } = loadFresh()
    expect(flags.versionFlags.correctAccountSerdeLayout).toBe(false)

    await activate('2.5.3')

    expect(flags.versionFlags.correctAccountSerdeLayout).toBe(true)
  })

  test('the order these run in does not change the outcome', async () => {
    // Guards the registry isolation itself: without it, whichever case ran first would leave every
    // migration marked applied and the other would assert nothing.
    const second = loadFresh()
    await second.activate('2.5.2')
    expect(second.flags.versionFlags.correctAccountSerdeLayout).toBe(false)

    const third = loadFresh()
    await third.activate('2.5.3')
    expect(third.flags.versionFlags.correctAccountSerdeLayout).toBe(true)
  })
})

describe('AJV validation migration', () => {
  test('2.5.2 leaves AJV validation off', async () => {
    const { activate, flags } = loadFresh()

    await activate('2.5.2')

    // removeUnusedTxState proves the 2.5.2 migrations ran, so the AJV assertion is meaningful
    expect(flags.versionFlags.removeUnusedTxState).toBe(true)
    expect(flags.enableAJVValidation).toBe(false)
  })

  test('2.5.3 turns AJV validation on', async () => {
    const { activate, flags } = loadFresh()
    expect(flags.enableAJVValidation).toBe(false)

    await activate('2.5.3')

    expect(flags.enableAJVValidation).toBe(true)
  })
})
