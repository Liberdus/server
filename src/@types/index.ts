// ---------------------- TRANSACTION export interfaceS ------------------

import { ShardusTypes } from '@shardus/core'
import { P2P } from '@shardus/lib-types'
import { StakeCert } from '../transactions/staking/query_certificate'
import { AdminCert } from '../transactions/admin_certificate'

// Define the AJVSchemaEnum with snake case values
export enum AJVSchemaEnum {
  query_cert_req = 'query_cert_req',
  inject_tx_req = 'inject_tx_req',
  internal_tx_base = 'internal_tx_base',
  left_network_early_violation_data = 'left_network_early_violation_data',
  syncing_timeout_violation_data = 'syncing_timeout_violation_data',
  node_refuted_violation_data = 'node_refuted_violation_data',
  sign = 'sign',
  signature = 'signature',
  app_join_data = 'app_join_data',
  stake_resp = 'stake_resp',
  stake_cert = 'stake_cert',
  remove_node_cert = 'remove_node_cert',
  // Transaction types with snake case values matching TXTypes
  init_network = 'init_network',
  network_windows = 'network_windows',
  snapshot = 'snapshot',
  /** @deprecated Deprecated in version 2.5.0 - will be removed in a future version */
  email = 'email',
  /** @deprecated Deprecated in version 2.5.0 - will be removed in a future version */
  gossip_email_hash = 'gossip_email_hash',
  /** @deprecated Deprecated in version 2.5.0 - will be removed in a future version */
  verify = 'verify',
  register = 'register',
  create = 'create',
  transfer = 'transfer',
  distribute = 'distribute',
  message = 'message',
  read = 'read',
  reclaim_toll = 'reclaim_toll',
  update_chat_toll = 'update_chat_toll',
  update_toll_required = 'update_toll_required',
  toll = 'toll',
  /** @deprecated Deprecated in version 2.5.0 - will be removed in a future version */
  friend = 'friend',
  /** @deprecated Deprecated in version 2.5.0 - will be removed in a future version */
  remove_friend = 'remove_friend',
  stake = 'stake',
  remove_stake = 'remove_stake',
  remove_stake_request = 'remove_stake_request',
  node_reward = 'node_reward',
  snapshot_claim = 'snapshot_claim',
  issue = 'issue',
  proposal = 'proposal',
  vote = 'vote',
  tally = 'tally',
  apply_tally = 'apply_tally',
  parameters = 'parameters',
  apply_parameters = 'apply_parameters',
  dev_issue = 'dev_issue',
  dev_proposal = 'dev_proposal',
  dev_vote = 'dev_vote',
  dev_tally = 'dev_tally',
  apply_dev_tally = 'apply_dev_tally',
  dev_parameters = 'dev_parameters',
  apply_dev_parameters = 'apply_dev_parameters',
  developer_payment = 'developer_payment',
  apply_developer_payment = 'apply_developer_payment',
  change_config = 'change_config',
  apply_change_config = 'apply_change_config',
  change_network_param = 'change_network_param',
  apply_change_network_param = 'apply_change_network_param',
  deposit_stake = 'deposit_stake',
  withdraw_stake = 'withdraw_stake',
  set_cert_time = 'set_cert_time',
  query_certificate = 'query_certificate',
  init_reward = 'init_reward',
  claim_reward = 'claim_reward',
  apply_penalty = 'apply_penalty',
  // New DAO transactions (Phase 1: governance/economic/protocol proposals)
  dao_proposal_create = 'dao_proposal_create',
  dao_committee_vote = 'dao_committee_vote',
  dao_committee_result = 'dao_committee_result',
  dao_vote = 'dao_vote',
  dao_vote_result = 'dao_vote_result',
  dao_apply_parameters = 'dao_apply_parameters',
  dao_claim_reward = 'dao_claim_reward',
}

