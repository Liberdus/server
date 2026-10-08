import { NetworkAccount, TollUnit, UserAccount } from '../@types'
import { VectorBufferStream } from '@shardus/core'
import * as crypto from '@shardus/lib-crypto-utils'
import { SerdeTypeIdent } from '.'
import * as utils from '../utils'
import * as AccountsStorage from '../storage/accountStorage'
import { INITIAL_PARAMETERS, LiberdusFlags } from '../config'
import {
  readBigIntDecimal,
  readJson,
  readNullableString,
  readSafeNumber,
  writeBigIntDecimal,
  writeJson,
  writeNullableString,
  writeSafeNumber,
} from '../utils/binaryFields'

export const userAccount = (accountId: string, timestamp: number): UserAccount => {
  // Ensure lowercase accountId
  accountId = accountId.toLowerCase()
  const account: UserAccount = {
    id: accountId,
    type: 'UserAccount',
    data: {
      balance: utils.libToWei(50),
      toll: utils.getDefaultTollWei(AccountsStorage.cachedNetworkAccount ?? ({ current: INITIAL_PARAMETERS } as NetworkAccount)),
      tollUnit: TollUnit.lib,
      chats: {},
      chatTimestamp: 0,
      ...(LiberdusFlags.versionFlags.removeLegacyDaoState ? {} : { payments: [] }),
      ...(LiberdusFlags.versionFlags.removeUnusedTxState ? {} : { stake: BigInt(0), remove_stake_request: null, friends: {} }),
    },
    alias: null,
    ...(LiberdusFlags.versionFlags.removeUnusedTxState ? {} : { emailHash: null, verified: false, claimedSnapshot: false }),
    hash: '',
    lastMaintenance: timestamp,
    timestamp: 0,
    publicKey: '',
    private: false,
  }
  account.hash = crypto.hashObj(account)
  return account
}

export const serializeUserAccount = (stream: VectorBufferStream, inp: UserAccount, root = false): void => {
  if (root) stream.writeUInt16(SerdeTypeIdent.UserAccount)
  const { id, type, data, alias, hash, lastMaintenance, timestamp, publicKey, ...extra } = inp
  const { balance, toll, tollUnit, chats, chatTimestamp, ...dataExtra } = data
  stream.writeString(id)
  stream.writeString(type)
  writeBigIntDecimal(stream, balance)
  stream.writeUInt8(toll === null ? 0 : 1)
  if (toll !== null) writeBigIntDecimal(stream, toll)
  stream.writeString(tollUnit)
  writeJson(stream, chats)
  writeSafeNumber(stream, chatTimestamp)
  // These objects carry stored retired fields as well as future optional fields.
  // Encoding their actual values preserves the hash of untouched live accounts.
  writeJson(stream, dataExtra)
  writeNullableString(stream, alias)
  stream.writeString(hash)
  writeSafeNumber(stream, lastMaintenance)
  writeSafeNumber(stream, timestamp)
  stream.writeString(publicKey)
  writeJson(stream, extra)
}

export const deserializeUserAccount = (stream: VectorBufferStream, root = false): UserAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.UserAccount) {
    throw new Error('Unexpected type identifier for UserAccount type')
  }

  const id = stream.readString()
  const type = stream.readString()
  const balance = readBigIntDecimal(stream)
  const toll = stream.readUInt8() === 0 ? null : readBigIntDecimal(stream)
  const tollUnit = stream.readString() as TollUnit
  const chats = readJson<UserAccount['data']['chats']>(stream)
  const chatTimestamp = readSafeNumber(stream)
  const dataExtra = readJson<Record<string, unknown>>(stream)
  const alias = readNullableString(stream)
  const hash = stream.readString()
  const lastMaintenance = readSafeNumber(stream)
  const timestamp = readSafeNumber(stream)
  const publicKey = stream.readString()
  const extra = readJson<Record<string, unknown>>(stream)
  return {
    id,
    type,
    data: { balance, toll, tollUnit, chats, chatTimestamp, ...dataExtra },
    alias,
    hash,
    lastMaintenance,
    timestamp,
    publicKey,
    ...extra,
  }
}
