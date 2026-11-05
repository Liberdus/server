import * as shardusCrypto from '@shardus/lib-crypto-utils'
import { Utils } from '@shardus/lib-types'
import { initAjvSchemas, verifyPayload } from '../src/@types/ajvHelper'
import { getVerifyFunction } from '../src/@types/schemaHelper'
import { AJVSchemaEnum, TXTypes, ViolationType } from '../src/@types'
import { LiberdusFlags } from '../src/config'
import { inject } from '../src/api/inject'
import { InjectTxToConsensor } from '../src/utils'
import * as Request from '../src/utils/request'
import * as AccountsStorage from '../src/storage/accountStorage'
import * as AdminCertificate from '../src/transactions/admin_certificate'
import { putAdminCertificateHandler } from '../src/transactions/admin_certificate'
import { canStayOnStandby, getTxSchemaError, verifyAppJoinData } from '../src/utils/appValidation'
import { validate_fields as validatePenaltyFields } from '../src/transactions/staking/apply_penalty'
import { validate_fields as validateQueryCertFields } from '../src/transactions/staking/query_certificate'

/* eslint-disable @typescript-eslint/no-explicit-any */

const key = 'a'.repeat(64)
const otherKey = 'b'.repeat(64)
const networkId = 'network-id'
const sign = { owner: key, sig: 'signature' }

const base = (type: TXTypes): any => ({ type, timestamp: 1, networkId, sign })
const unsignedBase = (type: TXTypes): any => ({ type, timestamp: 1, networkId })

const leftNetworkEarlyData = { nodeLostCycle: 1, nodeDroppedCycle: 2, nodeDroppedTime: 3 }
const nodeRefutedData = { nodeRefutedCycle: 1, nodeRefutedTime: 2 }

const stakeCert = { nominator: key, nominee: otherKey, stake: BigInt(10), certExp: 100, signs: [sign] }
const adminCert = { nominee: otherKey, certCreation: 1, certExp: 2, sign, goldenTicket: true }

// The encrypted memo payload web-client-v2 sends as transfer.xmemo (app.js:35031)
function webClientMemo(message: string): any {
  return {
    message,
    senderInfo: 'encrypted sender info',
    encrypted: true,
    encryptionMethod: 'xchacha20poly1305',
    pqEncSharedKey: 'pq key',
    selfKey: 'self key',
    sharedKeyMethod: 'pq',
    sent_timestamp: 1,
  }
}

// The encrypted wrapper web-client-v2 sends as message.xmessage for chats (app.js:24053), calls (app.js:28650)
// and meeting invites (app.js:29934). The chat text or call object is encrypted into `message`.
function webClientEncryptedPayload(encryptedMessage: string): any {
  return {
    message: encryptedMessage,
    encrypted: true,
    encryptionMethod: 'xchacha20poly1305',
    pqEncSharedKey: 'pq key',
    selfKey: 'self key',
    sent_timestamp: 1,
    senderInfo: 'encrypted sender info',
  }
}

// A web-client-v2 chat message: message is 'x' and the content lives in xmessage (app.js:23960)
function webClientMessage(xmessage: any): any {
  return { from: key, to: otherKey, chatId: 'chat', amount: BigInt(0), message: 'x', xmessage, fee: BigInt(1) }
}

