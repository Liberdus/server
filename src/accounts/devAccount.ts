import * as crypto from '../crypto'
import { DevAccount } from '../@types'
import { VectorBufferStream } from '@shardeum-foundation/core'
import { SerdeTypeIdent } from '.'

export const devAccount = (accountId: string): DevAccount => {
  // Ensure lowercase accountId
  accountId = accountId.toLowerCase()
  const account: DevAccount = {
    id: accountId,
    type: 'DevAccount',
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}

export const serializeDevAccount = (stream: VectorBufferStream, inp: DevAccount, root = false): void => {
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.AliasAccount)
  }
  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeString(inp.hash)
  stream.writeBigUInt64(BigInt(inp.timestamp))
}

export const deserializeDevAccount = (stream: VectorBufferStream, root = false): DevAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.DevAccount) {
    throw new Error('Unexpected bufferstream for DevAccount type')
  }

  return {
    id: stream.readString(),
    type: stream.readString(),
    hash: stream.readString(),
    timestamp: Number(stream.readBigUInt64()),
  }
}
