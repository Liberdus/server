import * as crypto from '../crypto'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import { NodeAccount } from '../@types'
import { Utils } from '@shardus/lib-types'
import { LiberdusFlags } from '../config'

const populatedRetiredFieldsError = 'NodeAccount binary codec does not support populated retired fields'

// balance and nodeRewardTime were written only by the removed node_reward tx. balance is zero on live accounts, but
// nodeRewardTime may still hold an old timestamp. Normal NodeAccounts use JSON; direct binary calls reject such values.
const hasPopulatedRetiredFields = (account: NodeAccount): boolean => {
  const legacyAccount = account as NodeAccount & Record<string, unknown>
  return ('balance' in legacyAccount && legacyAccount.balance !== 0n) || ('nodeRewardTime' in legacyAccount && legacyAccount.nodeRewardTime !== 0)
}

export const nodeAccount = (accountId: string): NodeAccount => {
  // Ensure lowercase accountId
  accountId = accountId.toLowerCase()
  const account: NodeAccount = {
    id: accountId,
    type: 'NodeAccount',
    ...(LiberdusFlags.versionFlags.removeUnusedTxState ? {} : { balance: BigInt(0), nodeRewardTime: 0 }),
    hash: '',
    timestamp: 0,
    nominator: '',
    stakeLock: BigInt(0),
    stakeTimestamp: 0,
    penalty: BigInt(0),
    nodeAccountStats: {
      totalReward: BigInt(0),
      totalPenalty: BigInt(0),
      history: [],
      lastPenaltyTime: 0,
      penaltyHistory: [],
    },
    rewardStartTime: 0,
    rewardEndTime: 0,
    reward: BigInt(0),
    rewardRate: BigInt(0),
    rewarded: false,
  }
  account.hash = crypto.hashObj(account)
  return account
}

export const serializeNodeAccount = (stream: VectorBufferStream, inp: NodeAccount, root = false): void => {
  // Normal NodeAccount objects use the JSON fallback. Keep this legacy binary
  // layout for direct callers, but never discard populated retired fields.
  if (hasPopulatedRetiredFields(inp)) {
    throw new Error(populatedRetiredFieldsError)
  }
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.NodeAccount)
  }
  stream.writeString(inp.id)
  stream.writeString(inp.type)
  // Preserve the positional slots and the bytes emitted for the default retired state.
  stream.writeBigUInt64(0n) // balance
  stream.writeBigUInt64(0n) // nodeRewardTime
  stream.writeString(inp.hash)
  stream.writeBigUInt64(BigInt(inp.timestamp))
  stream.writeString(inp.nominator)
  stream.writeBigUInt64(inp.stakeLock)
  stream.writeBigUInt64(BigInt(inp.stakeTimestamp))
  stream.writeBigUInt64(inp.penalty)
  stream.writeString(Utils.safeStringify(inp.nodeAccountStats.history))
  stream.writeBigUInt64(BigInt(inp.rewardStartTime))
  stream.writeBigUInt64(BigInt(inp.rewardEndTime))
  stream.writeBigUInt64(inp.reward)
  stream.writeBigUInt64(inp.rewardRate)
  stream.writeUInt8(inp.rewarded ? 1 : 0) // Serialize boolean as UInt8
}

export const deserializeNodeAccount = (stream: VectorBufferStream, root = false): NodeAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.NodeAccount) {
    throw new Error('Unexpected bufferstream for NodeAccount type')
  }

  const id = stream.readString()
  const type = stream.readString()

  // The retired slots must contain exactly the default bytes. Populated values
  // have no lossless representation in this compatibility-only decoder.
  const balance = stream.readBigUInt64()
  const nodeRewardTime = stream.readBigUInt64()
  if (balance !== 0n || nodeRewardTime !== 0n) {
    throw new Error(populatedRetiredFieldsError)
  }

  return {
    id,
    type,
    ...(LiberdusFlags.versionFlags.removeUnusedTxState ? {} : { balance: BigInt(0), nodeRewardTime: 0 }),
    hash: stream.readString(),
    timestamp: Number(stream.readBigUInt64()),
    nominator: stream.readString(),
    stakeLock: stream.readBigUInt64(),
    stakeTimestamp: Number(stream.readBigUInt64()),
    penalty: stream.readBigUInt64(),
    nodeAccountStats: Utils.safeJsonParse(stream.readString()),
    rewardStartTime: Number(stream.readBigUInt64()),
    rewardEndTime: Number(stream.readBigUInt64()),
    reward: stream.readBigUInt64(),
    rewardRate: stream.readBigUInt64(),
    rewarded: stream.readUInt8() === 1,
  }
}
