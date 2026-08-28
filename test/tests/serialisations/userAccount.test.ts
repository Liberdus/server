import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { deserializeAccounts, SerdeTypeIdent, serializeAccounts } from '../../../src/accounts'
import { TollUnit, UserAccount } from '../../../src/@types'
import { LiberdusFlags } from '../../../src/config'
import { deserializeUserAccount, serializeUserAccount } from '../../../src/accounts/userAccount'

describe('UserAccount serialization dispatch', () => {
  const originalRemoveLegacyDaoState = LiberdusFlags.versionFlags.removeLegacyDaoState

  afterEach(() => {
    LiberdusFlags.versionFlags.removeLegacyDaoState = originalRemoveLegacyDaoState
  })

  test('uses the fallback envelope for the production type casing', () => {
    const obj: UserAccount = {
      id: 'test',
      type: 'UserAccount',
      data: { balance: 50n, stake: 0n, remove_stake_request: null, toll: 1n, tollUnit: TollUnit.lib, chats: {}, chatTimestamp: 0, friends: {} },
      alias: null,
      emailHash: null,
      verified: false,
      hash: '',
      claimedSnapshot: false,
      lastMaintenance: 0,
      timestamp: 0,
      publicKey: '',
      private: false,
    }

    const stream = serializeAccounts(obj)
    const encoded = stream.getBuffer()
    expect(VectorBufferStream.fromBuffer(encoded).readUInt16()).toEqual(SerdeTypeIdent.Fallback)
    const deserialised = deserializeAccounts(encoded)

    expect(deserialised).toEqual(obj)
    expect(Utils.safeStringify(deserialised)).toEqual(Utils.safeStringify(obj))
  })

  test('retains an empty payment slot while omitting migrated payment state', () => {
    const account = {
      id: 'test',
      type: 'UserAccount',
      data: { balance: 50n, stake: 0n, remove_stake_request: null, toll: 1n, tollUnit: TollUnit.lib, chats: {}, chatTimestamp: 0, friends: {}, payments: [] },
      alias: null,
      emailHash: null,
      verified: false,
      hash: '',
      claimedSnapshot: false,
      lastMaintenance: 0,
      timestamp: 0,
      publicKey: '',
      private: false,
    }

    const legacyStream = new VectorBufferStream(0)
    serializeUserAccount(legacyStream, account, true)
    const legacyData = deserializeUserAccount(VectorBufferStream.fromBuffer(legacyStream.getBuffer()), true).data as unknown as Record<string, unknown>
    expect(legacyData.payments).toEqual([])

    LiberdusFlags.versionFlags.removeLegacyDaoState = true
    const migrated = { ...account, data: { ...account.data } }
    delete migrated.data.payments
    const migratedStream = new VectorBufferStream(0)
    serializeUserAccount(migratedStream, migrated, true)
    const migratedData = deserializeUserAccount(VectorBufferStream.fromBuffer(migratedStream.getBuffer()), true).data as unknown as Record<string, unknown>
    expect(migratedData.payments).toBeUndefined()
  })
})
