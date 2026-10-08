import * as crypto from '../crypto'
import { AliasAccount } from '../@types'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import { readJson, readSafeNumber, writeJson, writeSafeNumber } from '../utils/binaryFields'

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
  if (root) stream.writeUInt16(SerdeTypeIdent.AliasAccount)
  const { id, type, hash, inbox, address, timestamp, ...extra } = inp
  for (const value of [id, type, hash, inbox, address]) stream.writeString(value)
  writeSafeNumber(stream, timestamp)
  writeJson(stream, extra)
}

export const deserializeAliasAccount = (stream: VectorBufferStream, root = false): AliasAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.AliasAccount) {
    throw new Error('Unexpected bufferstream for AliasAccount type')
  }

  const id = stream.readString()
  const type = stream.readString()
  const hash = stream.readString()
  const inbox = stream.readString()
  const address = stream.readString()
  const timestamp = readSafeNumber(stream)
  return { id, type, hash, inbox, address, timestamp, ...readJson<Record<string, unknown>>(stream) }
}
