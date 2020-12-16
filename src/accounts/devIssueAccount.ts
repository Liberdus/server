import * as crypto from 'shardus-crypto-utils'

export const devIssueAccount = (accountId: string) => {
  const devIssue: DevIssueAccount = {
    id: accountId,
    type: 'DevIssueAccount',
    devProposals: [],
    devProposalCount: 0,
    winners: [],
    hash: '',
    active: null,
    number: null,
    timestamp: 0,
  }
  devIssue.hash = crypto.hashObj(devIssue)
  return devIssue
}
