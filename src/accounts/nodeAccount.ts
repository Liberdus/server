import { VectorBufferStream } from '@shardus/core'
import * as crypto from '@shardus/crypto-utils'
import { SerdeTypeIdent } from '.'
import {NodeAccount} from '../@types'

export const nodeAccount = (accountId: string) => {
  const account: NodeAccount = {
    id: accountId,
    type: 'NodeAccount',
    balance: 0,
    nodeRewardTime: 0,
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}

export const serializeNodeAccount = (stream: VectorBufferStream, inp: NodeAccount, root = false): void => {
  if(root){
    stream.writeUInt16(SerdeTypeIdent.NodeAccount)
  }

  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeUInt32(inp.balance)
  stream.writeBigUInt64(BigInt(inp.nodeRewardTime))
  stream.writeString(inp.hash)
  stream.writeBigUInt64(BigInt(inp.timestamp))
}

export const deserializeNodeAccount = (stream: VectorBufferStream, root = false): NodeAccount => {

  if(root && (stream.readUInt16() !== SerdeTypeIdent.NodeAccount)){
    throw new Error("Unexpected bufferstream for NodeAccount type");
  }

  return {
    id: stream.readString(),
    type: stream.readString(),
    balance: stream.readUInt32(),
    nodeRewardTime: Number(stream.readBigUInt64()),
    hash: stream.readString(),
    timestamp: Number(stream.readBigUInt64())
  }
}
