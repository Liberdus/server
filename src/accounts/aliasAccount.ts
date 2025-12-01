import * as crypto from '../crypto'
import { AliasAccount } from '../@types'
import { VectorBufferStream } from '@shardeum-foundation/core'
import { SerdeTypeIdent } from '.'

export const aliasAccount = (accountId: string): AliasAccount => {
  // Ensure lowercase accountId
  accountId = accountId.toLowerCase()
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

export const serializeAliasAccount = (stream: VectorBufferStream, inp: AliasAccount, root = false): void => {
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.AliasAccount)
  }
  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeString(inp.hash)
  stream.writeString(inp.inbox)
  stream.writeString(inp.address)
  stream.writeBigUInt64(BigInt(inp.timestamp))
}

export const deserializeAliasAccount = (stream: VectorBufferStream, root = false): AliasAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.AliasAccount) {
    throw new Error('Unexpected bufferstream for AliasAccount type')
  }

  return {
    id: stream.readString(),
    type: stream.readString(),
    hash: stream.readString(),
    inbox: stream.readString(),
    address: stream.readString(),
    timestamp: Number(stream.readBigUInt64()),
  }
}
