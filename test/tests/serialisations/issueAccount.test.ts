import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { issueAccount, serializeIssueAccount, deserializeIssueAccount } from '../../../src/accounts/issueAccount'
import { SerdeTypeIdent } from '../../../src/accounts/index'

import { IssueAccount } from '../../../src/@types'

describe('IssueAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj: IssueAccount = issueAccount('test')

    const stream = new VectorBufferStream(0)
    serializeIssueAccount(stream, obj, true)

    stream.position = 0

    const type = stream.readUInt16()
    expect(type).toEqual(SerdeTypeIdent.IssueAccount)
    const deserialised = deserializeIssueAccount(stream)

    expect(deserialised).toEqual(obj)
    expect(Utils.safeStringify(deserialised)).toEqual(Utils.safeStringify(obj))
  })
})
