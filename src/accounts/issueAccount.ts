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
  
  if(inp.active !== null){
    stream.writeUInt8(1)
    stream.writeUInt8((inp.active === true) ? 1 : 0)
  }else{
    stream.writeUInt8(0)
  }

  if(inp.number !== null){
    stream.writeUInt8(1)
    stream.writeUInt32(inp.number)
  }else{
    stream.writeUInt8(0)
  }

  if(inp.winnerId !== null){
    stream.writeUInt8(1)
    stream.writeString(inp.winnerId)
  }else{
    stream.writeUInt8(0)
  }
  stream.writeString(inp.hash)
  stream.writeBigUInt64(BigInt(inp.timestamp))
  stream.writeUInt8(inp.tallied ? 1 : 0)
}

export const deserializeIssueAccount = (stream: VectorBufferStream, root = false): IssueAccount => {

  if(root && (stream.readUInt16() !== SerdeTypeIdent.IssueAccount)){
    throw new Error("Unexpected bufferstream for IssueAccount type");
  }

  let id = stream.readString()
  let type = stream.readString()
  let proposals = []
  for(let i = 0; i < stream.readUInt32(); i++){
    proposals.push(stream.readString())
  }
  let proposalCount = stream.readUInt32()
  let active = null
  if(stream.readUInt8() === 1){
    active = (stream.readUInt8() === 1) ? true : false
  }
  let number = null
  if(stream.readUInt8() === 1){
    number = stream.readUInt32()
  }
  let winnerId = null
  if(stream.readUInt8() === 1){
    winnerId = stream.readString()
  }
  let hash = stream.readString()
  let timestamp = Number(stream.readBigUInt64())
  let tallied = stream.readUInt8() === 1 ? true : false
  return {
    id,
    type,
    proposals,
    proposalCount,
    active,
    number,
    winnerId,
    hash,
    timestamp,
    tallied
  }
}
