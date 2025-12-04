import * as crypto from '../crypto'
import * as config from '../config'
import { NetworkAccount } from '../@types'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import { Utils } from '@shardus/lib-types'
import { Shardus } from '@shardus/core'

export const networkAccount = (accountId: string, timestamp: number, dapp: Shardus): NetworkAccount => {
  // Ensure lowercase accountId
  accountId = accountId.toLowerCase()
  // const proposalWindow = [timestamp, timestamp + config.TIME_FOR_PROPOSALS]
  // const votingWindow = [proposalWindow[1], proposalWindow[1] + config.TIME_FOR_VOTING]
  // const graceWindow = [votingWindow[1], votingWindow[1] + config.TIME_FOR_GRACE]
  // const applyWindow = [graceWindow[1], graceWindow[1] + config.TIME_FOR_APPLY]
  //
  // const devProposalWindow = [timestamp, timestamp + config.TIME_FOR_DEV_PROPOSALS]
  // const devVotingWindow = [devProposalWindow[1], devProposalWindow[1] + config.TIME_FOR_DEV_VOTING]
  // const devGraceWindow = [devVotingWindow[1], devVotingWindow[1] + config.TIME_FOR_DEV_GRACE]
  // const devApplyWindow = [devGraceWindow[1], devGraceWindow[1] + config.TIME_FOR_DEV_APPLY]

  const latestCycles = dapp.getLatestCycles()
  const currentCycle = latestCycles[0]

  const account: NetworkAccount = {
    id: accountId,
    networkId: currentCycle.networkId,
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
    timestamp,
  }
  account.hash = crypto.hashObj(account)
  console.log('INITIAL_HASH: ', account.hash)
  return account
}

// todo: we will have to do task to do detailed serialisation and deserialisation later with type reinforcements
export const serializeNetworkAccount = (stream: VectorBufferStream, inp: NetworkAccount, root = false): void => {
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