// Each tx built the way its injector or client builds it. `optional` lists the fields the tx may omit.
const signedTxFixtures: { label: string; tx: any; optional?: string[] }[] = [
  {
    label: 'transfer',
    tx: {
      ...base(TXTypes.transfer),
      from: key,
      to: otherKey,
      amount: BigInt(5),
      chatId: 'chat',
      memo: 'hi',
      xmemo: { message: 'x' },
      fee: BigInt(1),
      deductTxFeeFromAmount: true,
    },
    optional: ['memo', 'xmemo', 'fee', 'deductTxFeeFromAmount'],
  },
  {
    label: 'message',
    tx: { ...base(TXTypes.message), from: key, to: otherKey, chatId: 'chat', message: 'encrypted', amount: BigInt(1), fee: BigInt(1) },
    optional: ['amount', 'fee'],
  },
  { label: 'read', tx: { ...base(TXTypes.read), from: key, to: otherKey, chatId: 'chat', fee: BigInt(1) }, optional: ['fee'] },
  {
    label: 'update_toll_required',
    tx: { ...base(TXTypes.update_toll_required), from: key, to: otherKey, chatId: 'chat', required: 2, previousRequired: 1, fee: BigInt(1) },
    optional: ['previousRequired', 'fee'],
  },
  { label: 'toll', tx: { ...base(TXTypes.toll), from: key, toll: BigInt(1), tollUnit: 'USD', fee: BigInt(1) }, optional: ['tollUnit', 'fee'] },
  // web-client-v2 shapes (app.js at 5ab3994d). These carry fields client.js does not send.
  {
    label: 'transfer (web client wallet)',
    tx: {
      ...base(TXTypes.transfer),
      from: key,
      to: otherKey,
      amount: BigInt(5),
      chatId: 'chat',
      xmemo: webClientMemo('encrypted memo'),
      fee: BigInt(1),
    },
  },
  {
    // The wallet always sends the memo payload, even when the user typed no memo
    label: 'transfer (web client wallet, empty memo)',
    tx: { ...base(TXTypes.transfer), from: key, to: otherKey, amount: BigInt(5), chatId: 'chat', xmemo: webClientMemo(''), fee: BigInt(1) },
  },
  {
    label: 'message (web client chat)',
    tx: { ...base(TXTypes.message), ...webClientMessage(webClientEncryptedPayload('encrypted chat text')) },
    optional: ['amount', 'fee'],
  },
  {
    label: 'message (web client call)',
    tx: { ...base(TXTypes.message), ...webClientMessage(webClientEncryptedPayload('encrypted call object')), callType: true },
    optional: ['callType'],
  },
  {
    label: 'message (web client meeting invite)',
    tx: { ...base(TXTypes.message), ...webClientMessage(webClientEncryptedPayload('encrypted invite object')), callType: true },
    optional: ['callType'],
  },
  {
    label: 'read (web client)',
    tx: { ...base(TXTypes.read), from: key, to: otherKey, chatId: 'chat', oldContactTimestamp: 1 },
    optional: ['oldContactTimestamp'],
  },
  {
    label: 'update_toll_required (web client)',
    tx: { ...base(TXTypes.update_toll_required), from: key, to: otherKey, chatId: 'chat', required: 0, previousRequired: 1, username: 'alice' },
    optional: ['previousRequired', 'username'],
  },
  {
    label: 'register',
    tx: { ...base(TXTypes.register), from: key, aliasHash: 'hash', alias: 'alice', publicKey: key, pqPublicKey: 'pq', private: true },
    optional: ['pqPublicKey', 'private'],
  },
  { label: 'deposit_stake', tx: { ...base(TXTypes.deposit_stake), nominator: key, nominee: otherKey, stake: BigInt(10) } },
  { label: 'withdraw_stake', tx: { ...base(TXTypes.withdraw_stake), nominator: key, nominee: otherKey, force: false } },
  { label: 'set_cert_time', tx: { ...base(TXTypes.set_cert_time), nominee: otherKey, nominator: key, duration: 20 } },
  {
    label: 'init_reward',
    tx: { ...base(TXTypes.init_reward), nominee: otherKey, nodeActivatedTime: 1, txData: { publicKey: otherKey, nodeId: key, startTime: 1 } },
  },
  {
    label: 'claim_reward',
    tx: {
      ...base(TXTypes.claim_reward),
      nominee: otherKey,
      nominator: key,
      deactivatedNodeId: key,
      nodeDeactivatedTime: 2,
      cycle: 3,
      txData: { publicKey: otherKey, nodeId: key, endTime: 2 },
    },
  },
  {
    label: 'apply_penalty',
    tx: {
      ...base(TXTypes.apply_penalty),
      reportedNodeId: key,
      reportedNodePublickKey: otherKey,
      nominator: key,
      violationType: ViolationType.LeftNetworkEarly,
      violationData: leftNetworkEarlyData,
    },
  },
  {
    label: 'dao_proposal_create',
    tx: {
      ...base(TXTypes.dao_proposal_create),
      from: key,
      proposalId: key,
      metaId: otherKey,
      emergency: false,
      proposalType: 'governance',
      gracePeriod: 0,
      title: 'title',
      description: 'description',
      options: ['yes', 'no'],
    },
    optional: ['gracePeriod'],
  },
  {
    label: 'dao_proposal_create (project)',
    tx: {
      ...base(TXTypes.dao_proposal_create),
      from: key,
      proposalId: key,
      metaId: otherKey,
      emergency: false,
      proposalType: 'project',
      title: 'title',
      description: 'description',
      options: ['yes', 'no'],
      project: { milestones: [], address: otherKey },
      startTime: 2,
    },
    optional: ['startTime'],
  },
  { label: 'dao_vote', tx: { ...base(TXTypes.dao_vote), from: key, proposalId: key, weights: [1, 0], spend: BigInt(1) } },
  {
    label: 'dao_committee_vote',
    tx: { ...base(TXTypes.dao_committee_vote), from: key, proposalId: key, vote: 'withhold', withheldReason: 'reason' },
    optional: ['withheldReason'],
  },
  { label: 'dao_committee_result', tx: { ...base(TXTypes.dao_committee_result), from: key, proposalId: key } },
  { label: 'dao_vote_result', tx: { ...base(TXTypes.dao_vote_result), from: key, proposalId: key } },
  { label: 'dao_apply_parameters', tx: { ...base(TXTypes.dao_apply_parameters), from: key, proposalId: key } },
  { label: 'dao_unapply_parameters', tx: { ...base(TXTypes.dao_unapply_parameters), from: key, proposalId: key } },
  { label: 'dao_claim_reward', tx: { ...base(TXTypes.dao_claim_reward), from: key, proposalId: key } },
  { label: 'dao_burn_reward', tx: { ...base(TXTypes.dao_burn_reward), from: key, proposalId: key } },
  { label: 'dao_cancel', tx: { ...base(TXTypes.dao_cancel), from: key, proposalId: key } },
  { label: 'dao_project_start', tx: { ...base(TXTypes.dao_project_start), from: key, proposalId: key } },
  // proposedTime is present when proposing a time and absent when endorsing the pending one
  {
    label: 'dao_project_milestone_start',
    tx: { ...base(TXTypes.dao_project_milestone_start), from: key, proposalId: key, proposedTime: 5 },
    optional: ['proposedTime'],
  },
  {
    label: 'dao_project_milestone_end',
    tx: { ...base(TXTypes.dao_project_milestone_end), from: key, proposalId: key, proposedTime: 5 },
    optional: ['proposedTime'],
  },
  {
    label: 'dao_project_milestone_terminate',
    tx: { ...base(TXTypes.dao_project_milestone_terminate), from: key, proposalId: key, milestoneNumber: 1, reason: 'reason' },
  },
  { label: 'dao_project_milestone_claim', tx: { ...base(TXTypes.dao_project_milestone_claim), from: key, proposalId: key, milestoneNumber: 1 } },
  { label: 'dao_project_reclaim_balance', tx: { ...base(TXTypes.dao_project_reclaim_balance), from: key, proposalId: key } },
  { label: 'dao_project_end', tx: { ...base(TXTypes.dao_project_end), from: key, proposalId: key } },
  // proposedAddress is present when proposing a replacement and absent when endorsing the pending one
  {
    label: 'dao_project_change_address',
    tx: { ...base(TXTypes.dao_project_change_address), from: key, proposalId: key, proposedAddress: otherKey },
    optional: ['proposedAddress'],
  },
  { label: 'create', tx: { ...base(TXTypes.create), from: key, to: otherKey, amount: BigInt(1) } },
  { label: 'reclaim_toll', tx: { ...base(TXTypes.reclaim_toll), from: key, to: otherKey, chatId: 'chat' } },
  { label: 'update_chat_toll', tx: { ...base(TXTypes.update_chat_toll), from: key, to: otherKey, chatId: 'chat', required: 1 } },
]

