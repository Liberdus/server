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
  dao_unapply_parameters = 'dao_unapply_parameters',
  dao_claim_reward = 'dao_claim_reward',
  dao_burn_reward = 'dao_burn_reward',
  dao_cancel = 'dao_cancel',
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
  dao_unapply_parameters = 'dao_unapply_parameters',
  dao_claim_reward = 'dao_claim_reward',
  dao_burn_reward = 'dao_burn_reward',
  dao_cancel = 'dao_cancel',
  // MLS (RFC 9420) group chat
  group_create = 'group_create',
  group_keypackage_publish = 'group_keypackage_publish',
  group_message = 'group_message',
  group_commit = 'group_commit',
  group_leave = 'group_leave',
  update_group_add_policy = 'update_group_add_policy',
  group_join_request = 'group_join_request',
  group_join_reclaim = 'group_join_reclaim',
  group_fee_claim = 'group_fee_claim',
  group_maintenance_fund = 'group_maintenance_fund',
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

  /**
   * ------------------------- MLS GROUP CHAT (RFC 9420) -------------------------
   *
   * Group messaging uses its own transaction family because `Message` is
   * irreducibly two-party: its chatId is hash(from,to) and its toll state is
   * [sender, receiver] pairs.
   *
   * All group transactions target a single GroupAccount, so Shardus orders them
   * deterministically by timestamp. That ordering is what makes MLS — which
   * requires every member to apply the same commits in the same sequence —
   * workable on-chain, and `GroupAccount.epoch` fences concurrent commits.
   *
   * Every blob below is opaque base64 produced by the client's MLS stack. The
   * network never sees plaintext, group name, or who said what inside a message.
   */

  /** ML-KEM-1024 sealed post-quantum PSK, addressed to one joining member. */
  export interface GroupSealedPsk {
    cipherText: string // ML-KEM-1024 ciphertext, b64
    nonce: string // AEAD nonce, b64
    ct: string // wrapped 32-byte group PSK, b64
  }

  /** Everything a newly added member needs to join. */
  export interface GroupWelcomeEnvelope {
    welcome: string // b64 MLS Welcome
    ratchetTree: string // b64 ratchet tree
    sealedPsk: GroupSealedPsk
    pskId: string // b64
    pskNonce: string // b64
    epoch: number
    timestamp: number
  }

  export interface GroupCreate extends BaseLiberdusTx {
    from: string
    groupId: string // must equal hash(from + groupNonce)
    groupNonce: string // 32-byte hex, client-chosen
    mlsGroupId: string // hex of the MLS group_id
    cipherSuite: number // pinned; members must agree
    meta: string // client-encrypted {name, avatar, ...}
    maxMembers: number
    /** Price of admission, escrowed by a requester and earned by the approving admin. */
    joinFee: bigint
    fee: bigint
  }

  /** Publish single-use MLS KeyPackages so others can add this account. */
  export interface GroupKeyPackagePublish extends BaseLiberdusTx {
    from: string
    keyPackages: string[] // b64, each consumed on use
    lastResortKeyPackage?: string // b64, reusable fallback when the pool empties
    cipherSuite: number
    fee: bigint
  }

  /** An application message: one MLS PrivateMessage. The hot path. */
  export interface GroupMessage extends BaseLiberdusTx {
    from: string
    groupId: string
    epoch: number // recorded, NOT enforced (see group_message.ts)
    message: string // b64 MLS PrivateMessage
    fee: bigint
  }

  export interface GroupMessageRecord {
    type: TXTypes.group_message
    txId: string
    from: string
    groupId: string
    epoch: number
    message: string
    timestamp: number
    sign: Signature
  }

  /** A membership change: MLS proposals + commit, fenced on `epoch`. */
  export interface GroupCommit extends BaseLiberdusTx {
    from: string
    groupId: string
    epoch: number // MUST equal GroupAccount.epoch
    commit: string // b64 MLS commit
    proposals: string[] // b64, applied before the commit
    pskId: string // b64, external PSK referenced by the commit
    pskNonce: string // b64
    welcomes: { address: string; envelope: GroupWelcomeEnvelope }[]
    groupInfo: string // b64 GroupInfo w/ external_pub, for recovery
    /**
     * BASELINE ONLY: the full b64 post-commit tree. Sent on a group's first
     * commit, or once per group when migrating an existing group onto the
     * delta scheme. Empty on every other commit — see `treeDelta`.
     */
    ratchetTree: string
    /**
     * Ratchet-tree nodes this commit changed, by node index (even = leaf,
     * odd = parent); `n: null` blanks the node.
     *
     * Must be an explicit field rather than something the server derives: our
     * commits are mls_private_message, so the UpdatePath inside them is
     * encrypted and the network cannot read it.
     */
    treeDelta: { i: number; n: string | null }[]
    addedMembers: string[]
    removedMembers: string[]
    consumedKeyPackages: { address: string; keyPackage: string }[]
    meta?: string
    fee: bigint
  }

  /** Trimmed transcript record. Welcomes and trees live elsewhere to keep this small. */
  export interface GroupCommitRecord {
    type: TXTypes.group_commit
    txId: string
    from: string
    groupId: string
    epoch: number // epoch BEFORE this commit applied
    commit: string
    proposals: string[]
    pskId: string
    pskNonce: string
    addedMembers: string[]
    removedMembers: string[]
    timestamp: number
    sign: Signature
  }

  /** Self-removal. Not cryptographically effective until an admin commits a Remove. */
  /**
   * Asks to join a group. The requester's own consent to be added, which
   * group_commit then requires — nobody can be pulled into a group they did not
   * ask for.
   *
   * Carries NO KeyPackage: the approving commit draws one from the requester's
   * published pool. Pinning one here would break if the requester rotated their
   * pool while the request was pending, because publishing discards the private
   * halves — the Welcome would be undecryptable and they could never join.
   */
  export interface GroupJoinRequest extends BaseLiberdusTx {
    from: string
    groupId: string
    /** The group's joinFee at request time, debited now and held on the group. */
    escrow: bigint
    message: string
    fee: bigint
  }

  /** Collects join fees that have finished vesting. */
  export interface GroupFeeClaim extends BaseLiberdusTx {
    from: string
    groupId: string
    fee: bigint
  }

  /**
   * Tops up a group's maintenanceBalance, which pays the fee on commits that
   * repair the ratchet tree.
   *
   * Open to anyone, member or not: the balance can only ever be spent burning a
   * repair fee, so a contribution cannot be redirected and there is nothing to
   * gain by restricting who may make one. There is deliberately no matching
   * withdrawal transaction -- see GroupAccount.maintenanceBalance.
   */
  export interface GroupMaintenanceFund extends BaseLiberdusTx {
    from: string
    groupId: string
    /** Amount to add to the balance, on top of this transaction's own fee. */
    amount: bigint
    fee: bigint
  }

  /** Withdraws a join request and returns its escrow. Modelled on reclaim_toll. */
  export interface GroupJoinReclaim extends BaseLiberdusTx {
    from: string
    groupId: string
    fee: bigint
  }

  export interface UpdateGroupAddPolicy extends BaseLiberdusTx {
    from: string
    policy: 'anyone' | 'contacts' | 'nobody'
    fee: bigint
  }

  export interface GroupLeave extends BaseLiberdusTx {
    from: string
    groupId: string
    fee: bigint
  }

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
    gracePeriod?: number
    title: string
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

  export interface DaoUnapplyParameters extends BaseLiberdusTx {
    from: string
    proposalId: string
  }

  export interface DaoClaimReward extends BaseLiberdusTx {
    from: string
    proposalId: string
  }

  export interface DaoBurnReward extends BaseLiberdusTx {
    from: string
    proposalId: string
  }

  export interface DaoCancel extends BaseLiberdusTx {
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
    /**
     * Pool of single-use MLS KeyPackages, b64. Popped by group_commit when this
     * account is added to a group; the client tops the pool back up.
     */
    mlsKeyPackages?: string[]
    /** Reusable fallback used when the pool empties (RFC 9420 s10, weaker PCS). */
    mlsLastResortKeyPackage?: string
    /** Ciphersuite the published KeyPackages were generated for. */
    mlsCipherSuite?: number
    /**
     * Who may add this account to a group WITHOUT it having asked to join.
     *
     *   'contacts' (default) - only accounts this one is connected to, i.e. has
     *                            waived its chat toll for (toll.required === 0)
     *   'anyone'             - anybody, i.e. the pre-consent behaviour
     *   'nobody'             - direct adds refused; join requests only
     *
     * Being added is not free for the addee: it consumes one of their single-use
     * KeyPackages and, under update-on-join, makes them inject a group_commit of
     * their own. So the default is restrictive.
     */
    groupAddPolicy?: 'anyone' | 'contacts' | 'nobody'
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

/**
 * One account per MLS group. Because every group transaction targets this single
 * account, Shardus serializes them into a deterministic, consensus-agreed order —
 * which is exactly the total-order broadcast MLS needs from a delivery service.
 *
 * The network stores only ciphertext and the minimum public metadata required to
 * authorize writes (who is a member) and to fence concurrent commits (`epoch`).
 */
export interface GroupAccount {
  id: string
  type: string
  hash: string
  timestamp: number

  // --- MLS coordination -----------------------------------------------------
  mlsGroupId: string
  cipherSuite: number
  /**
   * AUTHORITATIVE MLS epoch. A group_commit must name this exact value or it is
   * rejected, so exactly one commit can land per epoch no matter how many
   * members race. Incremented on every applied commit.
   */
  epoch: number

  // --- membership (public metadata; required for authorization) -------------
  members: string[]
  admins: string[]
  memberSince: { [address: string]: { epoch: number; timestamp: number } }

  // --- transcript -----------------------------------------------------------
  /** Application messages. Safe to prune: losing them costs history only. */
  messages: Tx.GroupMessageRecord[]
  /**
   * Commits, welcomes, the ratchet tree and the recovery checkpoint all live on
   * the GroupTreeAccount instead — see `treeId`. They are needed only by
   * group_commit, whereas THIS account is loaded, shipped to the consensus group
   * and re-hashed by every single group_message. Keeping them here made the hot
   * path carry megabytes it never reads.
   */
  treeId: string

  // --- admission ------------------------------------------------------------
  /**
   * Price of admission, escrowed by the requester and earned by the approving
   * admin. Zero until paid groups ship; the plumbing exists so enabling them is
   * a matter of allowing this to be set.
   */
  joinFee: bigint
  /** Addresses refused admission. The group's analogue of toll.required = 2. */
  blocked: string[]
  /**
   * How many requests to join are outstanding.
   *
   * A mirror of `Object.keys(GroupTreeAccount.pendingJoinRequests).length`,
   * kept here so a client can notice a new request without loading the tree.
   * The requests themselves are cold data, but their COUNT is polled: it is how
   * an admin's open Group info page learns that someone just asked to join, and
   * pulling ~112 kB of ratchet tree on every poll to discover an integer is
   * exactly what splitting the accounts was meant to avoid.
   *
   * Always RECOMPUTED from the map, never incremented. Every site that touches
   * pendingJoinRequests already holds the tree, so deriving it costs nothing
   * and cannot drift the way a hand-maintained counter eventually does.
   *
   * Optional on the wire: groups serialized before this field existed
   * deserialize with zero.
   */
  pendingJoinCount: number

  // --- maintenance ----------------------------------------------------------
  /**
   * Pays the transaction fee for repairing this group's ratchet tree.
   *
   * Removing a member blanks its ancestors, and someone has to spend a commit
   * to fill them back in. That someone is an ordinary member who happened to
   * sit nearby, so charging them makes a bystander pay for the group's own
   * upkeep. This balance pays instead.
   *
   * Funded per added member at add time, by the admin doing the adding: each
   * member prepays for the cleanup their eventual departure causes.
   *
   * Held in LIB rather than as a count of prepaid repairs, deliberately. A
   * count fixed at add time goes wrong the moment the network fee moves;
   * solvency is judged against the fee current at the time it is read.
   *
   * NOT withdrawable, and deliberately without an end-of-life payout. It leaves
   * only as a burned repair fee, which is what makes it uninteresting to steal.
   * It also never pays for a FAILED transaction -- see group_commit -- because
   * that would hand anyone who can inject transactions a way to drain it.
   *
   * There is no case where the balance is stranded, so nothing is owed an exit.
   * group_leave refuses to let the last member go, so a group always keeps at
   * least one, and a one-member group has no copath and so can never need a
   * repair. The balance simply idles until the group grows again -- at which
   * point the adds that grow it top it up anyway.
   *
   * Optional on the wire: groups created before this field existed deserialize
   * with zero rather than failing.
   */
  maintenanceBalance: bigint

  // --- misc -----------------------------------------------------------------
  meta: string // client-encrypted group name/avatar; opaque here
  maxMembers: number
  /** Per-member send throttle, address -> last group_message timestamp. */
  lastMessageAt: { [address: string]: number }
  createdBy: string
  hasChats: boolean
}

/**
 * The cold half of a group: everything group_commit needs and group_message does
 * not.
 *
 * Split out because `keys()` for a message names only the GroupAccount, so any
 * byte stored there is transferred and re-hashed on every message. The ratchet
 * tree alone is ~112 kB at 32 members, and `handshakes` grows without bound.
 *
 * Its id is hash(groupId + 'ratchet-tree') — deterministic so it can be named in
 * keys() before the account exists, and domain-separated so it cannot collide
 * with a user address (hash(username)) or a group id (hash(creator + nonce)).
 */
export interface GroupTreeAccount {
  id: string
  type: string
  hash: string
  timestamp: number

  /** Back-reference, so the pair can be validated as belonging together. */
  groupId: string

  // --- ratchet tree ---------------------------------------------------------
  /**
   * b64 encodeRatchetTree of the CURRENT tree, maintained by applying each
   * commit's `treeDelta`. Public key material only — never group state.
   */
  ratchetTree: string
  /** Epoch `ratchetTree` corresponds to. Invariant: equals GroupAccount.epoch. */
  treeEpoch: number

  // --- transcript -----------------------------------------------------------
  /**
   * Commits. MUST NOT be pruned on the ordinary retention timer — dropping a
   * commit a member has not applied locks that member out of the group forever.
   * Only prune below `checkpoint.epoch`, from which stragglers can re-join
   * externally.
   */
  handshakes: Tx.GroupCommitRecord[]

  /**
   * Welcome + sealed PQ PSK awaiting collection by each newly added member,
   * tagged with who added them so the invitee can be told before deciding.
   */
  pendingWelcomes: { [address: string]: Tx.GroupWelcomeEnvelope & { addedBy?: string } }

  /**
   * Ratchet tree snapshots, keyed by the epoch they belong to.
   *
   * A joiner needs the tree matching the GroupContext in its Welcome, but the
   * live tree moves on immediately — under update-on-join the joiner's own path
   * update is the very next commit. So the server keeps a snapshot, taken at
   * zero transaction cost from the tree it already maintains.
   *
   * Keyed by EPOCH, not by address: every joiner added in one commit shares the
   * same tree, and at 100 members a tree is ~354 kB. Storing one per joiner made
   * a 10-member add write 3.5 MB. Entries are dropped as soon as no pending
   * welcome refers to them.
   */
  welcomeTrees: { [epoch: string]: string }

  /**
   * Outstanding requests to join, by requester address.
   *
   * Lives here rather than on the GroupAccount because only group_commit reads
   * it — decision 4 exists to keep anything else off the account that every
   * group_message transfers and re-hashes.
   */
  pendingJoinRequests: {
    [address: string]: {
      /** Debited from the requester at request time; theirs until approved. */
      escrow: bigint
      message: string
      timestamp: number
    }
  }

  /**
   * Join fees earned but not yet payable.
   *
   * An approved fee does NOT land in the admin's balance immediately. It waits
   * until `vestingUntil`, so that a member removed before then can be refunded
   * rather than having to claw money back from someone who may already have
   * spent it. See GROUP_MEMBERSHIP_CONSENT_SPEC §5.2.
   */
  vestedFees: {
    /** The admin who approved, and is owed this. */
    admin: string
    /** The member who paid it, and who gets it back on an early removal. */
    member: string
    amount: bigint
    vestingUntil: number
  }[]

  // --- recovery -------------------------------------------------------------
  /**
   * Recovery pointer for a desynced member. Deliberately carries NO tree: it is
   * rewritten on every commit, so its epoch always equals `treeEpoch` and a tree
   * here would duplicate `ratchetTree` byte for byte. Read `ratchetTree` when
   * `checkpoint.epoch === treeEpoch`.
   */
  checkpoint: {
    epoch: number
    groupInfo: string // b64 GroupInfo with external_pub
    timestamp: number
  } | null
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
export type DaoProposalStatus = 'review' | 'withheld' | 'voting' | 'rejected' | 'accepted' | 'applied' | 'canceled'
export type DaoProposalType = 'governance' | 'economic' | 'protocol'
export interface DaoParamChange {
  key: string
  value: string
  current: string
}
export type DaoParamChanges = DaoParamChange[] | DaoParamChange[][]

export interface DaoGovernanceData {
  changes: DaoParamChanges
}

export interface DaoEconomicData {
  changes: DaoParamChanges
}

export interface DaoProtocolData {
  changes: DaoParamChanges
}

/**
 * One entry in the DaoProposalsMeta proposal index. `timestamp` is the txTimestamp of the
 * transaction that created the proposal or last changed its status — not the proposal account's
 * own timestamp (backfilled entries carry that instead, so they are approximate).
 */
export interface DaoProposalIndexEntry {
  /** Sequential proposal number, matching DaoProposalAccount.number. */
  proposal: number
  status: DaoProposalStatus
  emergencyFlag: boolean
  timestamp: number
}

export interface DaoProposalsMeta {
  id: string
  type: string
  count: number
  /**
   * Every proposal, most-recent-timestamp first. Optional so pre-index accounts still deserialize —
   * read it through getProposalIndex().
   */
  proposals?: DaoProposalIndexEntry[]
  hash: string
  /** Account timestamp — distinct from the per-entry timestamps in `proposals`. */
  timestamp: number
}

export interface DaoProposalAccount {
  id: string
  type: string
  status: DaoProposalStatus
  emergency: boolean
  proposalType: DaoProposalType
  number: number
  // creationTime/startTime always stored; every other timing field is derived — see
  // getReviewEnd/getVotingStart/getVotingEnd/getClaimEnd/getApplyEligibleAt in
  // src/accounts/daoProposalAccount.ts (single source of truth for the formulas).
  creationTime: number
  startTime: number
  // Set once dao_committee_result/dao_vote_result actually runs for regular proposals —
  // emergency proposals never enter community voting, so these stay absent there. Until set,
  // daoProposalAccount.ts's getters use reviewEnd/votingEnd instead.
  votingStartedAt?: number
  // Not the same as votingEnd (the scheduled deadline) — this is the real time dao_vote_result
  // ran, which can be later than votingEnd if it's submitted late.
  votingEndedAt?: number
  gracePeriod: number
  // Snapshot of DAO network params captured at proposal creation time.
  // USD-string values, converted to Wei via utils.usdStrToWei(...) at each point of use, against the current exchange rate.
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
  // Committee review tracking — one entry per member; switching a vote replaces (not appends)
  // that member's entry, so withheldReason always stays attributed to the member's current vote.
  committeeVotes: Array<{ memberAddress: string; vote: 'accept' | 'withhold'; withheldReason?: string }>
  // Committee addresses that have submitted dao_unapply_parameters for this proposal. Only
  // meaningful once status is 'applied'; created lazily on first use (not defaulted), and reset
  // to [] once the threshold flips status back to accepted. Read defensively — usually absent.
  unapplyVotes?: string[]
  // Voting state
  options: string[]
  totalVote: bigint[]
  winningOptionIndex?: number
  // Fixed once dao_vote_result runs (post-burn pool); accumulates pre-burn (proposalFeeWei +
  // sum of vote spends). claimedReward tracks the running total paid out via dao_claim_reward;
  // remaining unclaimed = voterRewardPool - claimedReward.
  voterRewardPool: bigint
  claimedReward: bigint
  // initialBurnedReward - the amount burned before the claim period (decisive committee withhold).
  // finalBurnedReward - the amount burned after the claim period (unclaimed remainder via dao_burn_reward).
  initialBurnedReward: bigint
  finalBurnedReward: bigint
  voterList: Array<{ address: string; timestamp: number }>
  claimList: string[]
  // Proposal content
  title: string
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
  ChatAccount &
  DaoProposalsMeta &
  DaoProposalAccount &
  GroupAccount &
  GroupTreeAccount

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
  | GroupAccount
  | GroupTreeAccount

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
