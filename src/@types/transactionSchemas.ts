import { addSchema } from './schemaHelper'
import { ViolationType, AJVSchemaEnum, Signature, TXTypes } from './index'
import * as Transactions from '../transactions'

// Basic schemas
export const SignatureSchema = {
  type: 'object',
  properties: {
    owner: { type: 'string' },
    sig: { type: 'string' },
  },
  required: ['owner', 'sig'],
  additionalProperties: false,
}

// [TODO] Put non-txs schemas to separate file
export const schemaStakeCert = {
  type: 'object',
  properties: {
    nominator: { type: 'string' },
    nominee: { type: 'string' },
    stake: { isBigInt: true },
    certExp: { type: 'number' },
    sign: SignatureSchema,
    signs: {
      type: 'array',
      items: SignatureSchema,
    },
  },
  required: ['nominator', 'nominee', 'stake', 'certExp'],
  additionalProperties: false,
}

export const schemaRemoveNodeCert = {
  type: 'object',
  properties: {
    nodePublicKey: { type: 'string' },
    cycle: { type: 'number' },
    sign: SignatureSchema,
    signs: {
      type: 'array',
      items: SignatureSchema,
    },
  },
  required: ['nodePublicKey', 'cycle'],
  additionalProperties: false,
}

// Violation data schemas
export const schemaLeftNetworkEarlyViolationData = {
  type: 'object',
  properties: {
    nodeLostCycle: { type: 'number' },
    nodeDroppedCycle: { type: 'number' },
    nodeDroppedTime: { type: 'number' },
  },
  required: ['nodeLostCycle', 'nodeDroppedCycle', 'nodeDroppedTime'],
  additionalProperties: false,
}

export const schemaSyncingTimeoutViolationData = {
  type: 'object',
  properties: {
    nodeLostCycle: { type: 'number' },
    nodeDroppedTime: { type: 'number' },
  },
  required: ['nodeLostCycle', 'nodeDroppedTime'],
  additionalProperties: false,
}

export const schemaNodeRefutedViolationData = {
  type: 'object',
  properties: {
    nodeRefutedCycle: { type: 'number' },
    nodeRefutedTime: { type: 'number' },
  },
  required: ['nodeRefutedCycle', 'nodeRefutedTime'],
  additionalProperties: false,
}

// Base transaction fields to be inlined into every TX schema
const baseTxProperties = {
  type: { enum: Object.values(TXTypes) },
  timestamp: { type: 'number', exclusiveMinimum: 0 },
  sign: SignatureSchema,
}

const baseTxRequired = ['type', 'timestamp', 'sign']

// Transaction schemas

export const schemaTransferTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    to: { type: 'string', minLength: 64, maxLength: 64 },
    amount: { isBigInt: true },
    memo: { type: ['string', 'null'] },
    chatId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'to', 'amount', 'chatId'],
  additionalProperties: false,
}

export const schemaPenaltyTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    reportedNodeId: { type: 'string', minLength: 64, maxLength: 64 },
    reportedNodePublickKey: { type: 'string', minLength: 64, maxLength: 64 },
    nominator: { type: 'string', minLength: 64, maxLength: 64 },
    violationType: { enum: Object.values(ViolationType) },
    violationData: {
      anyOf: [
        { $ref: AJVSchemaEnum.left_network_early_violation_data },
        { $ref: AJVSchemaEnum.syncing_timeout_violation_data },
        { $ref: AJVSchemaEnum.node_refuted_violation_data },
      ],
    },
  },
  required: [...baseTxRequired, 'from', 'reportedNodeId', 'reportedNodePublickKey', 'nominator', 'violationType', 'violationData'],
  additionalProperties: false,
}

export const schemaCreateTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    to: { type: 'string' },
    amount: { isBigInt: true },
  },
  required: [...baseTxRequired, 'from', 'to', 'amount'],
  additionalProperties: false,
}