// Global txs are emitted through setGlobal and carry no sign.
const unsignedGlobalFixtures: { label: string; tx: any }[] = [
  { label: 'init_network', tx: { type: TXTypes.init_network, timestamp: 1, network: key, networkId } },
  { label: 'apply_change_config', tx: { ...unsignedBase(TXTypes.apply_change_config), from: key, change: { cycle: 1, change: {} } } },
  {
    label: 'apply_change_network_param',
    tx: { ...unsignedBase(TXTypes.apply_change_network_param), from: key, change: { cycle: 1, change: {}, appData: {} } },
  },
]

// change_config and change_network_param are signed with `signs`; the CLI deletes the singular `sign`.
const multiSigFixtures: { label: string; tx: any }[] = [
  { label: 'change_config', tx: { ...unsignedBase(TXTypes.change_config), from: key, cycle: -1, config: '{}', signs: [sign] } },
  { label: 'change_network_param', tx: { ...unsignedBase(TXTypes.change_network_param), from: key, cycle: -1, config: '{}', signs: [sign] } },
]

const without = (obj: any, field: string): any => {
  const copy = { ...obj }
  delete copy[field] // eslint-disable-line security/detect-object-injection
  return copy
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  initAjvSchemas()
})

afterAll(() => {
  jest.restoreAllMocks()
})

describe('AJV schema registration', () => {
  it.each(Object.values(TXTypes))('compiles a schema for tx type %s', (txType) => {
    expect(() => getVerifyFunction(txType)).not.toThrow()
  })

  it.each([
    AJVSchemaEnum.stake_cert,
    AJVSchemaEnum.remove_node_cert,
    AJVSchemaEnum.signature,
    AJVSchemaEnum.left_network_early_violation_data,
    AJVSchemaEnum.syncing_timeout_violation_data,
    AJVSchemaEnum.node_refuted_violation_data,
    AJVSchemaEnum.admin_cert,
    AJVSchemaEnum.app_join_data,
    AJVSchemaEnum.inject_tx_req,
    AJVSchemaEnum.stake_resp,
    AJVSchemaEnum.query_cert_req,
  ])('compiles the %s schema', (name) => {
    expect(() => getVerifyFunction(name)).not.toThrow()
  })
})

