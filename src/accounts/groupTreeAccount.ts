import * as crypto from '../crypto'
import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { SerdeTypeIdent } from '.'
import { GroupTreeAccount } from '../@types'

/**
 * The cold half of a group.
 *
 * group_message names only the GroupAccount in keys(), so everything stored
 * there is transferred to the consensus group and re-hashed on every message.
 * The ratchet tree (~112 kB at 32 members) and the unbounded commit transcript
 * are needed only by group_commit, so they live here instead.
 *
 * Created alongside the GroupAccount by group_create, at the deterministic
 * address utils.calculateGroupTreeId(groupId).
 */
export const groupTreeAccount = (accountId: string, groupId: string): GroupTreeAccount => {
  const account: GroupTreeAccount = {
    id: accountId.toLowerCase(),
    type: 'GroupTreeAccount',
    hash: '',
    // Shardus requires a new account to start at timestamp 0; the applying
    // transaction sets the real one.
    timestamp: 0,

    groupId: groupId.toLowerCase(),

    ratchetTree: '',
    treeEpoch: 0,

    handshakes: [],
    pendingWelcomes: {},
    welcomeTrees: {},
    pendingJoinRequests: {},
    vestedFees: [],
    checkpoint: null,
  }

  account.hash = crypto.hashObj(account)
  return account
}

/**
 * The variable-length parts are written as JSON rather than field-by-field, for
 * the same reason as GroupAccount: they are opaque base64 blobs whose shape is
 * driven by the client's MLS stack.
 */
export const serializeGroupTreeAccount = (stream: VectorBufferStream, inp: GroupTreeAccount, root = false): void => {
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.GroupTreeAccount)
  }

  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeString(inp.hash)
  stream.writeBigUInt64(BigInt(inp.timestamp))

  stream.writeString(inp.groupId)
  stream.writeString(inp.ratchetTree)
  stream.writeUInt32(inp.treeEpoch)

  stream.writeString(Utils.safeStringify(inp.handshakes))
  stream.writeString(Utils.safeStringify(inp.pendingWelcomes))
  stream.writeString(Utils.safeStringify(inp.welcomeTrees))
  stream.writeString(Utils.safeStringify(inp.pendingJoinRequests))
  stream.writeString(Utils.safeStringify(inp.vestedFees))
  stream.writeString(Utils.safeStringify(inp.checkpoint))
}

export const deserializeGroupTreeAccount = (stream: VectorBufferStream, root = false): GroupTreeAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.GroupTreeAccount) {
    throw new Error('Unexpected bufferstream for GroupTreeAccount type')
  }

  const id = stream.readString()
  const type = stream.readString()
  const hash = stream.readString()
  const timestamp = Number(stream.readBigUInt64())

  const groupId = stream.readString()
  const ratchetTree = stream.readString()
  const treeEpoch = stream.readUInt32()

  const handshakes = Utils.safeJsonParse(stream.readString())
  const pendingWelcomes = Utils.safeJsonParse(stream.readString())
  const welcomeTrees = Utils.safeJsonParse(stream.readString())
  const pendingJoinRequests = Utils.safeJsonParse(stream.readString())
  const vestedFees = Utils.safeJsonParse(stream.readString())
  const checkpoint = Utils.safeJsonParse(stream.readString())

  return {
    id,
    type,
    hash,
    timestamp,
    groupId,
    ratchetTree,
    treeEpoch,
    handshakes,
    pendingWelcomes,
    welcomeTrees,
    pendingJoinRequests,
    vestedFees,
    checkpoint,
  }
}
