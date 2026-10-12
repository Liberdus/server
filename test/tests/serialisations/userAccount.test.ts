import { VectorBufferStream } from '@shardus/core'
import { TollUnit, UserAccount } from '../../../src/@types'
import { deserializeUserAccount, serializeUserAccount } from '../../../src/accounts/userAccount'
import { SerdeTypeIdent } from '../../../src/accounts'
import { LiberdusFlags } from '../../../src/config'

const account = (): UserAccount =>
  ({
    id: 'test',
    type: 'UserAccount',
    data: {
      balance: 50n * 10n ** 18n,
      toll: 16n * 10n ** 18n,
      tollUnit: TollUnit.lib,
      chats: { recipient: { receivedTimestamp: 1_791_304_868_693, chatId: 'chat' } },
      chatTimestamp: 1_791_304_868_693,
      payments: [],
      stake: 0n,
      remove_stake_request: null,
      friends: {},
    },
    alias: null,
    emailHash: null,
    verified: false,
    claimedSnapshot: false,
    hash: 'stored-hash',
    lastMaintenance: 1_791_304_868_693,
    timestamp: 1_791_304_868_693,
    publicKey: '',
    private: false,
  } as UserAccount)

const roundTrip = (input: UserAccount): UserAccount => {
  const stream = new VectorBufferStream(0)
  serializeUserAccount(stream, input, true)
  stream.position = 0
  expect(stream.readUInt16()).toBe(SerdeTypeIdent.UserAccount)
  return deserializeUserAccount(stream)
}

describe('UserAccount binary codec', () => {
  const originalFlag = LiberdusFlags.versionFlags.correctAccountSerdeLayout
  afterEach(() => {
    LiberdusFlags.versionFlags.correctAccountSerdeLayout = originalFlag
  })

  test('round-trips a live legacy shape with default retired values', () => {
    expect(roundTrip(account())).toEqual(account())
  })

  test('preserves populated retired values without consulting the activation flag', () => {
    const input = account()
    const legacy = input as UserAccount & { verified: string; emailHash: string; claimedSnapshot: boolean }
    legacy.verified = 'verification-hash'
    legacy.emailHash = 'email-hash'
    legacy.claimedSnapshot = true
    ;(input.data as Record<string, unknown>).stake = 9n
    ;(input.data as Record<string, unknown>).friends = { recipient: 'alias' }
    input.pqPublicKey = 'pq-key'
    LiberdusFlags.versionFlags.correctAccountSerdeLayout = false
    expect(roundTrip(input)).toEqual(input)
    LiberdusFlags.versionFlags.correctAccountSerdeLayout = true
    expect(roundTrip(input)).toEqual(input)
  })

  test('preserves the absence of retired fields on stripped accounts', () => {
    const input = account()
    delete (input.data as Record<string, unknown>).payments
    delete (input.data as Record<string, unknown>).stake
    delete (input.data as Record<string, unknown>).remove_stake_request
    delete (input.data as Record<string, unknown>).friends
    delete (input as unknown as Record<string, unknown>).emailHash
    delete (input as unknown as Record<string, unknown>).verified
    delete (input as unknown as Record<string, unknown>).claimedSnapshot
    delete input.private
    input.pqPublicKey = 'pq-key'
    expect(roundTrip(input)).toEqual(input)
  })

  test.each([null, 0n])('preserves toll %s and an empty alias', (toll) => {
    const input = account()
    input.data.toll = toll
    input.alias = ''
    expect(roundTrip(input)).toEqual(input)
  })
})