describe('AJV tx schemas', () => {
  // Compiling a schema cannot catch it rejecting a legitimate field, so every type needs a real payload.
  it('has an accepted payload fixture for every tx type', () => {
    const covered = new Set([...signedTxFixtures, ...unsignedGlobalFixtures, ...multiSigFixtures].map((f) => f.tx.type))
    expect(Object.values(TXTypes).filter((txType) => !covered.has(txType))).toEqual([])
  })

  it.each(signedTxFixtures.map((f) => [f.label, f.tx]))('accepts a %s tx', (_label, tx) => {
    expect(verifyPayload(tx.type, tx)).toBeNull()
  })

  const optionalCases = signedTxFixtures.flatMap((f) => (f.optional ?? []).map((field) => [f.label, field, f.tx]))
  it.each(optionalCases)('accepts a %s tx without optional %s', (_label, field, tx) => {
    expect(verifyPayload(tx.type, without(tx, field))).toBeNull()
  })

  it.each(signedTxFixtures.map((f) => [f.label, f.tx]))('rejects a %s tx without sign', (_label, tx) => {
    expect(verifyPayload(tx.type, without(tx, 'sign'))).not.toBeNull()
  })

  it.each(signedTxFixtures.map((f) => [f.label, f.tx]))('rejects a %s tx without networkId', (_label, tx) => {
    expect(verifyPayload(tx.type, without(tx, 'networkId'))).not.toBeNull()
  })

  it.each(signedTxFixtures.map((f) => [f.label, f.tx]))('rejects a %s tx with an unknown field', (_label, tx) => {
    expect(verifyPayload(tx.type, { ...tx, unexpected: true })).not.toBeNull()
  })

  it.each(unsignedGlobalFixtures.map((f) => [f.label, f.tx]))('accepts an unsigned %s global tx', (_label, tx) => {
    expect(verifyPayload(tx.type, tx)).toBeNull()
  })

  it.each(unsignedGlobalFixtures.map((f) => [f.label, f.tx]))('rejects a %s global tx without networkId', (_label, tx) => {
    expect(verifyPayload(tx.type, without(tx, 'networkId'))).not.toBeNull()
  })

  it.each([TXTypes.apply_change_config, TXTypes.apply_change_network_param])('rejects %s without from', (txType) => {
    const fixture = unsignedGlobalFixtures.find((f) => f.tx.type === txType)
    expect(verifyPayload(txType, without(fixture.tx, 'from'))).not.toBeNull()
  })

  it.each(multiSigFixtures.map((f) => [f.label, f.tx]))('accepts a %s tx with signs and no sign', (_label, tx) => {
    expect(verifyPayload(tx.type, tx)).toBeNull()
  })

  it.each(multiSigFixtures.map((f) => [f.label, f.tx]))('rejects a %s tx without signs', (_label, tx) => {
    expect(verifyPayload(tx.type, without(tx, 'signs'))).not.toBeNull()
  })

  it('rejects malformed nested data', () => {
    const transfer = signedTxFixtures.find((f) => f.label === 'transfer').tx
    const claimReward = signedTxFixtures.find((f) => f.label === 'claim_reward').tx
    const penalty = signedTxFixtures.find((f) => f.label === 'apply_penalty').tx

    expect(verifyPayload(TXTypes.transfer, { ...transfer, xmemo: { message: 5 } })).not.toBeNull()
    expect(verifyPayload(TXTypes.transfer, { ...transfer, xmemo: 'memo' })).not.toBeNull()
    expect(verifyPayload(TXTypes.transfer, { ...transfer, sign: { owner: key } })).not.toBeNull()
    expect(verifyPayload(TXTypes.transfer, { ...transfer, amount: '5' })).not.toBeNull()
    expect(verifyPayload(TXTypes.claim_reward, { ...claimReward, txData: { ...claimReward.txData, start: 1 } })).not.toBeNull()
    expect(verifyPayload(TXTypes.claim_reward, without(claimReward, 'txData'))).not.toBeNull()
    expect(verifyPayload(TXTypes.apply_penalty, { ...penalty, violationData: { nodeLostCycle: 1 } })).not.toBeNull()
  })

  it('rejects an update_toll_required value outside 0, 1 and 2', () => {
    const tx = signedTxFixtures.find((f) => f.label === 'update_toll_required').tx
    expect(verifyPayload(TXTypes.update_toll_required, { ...tx, required: 1.5 })).not.toBeNull()
    expect(verifyPayload(TXTypes.update_toll_required, { ...tx, required: 3 })).not.toBeNull()
  })

  const fixture = (label: string): any => signedTxFixtures.find((f) => f.label === label).tx
  it.each([
    ['message', 'xmessage', 'not an object', 'message (web client chat)'],
    ['message', 'xmessage', ['array'], 'message (web client chat)'],
    ['message', 'xmessage', null, 'message (web client chat)'],
    ['message', 'callType', 'true', 'message (web client call)'],
    ['read', 'oldContactTimestamp', '1', 'read (web client)'],
    ['update_toll_required', 'username', 5, 'update_toll_required (web client)'],
  ])('rejects %s with a wrong-type %s (%j)', (_type, field, value, label) => {
    const tx = fixture(label)
    expect(verifyPayload(tx.type, { ...tx, [field]: value })).not.toBeNull()
  })

  it('rejects an unknown toll unit', () => {
    const tx = signedTxFixtures.find((f) => f.label === 'toll').tx
    expect(verifyPayload(TXTypes.toll, { ...tx, tollUnit: 'EUR' })).not.toBeNull()
  })
})