export enum TXTypes {
  init_network = 'init_network',
  network_windows = 'network_windows',
  snapshot = 'snapshot',
  /** @deprecated Deprecated in version 2.5.0 - will be removed in a future version */
  email = 'email',
  /** @deprecated Deprecated in version 2.5.0 - will be removed in a future version */
  gossip_email_hash = 'gossip_email_hash',
  /** @deprecated Deprecated in version 2.5.0 - will be removed in a future version */
  verify = 'verify',
  register = 'register',
  create = 'create',
  transfer = 'transfer',
  distribute = 'distribute',
  message = 'message',
  read = 'read',
  reclaim_toll = 'reclaim_toll',
  update_chat_toll = 'update_chat_toll',
  update_toll_required = 'update_toll_required',
  toll = 'toll',
  /** @deprecated Deprecated in version 2.5.0 - will be removed in a future version */
  friend = 'friend',
  /** @deprecated Deprecated in version 2.5.0 - will be removed in a future version */
  remove_friend = 'remove_friend',
  stake = 'stake',
  remove_stake = 'remove_stake',
  remove_stake_request = 'remove_stake_request',
  node_reward = 'node_reward',
  snapshot_claim = 'snapshot_claim',
  issue = 'issue',
  proposal = 'proposal',
  vote = 'vote',
  tally = 'tally',
  apply_tally = 'apply_tally',
  parameters = 'parameters',
  apply_parameters = 'apply_parameters',
  dev_issue = 'dev_issue',
  dev_proposal = 'dev_proposal',
  dev_vote = 'dev_vote',
  dev_tally = 'dev_tally',
  apply_dev_tally = 'apply_dev_tally',
  dev_parameters = 'dev_parameters',
  apply_dev_parameters = 'apply_dev_parameters',
  developer_payment = 'developer_payment',
  apply_developer_payment = 'apply_developer_payment',
  change_config = 'change_config',
  apply_change_config = 'apply_change_config',
  change_network_param = 'change_network_param',
  apply_change_network_param = 'apply_change_network_param',
  deposit_stake = 'deposit_stake',
  withdraw_stake = 'withdraw_stake',
  set_cert_time = 'set_cert_time',
  init_reward = 'init_reward',
  claim_reward = 'claim_reward',
  apply_penalty = 'apply_penalty',
  // New DAO transactions (Phase 1: governance/economic/protocol proposals)
  dao_proposal_create = 'dao_proposal_create',
  dao_committee_vote = 'dao_committee_vote',
  dao_committee_result = 'dao_committee_result',
  dao_vote = 'dao_vote',
  dao_vote_result = 'dao_vote_result',
  dao_apply_parameters = 'dao_apply_parameters',
  dao_claim_reward = 'dao_claim_reward',
}

export interface BaseLiberdusTx {
  timestamp: number
  type: TXTypes
  sign: Signature
  networkId: string
}

export namespace Tx {
  export interface ApplyParameters extends BaseLiberdusTx {
    from: string
    current: NetworkParameters
    next: {}
    windows: Windows
    nextWindows: {}
    issue: number
    devWindows?: DevWindows
    nextDevWindows?: DevWindows
  }

  export interface ApplyDevParameters extends BaseLiberdusTx {
    from: string
    timestamp: number
    devWindows: DevWindows
    nextDevWindows: {}
    developerFund: DeveloperPayment[]
    nextDeveloperFund: DeveloperPayment[]
    devIssue: number
  }

  export interface ApplyDevPayment extends BaseLiberdusTx {
    from: string
    developerFund: DeveloperPayment[]
  }

  export interface ApplyTally extends BaseLiberdusTx {
    from: string
    next: NetworkParameters
    nextWindows: Windows
  }

  export interface ApplyDevTally extends BaseLiberdusTx {
    from: string
    nextDeveloperFund: DeveloperPayment[]
    nextDevWindows: DevWindows
  }

  export interface Create extends BaseLiberdusTx {
    from: string
    to: string
    amount: bigint
  }

  export interface Distribute extends BaseLiberdusTx {
    from: string
    recipients: string[]
    amount: bigint
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

  export interface NetworkWindows extends BaseLiberdusTx {
    type: TXTypes
    timestamp: number
    from: string
    nodeId: string
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
    amount: bigint
    fee: bigint
  }

  export type MessageRecord = Message

  export interface Read extends BaseLiberdusTx {
    from: string
    to: string
    chatId: string
    timestamp: number // timestamp up to which messages are considered read
    fee?: bigint // Optional fee for the read transaction
  }

  export interface UpdateChatToll extends BaseLiberdusTx {
    from: string
    to: string
    chatId: string
    required: number // 1 if toll required, 0 if not nd 2 to block other party
    timestamp: number // timestamp up to which messages are considered read
  }

