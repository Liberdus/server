import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { chatAccount, serializeChatAccount, deserializeChatAccount } from '../../../src/accounts/chatAccount'
import { SerdeTypeIdent } from '../../../src/accounts/index'

import { ChatAccount, Tx } from '../../../src/@types'

// chatAccount reads only tx.from and tx.to, to decide which participant owes no toll.
const txStub = { from: 'aaaa', to: 'bbbb' } as unknown as Tx.Message

describe('ChatAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj: ChatAccount = chatAccount('test', txStub)

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
