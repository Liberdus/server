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

// export interface DevProposalAccount {
//   id: string
//   type: string
//   approve: number
//   reject: number
//   title: string | null
//   description: string | null
//   totalVotes: number
//   totalAmount: number | null
//   payAddress: string
//   payments: DeveloperPayment[]
//   approved: boolean | null
//   number: number | null
//   hash: string
//   timestamp: number
// }

export const serializeDevProposalAccount = (stream: VectorBufferStream, inp: DevProposalAccount, root = false) => {
  if(root){
    stream.writeUInt16(SerdeTypeIdent.DevProposalAccount)
  }

  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeBigUInt64(inp.approve)
  stream.writeBigUInt64(inp.reject)

  if(inp.title !== null){
    stream.writeUInt8(1)
    stream.writeString(inp.title)
  }else{
    stream.writeUInt8(0)
  }

  if(inp.description !== null){
    stream.writeUInt8(1)
    stream.writeString(inp.description)
  }else{
    stream.writeUInt8(0)
  }


  stream.writeUInt32(inp.totalVotes)

  if(inp.totalAmount !== null){
    stream.writeUInt8(1)
    stream.writeBigInt64(inp.totalAmount)
  }else{
    stream.writeUInt8(0)
  }

  stream.writeString(inp.payAddress)

  stream.writeUInt32(inp.payments.length)
  for(let i = 0; i < inp.payments.length; i++){
    serializeDeveloperPayment(stream, inp.payments[i])
  }

  if(inp.approved !== null){
    stream.writeUInt8(1)
    stream.writeUInt8((inp.approved === true) ? 1 : 0)
  }else{
    stream.writeUInt8(0)
  }

  if(inp.number !== null){
    stream.writeUInt8(1)
    stream.writeUInt32(inp.number)
  }else{
    stream.writeUInt8(0)
  }

  stream.writeString(inp.hash)

  stream.writeBigUInt64(BigInt(inp.timestamp))

}

export const deserializeDevProposalAccount = (stream: VectorBufferStream, root = false): DevProposalAccount => {
  
    if(root && (stream.readUInt16() !== SerdeTypeIdent.DevProposalAccount)){
      throw new Error("Unexpected bufferstream for DevProposalAccount type");
    }

    const id = stream.readString()
    const type = stream.readString()
    const approve = stream.readBigUInt64()
    const reject = stream.readBigUInt64()

    let title = null
    if(stream.readUInt8() === 1){
      title = stream.readString()
    }
    let description = null
    if(stream.readUInt8() === 1){
      description = stream.readString()
    }
    const totalVotes = stream.readUInt32()
    let totalAmount = null
    if(stream.readUInt8() === 1){
      totalAmount = stream.readBigUInt64()
    }
    const payAddress = stream.readString()
    const payments = []
    for(let i = 0; i < stream.readUInt32(); i++){
      payments.push(deserializeDeveloperPayment(stream))
    }
    let approved = null
    if(stream.readUInt8() === 1){
      approved = (stream.readUInt8() === 1) ? true : false
    }
    let number = null
    if(stream.readUInt8() === 1){
      number = stream.readUInt32()
    }
    const hash = stream.readString()
    const timestamp = Number(stream.readBigUInt64())

    return {
      id,
      type,
      approve,
      reject,
      title,
      description,
      totalVotes,
      totalAmount,
      payAddress,
      payments,
      approved,
      number,
      hash,
      timestamp
    }
  
  }
