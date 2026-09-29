import { Utils } from '@shardus/lib-types'
import { Shardus, ShardusTypes } from '@shardus/core'
import { AppReceiptData, NetworkAccount, Tx, UserAccount, WrappedStates } from '../src/@types'
import { userAccount } from '../src/accounts/userAccount'
import { INITIAL_PARAMETERS, LiberdusFlags } from '../src/config'
import * as crypto from '../src/crypto'
import * as AccountsStorage from '../src/storage/accountStorage'
import { getSetCertTimeFeeWei } from '../src/transactions/staking/set_cert_time'
import { createFailedAppReceiptData } from '../src/transactions/staking/withdraw_stake'
import { getTransactionFeeWei, maintenanceAmount, usdStrToWei } from '../src/utils'

describe('legacy network parameter activation', () => {
  const originalCachedNetworkAccount = AccountsStorage.cachedNetworkAccount
  const originalFlags = { ...LiberdusFlags.versionFlags }
  const networkAt = (activeVersion: string, includeLegacyParams: boolean): NetworkAccount =>
    ({
      type: 'NetworkAccount',
      current: {
        ...INITIAL_PARAMETERS,
        activeVersion,
        ...(includeLegacyParams ? { transactionFee: 10n ** 17n, maintenanceInterval: 86_400_000, maintenanceFee: 0n } : {}),
      },
    } as NetworkAccount)

  beforeAll(() => {
    crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
    crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  })

  afterEach(() => {
    AccountsStorage.setCachedNetworkAccount(originalCachedNetworkAccount)
    Object.assign(LiberdusFlags.versionFlags, originalFlags)
  })

  test('set_cert_time uses the old fee until the parameter-removal flag activates', () => {
    const before = networkAt('2.5.1', true)
    const after = networkAt('2.5.2', false)

    LiberdusFlags.versionFlags.removeLegacyNetworkParams = false
    expect(getSetCertTimeFeeWei(before)).toBe(125n * 10n ** 17n)
    LiberdusFlags.versionFlags.removeLegacyNetworkParams = true
    expect(getSetCertTimeFeeWei(after)).toBe(getTransactionFeeWei(after))
  })

  test('failed withdraw_stake switches fees with the parameter-removal flag', () => {
    const before = networkAt('2.5.1', true)
    const after = networkAt('2.5.2', false)
    const initialBalance = 10n ** 18n
    const chargeFailedWithdrawal = (network: NetworkAccount, removeLegacyNetworkParams: boolean): { balance: bigint; fee: bigint } => {
      AccountsStorage.setCachedNetworkAccount(network)
      LiberdusFlags.versionFlags.removeLegacyNetworkParams = removeLegacyNetworkParams
      const account = { data: { balance: initialBalance }, timestamp: 0 } as UserAccount
      const wrappedStates = { USER: { data: account } } as unknown as WrappedStates
      const addReceiptData = jest.fn()
      const dapp = { applyResponseAddReceiptData: addReceiptData } as unknown as Shardus
      const tx = { type: 'withdraw_stake', nominator: 'USER', nominee: 'NODE' } as Tx.WithdrawStake

      createFailedAppReceiptData(tx, 1, 'tx-id', wrappedStates, dapp, {} as ShardusTypes.ApplyResponse, 'invalid')

      const receipt = addReceiptData.mock.calls[0][1] as AppReceiptData
      return { balance: account.data.balance, fee: receipt.transactionFee }
    }

    const beforeResult = chargeFailedWithdrawal(before, false)
    expect(beforeResult).toEqual({ balance: initialBalance - 10n ** 17n, fee: 10n ** 17n })

    const afterFee = getTransactionFeeWei(after)
    expect(chargeFailedWithdrawal(after, true)).toEqual({ balance: initialBalance - afterFee, fee: afterFee })
  })

  test('maintenance stops advancing lastMaintenance when the parameter-removal flag activates', () => {
    const account = { lastMaintenance: 0, data: { balance: 50n } } as UserAccount
    const timestamp = 86_400_001

    const before = networkAt('2.5.1', true)
    LiberdusFlags.versionFlags.removeLegacyNetworkParams = false
    expect(maintenanceAmount(timestamp, account, before)).toBe(0n)
    expect(account.lastMaintenance).toBe(timestamp)

    const after = networkAt('2.5.2', false)
    LiberdusFlags.versionFlags.removeLegacyNetworkParams = true
    expect(maintenanceAmount(timestamp + 86_400_001, account, after)).toBe(0n)
    expect(account.lastMaintenance).toBe(timestamp)
  })

  test('new users use the USD default toll without a cached network account', () => {
    AccountsStorage.setCachedNetworkAccount(undefined)

    const account = userAccount('USER', 1)
    const expectedNetwork = { current: INITIAL_PARAMETERS } as NetworkAccount
    expect(account.data.toll).toBe(usdStrToWei(INITIAL_PARAMETERS.defaultTollUsdStr, expectedNetwork))
  })
})
