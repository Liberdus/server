// ---------------------- TRANSACTION INTERFACES ------------------

declare namespace Tx {
  interface ApplyParameters {
    type: string
    timestamp: number
    network: string
    current: NetworkParameters
    next: {}
    windows: Windows
    nextWindows: {}
    issue: number
  }

  interface ApplyDevParameters {
    type: string
    timestamp: number
    network: string
    devWindows: DevWindows
    nextDevWindows: {}
    developerFund: DeveloperPayment[]
    nextDeveloperFund: DeveloperPayment[]
    devIssue: number
  }

  interface ApplyDevPayment {
    type: string
    timestamp: number
    network: string
    developerFund: DeveloperPayment[]
  }

  interface ApplyTally {
    type: string
    timestamp: number
    network: string
    next: NetworkParameters
    nextWindows: Windows
  }

  interface ApplyDevTally {
    type: string
    timestamp: number
    network: string
    nextDeveloperFund: DeveloperPayment[]
    nextDevWindows: Windows
  }

  interface Create {
    type: string
    from: string
    to: string
    amount: number
    timestamp: number
  }

  interface Distribute {
    type: string
    network: string
    from: string
    recipients: string[]
    amount: number
    timestamp: number
    sign: Signature
  }

  interface Email {
    type: string
    signedTx: {
      emailHash: string
      from: string
      sign: Signature
    }
    email: string
    timestamp: number
  }

  interface GossipEmailHash {
    type: string
    nodeId: string
    account: string
    from: string
    emailHash: string
    verified: string
    timestamp: number
  }

  interface InitNetwork {
    type: string
    network: string
    timestamp: number
  }

  interface Issue {
    type: string
    network: string
    nodeId: string
    from: string
    issue: string
    proposal: string
    timestamp: number
  }

  interface DevIssue {
    type: string
    network: string
    nodeId: string
    from: string
    devIssue: string
    timestamp: number
  }

  interface Message {
    type: string
    network: string
    from: string
    to: string
    chatId: string
    message: string
    freeReply: boolean
    timestamp: number
    sign: Signature
  }

  interface NodeReward {
    type: string
    network: string
    nodeId: string
    from: string
    to: string
    timestamp: number
  }

  interface Parameters {
    type: string
    nodeId: string
    from: string
    network: string
    issue: string
    timestamp: number
  }

  interface DevParameters {
    type: string
    nodeId: string
    from: string
    network: string
    devIssue: string
    timestamp: number
  }

  interface Proposal {
    type: string
    network: string
    from: string
    proposal: string
    issue: string
    parameters: NetworkParameters
    timestamp: number
    sign: Signature
  }

  interface DevProposal {
    type: string
    network: string
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

  interface Register {
    type: string
    aliasHash: string
    from: string
    alias: string
    timestamp: number
    sign: Signature
  }

  interface RemoveStakeRequest {
    type: string
    network: string
    from: string
    stake: number
    timestamp: number
    sign: Signature
  }

  interface RemoveStake {
    type: string
    network: string
    from: string
    stake: number
    timestamp: number
    sign: Signature
  }

  interface SnapshotClaim {
    type: string
    network: string
    from: string
    timestamp: number
    sign: Signature
  }

  interface Snapshot {
    type: string
    from: string
    network: string
    snapshot: any
    timestamp: number
    sign: Signature
  }

  interface Stake {
    type: string
    network: string
    from: string
    stake: number
    timestamp: number
    sign: Signature
  }

  interface Tally {
    type: string
    nodeId: string
    from: string
    network: string
    issue: string
    proposals: string[]
    timestamp: number
  }

  interface DevTally {
    type: string
    nodeId: string
    from: string
    network: string
    devIssue: string
    devProposals: string[]
    timestamp: number
  }

  interface Toll {
    type: string
    network: string
    from: string
    toll: number
    timestamp: number
    sign: Signature
  }

  interface Transfer {
    type: string
    network: string
    from: string
    to: string
    amount: number
    timestamp: number
    sign: Signature
  }

  interface Verify {
    type: string
    from: string
    network: string
    code: string
    timestamp: number
    sign: Signature
  }

  interface Vote {
    type: string
    network: string
    from: string
    issue: string
    proposal: string
    amount: number
    timestamp: number
    sign: Signature
  }

  interface DevVote {
    type: string
    network: string
    from: string
    devIssue: string
    devProposal: string
    approve: boolean
    amount: number
    timestamp: number
    sign: Signature
  }

  interface DevPayment {
    type: string
    network: string
    nodeId: string
    from: string
    developer: string
    payment: DeveloperPayment
    timestamp: number
    sign: Signature
  }
}

interface Signature {
  owner: string
  sig: string
}

/**
 * ---------------------- ACCOUNT INTERFACES ----------------------
 */

interface UserAccount {
  id: string
  type: string
  data: {
    balance: number
    toll: number | null
    chats: object
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

interface NodeAccount {
  id: string
  type: string
  balance: number
  nodeRewardTime: number
  hash: string
  timestamp: number
}

interface ChatAccount {
  id: string
  type: string
  messages: unknown[]
  freeReply: { [id: string]: boolean }
  timestamp: number
  hash: string
}

interface AliasAccount {
  id: string
  type: string
  hash: string
  inbox: string
  address: string
  timestamp: number
}

interface NetworkAccount {
  id: string
  type: string
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

interface IssueAccount {
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

interface DevIssueAccount {
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

interface ProposalAccount {
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

interface DevProposalAccount {
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

type Accounts = NetworkAccount & IssueAccount & DevIssueAccount & UserAccount & AliasAccount & ProposalAccount & DevProposalAccount & NodeAccount & ChatAccount
// type Account = NetworkAccount | IssueAccount | DevIssueAccount | UserAccount | AliasAccount | ProposalAccount | DevProposalAccount | NodeAccount | ChatAccount

/**
 * ---------------------- NETWORK DATA INTERFACES ----------------------
 */

interface NetworkParameters {
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

interface Windows {
  proposalWindow: number[]
  votingWindow: number[]
  graceWindow: number[]
  applyWindow: number[]
}

interface DevWindows {
  devProposalWindow: number[]
  devVotingWindow: number[]
  devGraceWindow: number[]
  devApplyWindow: number[]
}

interface DeveloperPayment {
  id: string
  address: string
  amount: number
  delay: number
  timestamp: number
}

/**
 * ---------------------- SDK DATA INTERFACES ----------------------
 */

interface TransactionKeys {
  sourceKeys: string[]
  targetKeys: string[]
  allKeys: string[]
  timestamp: number
}

interface WrappedResponse {
  accountId: string
  accountCreated: boolean
  isPartial: boolean
  stateId: string
  timestamp: number
  data: never
}

interface ValidationResponse {
  result: string
  reason: string
  txnTimestamp?: number
}

interface WrappedAccount {
  accountId: string
  stateId: string
  data: Accounts
  timestamp: number
  accountCreated?: boolean
}

interface WrappedStates {
  [id: string]: WrappedAccount
}
