import { VectorBufferStream } from '@shardeum-foundation/core'
import { Utils } from '@shardus/types'
import { devIssueAccount, serializeDevIssueAccount, deserializeDevIssueAccount } from '../../../src/accounts/devIssueAccount'
import { SerdeTypeIdent } from '../../../src/accounts/index'

import { DevIssueAccount } from '../../../src/@types'

describe('DevIssueAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj: DevIssueAccount = devIssueAccount('test')

    const stream = new VectorBufferStream(0)
    serializeDevIssueAccount(stream, obj, true)

    stream.position = 0

    const type = stream.readUInt16()
    expect(type).toEqual(SerdeTypeIdent.DevIssueAccount)
    const deserialised = deserializeDevIssueAccount(stream)

    expect(deserialised).toEqual(obj)
    expect(Utils.safeStringify(deserialised)).toEqual(Utils.safeStringify(obj))
  })
})
