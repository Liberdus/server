import * as crypto from '../crypto'
import {IssueAccount} from '../@types'

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
    tallied: false
  }
  issue.hash = crypto.hashObj(issue)
  return issue
}
