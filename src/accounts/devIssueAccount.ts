import * as crypto from '../crypto'
import {DevIssueAccount} from '../@types'

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
    tallied: false
  }
  devIssue.hash = crypto.hashObj(devIssue)
  return devIssue
}
