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
    fee: { isBigInt: true },
    deductTxFeeFromAmount: { type: 'boolean' },
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

// @deprecated Deprecated in version 2.5.0 - will be removed in a future version
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

// @deprecated Deprecated in version 2.5.0 - will be removed in a future version
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

// @deprecated Deprecated in version 2.5.0 - will be removed in a future version
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

// @deprecated Deprecated in version 2.5.0 - will be removed in a future version
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

// @deprecated Deprecated in version 2.5.0 - will be removed in a future version
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

// New DAO schemas (Phase 1: governance/economic/protocol proposals)
export const schemaDaoProposalCreateTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposalId: { type: 'string', minLength: 64, maxLength: 64 },
    metaId: { type: 'string', minLength: 64, maxLength: 64 },
    emergency: { type: 'boolean' },
    proposalType: { enum: ['governance', 'economic', 'protocol'] },
    gracePeriod: { type: 'number', minimum: 0 },
    title: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', maxLength: 10000 },
    options: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 10,
    },
    governance: { type: 'object' },
    economic: { type: 'object' },
    protocol: { type: 'object' },
    startTime: { type: 'number', minimum: 0 },
    networkId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'proposalId', 'metaId', 'emergency', 'proposalType', 'gracePeriod', 'title', 'description', 'options'],
  additionalProperties: false,
}

export const schemaDaoCommitteeVoteTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposalId: { type: 'string', minLength: 64, maxLength: 64 },
    vote: { enum: ['accept', 'withhold'] },
    // Required (enforced in validate, not here, since it's conditional on vote === 'withhold')
    withheldReason: { type: 'string' },
    networkId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'proposalId', 'vote'],
  additionalProperties: false,
}

export const schemaDaoCommitteeResultTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposalId: { type: 'string', minLength: 64, maxLength: 64 },
    networkId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'proposalId'],
  additionalProperties: false,
}

export const schemaDaoVoteTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposalId: { type: 'string', minLength: 64, maxLength: 64 },
    // weights[i] applies to proposal.options[i]; length/sum checks happen in validate()
    // where the proposal account (and therefore proposal.options.length) is available.
    weights: {
      type: 'array',
      items: { type: 'number', minimum: 0 },
      minItems: 2,
      maxItems: 10,
    },
    spend: { isBigInt: true },
    networkId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'proposalId', 'weights', 'spend'],
  additionalProperties: false,
}

export const schemaDaoVoteResultTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposalId: { type: 'string', minLength: 64, maxLength: 64 },
    networkId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'proposalId'],
  additionalProperties: false,
}

export const schemaDaoApplyParametersTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposalId: { type: 'string', minLength: 64, maxLength: 64 },
    networkId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'proposalId'],
  additionalProperties: false,
}

export const schemaDaoUnapplyParametersTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposalId: { type: 'string', minLength: 64, maxLength: 64 },
    networkId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'proposalId'],
  additionalProperties: false,
}

export const schemaDaoClaimRewardTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposalId: { type: 'string', minLength: 64, maxLength: 64 },
    networkId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'proposalId'],
  additionalProperties: false,
}

export const schemaDaoBurnRewardTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposalId: { type: 'string', minLength: 64, maxLength: 64 },
    networkId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'proposalId'],
  additionalProperties: false,
}

export const schemaDaoCancelTX = {
  type: 'object',
  properties: {
    ...baseTxProperties,
    from: { type: 'string' },
    proposalId: { type: 'string', minLength: 64, maxLength: 64 },
    networkId: { type: 'string' },
  },
  required: [...baseTxRequired, 'from', 'proposalId'],
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
    [TXTypes.message]: schemaMessageTX,
    [TXTypes.read]: schemaReadTX,
    [TXTypes.reclaim_toll]: schemeReclaimTollTX,
    [TXTypes.update_chat_toll]: schemaUpdateChatTollTX,
    [TXTypes.node_reward]: schemaNodeRewardTX,
    [TXTypes.change_config]: schemaChangeConfigTX,
    [TXTypes.apply_change_config]: schemaApplyChangeConfigTX,
    [TXTypes.change_network_param]: schemaChangeNetworkParamTX,
    [TXTypes.apply_change_network_param]: schemaApplyChangeNetworkParamTX,
    [TXTypes.register]: schemaRegisterTX,
    [TXTypes.remove_friend]: schemaRemoveFriendTX,
    [TXTypes.remove_stake_request]: schemaRemoveStakeRequestTX,
    [TXTypes.remove_stake]: schemaRemoveStakeTX,
    [TXTypes.snapshot_claim]: schemaSnapshotClaimTX,
    [TXTypes.snapshot]: schemaSnapshotTX,
    [TXTypes.stake]: schemaStakeTX,
    [TXTypes.toll]: schemaTollTX,
    [TXTypes.verify]: schemaVerifyTX,
    [TXTypes.set_cert_time]: schemaSetCertTimeTX,
    [TXTypes.deposit_stake]: schemaDepositStakeTX,
    [TXTypes.withdraw_stake]: schemaWithdrawStakeTX,
    [TXTypes.init_reward]: schemaInitRewardTX,
    [TXTypes.claim_reward]: schemaClaimRewardTX,
    [TXTypes.apply_penalty]: schemaPenaltyTX,
    // New DAO transactions
    [TXTypes.dao_proposal_create]: schemaDaoProposalCreateTX,
    [TXTypes.dao_committee_vote]: schemaDaoCommitteeVoteTX,
    [TXTypes.dao_committee_result]: schemaDaoCommitteeResultTX,
    [TXTypes.dao_vote]: schemaDaoVoteTX,
    [TXTypes.dao_vote_result]: schemaDaoVoteResultTX,
    [TXTypes.dao_apply_parameters]: schemaDaoApplyParametersTX,
    [TXTypes.dao_unapply_parameters]: schemaDaoUnapplyParametersTX,
    [TXTypes.dao_claim_reward]: schemaDaoClaimRewardTX,
    [TXTypes.dao_burn_reward]: schemaDaoBurnRewardTX,
    [TXTypes.dao_cancel]: schemaDaoCancelTX,
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
