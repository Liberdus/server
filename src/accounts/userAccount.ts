import { TollUnit, UserAccount } from '../@types'
import { VectorBufferStream } from '@shardus/core'
import * as crypto from '@shardus/lib-crypto-utils'
import { SerdeTypeIdent } from '.'
import * as utils from '../utils'
import * as AccountsStorage from '../storage/accountStorage'
import { INITIAL_PARAMETERS, LiberdusFlags } from '../config'

export const userAccount = (accountId: string, timestamp: number): UserAccount => {
  // Ensure lowercase accountId
  accountId = accountId.toLowerCase()
  const account: UserAccount = {
    id: accountId,
    type: 'UserAccount',
    data: {
      balance: utils.libToWei(50),
      toll: AccountsStorage.cachedNetworkAccount ? utils.getDefaultTollWei(AccountsStorage.cachedNetworkAccount) : INITIAL_PARAMETERS.defaultToll,
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
  // Normal UserAccount objects use the JSON fallback. Keep this legacy binary
  // layout for direct callers, but never discard populated retired fields.
  const legacyAccount = inp as UserAccount & Record<string, unknown>
  const legacyData = inp.data as Record<string, unknown>
  if (
    ('friends' in legacyData &&
      (legacyData.friends == null ||
        typeof legacyData.friends !== 'object' ||
        Array.isArray(legacyData.friends) ||
        Object.keys(legacyData.friends).length !== 0)) ||
    ('stake' in legacyData && legacyData.stake !== 0n) ||
    ('remove_stake_request' in legacyData && legacyData.remove_stake_request !== null) ||
    ('emailHash' in legacyAccount && legacyAccount.emailHash !== null) ||
    ('verified' in legacyAccount && legacyAccount.verified !== false) ||
    ('claimedSnapshot' in legacyAccount && legacyAccount.claimedSnapshot !== false)
  ) {
    throw new Error('UserAccount binary codec does not support populated retired fields')
  }
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.UserAccount)
  }

  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeBigUInt64(inp.data.balance)

  stream.writeUInt8(inp.data.toll ? 1 : 0)

  if (inp.data.toll) {
    stream.writeBigInt64(inp.data.toll)
  }
  // serialize tollUnit
  stream.writeString(inp.data.tollUnit)

  stream.writeUInt32(Object.keys(inp.data.chats).length)
  for (const key in inp.data.chats) {
    stream.writeString(key)
    const chatObject = inp.data.chats[key]
    stream.writeUInt32(chatObject.receivedTimestamp)
    stream.writeString(chatObject.chatId)
  }
  stream.writeUInt32(inp.data.chatTimestamp)

  // Preserve positional slots and the bytes emitted for default legacy state.
  stream.writeUInt32(0) // friends
  stream.writeUInt8(1) // stake present
  stream.writeBigUInt64(0n)
  stream.writeUInt8(0) // remove_stake_request absent

  // Legacy user accounts contain only an empty payments array. Preserve its
  // positional slot without retaining the retired payment type or serializer.
  stream.writeUInt32(0)

  stream.writeUInt8(inp.alias ? 1 : 0)
  if (inp.alias) {
    stream.writeString(inp.alias)
  }
  stream.writeUInt8(0) // emailHash absent
  stream.writeUInt8(0) // verified false
  stream.writeUInt32(inp.lastMaintenance)
  stream.writeUInt8(0) // claimedSnapshot false
  stream.writeUInt32(inp.timestamp)
  stream.writeString(inp.hash)
  stream.writeString(inp.publicKey)
  stream.writeUInt8(inp.private ? 1 : 0)
}

export const deserializeUserAccount = (stream: VectorBufferStream, root = false): UserAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.UserAccount) {
    throw new Error('Unexpected type identifier for UserAccount type')
  }

  const id = stream.readString()
  const type = stream.readString()

  // Deserialize 'data'
  const balance = stream.readBigUInt64()

  // Optional toll
  let toll = null
  if (stream.readUInt8() === 1) {
    toll = stream.readBigInt64()
  }
  // Deserialize tollUnit
  const tollUnit = stream.readString() as TollUnit

  // Deserialize chats
  const chats = {} as UserAccount['data']['chats']
  const chatCount = stream.readUInt32()
  for (let i = 0; i < chatCount; i++) {
    const key = stream.readString()
    const receivedTimestamp = stream.readUInt32()
    const chatId = stream.readString()
    // eslint-disable-next-line security/detect-object-injection
    chats[key] = {
      receivedTimestamp,
      chatId,
    }
  }

  // Deserialize chatTimestamp
  const chatTimestamp = stream.readUInt32()

  // The retired slots must contain exactly the default bytes. Populated values
  // have no lossless representation in this compatibility-only decoder.
  if (stream.readUInt32() !== 0 || stream.readUInt8() !== 1 || stream.readBigUInt64() !== 0n || stream.readUInt8() !== 0) {
    throw new Error('UserAccount binary codec does not support populated retired fields')
  }

  // The migrated state contains only an empty payment slot. Consume its length to
  // preserve the positional layout without restoring the retired payment decoder.
  const paymentsLength = stream.readUInt32()
  if (paymentsLength !== 0) {
    throw new Error('Legacy user-account payments are not supported')
  }

  // Optional alias
  let alias = null
  if (stream.readUInt8() === 1) {
    alias = stream.readString()
  }

  if (stream.readUInt8() !== 0 || stream.readUInt8() !== 0) {
    throw new Error('UserAccount binary codec does not support populated retired fields')
  }

  // Deserialize lastMaintenance
  const lastMaintenance = stream.readUInt32()

  if (stream.readUInt8() !== 0) {
    throw new Error('UserAccount binary codec does not support populated retired fields')
  }

  // Deserialize timestamp
  const timestamp = stream.readUInt32()

  // Deserialize hash
  const hash = stream.readString()
  const publicKey = stream.readString()

  let isPrivate = false
  try {
    if (stream.position < stream.getBufferLength()) {
      isPrivate = stream.readUInt8() === 1
    }
  } catch (e) {
    // ignore
  }

  return {
    id,
    type,
    data: {
      balance,
      toll,
      tollUnit,
      chats,
      chatTimestamp,
      ...(LiberdusFlags.versionFlags.removeLegacyDaoState ? {} : { payments: [] }),
      ...(LiberdusFlags.versionFlags.removeUnusedTxState ? {} : { stake: BigInt(0), remove_stake_request: null, friends: {} }),
    },
    alias,
    ...(LiberdusFlags.versionFlags.removeUnusedTxState ? {} : { emailHash: null, verified: false, claimedSnapshot: false }),
    hash,
    lastMaintenance,
    timestamp,
    publicKey,
    private: isPrivate,
  }
}
