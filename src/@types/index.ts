// ---------------------- TRANSACTION export interfaceS ------------------

import {shardusFactory, ShardusTypes} from '@shardus/core'
import  {TXTypes} from '../transactions'
export interface BaseLiberdusTx {
  timestamp: number
  type: TXTypes
  sign: Signature
}
export namespace Tx {
  export interface ApplyParameters extends BaseLiberdusTx {
    current: NetworkParameters
    next: {}
    windows: Windows
    nextWindows: {}
    issue: number,
  }

  export interface ApplyDevParameters extends BaseLiberdusTx {
    timestamp: number
    devWindows: DevWindows
    nextDevWindows: {}
    developerFund: DeveloperPayment[]
    nextDeveloperFund: DeveloperPayment[]
    devIssue: number,
  }

  export interface ApplyDevPayment extends BaseLiberdusTx {
    developerFund: DeveloperPayment[],
  }

  export interface ApplyTally extends BaseLiberdusTx {
    next: NetworkParameters
    nextWindows: Windows
  }

  export interface ApplyDevTally extends BaseLiberdusTx {
    nextDeveloperFund: DeveloperPayment[]
    nextDevWindows: Windows
  }

  export interface Create extends BaseLiberdusTx {
    from: string
    to: string
    amount: number
  }

  export interface Distribute extends BaseLiberdusTx {
    from: string
    recipients: string[]
    amount: number
  }

  export interface Email extends BaseLiberdusTx {
    signedTx: {
      emailHash: string
      from: string
      sign: Signature
    }
    email: string
  }

  export interface Friend extends BaseLiberdusTx {
    alias: string
    from: string
    to: string
  }

  export interface GossipEmailHash extends BaseLiberdusTx {
    nodeId: string
    account: string
    from: string
    emailHash: string
    verified: string
  }

  export interface InitNetwork extends BaseLiberdusTx {
    type: TXTypes
    timestamp: number
  }

  export interface Issue extends BaseLiberdusTx {
    nodeId: string
    from: string
    issue: string
    proposal: string
  }

  export interface DevIssue extends BaseLiberdusTx {
    nodeId: string
    from: string
    devIssue: string
  }

  export interface Message extends BaseLiberdusTx {
    from: string
    to: string
    chatId: string
    message: string
  }

  export interface NodeReward extends BaseLiberdusTx {
    nodeId: string
    from: string
    to: string
  }

  export interface Parameters extends BaseLiberdusTx {
    nodeId: string
    from: string
    issue: string
  }

  export interface ChangeConfig extends BaseLiberdusTx {
    from: string
    cycle: number
    config: string
  }

  export interface ApplyChangeConfig extends BaseLiberdusTx {
    change: any
  }

  export interface DevParameters extends BaseLiberdusTx {
    nodeId: string
    from: string
    devIssue: string
  }

  export interface Proposal extends BaseLiberdusTx {
    from: string
    proposal: string
    issue: string
    parameters: NetworkParameters
  }

  export interface DevProposal extends BaseLiberdusTx {
    from: string
    devProposal: string
    devIssue: string
    totalAmount: number
    payments: DeveloperPayment[]
    title: string
    description: string
    payAddress: string
  }

  export interface Register extends BaseLiberdusTx {
    aliasHash: string
    from: string
    alias: string
  }

  export interface RemoveFriend extends BaseLiberdusTx {
    from: string
    to: string
  }

  export interface RemoveStakeRequest extends BaseLiberdusTx {
    from: string
    stake: number
  }

  export interface RemoveStake extends BaseLiberdusTx {
    from: string
    stake: number
  }

  export interface SnapshotClaim extends BaseLiberdusTx {
    from: string
  }

  export interface Snapshot extends BaseLiberdusTx {
    from: string
    snapshot: any
  }

  export interface Stake extends BaseLiberdusTx {
    from: string
    stake: number
  }

  export interface Tally extends BaseLiberdusTx {
    nodeId: string
    from: string
    issue: string
    proposals: string[]
  }

  export interface DevTally extends BaseLiberdusTx {
    nodeId: string
    from: string
    devIssue: string
    devProposals: string[]
  }

  export interface Toll extends BaseLiberdusTx {
    from: string
    toll: number
  }

  export interface Transfer extends BaseLiberdusTx {
    from: string
    to: string
    amount: number
  }

  export interface Verify extends BaseLiberdusTx {
    from: string
    code: string
  }

  export interface Vote extends BaseLiberdusTx {
    from: string
    issue: string
    proposal: string
    amount: number
  }

  export interface DevVote extends BaseLiberdusTx {
    from: string
    devIssue: string
    devProposal: string
    approve: boolean
    amount: number
  }

  export interface DevPayment extends BaseLiberdusTx {
    nodeId: string
    from: string
    developer: string
    payment: DeveloperPayment
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
    // transactions: object[]
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
