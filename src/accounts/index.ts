import { aliasAccount, deserializeAliasAccount, serializeAliasAccount } from './aliasAccount'
import { chatAccount, deserializeChatAccount, serializeChatAccount } from './chatAccount'
import { deserializeDevProposalAccount, devProposalAccount, serializeDevProposalAccount } from './devProposalAccount'
import { deserializeDevIssueAccount, devIssueAccount, serializeDevIssueAccount } from './devIssueAccount'
import { deserializeUserAccount, serializeUserAccount, userAccount } from './userAccount'
import { deserializeIssueAccount, issueAccount, serializeIssueAccount } from './issueAccount'
import { deserializeNetworkAccount, networkAccount, serializeNetworkAccount } from './networkAccount'
import { deserializeNodeAccount, nodeAccount, serializeNodeAccount } from './nodeAccount'
import { deserializeProposalAccount, proposalAccount, serializeProposalAccount } from './proposalAccount'
import { VectorBufferStream } from '@shardus/core'
import { DeveloperPayment, AccountVariant, AliasAccount, ChatAccount, DevIssueAccount, DevProposalAccount, IssueAccount, NetworkAccount, NodeAccount, ProposalAccount, UserAccount } from '../@types'
import { Utils } from '@shardus/types'

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
  Fallback,
}


export const serializeAccounts = (inp: AccountVariant): VectorBufferStream => {
  const stream = new VectorBufferStream(0)
  switch(inp.type){
    case 'aliasAccount':
      serializeAliasAccount(stream, inp as AliasAccount, true)
      break
    case 'chatAccount':
      serializeChatAccount(stream, inp as ChatAccount, true)
      break
    case 'devIssueAccount':
      serializeDevIssueAccount(stream, inp as DevIssueAccount, true)
      break
    case 'devProposalAccount':
      serializeDevProposalAccount(stream, inp as DevProposalAccount, true)
      break
    case 'issueAccount':
      serializeIssueAccount(stream, inp as IssueAccount, true)
      break
    case 'networkAccount':
      serializeNetworkAccount(stream, inp as NetworkAccount, true)
      break
    case 'nodeAccount':
      serializeNodeAccount(stream, inp as NodeAccount, true)
      break
    case 'proposalAccount':
      serializeProposalAccount(stream, inp as ProposalAccount, true)
      break
    case 'userAccount':
      serializeUserAccount(stream, inp as UserAccount, true)
      break
    default:
      fallbackSerializer(stream, inp, true)
      break
  }

  return stream
}

export const deserializeAccounts = (buffer: Buffer): AccountVariant => {
  const stream = VectorBufferStream.fromBuffer(buffer)
  const type = stream.readUInt16()
  switch(type){
    case SerdeTypeIdent.AliasAccount:
      return deserializeAliasAccount(stream)
    case SerdeTypeIdent.ChatAccount:
      return deserializeChatAccount(stream)
    case SerdeTypeIdent.DevIssueAccount:
      return deserializeDevIssueAccount(stream)
    case SerdeTypeIdent.DevProposalAccount:
      return deserializeDevProposalAccount(stream)
    case SerdeTypeIdent.IssueAccount:
      return deserializeIssueAccount(stream)
    case SerdeTypeIdent.NetworkAccount:
      return deserializeNetworkAccount(stream)
    case SerdeTypeIdent.NodeAccount:
      return deserializeNodeAccount(stream)
    case SerdeTypeIdent.ProposalAccount:
      return deserializeProposalAccount(stream)
    case SerdeTypeIdent.UserAccount:
      return deserializeUserAccount(stream)
    default:
      return fallbackDeserializer(stream)
  }
}

export const fallbackSerializer = (stream: VectorBufferStream, inp: any, root = false): void => {
  if(root){
    stream.writeUInt16(SerdeTypeIdent.Fallback)
  }
  stream.writeString(Utils.safeStringify(inp))
}

export const fallbackDeserializer = (stream: VectorBufferStream, root = false): any => {
  if(root && (stream.readUInt16() !== SerdeTypeIdent.Fallback)){
    throw new Error("Unexpected bufferstream for Fallback type");
  }
  return Utils.safeJsonParse(stream.readString())
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