export const schemaDistributeTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    recipients: {
      type: 'array',
      items: { type: 'string' },
    },
    amount: { isBigInt: true },
  },
  required: [...baseTxRequired, 'from', 'recipients', 'amount'],
  additionalProperties: false,
}

export const schemaEmailTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    signedTx: {
      type: 'object',
      properties: {
        emailHash: { type: 'string' },
        from: { type: 'string' },
        sign: SignatureSchema,
      },
      required: ['emailHash', 'from', 'sign'],
      additionalProperties: false,
    },
    email: { type: 'string' },
  },
  required: [...baseTxRequired, 'signedTx', 'email'],
  additionalProperties: false,
}

export const schemaFriendTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    to: { type: 'string' },
    alias: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'to', 'alias'],
  additionalProperties: false,
}

export const schemaGossipEmailHashTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nodeId: { type: 'string' },
    account: { type: 'string' },
    emailHash: { type: 'string' },
    verified: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'nodeId', 'account', 'emailHash', 'verified'],
  additionalProperties: false,
}

export const schemaInitNetworkTX = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    network: { type: 'string' },
    timestamp: { type: 'number', exclusiveMinimum: 0 },
  },
  additionalProperties: false,
}

export const schemaNetworkWindowsTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nodeId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'nodeId'],
  additionalProperties: false,
}

export const schemaIssueTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nodeId: { type: 'string' },
    issue: { type: 'string' },
    proposal: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'nodeId', 'issue', 'proposal'],
  additionalProperties: false,
}

export const schemaDevIssueTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nodeId: { type: 'string' },
    devIssue: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'nodeId', 'devIssue'],
  additionalProperties: false,
}

export const schemaMessageTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    to: { type: 'string' },
    chatId: { type: 'string' },
    message: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'to', 'chatId', 'message'],
  additionalProperties: false,
}

export const schemaReadTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    to: { type: 'string' },
    chatId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'to', 'chatId'],
  additionalProperties: false,
}

export const schemaUpdateChatTollTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    to: { type: 'string' },
    chatId: { type: 'string' },
    required: { type: 'number', minimum: 0, maximum: 2 },
  },
  required: [...baseTxRequired, 'from', 'to', 'chatId', 'required'],
  additionalProperties: false,
}

export const schemeReclaimTollTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    to: { type: 'string' },
    chatId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'to', 'chatId'],
  additionalProperties: false,
}

export const schemaNodeRewardTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nodeId: { type: 'string' },
    to: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'nodeId', 'to'],
  additionalProperties: false,
}

export const schemaParametersTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nodeId: { type: 'string' },
    issue: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'nodeId', 'issue'],
  additionalProperties: false,
}

export const schemaChangeConfigTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    cycle: { type: 'number' },
    config: { type: 'string' },
    signs: {
      type: 'array',
      items: SignatureSchema,
    },
  },
  required: ['type', 'timestamp', 'from', 'cycle', 'config', 'signs'],
  additionalProperties: false,
}

export const schemaApplyChangeConfigTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    change: { type: 'object' },
  },
  required: ['type', 'timestamp', 'change'],
  additionalProperties: false,
}

export const schemaChangeNetworkParamTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    cycle: { type: 'number' },
    config: { type: 'string' },
    signs: {
      type: 'array',
      items: SignatureSchema,
    },
  },
  required: ['type', 'timestamp', 'from', 'cycle', 'config', 'signs'],
  additionalProperties: false,
}

export const schemaApplyChangeNetworkParamTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    change: { type: 'object' },
  },
  required: ['type', 'timestamp', 'change'],
  additionalProperties: false,
}

export const schemaDevParametersTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nodeId: { type: 'string' },
    devIssue: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'nodeId', 'devIssue'],
  additionalProperties: false,
}

export const schemaProposalTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposal: { type: 'string' },
    issue: { type: 'string' },
    parameters: { type: 'object' },
  },
  required: [...baseTxRequired, 'from', 'proposal', 'issue', 'parameters'],
  additionalProperties: false,
}

