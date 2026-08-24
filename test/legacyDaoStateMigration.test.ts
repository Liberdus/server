import { LiberdusFlags } from '../src/config'
import { Accounts, NetworkAccount } from '../src/@types'
import * as crypto from '../src/crypto'
import { calculateAccountHash } from '../src/utils'
import { backfillNetworkAccount } from '../src/transactions/apply_change_network_param'

describe('legacy DAO state migration', () => {
  const originalFlag = LiberdusFlags.versionFlags.removeLegacyDaoState

  afterEach(() => {
    LiberdusFlags.versionFlags.removeLegacyDaoState = originalFlag
  })

  beforeAll(() => {
    crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
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
})
