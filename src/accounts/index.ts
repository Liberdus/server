import { aliasAccount } from './aliasAccount'
import { chatAccount } from './chatAccount'
import { devProposalAccount } from './devProposalAccount'
import { devIssueAccount } from './devIssueAccount'
import { userAccount } from './userAccount'
import { issueAccount } from './issueAccount'
import { networkAccount } from './networkAccount'
import { nodeAccount } from './nodeAccount'
import { proposalAccount } from './proposalAccount'
import { VectorBufferStream } from '@shardus/core'
import { DeveloperPayment } from '../@types'

export enum SerdeTypeIdent {
  AliasAccount = 1,
  ChatAccount,
  DevIssueAccount,
  DevProposalAccount,
  IssueAccount,
  NetworkAccount,
  NodeAccount,
  ProposalAccount,
  UserAccount,
  DeveloperPayment,
  NetworkParameters,
}

export const serializeDeveloperPayment = (stream: VectorBufferStream, inp: DeveloperPayment, root = false): void => {
  if(root){
    stream.writeUInt16(SerdeTypeIdent.DeveloperPayment)
  }
  stream.writeString(inp.id)
  stream.writeString(inp.address)
  stream.writeUInt32(inp.amount)
  stream.writeUInt32(inp.delay)
  stream.writeBigUInt64(BigInt(inp.timestamp))
}

export const deserializeDeveloperPayment = (stream: VectorBufferStream, root = false): DeveloperPayment => {
  if(root && (stream.readUInt16() !== SerdeTypeIdent.DeveloperPayment)){
    throw new Error("Unexpected bufferstream for DeveloperPayment type");
  }
  return {
    id: stream.readString(),
    address: stream.readString(),
    amount: stream.readUInt32(),
    delay: stream.readUInt32(),
    timestamp: Number(stream.readBigUInt64())
  }
}

export const serializeNetworkParameters = (stream: VectorBufferStream, inp: any, root = false): void => {
  if(root){
    stream.writeUInt16(SerdeTypeIdent.NetworkParameters)
  }
  stream.writeString(inp.title)
  stream.writeString(inp.description)
  stream.writeUInt32(inp.nodeRewardInterval)
  stream.writeUInt32(inp.nodeRewardAmount)
  stream.writeUInt32(inp.nodePenalty)
  stream.writeUInt32(inp.transactionFee)
  stream.writeUInt32(inp.stakeRequired)
  stream.writeUInt32(inp.maintenanceInterval)
  stream.writeUInt32(inp.maintenanceFee)
  stream.writeUInt32(inp.proposalFee)
  stream.writeUInt32(inp.devProposalFee)
  stream.writeUInt32(inp.faucetAmount)
  stream.writeUInt32(inp.defaultToll)
}

export const deserializeNetworkParameters = (stream: VectorBufferStream, root = false): any => {
  if(root && (stream.readUInt16() !== SerdeTypeIdent.NetworkParameters)){
    throw new Error("Unexpected bufferstream for NetworkParameters type");
  }
  return {
    title: stream.readString(),
    description: stream.readString(),
    nodeRewardInterval: stream.readUInt32(),
    nodeRewardAmount: stream.readUInt32(),
    nodePenalty: stream.readUInt32(),
    transactionFee: stream.readUInt32(),
    stakeRequired: stream.readUInt32(),
    maintenanceInterval: stream.readUInt32(),
    maintenanceFee: stream.readUInt32(),
    proposalFee: stream.readUInt32(),
    devProposalFee: stream.readUInt32(),
    faucetAmount: stream.readUInt32(),
    defaultToll: stream.readUInt32()
  }
}



export default {
  aliasAccount,
  chatAccount,
  devIssueAccount,
  devProposalAccount,
  issueAccount,
  networkAccount,
  nodeAccount,
  proposalAccount,
  userAccount,
}
