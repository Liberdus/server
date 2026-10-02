import { Shardus, VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { networkAccount, serializeNetworkAccount, deserializeNetworkAccount } from '../../../src/accounts/networkAccount'
import { SerdeTypeIdent } from '../../../src/accounts/index'

import { NetworkAccount } from '../../../src/@types'

// networkAccount reads dapp.getLatestCycles()[0].networkId; nothing else on dapp is touched.
const dappStub = { getLatestCycles: () => [{ networkId: 'test-network-id' }] } as unknown as Shardus

describe('NetworkAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj: NetworkAccount = networkAccount('test', 0, dappStub)

    const stream = new VectorBufferStream(0)
    serializeNetworkAccount(stream, obj, true)

    stream.position = 0

    const type = stream.readUInt16()
    expect(type).toEqual(SerdeTypeIdent.NetworkAccount)
    const deserialised = deserializeNetworkAccount(stream)

    expect(deserialised).toEqual(obj)
    expect(Utils.safeStringify(deserialised)).toEqual(Utils.safeStringify(obj))
  })
})
