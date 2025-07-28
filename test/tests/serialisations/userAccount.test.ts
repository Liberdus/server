import { VectorBufferStream } from '@shardeum-foundation/core'
import { Utils } from '@shardeum-foundation/lib-types'
import { userAccount, serializeUserAccount, deserializeUserAccount } from '../../../src/accounts/userAccount'
import { SerdeTypeIdent } from '../../../src/accounts/index'

import { UserAccount } from '../../../src/@types'

describe('UserAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj: UserAccount = userAccount('test', 0)

    const stream = new VectorBufferStream(0)
    serializeUserAccount(stream, obj, true)

    stream.position = 0

    const type = stream.readUInt16()
    expect(type).toEqual(SerdeTypeIdent.UserAccount)
    const deserialised = deserializeUserAccount(stream)

    expect(deserialised).toEqual(obj)
    expect(Utils.safeStringify(deserialised)).toEqual(Utils.safeStringify(obj))
  })
})