  export interface UpdateTollRequired extends BaseLiberdusTx {
    from: string
    to: string
    chatId: string
    required: number // 1 if toll required, 0 if not nd 2 to block other party
    previousRequired?: number
    timestamp: number // timestamp up to which messages are considered read
    fee?: bigint // Optional fee for the update toll transaction
  }

  export type ChatMessageRecord = MessageRecord | Transfer | Read | UpdateTollRequired

  export interface ReclaimToll extends BaseLiberdusTx {
    from: string
    to: string
    chatId: string
    timestamp: number // timestamp up to which messages are considered read
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
    signs: Signature[]
  }

  export interface ApplyChangeConfig extends BaseLiberdusTx {
    from: string
    change: any
  }

  export interface ChangeNetworkParam extends BaseLiberdusTx {
    from: string
    cycle: number
    config: string
    signs: Signature[]
  }

  export interface ApplyChangeNetworkParam extends BaseLiberdusTx {
    from: string
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
    totalAmount: bigint
    payments: DeveloperPayment[]
    title: string
    description: string
    payAddress: string
  }

  export interface Register extends BaseLiberdusTx {
    aliasHash: string
    from: string
    alias: string
    publicKey: string
    pqPublicKey?: string
    private?: boolean
  }

  export interface RemoveFriend extends BaseLiberdusTx {
    from: string
    to: string
  }

  export interface RemoveStakeRequest extends BaseLiberdusTx {
    from: string
    stake: bigint
  }

  export interface RemoveStake extends BaseLiberdusTx {
    from: string
    stake: bigint
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
    stake: bigint
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
    toll: bigint
    tollUnit: TollUnit
    fee?: bigint // Optional fee for the toll transaction
  }

  export interface Transfer extends BaseLiberdusTx {
    from: string
    to: string
    amount: bigint
    memo?: string
    xmemo?: {
      message?: string
    }
    chatId: string
    fee?: bigint // Optional fee for the transfer
    deductTxFeeFromAmount?: boolean // Optional, defaults to false. If true, tx fee is deducted from the transfer amount.
  }

  export interface Verify extends BaseLiberdusTx {
    from: string
    code: string
  }

  export interface Vote extends BaseLiberdusTx {
    from: string
    issue: string
    proposal: string
    amount: bigint
  }

  export interface DevVote extends BaseLiberdusTx {
    from: string
    devIssue: string
    devProposal: string
    approve: boolean
    amount: bigint
  }

  export interface DevPayment extends BaseLiberdusTx {
    nodeId: string
    from: string
    developer: string
    payment: DeveloperPayment
  }

  export interface SetCertTime extends BaseLiberdusTx {
    nominee: string
    nominator: string
    duration: number
  }

  export interface DepositStake extends BaseLiberdusTx {
    nominee: string
    nominator: string
    stake: bigint
  }

  export interface WithdrawStake extends BaseLiberdusTx {
    nominee: string
    nominator: string
    force: boolean
  }

  export interface InitRewardTX extends BaseLiberdusTx {
    nominee: string
    nodeActivatedTime: number
    txData: NodeInitTxData
  }

  export interface ClaimRewardTX extends BaseLiberdusTx {
    nominee: string
    nominator: string
    deactivatedNodeId: string
    nodeDeactivatedTime: number
    txData: NodeRewardTxData
  }

  export interface PenaltyTX extends BaseLiberdusTx {
    reportedNodeId: string
    reportedNodePublickKey: string
    nominator: string
    violationType: ViolationType
    violationData: LeftNetworkEarlyViolationData | SyncingTimeoutViolationData | NodeRefutedViolationData
  }

  // New DAO transaction interfaces (Phase 1: governance/economic/protocol proposals)
  export interface DaoProposalCreate extends BaseLiberdusTx {
    from: string
    proposalId: string
    metaId: string
    emergency: boolean
    proposalType: DaoProposalType
    gracePeriod: number
    description: string
    options: string[]
    governance?: DaoGovernanceData
    economic?: DaoEconomicData
    protocol?: DaoProtocolData
    // Optional: when committee review should begin. Must be >= tx.timestamp (creation time);
    // defaults to tx.timestamp (creationTime) when omitted. See dao_proposal_create.validate.
    startTime?: number
  }

  export interface DaoCommitteeVote extends BaseLiberdusTx {
    from: string
    proposalId: string
    vote: 'accept' | 'withhold'
    // Required when vote === 'withhold'; the voter must supply a reason.
    withheldReason?: string
  }

