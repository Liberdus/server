import { Shardus, ShardusTypes } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { INITIAL_PARAMETERS, LiberdusFlags, networkAccount as networkAccountId } from '../src/config'
import { Accounts, DevAccount, NetworkAccount, OurAppDefinedData, Tx, TXTypes, WrappedStates } from '../src/@types'
import * as crypto from '../src/crypto'
import * as utils from '../src/utils'
import * as AccountsStorage from '../src/storage/accountStorage'
import * as changeConfig from '../src/transactions/change_config'
import * as applyChangeConfig from '../src/transactions/apply_change_config'
import * as changeNetworkParam from '../src/transactions/change_network_param'
import * as applyChangeNetworkParam from '../src/transactions/apply_change_network_param'
import * as daoApplyParameters from '../src/transactions/dao/dao_apply_parameters'
import { daoProposalsMetaId } from '../src/accounts/daoProposalsMetaAccount'

/**
 * A global message promises an afterStateHash computed before the change lands. If the
 * apply path normalizes the network account differently from the propose path, the
 * archiver sees a mismatch. These tests pin the two together for both global paths,
 * with the network account still carrying retired DAO state.
 */
describe('global network-account afterStateHash parity', () => {
  const devAddress = 'a'.repeat(64)
  const originalFlag = LiberdusFlags.versionFlags.removeLegacyDaoState
  const originalUnusedFlag = LiberdusFlags.versionFlags.removeUnusedTxState
  const originalNetworkParamsFlag = LiberdusFlags.versionFlags.removeLegacyNetworkParams
  const retiredNetworkParamKeys = [
    'transactionFee',
    'faucetAmount',
    'nodeRewardAmountUsd',
    'nodePenaltyUsd',
    'stakeRequiredUsd',
    'defaultToll',
    'minToll',
  ]

  beforeAll(() => {
    crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
    // src/index.ts installs this at startup; without it fast-stable-stringify cannot
    // hash the BigInt fields in network.current.
    crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  })

  const originalCachedNetworkAccount = AccountsStorage.cachedNetworkAccount

  afterEach(() => {
    LiberdusFlags.versionFlags.removeLegacyDaoState = originalFlag
    LiberdusFlags.versionFlags.removeUnusedTxState = originalUnusedFlag
    LiberdusFlags.versionFlags.removeLegacyNetworkParams = originalNetworkParamsFlag
    // assertParity overwrites this module global; put it back so the suite is self-contained.
    AccountsStorage.setCachedNetworkAccount(originalCachedNetworkAccount)
  })

  /**
   * A pre-2.5.2 network account: current params plus the retired DAO fields. `current` is
   * deep-copied so the two accounts a parity run builds share nothing, and so a handler
   * mutating a nested section cannot reach the module-level INITIAL_PARAMETERS.
   */
  const legacyNetworkAccount = (): NetworkAccount =>
    ({
      id: networkAccountId,
      networkId: 'n'.repeat(64),
      type: 'NetworkAccount',
      listOfChanges: [],
      current: {
        ...utils.deepCopy(INITIAL_PARAMETERS),
        activeVersion: LiberdusFlags.versionFlags.removeLegacyNetworkParams ? '2.5.2' : '2.5.1',
        proposalFee: 50n,
        devProposalFee: 50n,
        transactionFee: 10n ** 17n,
        maintenanceInterval: 86_400_000,
        maintenanceFee: 0n,
        faucetAmount: 10n,
        nodeRewardAmountUsd: 1n,
        nodePenaltyUsd: 10n,
        stakeRequiredUsd: 10n,
        defaultToll: 1n,
        minToll: 1n,
      },
      next: {},
      windows: null,
      nextWindows: {},
      devWindows: null,
      nextDevWindows: {},
      developerFund: [],
      nextDeveloperFund: [],
      issue: 1,
      devIssue: 1,
      hash: 'stale-hash',
      timestamp: 1000,
    }) as unknown as NetworkAccount

  const devAccount = (): DevAccount => ({ id: devAddress, type: 'DevAccount', hash: '', timestamp: 0 })

  const stubDapp = (): Shardus =>
    ({
      getLatestCycles: () => [{ counter: 100 }],
      applyResponseAddReceiptData: () => undefined,
      shardusGetTime: () => 5000,
      log: () => undefined,
    }) as unknown as Shardus

  const wrap = (network: NetworkAccount): WrappedStates =>
    ({
      [devAddress]: { data: devAccount(), stateId: 'dev-state' },
      [networkAccountId]: { data: network, stateId: 'net-state' },
    }) as unknown as WrappedStates

  /**
   * Runs the propose handler to capture the promised afterStateHash, then replays the
   * emitted global message through its apply handler on an independent copy of the same
   * starting account. Both hashes must agree.
   */
  const assertParity = (
    propose: { apply: (...args: never[]) => void },
    applyHandler: { apply: (...args: never[]) => void },
    tx: unknown,
    makeStates: (network: NetworkAccount) => WrappedStates = wrap,
  ): OurAppDefinedData['globalMsg'] => {
    const network = legacyNetworkAccount()
    AccountsStorage.setCachedNetworkAccount(network)

    const proposeResponse = { appDefinedData: {} } as unknown as ShardusTypes.ApplyResponse
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(propose.apply as any)(tx, 5000, 'tx-id', makeStates(network), stubDapp(), proposeResponse)

    const globalMsg = (proposeResponse.appDefinedData as OurAppDefinedData).globalMsg
    const { value, when, afterStateHash } = globalMsg

    // Apply the global message to a fresh copy of the same pre-change account. The apply
    // handlers read only the network account, so the default wrap suffices even when the
    // propose side needed a richer set.
    const applied = legacyNetworkAccount()
    const applyResponse = { appDefinedData: {} } as unknown as ShardusTypes.ApplyResponse
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(applyHandler.apply as any)(value, when, 'global-tx-id', wrap(applied), stubDapp(), applyResponse)

    for (const key of retiredNetworkParamKeys) {
      expect(Object.prototype.hasOwnProperty.call(applied.current, key)).toBe(!LiberdusFlags.versionFlags.removeLegacyNetworkParams)
    }
    expect(applied.current.maintenanceInterval).toBe(INITIAL_PARAMETERS.maintenanceInterval)
    expect(applied.current.maintenanceFee).toBe(INITIAL_PARAMETERS.maintenanceFee)

    expect(utils.calculateAccountHash(applied as unknown as Accounts)).toEqual(afterStateHash)
    return globalMsg
  }

  const changeConfigTx = (): Tx.ChangeConfig =>
    ({
      type: 'change_config',
      from: devAddress,
      cycle: -1,
      config: Utils.safeStringify({ p2p: { maxNodesToRotate: 3 } }),
      timestamp: 5000,
      networkId: 'n'.repeat(64),
    }) as unknown as Tx.ChangeConfig

  // change_network_param.validate compares the parsed config directly against
  // network.current, so a realistic payload is flat — not wrapped in `current`.
  const networkParamChange = { transactionFeeUsdStr: '0.02' }

  // A governance proposal resolves its changes against network.current.dao, and emits
  // apply_change_network_param. Only the fields dao_apply_parameters.apply reads are set.
  const proposalId = 'p'.repeat(64)
  const voterAddress = 'b'.repeat(64)

  const daoWrap = (network: NetworkAccount): WrappedStates =>
    ({
      [voterAddress]: { data: { id: voterAddress, type: 'UserAccount', data: { balance: 10n ** 20n } }, stateId: 'voter-state' },
      [proposalId]: {
        data: {
          id: proposalId,
          type: 'DaoProposalAccount',
          proposalType: 'governance',
          emergency: false,
          status: 'accepted',
          number: 1,
          options: ['no', 'burn 60'],
          winningOptionIndex: 1,
          governance: { changes: [[{ key: 'pctBurned', value: '60', current: '50' }]] },
          timestamp: 1000,
        },
        stateId: 'proposal-state',
      },
      [daoProposalsMetaId()]: {
        data: { id: daoProposalsMetaId(), type: 'DaoProposalsMeta', count: 1, proposals: [], hash: '', timestamp: 1000 },
        stateId: 'meta-state',
      },
      [networkAccountId]: { data: network, stateId: 'net-state' },
    }) as unknown as WrappedStates

  const daoApplyParametersTx = (): Tx.DaoApplyParameters =>
    ({
      type: 'dao_apply_parameters',
      from: voterAddress,
      proposalId,
      timestamp: 5000,
      networkId: 'n'.repeat(64),
    }) as unknown as Tx.DaoApplyParameters

  const changeNetworkParamTx = (): Tx.ChangeNetworkParam =>
    ({
      type: 'change_network_param',
      from: devAddress,
      cycle: -1,
      config: Utils.safeStringify(networkParamChange),
      timestamp: 5000,
      networkId: 'n'.repeat(64),
    }) as unknown as Tx.ChangeNetworkParam

  // The parity helper calls apply directly, so nothing else here would notice if the
  // payload drifted into a shape production rejects.
  test('the change_network_param payload is one validate would accept', () => {
    expect(utils.comparePropertiesTypes(networkParamChange, legacyNetworkAccount().current)).toBe(true)
  })

  describe('with the 2.5.2 migration active', () => {
    beforeEach(() => {
      LiberdusFlags.versionFlags.removeLegacyDaoState = true
      LiberdusFlags.versionFlags.removeUnusedTxState = true
      LiberdusFlags.versionFlags.removeLegacyNetworkParams = true
    })

    test('change_config promises the hash apply_change_config produces', () => {
      assertParity(changeConfig, applyChangeConfig, changeConfigTx())
    })

    test('change_network_param promises the hash apply_change_network_param produces', () => {
      assertParity(changeNetworkParam, applyChangeNetworkParam, changeNetworkParamTx())
    })

    test('dao_apply_parameters promises the hash its global message produces', () => {
      const globalMsg = assertParity(daoApplyParameters, applyChangeNetworkParam, daoApplyParametersTx(), daoWrap)

      // Without these the fixture could silently degrade into a no-op proposal and the
      // parity assertion would still pass, proving nothing about the DAO path.
      const value = globalMsg.value as Tx.ApplyChangeNetworkParam
      expect(value.type).toEqual(TXTypes.apply_change_network_param)
      expect(value.change.appData).toEqual({ dao: { pctBurned: 60 } })
    })
  })

  describe('before the 2.5.2 migration activates', () => {
    beforeEach(() => {
      LiberdusFlags.versionFlags.removeLegacyDaoState = false
      LiberdusFlags.versionFlags.removeUnusedTxState = false
      LiberdusFlags.versionFlags.removeLegacyNetworkParams = false
    })

    test('change_config parity holds with retired state still present', () => {
      assertParity(changeConfig, applyChangeConfig, changeConfigTx())
    })

    test('dao_apply_parameters parity holds with retired state still present', () => {
      assertParity(daoApplyParameters, applyChangeNetworkParam, daoApplyParametersTx(), daoWrap)
    })

    test('change_network_param parity holds with retired state still present', () => {
      assertParity(changeNetworkParam, applyChangeNetworkParam, changeNetworkParamTx())
    })
  })
})
