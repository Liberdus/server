import * as crypto from '../crypto'
import { DaoProposalsMeta } from '../@types'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import { Utils } from '@shardus/lib-types'

export const DAO_PROPOSALS_META_ID_STRING = 'dao proposals meta'

/**
 * Address of the DAO proposals meta account, derived so handlers can declare it in keys() without
 * a new tx field. Lazy rather than a module const: crypto must be initialized before hashing.
 */
export function daoProposalsMetaId(): string {
  return crypto.hash(DAO_PROPOSALS_META_ID_STRING)
}

export function daoProposalsMetaAccount(id: string): DaoProposalsMeta {
  const account: DaoProposalsMeta = {
    id,
    type: 'DaoProposalsMeta',
    count: 0,
    proposals: [],
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}

export function serializeDaoProposalsMetaAccount(stream: VectorBufferStream, inp: DaoProposalsMeta, root = false): void {
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.DaoProposalsMeta)
  }
  stream.writeString(Utils.safeStringify(inp))
}

export function deserializeDaoProposalsMetaAccount(stream: VectorBufferStream): DaoProposalsMeta {
  return Utils.safeJsonParse(stream.readString()) as DaoProposalsMeta
}
