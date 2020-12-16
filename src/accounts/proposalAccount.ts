import * as crypto from 'shardus-crypto-utils'

export const proposalAccount = (accountId: string, parameters: NetworkParameters) => {
    const proposal: ProposalAccount = {
        id: accountId,
        type: 'ProposalAccount',
        power: 0,
        totalVotes: 0,
        winner: false,
        parameters,
        number: null,
        hash: '',
        timestamp: 0,
    }
    proposal.hash = crypto.hashObj(proposal)
    return proposal
}