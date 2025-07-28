import { VectorBufferStream } from '@shardeum-foundation/core'
import { Utils } from '@shardeum-foundation/lib-types'
import { chatAccount, serializeChatAccount, deserializeChatAccount } from '../../../src/accounts/chatAccount'
import { SerdeTypeIdent } from '../../../src/accounts/index'

import { ChatAccount } from '../../../src/@types'

describe('ChatAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj: ChatAccount = chatAccount('test')

    const stream = new VectorBufferStream(0)
    serializeChatAccount(stream, obj, true)

    stream.position = 0

    const type = stream.readUInt16()
    expect(type).toEqual(SerdeTypeIdent.ChatAccount)
    const deserialised = deserializeChatAccount(stream)

    expect(deserialised).toEqual(obj)
    expect(Utils.safeStringify(deserialised)).toEqual(Utils.safeStringify(obj))
  })
})
