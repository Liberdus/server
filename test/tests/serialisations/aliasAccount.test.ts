import { VectorBufferStream } from '@shardeum-foundation/core'
import { Utils } from '@shardus/types'
import { aliasAccount, serializeAliasAccount, deserializeAliasAccount } from '../../../src/accounts/aliasAccount'
import { SerdeTypeIdent } from '../../../src/accounts/index'

import { AliasAccount } from '../../../src/@types'

describe('AliasAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj: AliasAccount = aliasAccount('test')

    const stream = new VectorBufferStream(0)
    serializeAliasAccount(stream, obj, true)

    stream.position = 0

    const type = stream.readUInt16()
    expect(type).toEqual(SerdeTypeIdent.AliasAccount)
    const deserialised = deserializeAliasAccount(stream)

    expect(deserialised).toEqual(obj)
    expect(Utils.safeStringify(deserialised)).toEqual(Utils.safeStringify(obj))
  })
})