  export interface DaoCommitteeResult extends BaseLiberdusTx {
    from: string
    proposalId: string
  }

  export interface DaoVote extends BaseLiberdusTx {
    from: string
    proposalId: string
    // Relative weight the voter assigns to each proposal option, mapped 1:1 by index onto
    // proposal.options (e.g. weights: [3, 5, 0, 2] for options [bob, tom, sam, jim]).
    // Replaces the old single-option `optionIndex` — a vote can now spread its spend-weight
    // across multiple options proportionally. Must have the same length as proposal.options,
    // contain non-negative finite numbers, and sum to > 0.
    weights: number[]
    spend: bigint
  }

  export interface DaoVoteResult extends BaseLiberdusTx {
    from: string
    proposalId: string
  }

  export interface DaoApplyParameters extends BaseLiberdusTx {
    from: string
    proposalId: string
  }

  export interface DaoClaimReward extends BaseLiberdusTx {
    from: string
    proposalId: string
  }
}

export interface Signature {
  owner: string
  sig: string
}

export enum TollUnit {
  lib = 'LIB',
  usd = 'USD',
}

/**
 * ---------------------- ACCOUNT export interfaceS ----------------------
 */

export interface UserAccount {
  id: string
  type: string
  data: {
    balance: bigint
    toll: bigint | null
    tollUnit: TollUnit
    chats: chatMessages
    chatTimestamp: number
    friends: object
    stake?: bigint
    remove_stake_request: number | null
    payments: DeveloperPayment[]
  }
  alias: string | null
  emailHash: string | null
  verified: string | boolean
  lastMaintenance: number
  claimedSnapshot: boolean
  timestamp: number
  hash: string
  operatorAccountInfo?: OperatorAccountInfo
  publicKey: string
  pqPublicKey?: string
  private?: boolean
}

interface chatMessages {
  [address: string]: {
    receivedTimestamp: number
    chatId: string
  }
}

export interface OperatorAccountInfo {
  stake: bigint
  nominee: string
  certExp: number
  lastStakeTimestamp: number
  operatorStats: OperatorStats
}

export interface OperatorStats {
  //update when node is rewarded/penalized (exits)
  totalNodeReward: bigint
  totalNodePenalty: bigint
  totalNodeTime: number
  //push begin and end times when rewarded (deprecated - removed in 2.4.5)
  history?: { b: number; e: number }[]

  //update then unstaked
  totalUnstakeReward: bigint
  unstakeCount: number

