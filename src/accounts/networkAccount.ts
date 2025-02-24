import * as crypto from '../crypto'
import * as config from '../config'
import { NetworkAccount } from '../@types'
import { VectorBufferStream } from '@shardeum-foundation/core'
import { SerdeTypeIdent } from '.'
import { Utils } from '@shardus/types'

export const networkAccount = (accountId: string, timestamp: number) => {
  // const proposalWindow = [timestamp, timestamp + config.TIME_FOR_PROPOSALS]
  // const votingWindow = [proposalWindow[1], proposalWindow[1] + config.TIME_FOR_VOTING]
  // const graceWindow = [votingWindow[1], votingWindow[1] + config.TIME_FOR_GRACE]
  // const applyWindow = [graceWindow[1], graceWindow[1] + config.TIME_FOR_APPLY]
  //
  // const devProposalWindow = [timestamp, timestamp + config.TIME_FOR_DEV_PROPOSALS]
  // const devVotingWindow = [devProposalWindow[1], devProposalWindow[1] + config.TIME_FOR_DEV_VOTING]
  // const devGraceWindow = [devVotingWindow[1], devVotingWindow[1] + config.TIME_FOR_DEV_GRACE]
  // const devApplyWindow = [devGraceWindow[1], devGraceWindow[1] + config.TIME_FOR_DEV_APPLY]

  const account: NetworkAccount = {
    id: accountId,
    type: 'NetworkAccount',
    listOfChanges: [],
    current: config.INITIAL_PARAMETERS,
    next: {},
    windows: null,
    nextWindows: {},
    devWindows: null,
    nextDevWindows: {},
    developerFund: [],
    nextDeveloperFund: [],
    issue: 1,
    devIssue: 1,
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  console.log('INITIAL_HASH: ', account.hash)
  return account
}

// we will have to do task to do detailed serialisation and deserialisation later with type reinforcements
export const serializeNetworkAccount = (stream: VectorBufferStream, inp: NetworkAccount, root = false) => {
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.NetworkAccount)
  }
  stream.writeString(Utils.safeStringify(inp))
}

export const deserializeNetworkAccount = (stream: VectorBufferStream, root = false): NetworkAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.NetworkAccount) {
    throw new Error('Unexpected bufferstream for NetworkAccount type')
  }
  return Utils.safeJsonParse(stream.readString())
}
