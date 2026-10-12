import { aliasAccount, deserializeAliasAccount, serializeAliasAccount } from './aliasAccount'
import { devAccount, deserializeDevAccount, serializeDevAccount } from './devAccount'
import { chatAccount, deserializeChatAccount, serializeChatAccount } from './chatAccount'
import { deserializeUserAccount, serializeUserAccount, userAccount } from './userAccount'
import { deserializeNetworkAccount, networkAccount, serializeNetworkAccount } from './networkAccount'
import { deserializeNodeAccount, nodeAccount, serializeNodeAccount } from './nodeAccount'
import { daoProposalsMetaAccount, deserializeDaoProposalsMetaAccount, serializeDaoProposalsMetaAccount } from './daoProposalsMetaAccount'
import { daoProposalAccount, deserializeDaoProposalAccount, serializeDaoProposalAccount } from './daoProposalAccount'
import { VectorBufferStream } from '@shardus/core'
import {
  AccountVariant,
  AliasAccount,
  ChatAccount,
  NetworkAccount,
  NodeAccount,
  UserAccount,
  DevAccount,
  DaoProposalsMeta,
  DaoProposalAccount,
} from '../@types'
import { Utils } from '@shardus/lib-types'
import { LiberdusFlags } from '../config'

export enum SerdeTypeIdent {
  AliasAccount = 1,
  ChatAccount = 2,
  // 3, 4, 5, 8, 10 and 11 are retired legacy DAO payload identifiers.
  NetworkAccount = 6,
  NodeAccount = 7,
  UserAccount = 9,
  DevAccount = 12,
  Fallback = 13,
  DaoProposalsMeta = 14,
  DaoProposalAccount = 15,
}

export const serializeAccounts = (inp: AccountVariant): VectorBufferStream => {
  const stream = new VectorBufferStream(0)
  // Factory-built types used the JSON fallback before 2.5.3. Enable these
  // existing numeric tags only after every node has the corrected readers.
  // The DAO codecs were already active and keep their existing dispatch.
  if (!LiberdusFlags.versionFlags.correctAccountSerdeLayout && inp.type !== 'DaoProposalsMeta' && inp.type !== 'DaoProposalAccount') {
    fallbackSerializer(stream, inp, true)
    return stream
  }

  switch (inp.type) {
    case 'AliasAccount':
      serializeAliasAccount(stream, inp as AliasAccount, true)
      break
    case 'ChatAccount':
      serializeChatAccount(stream, inp as ChatAccount, true)
      break
    case 'NetworkAccount':
      serializeNetworkAccount(stream, inp as NetworkAccount, true)
      break
    case 'NodeAccount':
      serializeNodeAccount(stream, inp as NodeAccount, true)
      break
    case 'UserAccount':
      serializeUserAccount(stream, inp as UserAccount, true)
      break
    case 'DevAccount':
      serializeDevAccount(stream, inp as DevAccount, true)
      break
    case 'DaoProposalsMeta':
      serializeDaoProposalsMetaAccount(stream, inp as DaoProposalsMeta, true)
      break
    case 'DaoProposalAccount':
      serializeDaoProposalAccount(stream, inp as DaoProposalAccount, true)
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
  switch (type) {
    case SerdeTypeIdent.AliasAccount:
      return deserializeAliasAccount(stream)
    case SerdeTypeIdent.ChatAccount:
      return deserializeChatAccount(stream)
    case SerdeTypeIdent.NetworkAccount:
      return deserializeNetworkAccount(stream)
    case SerdeTypeIdent.NodeAccount:
      return deserializeNodeAccount(stream)
    case SerdeTypeIdent.UserAccount:
      return deserializeUserAccount(stream)
    case SerdeTypeIdent.DevAccount:
      return deserializeDevAccount(stream)
    case SerdeTypeIdent.DaoProposalsMeta:
      return deserializeDaoProposalsMetaAccount(stream)
    case SerdeTypeIdent.DaoProposalAccount:
      return deserializeDaoProposalAccount(stream)
    default:
      return fallbackDeserializer(stream)
  }
}

export const fallbackSerializer = (stream: VectorBufferStream, inp: any, root = false): void => {
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.Fallback)
  }
  stream.writeString(Utils.safeStringify(inp))
}

export const fallbackDeserializer = (stream: VectorBufferStream, root = false): any => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.Fallback) {
    throw new Error('Unexpected bufferstream for Fallback type')
  }
  return Utils.safeJsonParse(stream.readString())
}

export default {
  aliasAccount,
  devAccount,
  chatAccount,
  networkAccount,
  nodeAccount,
  userAccount,
  daoProposalsMetaAccount,
  daoProposalAccount,
}
