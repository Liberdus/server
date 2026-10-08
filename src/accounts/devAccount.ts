import * as crypto from '../crypto'
import { DevAccount } from '../@types'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import { readJson, readSafeNumber, writeJson, writeSafeNumber } from '../utils/binaryFields'

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
  if (root) stream.writeUInt16(SerdeTypeIdent.DevAccount)
  const { id, type, hash, timestamp, ...extra } = inp
  for (const value of [id, type, hash]) stream.writeString(value)
  writeSafeNumber(stream, timestamp)
  writeJson(stream, extra)
}

export const deserializeDevAccount = (stream: VectorBufferStream, root = false): DevAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.DevAccount) {
    throw new Error('Unexpected bufferstream for DevAccount type')
  }

  const id = stream.readString()
  const type = stream.readString()
  const hash = stream.readString()
  const timestamp = readSafeNumber(stream)
  return { id, type, hash, timestamp, ...readJson<Record<string, unknown>>(stream) }
}
