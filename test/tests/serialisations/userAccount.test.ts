import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { deserializeAccounts, SerdeTypeIdent, serializeAccounts } from '../../../src/accounts'
import { TollUnit, UserAccount } from '../../../src/@types'
import { LiberdusFlags } from '../../../src/config'
import { deserializeUserAccount, serializeUserAccount } from '../../../src/accounts/userAccount'
import { deserializeAppData, serializeAppData } from '../../../src/accounts/appDataSerialization'

// Captured from the pre-removal serializer for a default UserAccount.
const defaultAccountHex =
  '090004000000746573740b000000557365724163636f756e743200000000000000010100000000000000030000004c49420000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000'

const strippedAccount = (): UserAccount => ({
  id: 'test',
  type: 'UserAccount',
  data: { balance: 50n, toll: 1n, tollUnit: TollUnit.lib, chats: {}, chatTimestamp: 0 },
  alias: null,
  hash: '',
  lastMaintenance: 0,
  timestamp: 0,
  publicKey: '',
  private: false,
})

const defaultLegacyAccount = (): UserAccount =>
  ({
    ...strippedAccount(),
    data: { ...strippedAccount().data, stake: 0n, remove_stake_request: null, friends: {}, payments: [] },
    emailHash: null,
    verified: false,
    claimedSnapshot: false,
  } as UserAccount)

const encodeDirect = (account: UserAccount): Buffer => {
  const stream = new VectorBufferStream(0)
  serializeUserAccount(stream, account, true)
  return stream.getBuffer()
}

describe('UserAccount serialization dispatch', () => {
  const originalDaoFlag = LiberdusFlags.versionFlags.removeLegacyDaoState
  const originalUnusedFlag = LiberdusFlags.versionFlags.removeUnusedTxState

  afterEach(() => {
    LiberdusFlags.versionFlags.removeLegacyDaoState = originalDaoFlag
    LiberdusFlags.versionFlags.removeUnusedTxState = originalUnusedFlag
  })

  test('production PascalCase accounts use JSON and preserve both account shapes', () => {
    const legacy = {
      ...defaultLegacyAccount(),
      data: { ...defaultLegacyAccount().data, friends: { recipient: 'alias' }, stake: 5n },
      emailHash: 'email-hash',
      verified: 'verification-code-hash',
    } as UserAccount
    const modern = strippedAccount()
    for (const account of [legacy, modern]) {
      const encoded = serializeAccounts(account).getBuffer()
      expect(VectorBufferStream.fromBuffer(encoded).readUInt16()).toEqual(SerdeTypeIdent.Fallback)
      expect(deserializeAccounts(encoded)).toEqual(account)
      expect(Utils.safeStringify(deserializeAccounts(encoded))).toEqual(Utils.safeStringify(account))
    }
  })

  test('default binary slots match the pre-removal bytes with either flag setting', () => {
    for (const active of [false, true]) {
      LiberdusFlags.versionFlags.removeUnusedTxState = active
      LiberdusFlags.versionFlags.removeLegacyDaoState = active
      const input = active ? strippedAccount() : defaultLegacyAccount()
      const encoded = encodeDirect(input)
      expect(encoded.toString('hex')).toBe(defaultAccountHex)
      const decoded = deserializeUserAccount(VectorBufferStream.fromBuffer(encoded), true)
      expect(decoded).toEqual(input)
    }
  })

  test('decoding a stripped binary account before activation reconstructs defaults', () => {
    LiberdusFlags.versionFlags.removeUnusedTxState = false
    LiberdusFlags.versionFlags.removeLegacyDaoState = false
    const decoded = deserializeUserAccount(VectorBufferStream.fromBuffer(encodeDirect(strippedAccount())), true)
    expect(decoded).toEqual(defaultLegacyAccount())
  })

  test('Shardus AppData serialization falls back to JSON for populated legacy binary fields', () => {
    const base = defaultLegacyAccount()
    const account = { ...base, type: 'userAccount', data: { ...base.data, friends: { recipient: 'alias' } } } as UserAccount
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const encoded = serializeAppData('AppData', account)
      expect(encoded.toString('utf8')).toBe(Utils.safeStringify(account))
      expect(deserializeAppData('AppData', encoded)).toEqual(account)
      expect(warning).toHaveBeenNthCalledWith(1, 'AppData binary serialization failed; using JSON fallback', expect.any(Error))
      expect(warning).toHaveBeenNthCalledWith(2, 'AppData binary deserialization failed; using JSON fallback', expect.any(Error))
    } finally {
      warning.mockRestore()
    }
  })

  test.each([
    ['friends', { data: { friends: { recipient: 'alias' } } }],
    ['stake', { data: { stake: 5n } }],
    ['remove_stake_request', { data: { remove_stake_request: 1 } }],
    ['emailHash', { emailHash: 'hash' }],
    ['verified', { verified: 'hash' }],
    ['claimedSnapshot', { claimedSnapshot: true }],
  ])('binary encoder rejects populated %s', (_name, change) => {
    const base = defaultLegacyAccount()
    const account = { ...base, ...change, data: { ...base.data, ...(change as { data?: object }).data } } as UserAccount
    expect(() => encodeDirect(account)).toThrow('populated retired fields')
    expect(() => serializeAccounts({ ...account, type: 'userAccount' })).toThrow('populated retired fields')
    // The production PascalCase path remains lossless through JSON.
    expect(deserializeAccounts(serializeAccounts(account).getBuffer())).toEqual(account)
  })

  test('binary decoder rejects a populated retired slot', () => {
    const encoded = Buffer.from(defaultAccountHex, 'hex')
    const stream = VectorBufferStream.fromBuffer(encoded)
    stream.readUInt16()
    stream.readString()
    stream.readString()
    stream.readBigUInt64()
    if (stream.readUInt8() === 1) stream.readBigInt64()
    stream.readString()
    expect(stream.readUInt32()).toBe(0) // chats
    stream.readUInt32() // chatTimestamp
    encoded.writeUInt32LE(1, stream.position) // friends count
    expect(() => deserializeUserAccount(VectorBufferStream.fromBuffer(encoded), true)).toThrow('populated retired fields')
  })
})