describe('apply_penalty validate_fields', () => {
  const originalFlag = LiberdusFlags.enableAJVValidation

  // timestamp 0 stops validate_fields at the check right after the AJV block, so reaching
  // 'Invalid timestamp' means the violation checks passed.
  const penaltyTx = (violationType: any, violationData: any): any => ({
    ...base(TXTypes.apply_penalty),
    timestamp: 0,
    reportedNodeId: key,
    reportedNodePublickKey: otherKey,
    nominator: key,
    violationType,
    violationData,
  })
  const run = (tx: any): string => validatePenaltyFields(tx, { success: false, reason: '' } as any).reason

  afterEach(() => {
    LiberdusFlags.enableAJVValidation = originalFlag
  })

  describe('with AJV validation enabled', () => {
    beforeEach(() => {
      LiberdusFlags.enableAJVValidation = true
    })

    it.each([ViolationType.LiberdusMinID, ViolationType.DoubleVote, ViolationType.LiberdusMaxID, 'LeftNetworkEarly'])(
      'rejects unsupported violation type %s',
      (violationType) => {
        expect(run(penaltyTx(violationType, leftNetworkEarlyData))).toBe('Unsupported violation type')
      },
    )

    it('rejects a payload that belongs to another violation type', () => {
      expect(run(penaltyTx(ViolationType.LeftNetworkEarly, nodeRefutedData))).toMatch(/^Invalid violation data: /)
    })

    it('accepts a payload that matches its violation type', () => {
      expect(run(penaltyTx(ViolationType.LeftNetworkEarly, leftNetworkEarlyData))).toBe('Invalid timestamp')
      expect(run(penaltyTx(ViolationType.NodeRefuted, nodeRefutedData))).toBe('Invalid timestamp')
    })
  })

  describe('with AJV validation disabled', () => {
    beforeEach(() => {
      LiberdusFlags.enableAJVValidation = false
    })

    it('keeps the previous behavior for a mismatched payload', () => {
      expect(run(penaltyTx(ViolationType.LeftNetworkEarly, nodeRefutedData))).toBe('Invalid timestamp')
    })
  })
})

describe('app validation hooks', () => {
  const originalFlag = LiberdusFlags.enableAJVValidation
  const originalNetworkAccount = AccountsStorage.cachedNetworkAccount
  const joinRequest = (appJoinData: any): any => ({ appJoinData })
  const joinData = (version: string): any => ({ version, stakeCert: null, adminCert: null })

  beforeEach(() => {
    AccountsStorage.setCachedNetworkAccount({ current: { minVersion: '2.5.0', latestVersion: '2.5.3' } } as any)
  })

  afterEach(() => {
    LiberdusFlags.enableAJVValidation = originalFlag
    AccountsStorage.setCachedNetworkAccount(originalNetworkAccount)
  })

  describe('with AJV validation enabled', () => {
    beforeEach(() => {
      LiberdusFlags.enableAJVValidation = true
    })

    it('getTxSchemaError accepts a valid tx and reports a schema failure', () => {
      const transfer = signedTxFixtures.find((f) => f.label === 'transfer').tx
      expect(getTxSchemaError(transfer)).toBeNull()
      expect(getTxSchemaError({ ...transfer, unexpected: true })).toMatch(/^AJV failed for transfer tx, errors: /)
    })

    it('verifyAppJoinData accepts valid join data and rejects malformed join data', () => {
      expect(verifyAppJoinData(joinData('2.5.3'))).toBeNull()
      expect(verifyAppJoinData(undefined)).not.toBeNull()
      expect(verifyAppJoinData({ ...joinData('2.5.3'), extra: true })).not.toBeNull()
    })

    it('canStayOnStandby removes a node with malformed join data instead of throwing', () => {
      const missing = canStayOnStandby({} as any)
      expect(missing.canStay).toBe(false)
      expect(missing.reason).toMatch(/^canStayOnStandby: invalid app join data: /)
      expect(canStayOnStandby(joinRequest({ version: '2.5.3' })).canStay).toBe(false)
    })

    it('canStayOnStandby still enforces the version bounds', () => {
      expect(canStayOnStandby(joinRequest(joinData('2.5.2')))).toEqual({ canStay: true, reason: '' })
      expect(canStayOnStandby(joinRequest(joinData('2.4.9'))).canStay).toBe(false)
      expect(canStayOnStandby(joinRequest(joinData('2.5.4'))).canStay).toBe(false)
    })

    it('canStayOnStandby keeps every node before the network account is cached', () => {
      AccountsStorage.setCachedNetworkAccount(undefined)
      expect(canStayOnStandby({} as any).canStay).toBe(true)
    })
  })

  describe('with AJV validation disabled', () => {
    beforeEach(() => {
      LiberdusFlags.enableAJVValidation = false
    })

    it('getTxSchemaError and verifyAppJoinData skip the schema', () => {
      const transfer = signedTxFixtures.find((f) => f.label === 'transfer').tx
      expect(getTxSchemaError({ ...transfer, unexpected: true })).toBeNull()
      expect(verifyAppJoinData(undefined)).toBeNull()
    })

    it('canStayOnStandby only checks the version bounds', () => {
      expect(canStayOnStandby(joinRequest({ version: '2.5.3', extra: true })).canStay).toBe(true)
      expect(canStayOnStandby(joinRequest(joinData('2.4.9'))).canStay).toBe(false)
    })
  })
})

