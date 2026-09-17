import * as crypto from '../crypto'
import * as config from '../config'
import { NetworkAccount } from '../@types'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import { Utils } from '@shardus/lib-types'
import { Shardus } from '@shardus/core'

export const networkAccount = (accountId: string, timestamp: number, dapp: Shardus): NetworkAccount => {
  // Ensure lowercase accountId
  accountId = accountId.toLowerCase()
  const latestCycles = dapp.getLatestCycles()
  const currentCycle = latestCycles[0]

  const account: NetworkAccount = {
    id: accountId,
    networkId: currentCycle.networkId,
    type: 'NetworkAccount',
    listOfChanges: [],
    current: config.INITIAL_PARAMETERS,
    hash: '',
    timestamp,
  }
  account.hash = crypto.hashObj(account)
  console.log('INITIAL_HASH: ', account.hash)
  return account
}

// todo: we will have to do task to do detailed serialisation and deserialisation later with type reinforcements
export const serializeNetworkAccount = (stream: VectorBufferStream, inp: NetworkAccount, root = false): void => {
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.NetworkAccount)
  }
  stream.writeString(Utils.safeStringify(inp))
}

export const deserializeNetworkAccount = (stream: VectorBufferStream, root = false): NetworkAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.NetworkAccount) {
    throw new Error('Unexpected bufferstream for NetworkAccount type')
  }
  return Utils.safeJsonParse(stream.readString())
}
