import { LiberdusFlags } from '../../config'
import { Migration } from '../types'

export const migrate: Migration = async () => {
  LiberdusFlags.versionFlags.enforceAJVTxValidation = true
}
