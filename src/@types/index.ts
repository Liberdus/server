// ---------------------- TRANSACTION export interfaceS ------------------

import {shardusFactory, ShardusTypes} from '@shardus/core'
export interface BaseLiberdusTx {
  timestamp: number
  type: string
}
export namespace Tx {
  export interface ApplyParameters {
    type: string
    timestamp: number
    current: NetworkParameters
    next: {}
    windows: Windows
    nextWindows: {}
    issue: number
  }

  export interface ApplyDevParameters {
    type: string
    timestamp: number
    devWindows: DevWindows
    nextDevWindows: {}
    developerFund: DeveloperPayment[]
    nextDeveloperFund: DeveloperPayment[]
    devIssue: number
  }

  export interface ApplyDevPayment {
    type: string
    timestamp: number
    developerFund: DeveloperPayment[]
  }

  export interface ApplyTally {
    type: string
    timestamp: number
    next: NetworkParameters
    nextWindows: Windows
  }

  export interface ApplyDevTally {
    type: string
    timestamp: number
    nextDeveloperFund: DeveloperPayment[]
    nextDevWindows: Windows
  }

  export interface Create {
    type: string
    from: string
    to: string
    amount: number
    timestamp: number
  }

  export interface Distribute {
    type: string
    from: string
    recipients: string[]
    amount: number
    timestamp: number
    sign: Signature
  }

  export interface Email {
    type: string
    signedTx: {
      emailHash: string
      from: string
      sign: Signature
    }
    email: string
    timestamp: number
  }

  export interface Friend {
    type: string
    alias: string
    from: string
    to: string
    timestamp: number
    sign: Signature
  }

  export interface GossipEmailHash {
    type: string
    nodeId: string
    account: string
    from: string
    emailHash: string
    verified: string
    timestamp: number
  }

  export interface InitNetwork {
    type: string
    timestamp: number
  }

  export interface Issue {
    type: string
    nodeId: string
    from: string
    issue: string
    proposal: string
    timestamp: number
  }

  export interface DevIssue {
    type: string
    nodeId: string
    from: string
    devIssue: string
    timestamp: number
  }

  export interface Message {
    type: string
    from: string
    to: string
    chatId: string
    message: string
    timestamp: number
    sign: Signature
  }

  export interface NodeReward {
    type: string
    nodeId: string
    from: string
    to: string
    timestamp: number
  }

  export interface Parameters {
    type: string
    nodeId: string
    from: string
    issue: string
    timestamp: number
  }

  export interface ChangeConfig {
    type: string
    from: string
    cycle: number
    config: string
    timestamp: number
  }

  export interface ApplyChangeConfig {
    type: string
    change: any
    timestamp: number
  }

  export interface DevParameters {
    type: string
    nodeId: string
    from: string
    devIssue: string
    timestamp: number
  }

  export interface Proposal {
    type: string
    from: string
    proposal: string
    issue: string
    parameters: NetworkParameters
    timestamp: number
    sign: Signature
  }

  export interface DevProposal {
    type: string
    from: string
    devProposal: string
    devIssue: string
    totalAmount: number
    payments: DeveloperPayment[]
    title: string
    description: string
    payAddress: string
    timestamp: number
    sign: Signature
  }

  export interface Register {
    type: string
    aliasHash: string
    from: string
    alias: string
    timestamp: number
    sign: Signature
  }

  export interface RemoveFriend {
    type: string
    from: string
    to: string
    timestamp: number
    sign: Signature
  }

  export interface RemoveStakeRequest {
    type: string
    from: string
    stake: number
    timestamp: number
    sign: Signature
  }

  export interface RemoveStake {
    type: string
    from: string
    stake: number
    timestamp: number
    sign: Signature
  }

  export interface SnapshotClaim {
    type: string
    from: string
    timestamp: number
    sign: Signature
  }

  export interface Snapshot {
    type: string
    from: string
    snapshot: any
    timestamp: number
    sign: Signature
  }

  export interface Stake {
    type: string
    from: string
    stake: number
    timestamp: number
    sign: Signature
  }

  export interface Tally {
    type: string
    nodeId: string
    from: string
    issue: string
    proposals: string[]
    timestamp: number
  }

  export interface DevTally {
    type: string
    nodeId: string
    from: string
    devIssue: string
    devProposals: string[]
    timestamp: number
  }

  export interface Toll {
    type: string
    from: string
    toll: number
    timestamp: number
    sign: Signature
  }

  export interface Transfer {
    type: string
    from: string
    to: string
    amount: number
    timestamp: number
    sign: Signature
  }

  export interface Verify {
    type: string
    from: string
    code: string
    timestamp: number
    sign: Signature
  }

  export interface Vote {
    type: string
    from: string
    issue: string
    proposal: string
    amount: number
    timestamp: number
    sign: Signature
  }

  export interface DevVote {
    type: string
    from: string
    devIssue: string
    devProposal: string
    approve: boolean
    amount: number
    timestamp: number
    sign: Signature
  }

