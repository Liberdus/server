import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { deserializeAccounts, SerdeTypeIdent, serializeAccounts } from '../../../src/accounts'
import { TollUnit, UserAccount } from '../../../src/@types'

describe('UserAccount serialization dispatch', () => {
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
})
