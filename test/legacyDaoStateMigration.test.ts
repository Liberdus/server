import { LiberdusFlags } from '../src/config'
import { Accounts, NetworkAccount, UserAccount } from '../src/@types'
import * as crypto from '../src/crypto'
import { calculateAccountHash, stripRetiredState } from '../src/utils'
import { backfillNetworkAccount } from '../src/transactions/apply_change_network_param'
import { onActiveVersionChange } from '../src/versioning'
import { userAccount } from '../src/accounts/userAccount'
import { Utils } from '@shardus/lib-types'

describe('legacy DAO state migration', () => {
  const originalFlag = LiberdusFlags.versionFlags.removeLegacyDaoState
  const originalUnusedTxFlag = LiberdusFlags.versionFlags.removeUnusedTxState
  const originalNetworkParamsFlag = LiberdusFlags.versionFlags.removeLegacyNetworkParams

  afterEach(() => {
    LiberdusFlags.versionFlags.removeLegacyDaoState = originalFlag
    LiberdusFlags.versionFlags.removeUnusedTxState = originalUnusedTxFlag
    LiberdusFlags.versionFlags.removeLegacyNetworkParams = originalNetworkParamsFlag
  })

  beforeAll(() => {
    crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
    crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  })

  test('the 2.5.2 migration is registered and activates the flag', async () => {
    // Snapshot every versionFlag: onActiveVersionChange replays all migrations up to the
    // given version, not just 2.5.2.
    const snapshot = { ...LiberdusFlags.versionFlags }
    LiberdusFlags.versionFlags.removeLegacyDaoState = false
    LiberdusFlags.versionFlags.removeUnusedTxState = false
    LiberdusFlags.versionFlags.removeLegacyNetworkParams = false

    try {
      await onActiveVersionChange('2.5.2')
      expect(LiberdusFlags.versionFlags.removeLegacyDaoState).toBe(true)
      expect(LiberdusFlags.versionFlags.removeUnusedTxState).toBe(true)
      expect(LiberdusFlags.versionFlags.removeLegacyNetworkParams).toBe(true)
    } finally {
      // Restore even on failure: onActiveVersionChange flips flags for every migration
      // up to 2.5.2, and leaking those would corrupt later tests.
      Object.assign(LiberdusFlags.versionFlags, snapshot)
    }
  })

  test('removes retired fields when the migration is active', () => {
    LiberdusFlags.versionFlags.removeLegacyDaoState = true
    const network = {
      type: 'NetworkAccount',
      current: { proposalFee: 1n, devProposalFee: 2n },
      next: {},
      windows: null,
      nextWindows: {},
      devWindows: null,
      nextDevWindows: {},
      issue: 1,
      devIssue: 1,
      developerFund: [],
      nextDeveloperFund: [],
    } as unknown as NetworkAccount

    backfillNetworkAccount(network)

    expect(network).not.toHaveProperty('next')
    expect(network).not.toHaveProperty('windows')
    expect(network).not.toHaveProperty('devWindows')
    expect(network).not.toHaveProperty('developerFund')
    expect(network.current).not.toHaveProperty('proposalFee')
    expect(network.current).not.toHaveProperty('devProposalFee')
  })

  test('does not strip retired state while calculating an account hash', () => {
    LiberdusFlags.versionFlags.removeLegacyDaoState = true
    const account = {
      id: 'user',
      type: 'UserAccount',
      hash: '',
      data: { payments: [{ amount: 1 }] },
    } as unknown as Accounts
    const payments = (account.data as unknown as { payments: unknown }).payments

    calculateAccountHash(account)

    // State conversion belongs to the consensus-ordered apply path only; hashing must
    // never remove legacy fields, or dormant accounts would fail hash verification.
    expect((account.data as unknown as { payments: unknown }).payments).toBe(payments)
  })

  test('strips retired user-account state only from the apply-state helper', () => {
    LiberdusFlags.versionFlags.removeLegacyDaoState = true
    const account = {
      type: 'UserAccount',
      data: { payments: [{ amount: 1n }] },
    } as unknown as UserAccount

    stripRetiredState(account)

    expect(account.data).not.toHaveProperty('payments')
  })

  test('unused-tx fields remain until the flag is active, then leave on the apply-state path', () => {
    const account = {
      id: 'user',
      type: 'UserAccount',
      hash: '',
      data: { balance: 50n, friends: {}, stake: 0n, remove_stake_request: null },
      emailHash: null,
      verified: false,
      claimedSnapshot: false,
    } as unknown as UserAccount
    LiberdusFlags.versionFlags.removeUnusedTxState = false
    stripRetiredState(account)
    expect(account.data).toHaveProperty('friends')
    expect(account).toHaveProperty('verified')

    LiberdusFlags.versionFlags.removeUnusedTxState = true
    calculateAccountHash(account as Accounts)
    expect(account.data).toHaveProperty('friends')
    stripRetiredState(account)
    expect(account.data).not.toHaveProperty('friends')
    expect(account.data).not.toHaveProperty('stake')
    expect(account.data).not.toHaveProperty('remove_stake_request')
    expect(account).not.toHaveProperty('emailHash')
    expect(account).not.toHaveProperty('verified')
    expect(account).not.toHaveProperty('claimedSnapshot')
  })

  test('legacy network parameters remain until activation and then leave the stored account', () => {
    const network = {
      type: 'NetworkAccount',
      current: {
        transactionFee: 1n,
        maintenanceInterval: 86_400_000,
        maintenanceFee: 0n,
        faucetAmount: 10n,
        nodeRewardAmountUsd: 1n,
        nodePenaltyUsd: 10n,
        stakeRequiredUsd: 10n,
        defaultToll: 1n,
        minToll: 1n,
        transactionFeeUsdStr: '0.01',
      },
    } as unknown as NetworkAccount
    const legacyKeys = [
      'transactionFee',
      'maintenanceInterval',
      'maintenanceFee',
      'faucetAmount',
      'nodeRewardAmountUsd',
      'nodePenaltyUsd',
      'stakeRequiredUsd',
      'defaultToll',
      'minToll',
    ]

    LiberdusFlags.versionFlags.removeLegacyNetworkParams = false
    backfillNetworkAccount(network)
    for (const key of legacyKeys) expect(network.current).toHaveProperty(key)

    LiberdusFlags.versionFlags.removeLegacyNetworkParams = true
    backfillNetworkAccount(network)
    for (const key of legacyKeys) expect(network.current).not.toHaveProperty(key)
    expect(network.current.transactionFeeUsdStr).toBe('0.01')
  })

  test('new users omit retired fields only after activation', () => {
    LiberdusFlags.versionFlags.removeUnusedTxState = false
    const before = userAccount('user', 1)
    expect(before.data).toHaveProperty('stake', 0n)
    expect(before.data).toHaveProperty('friends')
    expect(before).toHaveProperty('verified', false)

    LiberdusFlags.versionFlags.removeUnusedTxState = true
    const after = userAccount('user', 1)
    expect(after.data).not.toHaveProperty('stake')
    expect(after.data).not.toHaveProperty('friends')
    expect(after).not.toHaveProperty('verified')
  })
})
