
import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/types'
import { devProposalAccount, serializeDevProposalAccount, deserializeDevProposalAccount } from '../../../src/accounts/devProposalAccount'
import { SerdeTypeIdent } from '../../../src/accounts/index'

import { DevProposalAccount } from '../../../src/@types'


describe('DevPropsoalAccount Serialization', () => {
  test('should serialize with root true', () => {
    const obj: DevProposalAccount = devProposalAccount('test')

    const stream = new VectorBufferStream(0)
    serializeDevProposalAccount(stream, obj, true)

    stream.position = 0

    const type = stream.readUInt16()
    expect(type).toEqual(SerdeTypeIdent.DevProposalAccount)
    const deserialised = deserializeDevProposalAccount(stream)

    expect(deserialised).toEqual(obj)
    expect(Utils.safeStringify(deserialised)).toEqual(Utils.safeStringify(obj))
  })
})

