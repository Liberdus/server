import * as crypto from '../crypto'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import { DevIssueAccount } from '../@types'

export const devIssueAccount = (accountId: string): DevIssueAccount => {
  // Ensure lowercase accountId
  accountId = accountId.toLowerCase()
  const devIssue: DevIssueAccount = {
    id: accountId,
    type: 'DevIssueAccount',
    devProposals: [],
    devProposalCount: 0,
    winners: [],
    hash: '',
    active: null,
    number: null,
    timestamp: 0,
    tallied: false,
  }
  devIssue.hash = crypto.hashObj(devIssue)
  return devIssue
}

export const serializeDevIssueAccount = (stream: VectorBufferStream, inp: DevIssueAccount, root = false): void => {
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.DevIssueAccount)
  }

  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeUInt32(inp.devProposals.length)

  for (let i = 0; i < inp.devProposals.length; i++) {
    stream.writeString(inp.devProposals[i])
  }

  stream.writeUInt32(inp.devProposalCount)

  stream.writeUInt32(inp.winners.length)

  for (let i = 0; i < inp.winners.length; i++) {
    stream.writeString(inp.winners[i])
  }

  if (inp.active !== null) {
    stream.writeUInt8(1)
    stream.writeUInt8(inp.active === true ? 1 : 0)
  } else {
    stream.writeUInt8(0)
  }

  if (inp.number !== null) {
    stream.writeUInt8(1)
    stream.writeUInt32(inp.number)
  } else {
    stream.writeUInt8(0)
  }

  stream.writeString(inp.hash)
  stream.writeBigUInt64(BigInt(inp.timestamp))
  stream.writeUInt8(inp.tallied ? 1 : 0)
}

export const deserializeDevIssueAccount = (stream: VectorBufferStream, root = false): DevIssueAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.DevIssueAccount) {
    throw new Error('Unexpected bufferstream for DevIssueAccount type')
  }

  const id = stream.readString()
  const type = stream.readString()
  const devProposals = []

  for (let i = 0; i < stream.readUInt32(); i++) {
    devProposals.push(stream.readString())
  }

  const devProposalCount = stream.readUInt32()

  const winners = []

  for (let i = 0; i < stream.readUInt32(); i++) {
    winners.push(stream.readString())
  }

  let active = null
  if (stream.readUInt8() === 1) {
    active = stream.readUInt8() === 1 ? true : false
  }

  let number = null
  if (stream.readUInt8() === 1) {
    number = stream.readUInt32()
  }

  const hash = stream.readString()
  const timestamp = Number(stream.readBigUInt64())
  const tallied = stream.readUInt8() === 1 ? true : false

  return {
    id,
    type,
    devProposals,
    devProposalCount,
    winners,
    active,
    number,
    hash,
    timestamp,
    tallied,
  }
}
