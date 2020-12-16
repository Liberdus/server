import * as crypto from 'shardus-crypto-utils'

export const issueAccount = (accountId: string) => {
  const issue: IssueAccount = {
    id: accountId,
    type: 'IssueAccount',
    active: null,
    proposals: [],
    proposalCount: 0,
    number: null,
    winnerId: null,
    hash: '',
    timestamp: 0,
  }
  issue.hash = crypto.hashObj(issue)
  return issue
}
