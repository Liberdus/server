import * as crypto from '../crypto'
import { VectorBufferStream } from '@shardus/core'
import { deserializeNetworkParameters, SerdeTypeIdent, serializeNetworkParameters } from '.'
import {ProposalAccount, NetworkParameters} from '../@types'

export const proposalAccount = (accountId: string, parameters?: NetworkParameters) => {
  const proposal: ProposalAccount = {
    id: accountId,
    type: 'ProposalAccount',
    power: 0,
    totalVotes: 0,
    winner: false,
    parameters,
    number: null,
    hash: '',
    timestamp: 0,
  }
  proposal.hash = crypto.hashObj(proposal)
  return proposal
}

export const serializeProposalAccount = (stream: VectorBufferStream, inp: ProposalAccount, root = false) => {
  if(root){
    stream.writeUInt16(SerdeTypeIdent.ProposalAccount)
  }

  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeUInt32(inp.power)
  stream.writeUInt32(inp.totalVotes)
  serializeNetworkParameters(stream, inp.parameters)
  stream.writeUInt8(inp.winner ? 1 : 0)
  stream.writeUInt8(inp.number ? 1 : 0)
  if(inp.number){
    stream.writeUInt32(inp.number)
  }
  stream.writeString(inp.hash)
  stream.writeBigUInt64(BigInt(inp.timestamp))
}

export const deserializeProposalAccount = (stream: VectorBufferStream, root = false): ProposalAccount => {

  if(root && (stream.readUInt16() !== SerdeTypeIdent.ProposalAccount)){
    throw new Error("Unexpected bufferstream for ProposalAccount type");
  }

  return {
    id: stream.readString(),
    type: stream.readString(),
    power: stream.readUInt32(),
    totalVotes: stream.readUInt32(),
    parameters: deserializeNetworkParameters(stream),
    winner: stream.readUInt8() === 1,
    number: stream.readUInt8() === 1 ? stream.readUInt32() : null,
    hash: stream.readString(),
    timestamp: Number(stream.readBigUInt64())
  }
}
