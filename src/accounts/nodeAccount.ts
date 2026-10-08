import * as crypto from '../crypto'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import { NodeAccount } from '../@types'
import { LiberdusFlags } from '../config'
import { readBigIntDecimal, readJson, readSafeNumber, writeBigIntDecimal, writeJson, writeSafeNumber } from '../utils/binaryFields'

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
  if (root) stream.writeUInt16(SerdeTypeIdent.NodeAccount)
  const {
    id,
    type,
    hash,
    timestamp,
    nominator,
    stakeLock,
    stakeTimestamp,
    penalty,
    nodeAccountStats,
    rewardStartTime,
    rewardEndTime,
    reward,
    rewardRate,
    rewarded,
    ...extra
  } = inp
  stream.writeString(id)
  stream.writeString(type)
  stream.writeString(hash)
  writeSafeNumber(stream, timestamp)
  stream.writeString(nominator)
  writeBigIntDecimal(stream, stakeLock)
  writeSafeNumber(stream, stakeTimestamp)
  writeBigIntDecimal(stream, penalty)
  writeJson(stream, nodeAccountStats)
  writeSafeNumber(stream, rewardStartTime)
  writeSafeNumber(stream, rewardEndTime)
  writeBigIntDecimal(stream, reward)
  writeBigIntDecimal(stream, rewardRate)
  stream.writeUInt8(rewarded ? 1 : 0)
  // Includes stored balance and nodeRewardTime when present on an untouched account.
  writeJson(stream, extra)
}

export const deserializeNodeAccount = (stream: VectorBufferStream, root = false): NodeAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.NodeAccount) {
    throw new Error('Unexpected bufferstream for NodeAccount type')
  }

  const id = stream.readString()
  const type = stream.readString()
  const hash = stream.readString()
  const timestamp = readSafeNumber(stream)
  const nominator = stream.readString()
  const stakeLock = readBigIntDecimal(stream)
  const stakeTimestamp = readSafeNumber(stream)
  const penalty = readBigIntDecimal(stream)
  const nodeAccountStats = readJson<NodeAccount['nodeAccountStats']>(stream)
  const rewardStartTime = readSafeNumber(stream)
  const rewardEndTime = readSafeNumber(stream)
  const reward = readBigIntDecimal(stream)
  const rewardRate = readBigIntDecimal(stream)
  const rewarded = stream.readUInt8() === 1
  const extra = readJson<Record<string, unknown>>(stream)
  return {
    id,
    type,
    hash,
    timestamp,
    nominator,
    stakeLock,
    stakeTimestamp,
    penalty,
    nodeAccountStats,
    rewardStartTime,
    rewardEndTime,
    reward,
    rewardRate,
    rewarded,
    ...extra,
  }
}