  export interface DevPayment {
    type: string
    nodeId: string
    from: string
    developer: string
    payment: DeveloperPayment
    timestamp: number
    sign: Signature
  }
}

export interface Signature {
  owner: string
  sig: string
}

/**
 * ---------------------- ACCOUNT export interfaceS ----------------------
 */

export interface UserAccount {
  id: string
  type: string
  data: {
    balance: number
    toll: number | null
    chats: object
    friends: object
    stake?: number
    remove_stake_request: number | null
    transactions: object[]
    payments: DeveloperPayment[]
  }
  alias: string | null
  emailHash: string | null
  verified: string | boolean
  lastMaintenance: number
  claimedSnapshot: boolean
  timestamp: number
  hash: string
}

export interface NodeAccount {
  id: string
  type: string
  balance: number
  nodeRewardTime: number
  hash: string
  timestamp: number
}

export interface ChatAccount {
  id: string
  type: string
  messages: unknown[]
  timestamp: number
  hash: string
}

export interface AliasAccount {
  id: string
  type: string
  hash: string
  inbox: string
  address: string
  timestamp: number
}

export interface NetworkAccount {
  id: string
  type: string
  listOfChanges: Array<{
    cycle: number
    change: any
  }>
  current: NetworkParameters
  next: NetworkParameters | {}
  windows: Windows
  nextWindows: Windows | {}
  devWindows: DevWindows
  nextDevWindows: DevWindows | {}
  issue: number
  devIssue: number
  developerFund: DeveloperPayment[]
  nextDeveloperFund: DeveloperPayment[]
  hash: string
  timestamp: number
  snapshot?: object
}

export interface IssueAccount {
  id: string
  type: string
  active: boolean | null
  proposals: string[]
  proposalCount: number
  number: number | null
  winnerId: string | null
  hash: string
  timestamp: number
}

export interface DevIssueAccount {
  id: string
  type: string
  devProposals: string[]
  devProposalCount: number
  winners: string[]
  active: boolean | null
  number: number | null
  hash: string
  timestamp: number
}

export interface ProposalAccount {
  id: string
  type: string
  power: number
  totalVotes: number
  parameters: NetworkParameters
  winner: boolean
  number: number | null
  hash: string
  timestamp: number
}

export interface DevProposalAccount {
  id: string
  type: string
  approve: number
  reject: number
  title: string | null
  description: string | null
  totalVotes: number
  totalAmount: number | null
  payAddress: string
  payments: DeveloperPayment[]
  approved: boolean | null
  number: number | null
  hash: string
  timestamp: number
}

export type Accounts = NetworkAccount & IssueAccount & DevIssueAccount & UserAccount & AliasAccount & ProposalAccount & DevProposalAccount & NodeAccount & ChatAccount
// type Account = NetworkAccount | IssueAccount | DevIssueAccount | UserAccount | AliasAccount | ProposalAccount | DevProposalAccount | NodeAccount | ChatAccount

/**
 * ---------------------- NETWORK DATA export interfaceS ----------------------
 */

export interface NetworkParameters {
  title: string
  description: string
  nodeRewardInterval: number
  nodeRewardAmount: number
  nodePenalty: number
  transactionFee: number
  stakeRequired: number
  maintenanceInterval: number
  maintenanceFee: number
  proposalFee: number
  devProposalFee: number
  faucetAmount: number
  defaultToll: number
}

export interface Windows {
  proposalWindow: number[]
  votingWindow: number[]
  graceWindow: number[]
  applyWindow: number[]
}

export interface DevWindows {
  devProposalWindow: number[]
  devVotingWindow: number[]
  devGraceWindow: number[]
  devApplyWindow: number[]
}

export interface DeveloperPayment {
  id: string
  address: string
  amount: number
  delay: number
  timestamp: number
}

/**
 * ---------------------- SDK DATA export interfaceS ----------------------
 */

export interface TransactionKeys {
  sourceKeys: string[]
  targetKeys: string[]
  allKeys: string[]
  timestamp: number
}

export interface WrappedResponse {
  accountId: string
  accountCreated: boolean
  isPartial: boolean
  stateId: string
  timestamp: number
  data: never
}

export interface ValidationResponse {
  result: string
  reason: string
  txnTimestamp?: number
}

export interface WrappedAccount {
  accountId: string
  stateId: string
  data: Accounts
  timestamp: number
  accountCreated?: boolean
}

export interface WrappedStates {
  [id: string]: WrappedAccount
}

export type KeyResult = {
  timestamp: number
  id: string
  keys: TransactionKeys
  shardusMemoryPatterns: ShardusTypes.ShardusMemoryPatternsInput
}

export interface OurAppDefinedData {
  globalMsg: {
    address: string
    value: any
    when: number,
    source: string
  }
}

export interface InjectTxResponse {
  success: boolean
  reason?: string
}

export interface ValidatorError {
  success: boolean
  reason: string
}
