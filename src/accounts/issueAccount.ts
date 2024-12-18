import * as crypto from '../crypto'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import {IssueAccount} from '../@types'

export const issueAccount = (accountId: string) => {
  const issue: IssueAccount = {
    id: accountId,
    type: 'IssueAccount',
    active: null,
    proposals: [],
    proposalCount: 0,
    number: null,
    winnerId: null,
    hash: '',
    timestamp: 0,
    tallied: false
  }
  issue.hash = crypto.hashObj(issue)
  return issue
}

export const serializeIssueAccount = (stream: VectorBufferStream, inp: IssueAccount, root = false) => {
  if(root){
    stream.writeUInt16(SerdeTypeIdent.IssueAccount)
  }

  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeUInt32(inp.proposals.length)

  for(let i = 0; i < inp.proposals.length; i++){
    stream.writeString(inp.proposals[i])
  }

  stream.writeUInt32(inp.proposalCount)
  
  stream.writeUInt8(inp.active ? 1 : 0)

  stream.writeUInt8(inp.number ? 1 : 0)

  if(inp.number){
    stream.writeUInt32(inp.number)
  }

  stream.writeString(inp.winnerId)
  stream.writeString(inp.hash)
  stream.writeBigUInt64(BigInt(inp.timestamp))
}

export const deserializeIssueAccount = (stream: VectorBufferStream, root = false): IssueAccount => {

  if(root && (stream.readUInt16() !== SerdeTypeIdent.IssueAccount)){
    throw new Error("Unexpected bufferstream for IssueAccount type");
  }

  return {
    id: stream.readString(),
    type: stream.readString(),
    proposals: Array.from({length: stream.readUInt32()}, () => stream.readString()),
    proposalCount: stream.readUInt32(),
    active: stream.readUInt8() === 1 ? true : false,
    number: stream.readUInt8() === 1 ? stream.readUInt32() : null,
    winnerId: stream.readString(),
    hash: stream.readString(),
    timestamp: Number(stream.readBigUInt64())
  }
}
