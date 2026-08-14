import * as crypto from '../crypto'
import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { SerdeTypeIdent } from '.'
import { GroupAccount, Tx } from '../@types'

/**
 * Creates the account backing one MLS group.
 *
 * The founder is the sole member at epoch 0; everyone else arrives via
 * group_commit, which is fenced on `epoch` so only one commit can land per
 * epoch regardless of how many admins act at once.
 */
export const groupAccount = (accountId: string, tx: Tx.GroupCreate, timestamp: number): GroupAccount => {
  // Ensure lowercase accountId
  accountId = accountId.toLowerCase()
  const from = tx.from.toLowerCase()

  const group: GroupAccount = {
    id: accountId,
    type: 'GroupAccount',
    hash: '',
    timestamp: 0,

    mlsGroupId: tx.mlsGroupId,
    cipherSuite: tx.cipherSuite,
    epoch: 0,

    members: [from],
    admins: [from],
    memberSince: { [from]: { epoch: 0, timestamp } },

    messages: [],
    handshakes: [],
    pendingWelcomes: {},

    checkpoint: null,

    meta: tx.meta,
    maxMembers: tx.maxMembers,
    lastMessageAt: {},
    createdBy: from,
    hasChats: false,
  }

  group.hash = crypto.hashObj(group)
  return group
}

/**
 * The variable-length, deeply nested parts (transcript, welcomes, checkpoint)
 * are written as JSON rather than field-by-field. They are already opaque
 * base64 blobs whose shape is driven by the client's MLS stack, so a bespoke
 * binary layout would buy little and would need a migration every time the
 * envelope changes.
 */
export const serializeGroupAccount = (stream: VectorBufferStream, inp: GroupAccount, root = false): void => {
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.GroupAccount)
  }

  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeString(inp.hash)
  stream.writeBigUInt64(BigInt(inp.timestamp))

  stream.writeString(inp.mlsGroupId)
  stream.writeUInt16(inp.cipherSuite)
  stream.writeUInt32(inp.epoch)

  stream.writeUInt32(inp.members.length)
  for (const member of inp.members) {
    stream.writeString(member)
  }

  stream.writeUInt32(inp.admins.length)
  for (const admin of inp.admins) {
    stream.writeString(admin)
  }

  stream.writeString(Utils.safeStringify(inp.memberSince))
  stream.writeString(Utils.safeStringify(inp.messages))
  stream.writeString(Utils.safeStringify(inp.handshakes))
  stream.writeString(Utils.safeStringify(inp.pendingWelcomes))
  stream.writeString(Utils.safeStringify(inp.checkpoint))
  stream.writeString(Utils.safeStringify(inp.lastMessageAt))

  stream.writeString(inp.meta)
  stream.writeUInt32(inp.maxMembers)
  stream.writeString(inp.createdBy)
  stream.writeUInt8(inp.hasChats ? 1 : 0)
}

export const deserializeGroupAccount = (stream: VectorBufferStream, root = false): GroupAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.GroupAccount) {
    throw new Error('Unexpected bufferstream for GroupAccount type')
  }

  const id = stream.readString()
  const type = stream.readString()
  const hash = stream.readString()
  const timestamp = Number(stream.readBigUInt64())

  const mlsGroupId = stream.readString()
  const cipherSuite = stream.readUInt16()
  const epoch = stream.readUInt32()

  const members: string[] = []
  const memberCount = stream.readUInt32()
  for (let i = 0; i < memberCount; i++) {
    members.push(stream.readString())
  }

  const admins: string[] = []
  const adminCount = stream.readUInt32()
  for (let i = 0; i < adminCount; i++) {
    admins.push(stream.readString())
  }

  const memberSince = Utils.safeJsonParse(stream.readString())
  const messages = Utils.safeJsonParse(stream.readString())
  const handshakes = Utils.safeJsonParse(stream.readString())
  const pendingWelcomes = Utils.safeJsonParse(stream.readString())
  const checkpoint = Utils.safeJsonParse(stream.readString())
  const lastMessageAt = Utils.safeJsonParse(stream.readString())

  const meta = stream.readString()
  const maxMembers = stream.readUInt32()
  const createdBy = stream.readString()
  const hasChats = stream.readUInt8() === 1

  return {
    id,
    type,
    hash,
    timestamp,
    mlsGroupId,
    cipherSuite,
    epoch,
    members,
    admins,
    memberSince,
    messages,
    handshakes,
    pendingWelcomes,
    checkpoint,
    meta,
    maxMembers,
    lastMessageAt,
    createdBy,
    hasChats,
  }
}