export const schemaDevProposalTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    devProposal: { type: 'string' },
    devIssue: { type: 'string' },
    totalAmount: { isBigInt: true },
    payments: {
      type: 'array',
      items: { type: 'object' },
    },
    title: { type: 'string' },
    description: { type: 'string' },
    payAddress: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'devProposal', 'devIssue', 'totalAmount', 'payments', 'title', 'description', 'payAddress'],
  additionalProperties: false,
}

export const schemaRegisterTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    aliasHash: { type: 'string' },
    alias: { type: 'string' },
    publicKey: { type: 'string' },
    pqPublicKey: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'aliasHash', 'alias', 'publicKey'],
  additionalProperties: false,
}

export const schemaRemoveFriendTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    to: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'to'],
  additionalProperties: false,
}

export const schemaRemoveStakeRequestTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    stake: { isBigInt: true },
  },
  required: [...baseTxRequired, 'from', 'stake'],
  additionalProperties: false,
}

export const schemaRemoveStakeTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    stake: { isBigInt: true },
  },
  required: [...baseTxRequired, 'from', 'stake'],
  additionalProperties: false,
}

export const schemaSnapshotClaimTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
  },
  required: [...baseTxRequired, 'from'],
  additionalProperties: false,
}

export const schemaSnapshotTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    snapshot: { type: 'object' },
  },
  required: [...baseTxRequired, 'from', 'snapshot'],
  additionalProperties: false,
}

export const schemaStakeTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    stake: { isBigInt: true },
  },
  required: [...baseTxRequired, 'from', 'stake'],
  additionalProperties: false,
}

export const schemaTallyTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nodeId: { type: 'string' },
    issue: { type: 'string' },
    proposals: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [...baseTxRequired, 'from', 'nodeId', 'issue', 'proposals'],
  additionalProperties: false,
}

export const schemaDevTallyTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nodeId: { type: 'string' },
    devIssue: { type: 'string' },
    devProposals: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [...baseTxRequired, 'from', 'nodeId', 'devIssue', 'devProposals'],
  additionalProperties: false,
}

export const schemaTollTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    toll: { isBigInt: true },
  },
  required: [...baseTxRequired, 'from', 'toll'],
  additionalProperties: false,
}

export const schemaVerifyTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    code: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'code'],
  additionalProperties: false,
}

export const schemaVoteTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    issue: { type: 'string' },
    proposal: { type: 'string' },
    amount: { isBigInt: true },
  },
  required: [...baseTxRequired, 'from', 'issue', 'proposal', 'amount'],
  additionalProperties: false,
}

export const schemaDevVoteTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    devIssue: { type: 'string' },
    devProposal: { type: 'string' },
    approve: { type: 'boolean' },
    amount: { isBigInt: true },
  },
  required: [...baseTxRequired, 'from', 'devIssue', 'devProposal', 'approve', 'amount'],
  additionalProperties: false,
}

export const schemaDevPaymentTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nodeId: { type: 'string' },
    developer: { type: 'string' },
    payment: { type: 'object' },
  },
  required: [...baseTxRequired, 'from', 'nodeId', 'developer', 'payment'],
  additionalProperties: false,
}

export const schemaSetCertTimeTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nominee: { type: 'string' },
    nominator: { type: 'string' },
    duration: { type: 'number' },
  },
  required: [...baseTxRequired, 'nominee', 'nominator', 'duration'],
  additionalProperties: false,
}

export const schemaDepositStakeTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nominee: { type: 'string' },
    nominator: { type: 'string' },
    stake: { isBigInt: true },
  },
  required: [...baseTxRequired, 'nominee', 'nominator', 'stake'],
  additionalProperties: false,
}

export const schemaWithdrawStakeTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nominee: { type: 'string' },
    nominator: { type: 'string' },
    force: { type: 'boolean' },
  },
  required: [...baseTxRequired, 'nominee', 'nominator', 'force'],
  additionalProperties: false,
}