describe('node and join data schemas', () => {
  it('accepts join data with null certificates or a stake certificate', () => {
    expect(verifyPayload(AJVSchemaEnum.app_join_data, { version: '2.5.3', stakeCert: null, adminCert: null })).toBeNull()
    expect(verifyPayload(AJVSchemaEnum.app_join_data, { version: '2.5.3', stakeCert, adminCert })).toBeNull()
  })

  it('rejects malformed join data', () => {
    const joinData = { version: '2.5.3', stakeCert: null, adminCert: null }
    expect(verifyPayload(AJVSchemaEnum.app_join_data, null)).not.toBeNull()
    expect(verifyPayload(AJVSchemaEnum.app_join_data, without(joinData, 'version'))).not.toBeNull()
    expect(verifyPayload(AJVSchemaEnum.app_join_data, { ...joinData, extra: true })).not.toBeNull()
    expect(verifyPayload(AJVSchemaEnum.app_join_data, { ...joinData, stakeCert: { ...stakeCert, stake: '10' } })).not.toBeNull()
  })

  it('keeps the stake certificate bigint through a serialize and parse round trip', () => {
    const roundTripped = Utils.safeJsonParse(Utils.safeStringify({ version: '2.5.3', stakeCert, adminCert: null }))
    expect(typeof roundTripped.stakeCert.stake).toBe('bigint')
    expect(verifyPayload(AJVSchemaEnum.app_join_data, roundTripped)).toBeNull()
  })

  it.each([
    ['a missing field', without(adminCert, 'certExp')],
    ['a wrong type', { ...adminCert, certCreation: '1' }],
    ['a non-boolean goldenTicket', { ...adminCert, goldenTicket: 'true' }],
    ['a malformed sign', { ...adminCert, sign: { owner: key } }],
  ])('rejects an admin certificate with %s', (_label, cert) => {
    expect(verifyPayload(AJVSchemaEnum.admin_cert, cert)).not.toBeNull()
  })

  it('rejects a malformed certificate in putAdminCertificateHandler before the field checks', async () => {
    const shardus: any = { crypto: { getPublicKey: jest.fn(() => key) } }

    const malformed = await putAdminCertificateHandler({ body: { ...adminCert, goldenTicket: 'true' } } as any, shardus)
    expect(malformed.success).toBe(false)
    expect(malformed.reason).toMatch(/^Invalid admin certificate: /)
    expect(shardus.crypto.getPublicKey).not.toHaveBeenCalled()

    // A well-formed certificate gets past the schema to the nominee check
    const wellFormed = await putAdminCertificateHandler({ body: adminCert } as any, shardus)
    expect(wellFormed.reason).toBe('nominee address and the current node public key do not match')
  })

  describe('signed admin certificates through putAdminCertificateHandler', () => {
    const devKeys = shardusCrypto.generateKeypair()
    const shardus: any = {
      crypto: { getPublicKey: () => otherKey, verify: () => true },
      getDevPublicKey: () => devKeys.publicKey,
      ensureKeySecurity: () => true,
    }
    const signedCert = (fields: any): any =>
      shardusCrypto.signObj({ nominee: otherKey, certCreation: 1, certExp: 2, ...fields }, devKeys.secretKey, devKeys.publicKey)
    const originalAdminCert = AdminCertificate.adminCert

    // A successful PUT stores the certificate in module state
    afterEach(() => {
      AdminCertificate.setAdminCertificate(originalAdminCert)
    })

    it('accepts a certificate in the shape the Golden Ticket server signs', async () => {
      const cert = signedCert({ goldenTicket: true })
      expect(verifyPayload(AJVSchemaEnum.app_join_data, { version: '2.5.3', stakeCert: null, adminCert: cert })).toBeNull()
      expect(await putAdminCertificateHandler({ body: cert } as any, shardus)).toEqual({ success: true })
      expect(AdminCertificate.adminCert).toEqual(cert)
    })

    it('still accepts a certificate an older client.js signed with networkId', async () => {
      // networkId is covered by the signature, so it cannot be stripped before verification
      const cert = signedCert({ goldenTicket: false, networkId })
      expect(verifyPayload(AJVSchemaEnum.app_join_data, { version: '2.5.3', stakeCert: null, adminCert: cert })).toBeNull()
      expect(await putAdminCertificateHandler({ body: cert } as any, shardus)).toEqual({ success: true })
    })
  })

  it('rejects a malformed query certificate request before the field checks', () => {
    expect(validateQueryCertFields({ nominee: otherKey, nominator: key } as any).reason).toMatch(/^Invalid query certificate request: /)
    expect(validateQueryCertFields({ nominee: otherKey, nominator: key, sign, extra: 1 } as any).reason).toMatch(/^Invalid query certificate request: /)
  })

  it('accepts only non-empty hex stake amounts', () => {
    const amount = (value: string): any => ({ dataType: 'bi', value })
    expect(verifyPayload(AJVSchemaEnum.stake_resp, { stakeRequired: amount('00ff'), stakeRequiredUsd: amount('0a') })).toBeNull()
    expect(verifyPayload(AJVSchemaEnum.stake_resp, { stakeRequired: amount('not hex'), stakeRequiredUsd: amount('0a') })).not.toBeNull()
    expect(verifyPayload(AJVSchemaEnum.stake_resp, { stakeRequired: amount(''), stakeRequiredUsd: amount('0a') })).not.toBeNull()
  })
})

