import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { NodeAccount } from '../../../src/@types'
import { deserializeNodeAccount, nodeAccount, serializeNodeAccount } from '../../../src/accounts/nodeAccount'
import { SerdeTypeIdent } from '../../../src/accounts'
import { LiberdusFlags } from '../../../src/config'
import * as crypto from '../../../src/crypto'

const roundTrip = (input: NodeAccount): NodeAccount => {
  const stream = new VectorBufferStream(0)
  serializeNodeAccount(stream, input, true)
  stream.position = 0
  expect(stream.readUInt16()).toBe(SerdeTypeIdent.NodeAccount)
  return deserializeNodeAccount(stream)
}

describe('NodeAccount binary codec', () => {
  const originalUnusedFlag = LiberdusFlags.versionFlags.removeUnusedTxState

  beforeAll(() => {
    crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
    crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  })

  afterEach(() => {
    LiberdusFlags.versionFlags.removeUnusedTxState = originalUnusedFlag
  })

  test('round-trips large wei totals and the complete nodeAccountStats', () => {
    const input = nodeAccount('test')
    input.stakeLock = 2n ** 90n
    input.penalty = 2n ** 85n
    input.reward = 2n ** 100n
    input.rewardRate = 2n ** 75n
    input.nodeAccountStats.totalReward = 2n ** 100n
    input.nodeAccountStats.totalPenalty = 2n ** 85n
    input.nodeAccountStats.lastPenaltyTime = 1_791_304_868_693
    input.nodeAccountStats.history = [{ b: 1_791_304_868_693, e: 1_791_304_868_694 }]
    input.nodeAccountStats.penaltyHistory = [{ type: 'LeftNetworkEarly', amount: 2n ** 85n, timestamp: 1_791_304_868_693 } as never]
    expect(roundTrip(input)).toEqual(input)
  })

  test('preserves non-default stored retired fields regardless of flag settings', () => {
    LiberdusFlags.versionFlags.removeUnusedTxState = false
    const input = nodeAccount('test')
    ;(input as unknown as Record<string, unknown>).nodeRewardTime = 1_791_304_868_693
    LiberdusFlags.versionFlags.removeUnusedTxState = true
    expect(roundTrip(input)).toEqual(input)
  })
})
