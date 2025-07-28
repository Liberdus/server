import { VectorBufferStream } from '@shardeum-foundation/core'
import { Utils } from '@shardeum-foundation/lib-types'
import { nodeAccount, serializeNodeAccount, deserializeNodeAccount } from '../../../src/accounts/nodeAccount'
import { SerdeTypeIdent } from '../../../src/accounts/index'

import { NodeAccount } from '../../../src/@types'

describe('NodeAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj: NodeAccount = nodeAccount('test')

    const stream = new VectorBufferStream(0)
    serializeNodeAccount(stream, obj, true)

    stream.position = 0

    const type = stream.readUInt16()
    expect(type).toEqual(SerdeTypeIdent.NodeAccount)
    const deserialised = deserializeNodeAccount(stream)

    expect(deserialised).toEqual(obj)
    expect(Utils.safeStringify(deserialised)).toEqual(Utils.safeStringify(obj))
  })
})
