import * as crypto from '@shardus/crypto-utils'

export const devProposalAccount = (accountId: string) => {
  const devProposal: DevProposalAccount = {
    id: accountId,
    type: 'DevProposalAccount',
    title: null,
    description: null,
    approve: 0,
    reject: 0,
    totalVotes: 0,
    totalAmount: null,
    payAddress: '',
    payments: [],
    approved: null,
    number: null,
    hash: '',
    timestamp: 0,
  }
  devProposal.hash = crypto.hashObj(devProposal)
  return devProposal
}
