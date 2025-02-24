import { nestedCountersInstance, Shardus } from '@shardeum-foundation/core'
import { LiberdusFlags, updateLiberdusFlag } from '../config'

export const debug_liberdus_flags =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      nestedCountersInstance.countEvent('liberdus-flags', 'called debug_liberdus_flags')
      return res.json({ LiberdusFlags })
    } catch (e) {
      dapp.log('debug_liberdus_flags', e)
      return res.json({ error: e.message })
    }
  }

export const set_liberdus_flag =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    let value
    let key
    try {
      key = req.query.key as string
      value = req.query.value as string
      if (value == null) {
        return res.json(`debug-set-liberdus-flag: ${value} == null`)
      }

      let typedValue: boolean | number | string

      if (value === 'true') typedValue = true
      else if (value === 'false') typedValue = false
      else if (!Number.isNaN(Number(value))) typedValue = Number(value)

      updateLiberdusFlag(key, typedValue)

      return res.json({ [key]: LiberdusFlags[key] }) // eslint-disable-line security/detect-object-injection
    } catch (err) {
      dapp.log('set_liberdus_flag', err)
      return res.json(`debug-set-liberdus-flag: ${key} ${err.message} `)
    }
  }