export const schemaInitRewardTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    nominee: { type: 'string' },
    nodeActivatedTime: { type: 'number' },
    txData: {
      type: 'object',
      properties: {
        publicKey: { type: 'string' },
        nodeId: { type: 'string' },
        startTime: { type: 'number' },
      },
      required: ['publicKey', 'nodeId', 'startTime'],
      additionalProperties: false,
    },
  },
  required: [...baseTxRequired, 'nominee', 'nodeActivatedTime'],
  additionalProperties: false,
}

export const schemaClaimRewardTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    nominee: { type: 'string' },
    nominator: { type: 'string' },
    deactivatedNodeId: { type: 'string' },
    nodeDeactivatedTime: { type: 'number' },
    cycle: { type: 'number' },
    txData: {
      type: 'object',
      properties: {
        publicKey: { type: 'string' },
        nodeId: { type: 'string' },
        start: { type: 'number' },
        end: { type: 'number' },
        endTime: { type: 'number' },
      },
      required: ['publicKey', 'nodeId', 'start', 'end', 'endTime'],
      additionalProperties: false,
    },
  },
  required: [...baseTxRequired, 'nominee', 'nominator', 'deactivatedNodeId', 'nodeDeactivatedTime'],
  additionalProperties: false,
}

export const schemaApplyParametersTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    current: { type: 'object' },
    next: { type: 'object' },
    windows: { type: 'object' },
    nextWindows: { type: 'object' },
    issue: { type: 'number' },
    devWindows: { type: 'object' },
    nextDevWindows: { type: 'object' },
  },
  required: [...baseTxRequired, 'current', 'next', 'windows', 'nextWindows', 'issue'],
  additionalProperties: false,
}

export const schemaApplyDevParametersTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    devWindows: { type: 'object' },
    nextDevWindows: { type: 'object' },
    developerFund: {
      type: 'array',
      items: { type: 'object' },
    },
    nextDeveloperFund: {
      type: 'array',
      items: { type: 'object' },
    },
    devIssue: { type: 'number' },
  },
  required: [...baseTxRequired, 'devWindows', 'nextDevWindows', 'developerFund', 'nextDeveloperFund', 'devIssue'],
  additionalProperties: false,
}

export const schemaApplyDevPaymentTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    developerFund: {
      type: 'array',
      items: { type: 'object' },
    },
  },
  required: [...baseTxRequired, 'developerFund'],
  additionalProperties: false,
}

export const schemaApplyTallyTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    next: { type: 'object' },
    nextWindows: { type: 'object' },
  },
  required: [...baseTxRequired, 'next', 'nextWindows'],
  additionalProperties: false,
}

export const schemaApplyDevTallyTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    nextDeveloperFund: {
      type: 'array',
      items: { type: 'object' },
    },
    nextDevWindows: { type: 'object' },
  },
  required: [...baseTxRequired, 'nextDeveloperFund', 'nextDevWindows'],
  additionalProperties: false,
}

export function initSchemas(): void {
  try {
    addSchemas()
    console.log('All transaction schemas have been registered')
  } catch (e) {
    throw new Error(`Error while adding ajv schema: ${e.message}`)
  }
}

