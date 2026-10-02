import { Shardus, VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { fallbackDeserializer, fallbackSerializer, SerdeTypeIdent } from '../../../src/accounts/index'
import { networkAccount } from '../../../src/accounts/networkAccount'

// networkAccount reads dapp.getLatestCycles()[0].networkId; nothing else on dapp is touched.
const dappStub = { getLatestCycles: () => [{ networkId: 'test-network-id' }] } as unknown as Shardus

describe('UserAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj = networkAccount('test', 108, dappStub)

    const stream = new VectorBufferStream(0)
    fallbackSerializer(stream, obj, true)

    stream.position = 0

    const type = stream.readUInt16()
    expect(type).toEqual(SerdeTypeIdent.Fallback)
    const deserialised = fallbackDeserializer(stream)

    expect(deserialised).toEqual(obj)
    expect(Utils.safeStringify(deserialised)).toEqual(Utils.safeStringify(obj))
  })
})
