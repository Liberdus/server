import * as crypto from '../crypto'
import {AliasAccount} from '../@types'

export const aliasAccount = (accountId: string): AliasAccount => {
  const alias: AliasAccount = {
    id: accountId,
    type: 'AliasAccount',
    hash: '',
    inbox: '',
    address: '',
    timestamp: 0,
  }
  alias.hash = crypto.hashObj(alias)
  return alias
}
