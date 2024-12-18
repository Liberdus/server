import * as crypto from '../crypto'
import { VectorBufferStream } from '@shardus/core'
import { deserializeDeveloperPayment, SerdeTypeIdent, serializeDeveloperPayment } from '.'
import {DevProposalAccount} from '../@types'

export const devProposalAccount = (accountId: string) => {
  const devProposal: DevProposalAccount = {
    id: accountId,
    type: 'DevProposalAccount',
    title: null,
    description: null,
    approve: BigInt(0),
    reject: BigInt(0),
    totalVotes: 0,
    totalAmount: null,
    payAddress: '',
    payments: [],
    approved: null,
    number: null,
    hash: '',
    timestamp: 0,
  }
  devProposal.hash = crypto.hashObj(devProposal)
  return devProposal

}

export const serializeDevProposalAccount = (stream: VectorBufferStream, inp: DevProposalAccount, root = false) => {
  if(root){
    stream.writeUInt16(SerdeTypeIdent.DevProposalAccount)
  }

  stream.writeString(inp.id)
  stream.writeString(inp.type)

  stream.writeUInt8(inp.title ? 1 : 0)
  if(inp.title){
    stream.writeString(inp.title)
  }

  stream.writeUInt8(inp.description ? 1 : 0)
  if(inp.description){
    stream.writeString(inp.description)
  }

  stream.writeUInt32(inp.totalVotes)

  stream.writeUInt8(inp.totalAmount ? 1 : 0)
  if(inp.totalAmount){
    stream.writeUInt32(inp.totalAmount)
  }

  stream.writeString(inp.payAddress)

  stream.writeUInt32(inp.payments.length)
  for(let i = 0; i < inp.payments.length; i++){
    serializeDeveloperPayment(stream, inp.payments[i])
  }

  stream.writeUInt8(inp.approved ? 1 : 0)

  stream.writeUInt8(inp.number ? 1 : 0)

  if(inp.number){
    stream.writeUInt32(inp.number)
  }

  stream.writeString(inp.hash)

  stream.writeBigUInt64(BigInt(inp.timestamp))

}

export const deserializeDevProposalAccount = (stream: VectorBufferStream, root = false) => {
  
    if(root && (stream.readUInt16() !== SerdeTypeIdent.DevProposalAccount)){
      throw new Error("Unexpected bufferstream for DevProposalAccount type");
    }
  
    const id = stream.readString()
    const type = stream.readString()
    const title = stream.readUInt8() ? stream.readString() : null
    const description = stream.readUInt8() ? stream.readString() : null
    const totalVotes = stream.readUInt32()
    const totalAmount = stream.readUInt8() ? stream.readUInt32() : null
    const payAddress = stream.readString()
    const payments = []
    const paymentsLength = stream.readUInt32()
    for(let i = 0; i < paymentsLength; i++){
      payments.push(deserializeDeveloperPayment(stream))
    }
    const approved = stream.readUInt8() ? true : null
    const number = stream.readUInt8() ? stream.readUInt32() : null
    const hash = stream.readString()
    const timestamp = Number(stream.readBigUInt64())
  
    return {
      id,
      type,
      title,
      description,
      totalVotes,
      totalAmount,
      payAddress,
      payments,
      approved,
      number,
      hash,
      timestamp,
    }
  }
