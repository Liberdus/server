import * as crypto from 'shardus-crypto-utils'
import * as config from '../config'

export const networkAccount = (accountId: string, timestamp: number) => {
  const proposalWindow = [timestamp, timestamp + config.TIME_FOR_PROPOSALS]
  const votingWindow = [proposalWindow[1], proposalWindow[1] + config.TIME_FOR_VOTING]
  const graceWindow = [votingWindow[1], votingWindow[1] + config.TIME_FOR_GRACE]
  const applyWindow = [graceWindow[1], graceWindow[1] + config.TIME_FOR_APPLY]

  const devProposalWindow = [timestamp, timestamp + config.TIME_FOR_DEV_PROPOSALS]
  const devVotingWindow = [devProposalWindow[1], devProposalWindow[1] + config.TIME_FOR_DEV_VOTING]
  const devGraceWindow = [devVotingWindow[1], devVotingWindow[1] + config.TIME_FOR_DEV_GRACE]
  const devApplyWindow = [devGraceWindow[1], devGraceWindow[1] + config.TIME_FOR_DEV_APPLY]

  const account: NetworkAccount = {
    id: accountId,
    type: 'NetworkAccount',
    current: config.INITIAL_PARAMETERS,
    next: {},
    windows: {
      proposalWindow,
      votingWindow,
      graceWindow,
      applyWindow,
    },
    nextWindows: {},
    devWindows: {
      devProposalWindow,
      devVotingWindow,
      devGraceWindow,
      devApplyWindow,
    },
    nextDevWindows: {},
    developerFund: [],
    nextDeveloperFund: [],
    issue: 1,
    devIssue: 1,
    rootUsers: [],
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  console.log('INITIAL_HASH: ', account.hash)
  return account
}