  lastStakedNodeKey: string
}

export interface NodeAccount {
  id: string
  type: string
  balance: bigint
  nodeRewardTime: number // TODO: remove
  hash: string
  timestamp: number
  nominator: string
  stakeLock: bigint //amount of coins in
  stakeTimestamp: number
  reward: bigint
  rewardStartTime: number
  rewardEndTime: number
  penalty: bigint
  nodeAccountStats: NodeAccountStats
  rewarded: boolean // This helps to prevent double rewards
  rewardRate: bigint
}

export interface NodeAccountStats {
  //update when node is rewarded/penalized (exits)
  totalReward: bigint
  totalPenalty: bigint
  //push begin and end times when rewarded
  history: { b: number; e: number }[]
  lastPenaltyTime: number
  penaltyHistory: { type: ViolationType; amount: bigint; timestamp: number }[]
}

export interface ChatAccount {
  id: string
  hash: string
  type: string
  timestamp: number
  messages: Tx.ChatMessageRecord[]
  toll: {
    required: [number, number] // 1 if toll required, 0 if not
    payOnRead: [bigint, bigint] // amount to be paid when reading
    payOnReply: [bigint, bigint] // amount to be paid when replying
  }
  read: [number, number] // timestamps of last read
  replied: [number, number] // timestamps of last reply
  hasChats: boolean // if chat has messages
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
  networkId: string
  type: string
  listOfChanges: Array<{
    cycle: number
    change: any
    appData: any
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
  tallied: boolean
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
  tallied: boolean
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
  approve: bigint
  reject: bigint
  title: string | null
  description: string | null
  totalVotes: number
  totalAmount: bigint | null
  payAddress: string
  payments: DeveloperPayment[]
  approved: boolean | null
  number: number | null
  hash: string
  timestamp: number
}

export interface DevAccount {
  id: string
  type: string
  hash: string
  timestamp: number
}

// New DAO account types (Phase 1: governance/economic/protocol proposals)
export type DaoProposalStatus = 'review' | 'withheld' | 'voting' | 'rejected' | 'accepted' | 'applied'
export type DaoProposalType = 'governance' | 'economic' | 'protocol'

export interface DaoGovernanceData {
  changes: Array<{ key: string; value: string; current: string }>
}

export interface DaoEconomicData {
  changes: Array<{ key: string; value: string; current: string }>
}

export interface DaoProtocolData {
  changes: Array<{ key: string; value: string; current: string }>
}

export interface DaoProposalsMeta {
  id: string
  type: 'DaoProposalsMeta'
  count: number
  hash: string
  timestamp: number
}

export interface DaoProposalAccount {
  id: string
  type: 'DaoProposalAccount'
  status: DaoProposalStatus
  emergency: boolean
  proposalType: DaoProposalType
  number: number
  // Only these two timestamps are stored; reviewEnd/votingStart/votingEnd/claimEnd/
  // applyEligibleAt are all derived from them + the duration fields below.
  // See getReviewEnd/getVotingStart/getVotingEnd/getClaimEnd/getApplyEligibleAt
  // in src/accounts/daoProposalAccount.ts (single source of truth for the formulas).
  creationTime: number
  startTime: number
  gracePeriod: number
  // Snapshot of DAO network params captured at proposal creation time
  proposalFeeWei: bigint
  voteThresholdWei: bigint
  minimumSpendWei: bigint
  voteExponent: number
  pctBurned: number
  reviewDuration: number
  votingDuration: number
  graceDuration: number
  claimDuration: number
  committeeAddresses: string[]
  // Committee review tracking — one entry per member; switching a vote replaces (not appends)
  // that member's entry, so withheldReason always stays attributed to the member's current vote.
  committeeVotes: Array<{ memberAddress: string; vote: 'accept' | 'withhold'; withheldReason?: string }>
  // Voting state
  options: string[]
  weights: bigint[]
  // Fixed once dao_vote_result runs (post-burn pool); accumulates pre-burn (proposalFeeWei +
  // sum of vote spends). claimedAmount tracks the running total paid out via dao_claim_reward;
  // remaining unclaimed = voterRewardPool - claimedAmount.
  voterRewardPool: bigint
  claimedAmount: bigint
  voterList: Array<{ address: string; timestamp: number }>
  claimList: string[]
  // Proposal content
  description: string
  governance?: DaoGovernanceData
  economic?: DaoEconomicData
  protocol?: DaoProtocolData
  hash: string
  timestamp: number
}

export type Accounts = NetworkAccount &
  IssueAccount &
  DevIssueAccount &
  UserAccount &
  AliasAccount &
  ProposalAccount &
  DevProposalAccount &
  NodeAccount &
  ChatAccount
export type AccountVariant =
  | NetworkAccount
  | IssueAccount
  | DevIssueAccount
  | UserAccount
  | AliasAccount
  | ProposalAccount
  | DevProposalAccount
  | NodeAccount
  | ChatAccount
  | DevAccount
  | DaoProposalsMeta
  | DaoProposalAccount

/**
 * ---------------------- NETWORK DATA export interfaceS ----------------------
 */

export interface NetworkParameters {
  title: string
  description: string
  nodeRewardInterval: number
  transactionFee: bigint
  maintenanceInterval: number
  maintenanceFee: bigint
  proposalFee: bigint
  devProposalFee: bigint
  faucetAmount: bigint
  nodeRewardAmountUsd: bigint
  nodePenaltyUsd: bigint
  stakeRequiredUsd: bigint
  restakeCooldown: number
  stabilityScaleMul: number
  stabilityScaleDiv: number
  minVersion: string
  activeVersion: string
  latestVersion: string
  archiver: {
    minVersion: string
    activeVersion: string
    latestVersion: string
  }
  txPause: boolean
  certCycleDuration: number
  enableNodeSlashing: boolean
  defaultToll: bigint
  minToll: bigint
  tollNetworkTaxPercent: number
  tollTimeout: number
  messageMaxLength: number // Maximum length of chat message
  messageRetentionDays: number // Number of days to retain chat messages
  slashing: {
    enableLeftNetworkEarlySlashing: boolean
    enableSyncTimeoutSlashing: boolean
    enableNodeRefutedSlashing: boolean
    leftNetworkEarlyPenaltyPercent: number
    syncTimeoutPenaltyPercent: number
    nodeRefutedPenaltyPercent: number
  }
  stakeLockTime: number
  nodeRewardAmountUsdStr: string
  nodePenaltyUsdStr: string
  stakeRequiredUsdStr: string
  transactionFeeUsdStr: string
  stabilityFactorStr: string
  minTollUsdStr: string
  defaultTollUsdStr: string
  goldenTicketServerUrl: string
  dao: {
    proposalFeeUsdStr: string
    voteThresholdUsdStr: string
    minimumSpendUsdStr: string
    voteExponent: number
    pctBurned: number
    reviewDuration: number
    votingDuration: number
    graceDuration: number
    claimDuration: number
    committeeAddresses: string[]
  }
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
  amount: bigint
  delay: number
  timestamp: number
}

/**
 * ---------------------- SDK DATA export interfaceS ----------------------
 */

export interface ValidationResponse {
  result: string
  reason: string
  txnTimestamp?: number
}

export interface WrappedAccount extends ShardusTypes.WrappedResponse {
  data: Accounts
}

export interface WrappedStates {
  [id: string]: WrappedAccount
}

export type KeyResult = {
  timestamp: number
  keys: ShardusTypes.TransactionKeys
  shardusMemoryPatterns: ShardusTypes.ShardusMemoryPatternsInput
}

export interface GlobalMessage extends Omit<P2P.GlobalAccountsTypes.SetGlobalTx, 'txId'> {
  value:
    | Tx.InitNetwork
    | Tx.ApplyChangeConfig
    | Tx.ApplyChangeNetworkParam
    | Tx.ApplyDevParameters
    | Tx.ApplyDevTally
    | Tx.ApplyDevPayment
    | Tx.ApplyParameters
    | Tx.ApplyTally
}

export interface OurAppDefinedData {
  globalMsg: GlobalMessage
}

export interface InjectTxResponse {
  success: boolean
  reason?: string
}

export interface ValidatorError {
  success: boolean
  reason: string
}

export interface AccountAxiosResponse {
  account: Accounts
  error: string
}

export interface AccountQueryResponse {
  success: boolean
  account?: Accounts
}

export interface InjectTxResponse {
  success: boolean
  reason?: string
}

export interface NodeInfoAppData {
  appVersion: string
  minVersion: string
  activeVersion: string
  latestVersion: string
  operatorCLIVersion: string
  operatorGUIVersion: string
}

export interface AppJoinData {
  version: string
  stakeCert: StakeCert
  adminCert: AdminCert
}

export interface NodeRewardTxData {
  publicKey: string
  nodeId: string
  endTime: number
}

export interface SignedNodeRewardTxData extends NodeRewardTxData {
  sign: ShardusTypes.Sign
}

export interface NodeInitTxData {
  publicKey: string
  nodeId: string
  startTime: number
}

export interface SignedNodeInitTxData extends NodeInitTxData {
  sign: ShardusTypes.Sign
}

export enum ViolationType {
  // 0-999 reserved for shardus core
  LiberdusMinID = 999,
  LeftNetworkEarly = 1000,
  SyncingTooLong = 1001,
  DoubleVote = 1002,
  NodeRefuted = 1003,
  LiberdusMaxID = 2000,
}

export interface SyncingTimeoutViolationData {
  nodeLostCycle: number
  nodeDroppedTime: number
}

export interface LeftNetworkEarlyViolationData {
  nodeLostCycle: number
  nodeDroppedCycle: number
  nodeDroppedTime: number
}

export interface NodeRefutedViolationData {
  nodeRefutedCycle: number
  nodeRefutedTime: number
}

export interface AppReceiptData {
  txId: string
  timestamp: number
  success: boolean
  reason?: string // Can be undefined if the transaction was successful
  from: string
  to?: string // Can be undefined if the transaction is not directed to any account or is directed more than one account
  type: string
  transactionFee: bigint
  additionalInfo?: object // Can add any additional info related to the transaction that are not in the original transaction data
}

export interface GoldenTicketRequest {
  publicKey: string
  nonce: number
  timestamp: number
  ip: string
  port: number
  sign: Signature
}