// Function to register all schemas
function addSchemas(): void {
  addSchema(AJVSchemaEnum.stake_cert, schemaStakeCert)
  addSchema(AJVSchemaEnum.remove_node_cert, schemaRemoveNodeCert)
  // Add reference schemas (these aren't part of TXTypes so add manually)
  addSchema(AJVSchemaEnum.signature, SignatureSchema)
  addSchema(AJVSchemaEnum.left_network_early_violation_data, schemaLeftNetworkEarlyViolationData)
  addSchema(AJVSchemaEnum.syncing_timeout_violation_data, schemaSyncingTimeoutViolationData)
  addSchema(AJVSchemaEnum.node_refuted_violation_data, schemaNodeRefutedViolationData)
  // Create a mapping of TXTypes to schema objects
  const txSchemaMap = {
    [TXTypes.transfer]: schemaTransferTX,
    [TXTypes.create]: schemaCreateTX,
    [TXTypes.distribute]: schemaDistributeTX,
    [TXTypes.email]: schemaEmailTX,
    [TXTypes.friend]: schemaFriendTX,
    [TXTypes.gossip_email_hash]: schemaGossipEmailHashTX,
    [TXTypes.init_network]: schemaInitNetworkTX,
    [TXTypes.network_windows]: schemaNetworkWindowsTX,
    [TXTypes.issue]: schemaIssueTX,
    [TXTypes.dev_issue]: schemaDevIssueTX,
    [TXTypes.message]: schemaMessageTX,
    [TXTypes.read]: schemaReadTX,
    [TXTypes.reclaim_toll]: schemeReclaimTollTX,
    [TXTypes.update_chat_toll]: schemaUpdateChatTollTX,
    [TXTypes.node_reward]: schemaNodeRewardTX,
    [TXTypes.parameters]: schemaParametersTX,
    [TXTypes.change_config]: schemaChangeConfigTX,
    [TXTypes.apply_change_config]: schemaApplyChangeConfigTX,
    [TXTypes.change_network_param]: schemaChangeNetworkParamTX,
    [TXTypes.apply_change_network_param]: schemaApplyChangeNetworkParamTX,
    [TXTypes.dev_parameters]: schemaDevParametersTX,
    [TXTypes.proposal]: schemaProposalTX,
    [TXTypes.dev_proposal]: schemaDevProposalTX,
    [TXTypes.register]: schemaRegisterTX,
    [TXTypes.remove_friend]: schemaRemoveFriendTX,
    [TXTypes.remove_stake_request]: schemaRemoveStakeRequestTX,
    [TXTypes.remove_stake]: schemaRemoveStakeTX,
    [TXTypes.snapshot_claim]: schemaSnapshotClaimTX,
    [TXTypes.snapshot]: schemaSnapshotTX,
    [TXTypes.stake]: schemaStakeTX,
    [TXTypes.tally]: schemaTallyTX,
    [TXTypes.dev_tally]: schemaDevTallyTX,
    [TXTypes.toll]: schemaTollTX,
    [TXTypes.verify]: schemaVerifyTX,
    [TXTypes.vote]: schemaVoteTX,
    [TXTypes.dev_vote]: schemaDevVoteTX,
    [TXTypes.developer_payment]: schemaDevPaymentTX,
    [TXTypes.set_cert_time]: schemaSetCertTimeTX,
    [TXTypes.deposit_stake]: schemaDepositStakeTX,
    [TXTypes.withdraw_stake]: schemaWithdrawStakeTX,
    [TXTypes.init_reward]: schemaInitRewardTX,
    [TXTypes.claim_reward]: schemaClaimRewardTX,
    [TXTypes.apply_parameters]: schemaApplyParametersTX,
    [TXTypes.apply_dev_parameters]: schemaApplyDevParametersTX,
    [TXTypes.apply_developer_payment]: schemaApplyDevPaymentTX,
    [TXTypes.apply_tally]: schemaApplyTallyTX,
    [TXTypes.apply_dev_tally]: schemaApplyDevTallyTX,
    [TXTypes.apply_penalty]: schemaPenaltyTX,
  }
  // Loop through TXTypes and register corresponding schemas
  Object.entries(txSchemaMap).forEach(([txType, schema]) => {
    // Convert TXType to the corresponding AJVSchemaEnum value (append "_tx")
    const schemaKey = `${txType}` as keyof typeof AJVSchemaEnum
    if (schemaKey in AJVSchemaEnum) {
      addSchema(AJVSchemaEnum[schemaKey], schema)
    } else {
      console.warn(`no ajvschemaenum found for ${schemaKey}`)
    }
  })
}
