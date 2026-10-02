import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { nodeAccount, serializeNodeAccount, deserializeNodeAccount } from '../../../src/accounts/nodeAccount'
import { deserializeAccounts, SerdeTypeIdent, serializeAccounts } from '../../../src/accounts/index'
import { LiberdusFlags } from '../../../src/config'
import * as crypto from '../../../src/crypto'

import { NodeAccount } from '../../../src/@types'

// Captured from the pre-removal serializer for a default NodeAccount.
const defaultAccountHex =
  '070004000000746573740b0000004e6f64654163636f756e740000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000005b5d000000000000000000000000000000000000000000000000000000000000000000'

const strippedAccount = (): NodeAccount => ({
  id: 'test',
  type: 'NodeAccount',
  hash: '',
  timestamp: 0,
  nominator: '',
  stakeLock: 0n,
  stakeTimestamp: 0,
  penalty: 0n,
  nodeAccountStats: { totalReward: 0n, totalPenalty: 0n, history: [], lastPenaltyTime: 0, penaltyHistory: [] },
  rewardStartTime: 0,
  rewardEndTime: 0,
  reward: 0n,
  rewardRate: 0n,
  rewarded: false,
})

const legacyAccount = (): NodeAccount => ({ ...strippedAccount(), balance: 0n, nodeRewardTime: 0 } as NodeAccount)

const encode = (account: NodeAccount): Buffer => {
  const stream = new VectorBufferStream(0)
  serializeNodeAccount(stream, account, true)
  return stream.getBuffer()
}

const decode = (buffer: Buffer): NodeAccount => deserializeNodeAccount(VectorBufferStream.fromBuffer(buffer), true)

describe('NodeAccount Serialization', () => {
  const originalFlag = LiberdusFlags.versionFlags.removeUnusedTxState

  beforeAll(() => {
    crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
    crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  })

  afterEach(() => {
    LiberdusFlags.versionFlags.removeUnusedTxState = originalFlag
  })

  test('should serialize with root true', () => {
    LiberdusFlags.versionFlags.removeUnusedTxState = false
    const obj: NodeAccount = nodeAccount('test')

    const stream = new VectorBufferStream(0)
    serializeNodeAccount(stream, obj, true)

    stream.position = 0

    const type = stream.readUInt16()
    expect(type).toEqual(SerdeTypeIdent.NodeAccount)
    const deserialised = deserializeNodeAccount(stream)

    // The codec carries nodeAccountStats.history only (pre-existing layout), so compare the rest.
    expect({ ...deserialised, nodeAccountStats: obj.nodeAccountStats }).toEqual(obj)
  })

  test('production PascalCase accounts use JSON and preserve both account shapes', () => {
    const legacy = { ...legacyAccount(), nodeRewardTime: 1_700_000_000_000 } as NodeAccount
    for (const account of [legacy, strippedAccount()]) {
      const encoded = serializeAccounts(account).getBuffer()
      expect(VectorBufferStream.fromBuffer(encoded).readUInt16()).toEqual(SerdeTypeIdent.Fallback)
      expect(deserializeAccounts(encoded)).toEqual(account)
    }
  })

  test('default retired slots match the pre-removal bytes with either flag setting', () => {
    for (const active of [false, true]) {
      LiberdusFlags.versionFlags.removeUnusedTxState = active
      const input = active ? strippedAccount() : legacyAccount()
      const encoded = encode(input)
      expect(encoded.toString('hex')).toBe(defaultAccountHex)
      expect(Object.prototype.hasOwnProperty.call(decode(encoded), 'balance')).toBe(!active)
      expect(Object.prototype.hasOwnProperty.call(decode(encoded), 'nodeRewardTime')).toBe(!active)
    }
  })

  test.each([
    ['balance', { balance: 5n }],
    ['nodeRewardTime', { nodeRewardTime: 1 }],
  ])('binary encoder rejects populated %s', (_name, change) => {
    expect(() => encode({ ...legacyAccount(), ...change } as NodeAccount)).toThrow('populated retired fields')
  })

  test('binary decoder rejects a populated retired slot', () => {
    const encoded = Buffer.from(defaultAccountHex, 'hex')
    const stream = VectorBufferStream.fromBuffer(encoded)
    stream.readUInt16()
    stream.readString()
    stream.readString()
    encoded.writeBigUInt64LE(5n, stream.position) // balance
    expect(() => decode(encoded)).toThrow('populated retired fields')
  })
})
