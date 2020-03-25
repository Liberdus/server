import { NODE_PARAMS } from './parameters'
import * as crypto from 'shardus-crypto-utils'
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

// CREATE A USER ACCOUNT
export function createAccount(accountId: string, timestamp: number): UserAccount {
  const account: UserAccount = {
    id: accountId,
    data: {
      balance: 5000,
      toll: 1,
      chats: {},
      friends: {},
      transactions: [],
    },
    alias: null,
    emailHash: null,
    verified: false,
    hash: '',
    claimedSnapshot: false,
    lastMaintenance: timestamp,
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}

// CREATE A NODE ACCOUNT FOR MINING
export function createNode(accountId: string): NodeAccount {
  const account: NodeAccount = {
    id: accountId,
    balance: 0,
    nodeRewardTime: 0,
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}

export function createChat(accountId: string): ChatAccount {
  const chat: ChatAccount = {
    id: accountId,
    messages: [],
    timestamp: 0,
    hash: '',
  }
  chat.hash = crypto.hashObj(chat)
  return chat
}

// CREATE AN ALIAS ACCOUNT
export function createAlias(accountId: string): AliasAccount {
  const alias: AliasAccount = {
    id: accountId,
    hash: '',
    inbox: '',
    address: '',
    timestamp: 0,
  }
  alias.hash = crypto.hashObj(alias)
  return alias
}

// CREATE THE INITIAL NETWORK ACCOUNT
export function createNetworkAccount(accountId: string): NetworkAccount {
  const account: NetworkAccount = {
    id: accountId,
    current: NODE_PARAMS.CURRENT,
    next: NODE_PARAMS.NEXT,
    windows: NODE_PARAMS.WINDOWS,
    nextWindows: NODE_PARAMS.NEXT_WINDOWS,
    devWindows: NODE_PARAMS.DEV_WINDOWS,
    nextDevWindows: NODE_PARAMS.NEXT_DEV_WINDOWS,
    issue: NODE_PARAMS.ISSUE,
    devIssue: NODE_PARAMS.DEV_ISSUE,
    developerFund: NODE_PARAMS.DEVELOPER_FUND,
    nextDeveloperFund: NODE_PARAMS.NEXT_DEVELOPER_FUND,
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}

// CREATE AN ISSUE ACCOUNT
export function createIssue(accountId: string): IssueAccount {
  const issue: IssueAccount = {
    id: accountId,
    active: null,
    proposals: [],
    proposalCount: 0,
    number: null,
    winner: null,
    hash: '',
    timestamp: 0,
  }
  issue.hash = crypto.hashObj(issue)
  return issue
}

// CREATE A DEV_ISSUE ACCOUNT
export function createDevIssue(accountId: string): DevIssueAccount {
  const devIssue: DevIssueAccount = {
    id: accountId,
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

// CREATE A PROPOSAL ACCOUNT
export function createProposal(accountId: string, parameters: NetworkParameters): ProposalAccount {
  const proposal: ProposalAccount = {
    id: accountId,
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

// CREATE A DEV_PROPOSAL ACCOUNT
export function createDevProposal(accountId: string): DevProposalAccount {
  const devProposal: DevProposalAccount = {
    id: accountId,
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
