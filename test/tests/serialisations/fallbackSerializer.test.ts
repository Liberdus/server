
import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/types'
import { fallbackDeserializer, fallbackSerializer, SerdeTypeIdent } from '../../../src/accounts/index'
import { networkAccount } from '../../../src/accounts/networkAccount'



describe('UserAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj = networkAccount('test', 108)

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
