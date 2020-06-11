/**
 * ---------------------- ACCOUNT INTERFACES ----------------------
 */

interface UserAccount {
  id: string
  data: {
    balance: number
    toll: number | null
    chats: object
    friends: object
    stake?: number
    remove_stake_request: boolean | null
    transactions: object[]
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
  balance: number
  nodeRewardTime: number
  hash: string
  timestamp: number
}

interface ChatAccount {
  id: string
  messages: unknown[]
  timestamp: number
  hash: string
}

interface AliasAccount {
  id: string
  hash: string
  inbox: string
  address: string
  timestamp: number
}

interface NetworkAccount {
  id: string
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
  active: boolean | null
  proposals: string[]
  proposalCount: number
  number: number | null
  winner: string | null
  hash: string
  timestamp: number
}

interface DevIssueAccount {
  id: string
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

type Account = NetworkAccount & IssueAccount & DevIssueAccount & UserAccount & AliasAccount & ProposalAccount & DevProposalAccount & NodeAccount & ChatAccount

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
  data: Account
  timestamp: number
  accountCreated?: boolean
}