describe('POST /inject envelope', () => {
  const makeRes = (): any => {
    const res: any = {}
    res.status = jest.fn(() => res)
    res.json = jest.fn(() => res)
    return res
  }
  const makeDapp = (): any => ({ put: jest.fn(async () => ({ success: true, reason: '', status: 200 })), log: jest.fn() })

  it.each([
    ['a missing tx', {}, /^Invalid inject request: /],
    ['a non-string tx', { tx: { type: 'transfer' } }, /^Invalid inject request: /],
    ['malformed JSON', { tx: '{bad' }, /^The tx field must contain valid JSON$/],
    ['null', { tx: 'null' }, /^The tx field must contain a JSON object$/],
    ['an array', { tx: '[]' }, /^The tx field must contain a JSON object$/],
    ['a primitive', { tx: '5' }, /^The tx field must contain a JSON object$/],
  ])('rejects %s with HTTP 400 and a result.reason before dapp.put', async (_label, body, reason) => {
    const dapp = makeDapp()
    const res = makeRes()

    await inject(dapp)({ body }, res)

    expect(res.status).toHaveBeenCalledWith(400)
    // Same shape as a dapp.put result, so clients read the reason from result.reason
    expect(res.json).toHaveBeenCalledWith({ result: { success: false, reason: expect.stringMatching(reason), status: 400 } })
    expect(dapp.put).not.toHaveBeenCalled()
  })

  it('returns a generic HTTP 500 when dapp.put throws', async () => {
    const tx = signedTxFixtures.find((f) => f.label === 'transfer').tx
    const dapp = makeDapp()
    dapp.put.mockRejectedValue(new Error('internal detail'))
    const res = makeRes()

    await inject(dapp)({ body: { tx: Utils.safeStringify(tx) } }, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ result: { success: false, reason: 'Unable to process transaction', status: 500 } })
  })

  it('passes a web client call message through the inject envelope and its schema', async () => {
    const tx = signedTxFixtures.find((f) => f.label === 'message (web client call)').tx
    const dapp = makeDapp()
    const res = makeRes()

    // Same envelope web-client-v2 injectTx sends: { tx: "<stringify JSON>" }
    await inject(dapp)({ body: { tx: Utils.safeStringify(tx) } }, res)

    expect(res.status).not.toHaveBeenCalled()
    const putTx = dapp.put.mock.calls[0][0]
    expect(putTx.callType).toBe(true)
    expect(putTx.xmessage).toEqual(webClientEncryptedPayload('encrypted call object'))
    expect(verifyPayload(TXTypes.message, putTx)).toBeNull()
  })

  it('passes a client-built tx to dapp.put with its bigints intact', async () => {
    const tx = signedTxFixtures.find((f) => f.label === 'transfer').tx
    const dapp = makeDapp()
    const res = makeRes()

    // Same envelope the client sends: { tx: "<safeStringify JSON>" }
    await inject(dapp)({ body: { tx: Utils.safeStringify(tx) } }, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(dapp.put).toHaveBeenCalledTimes(1)
    const putTx = dapp.put.mock.calls[0][0]
    expect(typeof putTx.amount).toBe('bigint')
    expect(verifyPayload(TXTypes.transfer, putTx)).toBeNull()
  })

  // Node-to-node injection (used for set_cert_time) reads the same failure shape
  describe('InjectTxToConsensor', () => {
    const node = { ip: '127.0.0.1', port: 9001, publicKey: key } as any
    const tx = { type: TXTypes.set_cert_time, timestamp: 1 } as any
    let post: jest.SpyInstance

    beforeEach(() => {
      post = jest.spyOn(Request, 'shardusPostToNode')
    })

    afterEach(() => {
      post.mockRestore()
    })

    it('returns the node result when injection succeeds', async () => {
      post.mockResolvedValue({ data: { result: { success: true, reason: '', status: 200 } } })
      expect(await InjectTxToConsensor([node], tx)).toEqual({ success: true, reason: '', status: 200 })
    })

    it('surfaces result.reason from an HTTP 400/500 failure', async () => {
      post.mockRejectedValue({
        message: 'Request failed with status code 400',
        response: { status: 400, data: { result: { success: false, reason: 'The tx field must contain a JSON object', status: 400 } } },
      })
      expect(await InjectTxToConsensor([node], tx)).toEqual({ success: false, reason: 'The tx field must contain a JSON object' })
    })

    it('falls back to the error message when there is no response body', async () => {
      post.mockRejectedValue(new Error('connect ECONNREFUSED'))
      expect(await InjectTxToConsensor([node], tx)).toEqual({ success: false, reason: 'connect ECONNREFUSED' })
    })

    describe('with several nodes', () => {
      const nodeA = { ...node, ip: '10.0.0.1' }
      const nodeB = { ...node, ip: '10.0.0.2' }
      const nodeC = { ...node, ip: '10.0.0.3' }
      const ok = { data: { result: { success: true, reason: '', status: 200 } } }
      const rejected = (reason: string): any => ({ data: { result: { success: false, reason, status: 200 } } })
      const httpError = (reason: string): any => ({
        message: 'Request failed with status code 400',
        response: { status: 400, data: { result: { success: false, reason, status: 400 } } },
      })
      const later = <V>(ms: number, value: V, fail = false): Promise<V> =>
        new Promise((resolve, reject) => setTimeout(() => (fail ? reject(value) : resolve(value)), ms))
      // Each node answers on its own schedule
      const answer = (byIp: Record<string, () => Promise<unknown>>): void => {
        post.mockImplementation((target) => byIp[target.ip]())
      }

      it('returns a later success instead of an earlier failure', async () => {
        answer({ '10.0.0.1': () => later(1, rejected('node A busy')), '10.0.0.2': () => later(20, ok) })
        expect(await InjectTxToConsensor([nodeA, nodeB], tx)).toEqual(ok.data.result)
      })

      it('returns a success even when another node errors first', async () => {
        answer({ '10.0.0.1': () => later(1, httpError('node A rejected'), true), '10.0.0.2': () => later(20, ok) })
        expect(await InjectTxToConsensor([nodeA, nodeB], tx)).toEqual(ok.data.result)
      })

      it('returns the first failure response once every node has failed', async () => {
        answer({
          '10.0.0.1': () => later(1, rejected('first failure')),
          '10.0.0.2': () => later(10, rejected('second failure')),
          '10.0.0.3': () => later(20, httpError('request error'), true),
        })
        expect(await InjectTxToConsensor([nodeA, nodeB, nodeC], tx)).toEqual({ success: false, reason: 'first failure', status: 200 })
      })

      it('surfaces a request error reason when no node returned a failure body', async () => {
        answer({ '10.0.0.1': () => later(1, httpError('node A rejected'), true), '10.0.0.2': () => later(10, new Error('connect ECONNREFUSED'), true) })
        expect(await InjectTxToConsensor([nodeA, nodeB], tx)).toEqual({ success: false, reason: 'connect ECONNREFUSED' })
      })

      it('ignores a malformed answer and reports the real failure', async () => {
        answer({ '10.0.0.1': () => later(1, { data: {} }), '10.0.0.2': () => later(10, rejected('node B rejected')) })
        expect(await InjectTxToConsensor([nodeA, nodeB], tx)).toEqual({ success: false, reason: 'node B rejected', status: 200 })
      })

      it('ignores a malformed answer and reports a request error reason', async () => {
        answer({ '10.0.0.1': () => later(1, { data: {} }), '10.0.0.2': () => later(10, httpError('node B rejected'), true) })
        expect(await InjectTxToConsensor([nodeA, nodeB], tx)).toEqual({ success: false, reason: 'node B rejected' })
      })

      it('returns a structured failure when every answer is malformed', async () => {
        answer({ '10.0.0.1': () => later(1, { data: {} }), '10.0.0.2': () => later(10, {}) })
        expect(await InjectTxToConsensor([nodeA, nodeB], tx)).toEqual({ success: false, reason: 'Invalid injection response' })
      })

      it('still returns a success after an answer with no data', async () => {
        answer({ '10.0.0.1': () => later(1, {}), '10.0.0.2': () => later(10, ok) })
        expect(await InjectTxToConsensor([nodeA, nodeB], tx)).toEqual(ok.data.result)
      })

      it('fails immediately for an empty node list', async () => {
        expect(await InjectTxToConsensor([], tx)).toEqual({ success: false, reason: 'No node answered the injection.' })
        expect(post).not.toHaveBeenCalled()
      })

      describe('timeout', () => {
        const hang = (): Promise<unknown> => new Promise(() => undefined)
        // Lets resolved node answers reach the race before time is advanced
        const flush = async (): Promise<void> => {
          for (let i = 0; i < 5; i++) await Promise.resolve()
        }

        beforeEach(() => {
          jest.useFakeTimers()
        })

        afterEach(() => {
          jest.useRealTimers()
        })

        it('waits the full 5s for a slower node before returning a failure, then ignores a late success', async () => {
          let answerNodeB: (value: unknown) => void
          answer({
            '10.0.0.1': () => Promise.resolve(rejected('node A rejected')),
            '10.0.0.2': () => new Promise((resolve) => (answerNodeB = resolve)),
          })
          let settled = false
          const result = InjectTxToConsensor([nodeA, nodeB], tx).then((value) => {
            settled = true
            return value
          })

          await flush()
          jest.advanceTimersByTime(4999)
          await flush()
          expect(settled).toBe(false)

          jest.advanceTimersByTime(1)
          await flush()
          expect(settled).toBe(true)
          expect(await result).toEqual({ success: false, reason: 'node A rejected', status: 200 })

          // Node B accepts after the race has settled; the reported failure stands
          answerNodeB(ok)
          await flush()
          expect(await result).toEqual({ success: false, reason: 'node A rejected', status: 200 })
        })

        it('reports the timeout when every node hangs', async () => {
          answer({ '10.0.0.1': hang, '10.0.0.2': hang })
          const result = InjectTxToConsensor([nodeA, nodeB], tx)
          await flush()
          jest.advanceTimersByTime(5000)
          expect(await result).toEqual({ success: false, reason: 'Timeout: Operation did not complete within the allowed time.' })
        })
      })
    })
  })
})
