import { DevSecurityLevel, nestedCountersInstance, Shardus, shardusFactory, ShardusTypes } from '@shardeum-foundation/core'
import account, { deserializeAccounts, serializeAccounts } from './accounts'
import { P2P, Utils } from '@shardus/types'
import { getFinalArchiverList, setupArchiverDiscovery } from '@shardus/archiver-discovery'
import { Archiver } from '@shardus/archiver-discovery/dist/src/types'
import axios from 'axios'
import * as crypto from './crypto'
import * as configs from './config'
import config, { FilePaths, LiberdusFlags, networkAccount, TOTAL_DAO_DURATION } from './config'
import * as utils from './utils'
import * as LiberdusTypes from './@types'
import { TXTypes } from './@types'
import dotenv from 'dotenv'
import transactions from './transactions'
import registerAPI from './api'
import * as AccountsStorage from './storage/accountStorage'
import { logFlags } from '@shardeum-foundation/core/dist/logger'
import { adminCert, AdminCert } from './transactions/admin_certificate'
import * as QueryCertificate from './transactions/staking/query_certificate'
import { RemoveNodeCert, StakeCert } from './transactions/staking/query_certificate'
import * as SetCertTime from './transactions/staking/set_cert_time'
import * as InitReward from './transactions/staking/init_reward'
import * as ClaimReward from './transactions/staking/claim_reward'
import * as Penalty from './transactions/staking/apply_penalty'
import { configShardusNetworkTransactions } from './transactions/networkTransaction/networkTransaction'
import { initAjvSchemas, verifyPayload } from './@types/ajvHelper'
import { operatorCLIVersion, operatorGUIVersion, readOperatorVersions } from './utils/versions'
import { toShardusAddress } from './utils/address'
import { onActiveVersionChange } from './versioning/index'
import genesis from './config/genesis.json'
import rfdc = require('rfdc')
import { safeStringify } from '@shardus/types/build/src/utils/functions/stringify'
import create from './accounts'

const { version } = require('./../package.json')

dotenv.config()
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')

// THE ENTIRE APP STATE FOR THIS NODE

const env = process.env
const args = process.argv

// let defaultConfig = configs.initConfigFromFile()
// let config = configs.overrideDefaultConfig(defaultConfig, env, args)

export let dapp: Shardus
export let shardusConfig: ShardusTypes.ServerConfiguration

// Read the CLI and GUI versions and save them in memory
readOperatorVersions()

if (LiberdusFlags.UseDBForAccounts === true) {
  AccountsStorage.init(config.server.baseDir, `${FilePaths.LIBERDUS_DB}`)
}

const statsDebugLogs = false
let lastCertTimeTxTimestamp = 0
let lastCertTimeTxCycle: number | null = null

let isReadyToJoinLatestValue = false
let mustUseAdminCert = false

function getNodeCountForCertSignatures(): number {
  let latestCycle: ShardusTypes.Cycle
  const latestCycles: ShardusTypes.Cycle[] = dapp.getLatestCycles()
  if (latestCycles && latestCycles.length > 0) [latestCycle] = latestCycles
  const activeNodeCount = latestCycle ? latestCycle.active : 1
  if (LiberdusFlags.VerboseLogs) console.log(`Active node count computed for cert signs ${activeNodeCount}`)
  return Math.min(LiberdusFlags.MinStakeCertSig, activeNodeCount)
}

const shardusSetup = (): void => {
  // SDK SETUP FUNCTIONS
  dapp.setup({
    async sync(): Promise<void> {
      dapp.useAccountWrites()
      // In the restore network, the current getLocalOrRemoteAccount would return null and the network account exist check will not work
      // https://github.com/shardeum/shardus-core/blob/39600e933622cda25ac629f3372b875f301b481a/src/shardus/index.ts#L2238
      // [TODO] - Might be goo to change in shardus core to fetch account data during restore mode, to ensure that required network account is present.
      if (dapp.getNetworkMode() === 'restore') {
        return
      }
      const existingNetworkAccount = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      if (existingNetworkAccount) {
        dapp.log('NETWORK_ACCOUNT ALREADY EXISTED: ', existingNetworkAccount)
        return
      }
      if (dapp.p2p.isFirstSeed && dapp.getNetworkMode() === 'forming') {
        const nodeId = dapp.getNodeId()
        const address = dapp.getNode(nodeId).address
        /**
         * [NOTE] [AS] Not sure why we're adding 10 secs to the timestamp but it
         * caused the network to not form up when the tx processing pipeline was
         * fixed to check timestamps properly
         */
        // const when = dapp.shardusGetTime() + configs.ONE_SECOND * 10
        const when = dapp.shardusGetTime()
        dapp.setGlobal(
          configs.networkAccount,
          '', // Setting addressHash = '' as the network account is not created yet.
          {
            type: 'init_network',
            timestamp: when,
            network: configs.networkAccount,
          },
          when,
          configs.networkAccount,
        )

        dapp.log(`node ${nodeId} GENERATED_A_NEW_NETWORK_ACCOUNT: `)

        /* Genesis account */

        type GenesisBalances = {
          [address: string]: {
            alias: string
            publicKey: string
            balance: string
          }
        }

        const genesisLoaded = genesis as GenesisBalances
        let accountCopies: ShardusTypes.AccountsCopy[] = []
        const currentCycle = dapp.getLatestCycles(1)[0]

        for (const address in genesisLoaded) {
          const accountId = toShardusAddress(address)

          if (await dapp.getLocalOrRemoteAccount(accountId)) {
            continue
          }

          const userAccount = account.userAccount(accountId, currentCycle.start)

          userAccount.alias = genesisLoaded[address].alias
          userAccount.publicKey = genesisLoaded[address].publicKey
          userAccount.timestamp = currentCycle.start * 1000
          userAccount.data.balance = BigInt(genesisLoaded[address].balance)
          userAccount.hash = ''
          userAccount.hash = crypto.hashObj(userAccount)

          const constructedShardusAccount = {
            accountId: accountId,
            cycleNumber: currentCycle.counter,
            data: userAccount,
            timestamp: userAccount.timestamp,
            isGlobal: false,
            hash: userAccount.hash,
          }

          accountCopies.push(constructedShardusAccount)

          const aliasAccount = account.aliasAccount(crypto.hash(genesisLoaded[address].alias))
          aliasAccount.address = userAccount.id
          aliasAccount.timestamp = currentCycle.start * 1000
          aliasAccount.hash = ''
          aliasAccount.hash = crypto.hashObj(aliasAccount)

          accountCopies.push({
            accountId: crypto.hash(genesisLoaded[address].alias),
            cycleNumber: currentCycle.counter,
            data: aliasAccount,
            timestamp: currentCycle.start,
            isGlobal: false,
            hash: aliasAccount.hash,
          })
        }

        //TODO we need to brainstorm a way to allow migration of keys on a live network
        const devPublicKeys = dapp.getDevPublicKeys()
        for (const devPublicKey of Object.keys(devPublicKeys)) {
          // eslint-disable-next-line security/detect-object-injection
          const level = devPublicKeys[devPublicKey]
          if (level >= DevSecurityLevel.Low) {
            const devAccount = account.devAccount(devPublicKey)
            devAccount.timestamp = currentCycle.start
            devAccount.hash = ''
            devAccount.hash = crypto.hashObj(devAccount)
            const accountCopy: ShardusTypes.AccountsCopy = {
              cycleNumber: currentCycle.counter,
              accountId: devAccount.id,
              data: devAccount,
              hash: devAccount.hash,
              isGlobal: false,
              timestamp: devAccount.timestamp,
            }
            accountCopies.push(accountCopy)
          }
        }
        accountCopies = accountCopies.map((acc) => {
          return Utils.safeJsonParse(Utils.safeStringify(acc))
        })
        await dapp.debugCommitAccountCopies(accountCopies)
        await dapp.forwardAccounts({ accounts: accountCopies, receipts: [] })

        await utils._sleep(configs.ONE_SECOND * 5)
      } else {
        while (!(await dapp.getLocalOrRemoteAccount(configs.networkAccount))) {
          console.log('Waiting network account...', +'Current network mode', dapp.getNetworkMode())
          await utils._sleep(1000)
        }
      }
    },
    // THIS NEEDS TO BE FAST, BUT PROVIDES BETTER RESPONSE IF SOMETHING GOES WRONG
    validate(timestampedTx: any, appData: any): { success: boolean; reason: string; status: number } {
      const validationResult = {
        success: false,
        reason: 'Invalid transaction',
        status: 400,
      }
      try {
        const { tx } = timestampedTx
        const txnTimestamp: number = utils.getInjectedOrGeneratedTimestamp(timestampedTx, dapp)

        // Validate tx fields here
        if (!txnTimestamp) {
          validationResult.reason = 'Invalid transaction timestamp'
          return validationResult
        }

        if (typeof txnTimestamp !== 'number' || !Number.isFinite(txnTimestamp) || txnTimestamp < 1) {
          validationResult.reason = 'Tx "timestamp" field must be a valid number.'
          return validationResult
        }

        if (typeof tx.type !== 'string') {
          validationResult.reason = 'Tx "type" field must be a string.'
          return validationResult
        }
        if (transactions[tx.type] == undefined) {
          validationResult.reason = `The tx type ${tx.type} does not exist in the network.`
          return validationResult
        }

        if (Object.values(LiberdusTypes.TXTypes).includes(tx.type) === false) {
          validationResult.reason = 'Tx type is not recognized'
          return validationResult
        }
        if (LiberdusFlags.enableAJVValidation) {
          const errors = verifyPayload(tx.type, tx)
          if (errors != null) {
            nestedCountersInstance.countEvent('external', `ajv-failed-${tx.type}-tx`)
            validationResult.reason = `AJV failed for ${tx.type} tx, errors: ${Utils.safeStringify(errors)}`
            if (LiberdusFlags.VerboseLogs) console.log(validationResult.reason)
            return validationResult
          }
        }
        const res = transactions[tx.type].validate_fields(tx, validationResult, dapp)
        if (res.success) {
          validationResult.reason = 'This transaction is valid!'
          validationResult.status = 200
        }
        if (LiberdusFlags.VerboseLogs) console.log('Tx validation status:', tx, validationResult.success, validationResult.reason)
      } catch (e) {
        validationResult.success = false
        validationResult.reason = e.message
        if (LiberdusFlags.VerboseLogs) console.log('Tx validation failed:', validationResult.reason)
      }
      return validationResult
    },
    getTimestampFromTransaction(tx): number {
      if (LiberdusFlags.versionFlags.enforceTxTimestamp === false) {
        return 'timestamp' in tx ? (tx.timestamp as number) : 0
      }
      // A missing timestamp or a value of 0/-1 reserved for network-generated timestamp, Liberdus does not support this
      if ('timestamp' in tx && typeof tx.timestamp === 'number' && tx.timestamp > 0) {
        return tx.timestamp
      }
      throw new Error('Tx has invalid timestamp')
    },
    crack(timestampedTx: any, appData: any): LiberdusTypes.KeyResult {
      const { tx } = timestampedTx
      const txnTimestamp: number = utils.getInjectedOrGeneratedTimestamp(timestampedTx, dapp)
      const result = {
        sourceKeys: [],
        targetKeys: [],
        allKeys: [],
        timestamp: txnTimestamp,
      } as LiberdusTypes.TransactionKeys
      const keys = transactions[tx.type].keys(tx, result)

      // TODO: this can be removed after we passed version 2.3.4
      if (
        AccountsStorage?.cachedNetworkAccount &&
        utils.isEqualOrOlderVersion('2.3.4', AccountsStorage.cachedNetworkAccount.current.activeVersion) &&
        tx.type === TXTypes.update_toll_required
      ) {
        // this tx is not supported yet in versions less than 2.3.5
        throw new Error('Tx crack failed - update_toll_required not supported in this version')
      }
      if (
        AccountsStorage?.cachedNetworkAccount &&
        utils.isEqualOrNewerVersion('2.3.5', AccountsStorage.cachedNetworkAccount.current.activeVersion) &&
        tx.type === TXTypes.update_chat_toll
      ) {
        // this tx is deprecated in versions 2.3.5 and later
        throw new Error('Tx crack failed - update_chat_toll is deprecated in this version')
      }

      const memoryPattern = transactions[tx.type].memoryPattern ? transactions[tx.type].memoryPattern(tx, result) : null
      const txId = utils.generateTxId(tx)
      return {
        id: txId,
        timestamp: txnTimestamp,
        keys,
        shardusMemoryPatterns: memoryPattern,
      }
    },
    async apply(timestampedTx: ShardusTypes.OpaqueTransaction, wrappedStates) {
      //@ts-ignore
      const { tx } = timestampedTx
      const txTimestamp = utils.getInjectedOrGeneratedTimestamp(timestampedTx, dapp)

      const preApplyStatus = {
        success: false,
        reason: 'Transaction is not valid.',
      }
      try {
        transactions[tx.type].validate(tx, wrappedStates, preApplyStatus, dapp)
      } catch (e) {
        preApplyStatus.success = false
        preApplyStatus.reason = e.message
      }

      // Create an applyResponse which will be used to tell Shardus that the tx has been applied
      const txId: string = utils.generateTxId(tx)

      const applyResponse: ShardusTypes.ApplyResponse = dapp.createApplyResponse(txId, txTimestamp)

      if (preApplyStatus.success === true) {
        try {
          transactions[tx.type].apply(tx, txTimestamp, txId, wrappedStates, dapp, applyResponse)
        } catch (e) {
          // Create the appReceiptData for the tx
          transactions[tx.type].createFailedAppReceiptData(tx, txTimestamp, txId, wrappedStates, dapp, applyResponse, e.message)
        }
      } else {
        // Create the appReceiptData for the tx
        transactions[tx.type].createFailedAppReceiptData(tx, txTimestamp, txId, wrappedStates, dapp, applyResponse, preApplyStatus.reason)
      }

      for (const accountId in wrappedStates) {
        // only add the accounts that have changed
        if (wrappedStates[accountId].data?.['timestamp'] === txTimestamp) {
          // Update the stateId by calculating the hash for the update accounts for the global txs
          // TODO: This is a hack, we might want to add the change of calling calculateAccountHash() on shardus core for global txs
          // For normal txs, shardus core takes care of account stateId updates, see: https://github.com/shardeum/shardus-core/blob/8dd4807e952ff5424dfd2e322284e0d55f84b3a8/src/state-manager/TransactionConsensus.ts#L3574
          const wrappedChangedAccount = wrappedStates[accountId] as ShardusTypes.WrappedResponse
          if (
            tx.type === TXTypes.init_network ||
            tx.type === TXTypes.apply_change_config ||
            tx.type === TXTypes.apply_change_network_param ||
            tx.type === TXTypes.apply_tally ||
            tx.type === TXTypes.apply_dev_tally ||
            tx.type === TXTypes.parameters ||
            tx.type === TXTypes.apply_parameters ||
            tx.type === TXTypes.dev_parameters ||
            tx.type === TXTypes.apply_dev_parameters ||
            tx.type === TXTypes.apply_developer_payment
          ) {
            const hashAfter = this.calculateAccountHash(wrappedStates[accountId].data)
            wrappedChangedAccount.stateId = hashAfter
          }
          // make sure the timestamp is set
          wrappedChangedAccount.timestamp = txTimestamp
          dapp.applyResponseAddChangedAccount(applyResponse, accountId, wrappedChangedAccount, txId, txTimestamp)
        }
      }

      return applyResponse
    },
    transactionReceiptPass(timestampedTx: any, wrappedStates: { [id: string]: LiberdusTypes.WrappedAccount }, applyResponse: ShardusTypes.ApplyResponse) {
      const { tx } = timestampedTx
      const txId: string = utils.generateTxId(tx)
      try {
        // Call the transaction receipt pass for the global txs
        if (transactions[tx.type].transactionReceiptPass) transactions[tx.type].transactionReceiptPass(tx, txId, wrappedStates, dapp, applyResponse)
        // Send the appReceiptData of the tx to cache in the network
        if (applyResponse == null || applyResponse.appReceiptData == null) return
        const appReceiptData = applyResponse.appReceiptData as LiberdusTypes.AppReceiptData

        if (LiberdusFlags.VerboseLogs) console.log('_transactionReceiptPass appReceiptData for tx', txId, applyResponse.appReceiptDataHash, appReceiptData)
        const dataId = appReceiptData.txId
        dapp
          .sendCorrespondingCachedAppData('receipt', dataId, appReceiptData, dapp.stateManager.currentCycleShardData.cycleNumber, appReceiptData.from, txId)
          .then(() => {
            if (LiberdusFlags.VerboseLogs) console.log('_transactionReceiptPass appReceiptData sent', txId)
          })
          .catch((err) => {
            throw new Error(`Error in sending appReceiptData for tx ${txId}: ${err.message}`)
          })
      } catch (e) {
        console.log(`Error in transactionReceiptPass: ${e.message}`)
      }
    },
    async getStateId(accountAddress: string, mustExist = true): Promise<string> {
      const account = await AccountsStorage.getAccount(accountAddress)
      if ((typeof account === 'undefined' || account === null) && mustExist === true) {
        throw new Error('Could not get stateId for account ' + accountAddress)
      }
      return account.hash
    },
    async getAccountTimestamp(accountAddress: string, mustExist = true): Promise<number> {
      const account = await AccountsStorage.getAccount(accountAddress)
      if ((typeof account === 'undefined' || account === null) && mustExist === true) {
        throw new Error('Could not get getAccountTimestamp for account ' + accountAddress)
      }
      return account.timestamp
    },
    getTimestampAndHashFromAccount(accountData: any): { timestamp: number; hash: string } {
      const account: LiberdusTypes.Accounts = accountData as LiberdusTypes.Accounts
      // if ((typeof account === 'undefined' || account === null)) {
      //   throw new Error(`Could not get getAccountInfo for account ${Utils.safeStringify(accountData)} `)
      // }
      const timestamp = account.timestamp
      const hash = account.hash
      return { timestamp, hash }
    },
    async deleteLocalAccountData(): Promise<void> {
      await AccountsStorage.clearAccounts()
    },
    async setAccountData(accountRecords: LiberdusTypes.Accounts[]): Promise<void> {
      for (const account of accountRecords) {
        // possibly need to clone this so others lose their ref
        await AccountsStorage.setAccount(account.id, account)
      }
    },
    async getRelevantData(accountId: string, timestampedTx: any): Promise<ShardusTypes.WrappedResponse> {
      console.log('getRelevantData', accountId, timestampedTx)
      const { tx } = timestampedTx
      const account = await AccountsStorage.getAccount(accountId)
      const accountCreated = false
      return transactions[tx.type].createRelevantAccount(dapp, account, accountId, tx, accountCreated)
    },
    async updateAccountFull(wrappedData, localCache, applyResponse): Promise<void> {
      const accountId = wrappedData.accountId
      const accountCreated = wrappedData.accountCreated
      const updatedAccount = wrappedData.data as LiberdusTypes.Accounts
      // Update hash
      const hashBefore = updatedAccount.hash
      const hashAfter = this.calculateAccountHash(updatedAccount)
      // Save updatedAccount to db / persistent storage
      await AccountsStorage.setAccount(accountId, updatedAccount)
      // Add data to our required response object
      dapp.applyResponseAddState(
        applyResponse,
        updatedAccount,
        updatedAccount,
        accountId,
        applyResponse.txId,
        applyResponse.txTimestamp,
        hashBefore,
        hashAfter,
        accountCreated,
      )
    },
    // TODO: This might be useful in making some optimizations
    updateAccountPartial(wrappedData, localCache, applyResponse) {
      this.updateAccountFull(wrappedData, localCache, applyResponse)
    },
    async getAccountDataByRange(accountStart, accountEnd, tsStart, tsEnd, maxRecords, offset = 0, accountOffset = ''): Promise<ShardusTypes.WrappedData[]> {
      const start = parseInt(accountStart, 16)
      const end = parseInt(accountEnd, 16)

      const finalResults: ShardusTypes.WrappedData[] = []

      if (LiberdusFlags.UseDBForAccounts === true) {
        //direct DB query
        const dbResults = await AccountsStorage.queryAccountsEntryByRanges2(accountStart, accountEnd, tsStart, tsEnd, maxRecords, offset, accountOffset)

        for (const account of dbResults) {
          // Process and add to finalResults
          const wrapped = {
            accountId: account.id,
            data: account,
            stateId: account.hash,
            timestamp: account.timestamp,
          }
          finalResults.push(wrapped)
        }
        return finalResults
      }

      const accounts = AccountsStorage.accounts
      const results: LiberdusTypes.Accounts[] = []
      // Loop all accounts
      for (const addressStr in accounts) {
        const account = accounts[addressStr] // eslint-disable-line security/detect-object-injection
        // Skip if not in account id range
        const id = parseInt(addressStr, 16)
        if (id < start || id > end) continue
        // Skip if not in timestamp range
        const timestamp = account.timestamp
        if (timestamp < tsStart || timestamp > tsEnd) continue

        // // Add to results
        results.push(account)
        // we can't exit early. this is hard on perf
        // This data needs to eventually live in a DB and then the sort and max records will be natural.

        // Return results early if maxRecords reached
        // if (results.length >= maxRecords) return results
      }
      //critical to sort by timestamp before we cull max records
      results.sort((a, b) => a.timestamp - b.timestamp)

      //let cappedResults = results.slice(0, maxRecords)

      const cappedResults = []
      let count = 0
      const extra = 0
      // let startTS = results[0].timestamp
      // let sameTS = true

      if (results.length > 0) {
        //start at offset!
        for (let i = offset; i < results.length; i++) {
          const account = results[i] // eslint-disable-line security/detect-object-injection
          if (count > maxRecords) {
            break //no extras allowed
          }
          count++
          cappedResults.push(account)
        }
      }

      /* prettier-ignore */
      dapp.log(`getAccountDataByRange: extra:${extra} ${Utils.safeStringify({ accountStart, accountEnd, tsStart, tsEnd, maxRecords, offset })}`)

      for (const account of cappedResults) {
        // Process and add to finalResults
        const wrapped = {
          accountId: account.id,
          stateId: account.hash,
          data: account,
          timestamp: account.timestamp,
        }
        finalResults.push(wrapped)
      }

      return finalResults
    },
    async getAccountData(accountStart, accountEnd, maxRecords): Promise<LiberdusTypes.WrappedAccount[]> {
      const results: LiberdusTypes.WrappedAccount[] = []
      const start = parseInt(accountStart, 16)
      const end = parseInt(accountEnd, 16)

      if (LiberdusFlags.UseDBForAccounts === true) {
        //direct DB query
        const dbResults = await AccountsStorage.queryAccountsEntryByRanges(accountStart, accountEnd, maxRecords)

        for (const account of dbResults) {
          const wrapped = {
            accountId: account.id,
            stateId: account.hash,
            data: account,
            timestamp: account.timestamp,
          }
          results.push(wrapped)
        }
        return results
      }

      const accounts = AccountsStorage.accounts

      // Loop all accounts
      for (const account of Object.values(accounts)) {
        // Skip if not in account id range
        const id = parseInt(account.id, 16)
        if (id < start || id > end) continue

        // Add to results
        const wrapped = {
          accountId: account.id,
          stateId: account.hash,
          data: account,
          timestamp: account.timestamp,
        }
        results.push(wrapped)
        // Return results early if maxRecords reached
        if (results.length >= maxRecords) {
          results.sort((a, b) => a.timestamp - b.timestamp)
          return results
        }
      }
      results.sort((a, b) => a.timestamp - b.timestamp)
      return results
    },
    async getAccountDataByList(addressList: string[]): Promise<LiberdusTypes.WrappedAccount[]> {
      const results: LiberdusTypes.WrappedAccount[] = []
      for (const address of addressList) {
        const account = await AccountsStorage.getAccount(address)
        if (account) {
          const wrapped = {
            accountId: account.id,
            stateId: account.hash,
            data: account,
            timestamp: account.timestamp,
          }
          results.push(wrapped)
        }
      }
      results.sort((a, b) => parseInt(a.accountId, 16) - parseInt(b.accountId, 16))
      return results
    },
    calculateAccountHash(account: any): string {
      account.hash = '' // Not sure this is really necessary
      account.hash = crypto.hashObj(account)
      return account.hash
    },
    // TODO:Seems we don't use resetAccountData and deleteAccountData anymore
    async resetAccountData(accountBackupCopies: any[]): Promise<void> {
      for (const recordData of accountBackupCopies) {
        const accountData: LiberdusTypes.Accounts = recordData.data
        await AccountsStorage.setAccount(accountData.id, { ...accountData })
      }
    },
    deleteAccountData(addressList: string[]): void {
      console.log('DELETE_ACCOUNT_DATA', Utils.safeStringify(addressList))
      for (const address of addressList) {
        // delete accounts[address]
        console.log(`Deleting account ${address}... - which is not implemented`)
        // await AccountsStorage.deleteAccount(address) // TODO: Add deleteAccount function in AccountsStorage
      }
    },
    getAccountDebugValue(wrappedAccount: LiberdusTypes.WrappedAccount): string {
      return `${Utils.safeStringify(wrappedAccount)}`
    },
    canDebugDropTx(tx: any) {
      return false
    },
    close(): void {
      dapp.log('Shutting down server...')
      console.log('Shutting down server...')
    },
    //txSummaryUpdate: (blob: any, tx: any, wrappedStates: any) => void
    txSummaryUpdate(blob, tx, wrappedStates) {
      if (blob.initialized == null) {
        blob.initialized = true
        blob.txByType = {}
        blob.totalTx = 0
      }

      if (blob.txByType[tx.type] == null) {
        blob.txByType[tx.type] = 0
      }
      blob.txByType[tx.type]++
      blob.totalTx++
    },
    // dataSummaryInit: (blob: any, accountData: any) => void
    dataSummaryInit(blob, accountData) {
      if (blob.initialized == null) {
        blob.initialized = true
        blob.accByType = {}
        blob.totalBalance = 0
        blob.totalAccounts = 0
      }

      const accType = utils.getAccountType(accountData)
      if (blob.accByType[accType] == null) {
        blob.accByType[accType] = 0
      }
      blob.accByType[accType]++
      blob.totalAccounts++

      if (accType == 'UserAccount') {
        if (accountData.data.balance != null) {
          const blobBalanceBefore = blob.totalBalance
          const accountBalance = accountData.data.balance
          const totalBalance = blobBalanceBefore + accountBalance

          if (statsDebugLogs) dapp.log(`stats balance init ${blobBalanceBefore}+${accountBalance}=${totalBalance}  ${Utils.safeStringify(accountData.id)}`)

          if (totalBalance != null) {
            blob.totalBalance = totalBalance
          } else {
            if (statsDebugLogs)
              dapp.log(`error: null balance attempt. dataSummaryInit UserAccount 1 ${accountData.data.balance} ${Utils.safeStringify(accountData.id)}`)
          }
        } else {
          if (statsDebugLogs)
            dapp.log(`error: null balance attempt. dataSummaryInit UserAccount 2 ${accountData.data.balance} ${Utils.safeStringify(accountData.id)}`)
        }
      }
      if (accType == 'NodeAccount') {
        if (accountData.balance != null) {
          const totalBalance = blob.totalBalance + accountData.balance
          if (totalBalance != null) {
            blob.totalBalance = totalBalance
          } else {
            if (statsDebugLogs)
              dapp.log(`error: null balance attempt. dataSummaryInit NodeAccount 1 ${accountData.balance} ${Utils.safeStringify(accountData.id)}`)
          }
        } else {
          if (statsDebugLogs)
            dapp.log(`error: null balance attempt. dataSummaryInit NodeAccount 2 ${accountData.balance} ${Utils.safeStringify(accountData.id)}`)
        }
      }
    },
    // dataSummaryUpdate: (blob: any, accountDataBefore: any, accountDataAfter: any) => void
    dataSummaryUpdate(blob, accountDataBefore, accountDataAfter) {
      if (blob.initialized == null) {
        //should not ever get here though.
        blob.initialized = true
        blob.accByType = {}
        blob.totalBalance = 0
        blob.totalAccounts = 0
      }
      const accType = utils.getAccountType(accountDataAfter)

      if (accType == 'UserAccount') {
        const blobBalanceBefore = blob.totalBalance
        const accountBalanceBefore = accountDataBefore.data.balance
        const accountBalanceAfter = accountDataAfter.data.balance
        const balanceChange = accountDataAfter.data.balance - accountDataBefore.data.balance

        let totalBalance = blob.totalBalance + balanceChange
        if (statsDebugLogs)
          dapp.log(
            `stats balance update ${blobBalanceBefore}+${balanceChange}(${accountBalanceAfter}-${accountBalanceBefore})=${totalBalance}  ${Utils.safeStringify(
              accountDataAfter.id,
            )}`,
          )

        if (balanceChange != null) {
          totalBalance = blob.totalBalance + balanceChange
          if (totalBalance != null) {
            blob.totalBalance = totalBalance
          } else {
            if (statsDebugLogs)
              dapp.log(
                `error: null balance attempt. dataSummaryUpdate UserAccount 1 ${accountDataAfter.data.balance} ${Utils.safeStringify(accountDataAfter.id)} ${
                  accountDataBefore.data.balance
                } ${Utils.safeStringify(accountDataBefore.id)}`,
              )
          }
        } else {
          if (statsDebugLogs)
            dapp.log(
              `error: null balance attempt. dataSummaryUpdate UserAccount 2 ${accountDataAfter.data.balance} ${Utils.safeStringify(accountDataAfter.id)} ${
                accountDataBefore.data.balance
              } ${Utils.safeStringify(accountDataBefore.id)}`,
            )
        }
      }
      if (accType == 'NodeAccount') {
        const balanceChange = accountDataAfter.balance - accountDataBefore.balance
        if (balanceChange != null) {
          const totalBalance = blob.totalBalance + balanceChange
          if (totalBalance != null) {
            blob.totalBalance = totalBalance
          } else {
            if (statsDebugLogs)
              dapp.log(
                `error: null balance attempt. dataSummaryUpdate NodeAccount 1 ${accountDataAfter.balance} ${Utils.safeStringify(accountDataAfter.id)} ${
                  accountDataBefore.balance
                } ${Utils.safeStringify(accountDataBefore.id)}`,
              )
          }
        } else {
          if (statsDebugLogs)
            dapp.log(
              `error: null balance attempt. dataSummaryUpdate NodeAccount 2 ${accountDataAfter.balance} ${Utils.safeStringify(accountDataAfter.id)} ${
                accountDataBefore.balance
              } ${Utils.safeStringify(accountDataBefore.id)}`,
            )
        }
      }
    },
    injectTxToConsensor(validatorDetails: any[], tx) {
      return utils.InjectTxToConsensor(validatorDetails, tx)
    },
    getNonceFromTx: function (tx: ShardusTypes.OpaqueTransaction): bigint {
      return BigInt(-1)
    },
    getAccountNonce: function (accountId: string, wrappedData?: ShardusTypes.WrappedData): Promise<bigint> {
      return new Promise((resolve) => resolve(BigInt(-1)))
    },
    // todo: consider a base liberdus tx type
    getTxSenderAddress: function (tx: any): string {
      const result = {
        sourceKeys: [],
        targetKeys: [],
        allKeys: [],
        timestamp: tx.timestamp,
      } as LiberdusTypes.TransactionKeys
      const keys = transactions[tx.type].keys(tx, result)
      return keys.allKeys[0]
    },
    isInternalTx: function (tx: LiberdusTypes.BaseLiberdusTx): boolean {
      // todo: decide what is internal and what is external
      const internalTxTypes = [
        TXTypes.init_network,
        TXTypes.issue,
        TXTypes.dev_issue,
        TXTypes.tally,
        TXTypes.apply_tally,
        TXTypes.dev_tally,
        TXTypes.apply_dev_tally,
        TXTypes.parameters,
        TXTypes.apply_parameters,
        TXTypes.dev_parameters,
        TXTypes.apply_dev_parameters,
        TXTypes.apply_change_config,
        TXTypes.apply_change_network_param,
        TXTypes.apply_developer_payment,
        TXTypes.node_reward,
        TXTypes.set_cert_time,
        TXTypes.query_certificate,
        TXTypes.init_reward,
        TXTypes.claim_reward,
        TXTypes.apply_penalty,
      ]
      if (internalTxTypes.includes(tx.type)) {
        return true
      }
      return false
    },
    async txPreCrackData(tx: any, appData: any): Promise<{ status: boolean; reason: string }> {
      if (tx.type != TXTypes.transfer && tx.type != TXTypes.message && tx.type != TXTypes.deposit_stake && tx.type != TXTypes.withdraw_stake) {
        return { status: true, reason: 'Tx PreCrack Skipped' }
      }
      try {
        const txTimestamp = utils.getInjectedOrGeneratedTimestamp({ tx: tx }, dapp)
        const wrappedStates: LiberdusTypes.WrappedStates = {}
        const promises = []
        let sourceKeyShardusAddr = null
        let targetKeyShardusAddr = null

        let from = tx.from
        let to = tx.to

        if (tx.type === TXTypes.deposit_stake || tx.type === TXTypes.withdraw_stake) {
          from = tx.nominator
          to = tx.nominee
        }

        if (from) {
          sourceKeyShardusAddr = toShardusAddress(from)
          promises.push(
            dapp.getLocalOrRemoteAccount(sourceKeyShardusAddr).then((queuedWrappedState) => {
              wrappedStates[from] = {
                accountId: queuedWrappedState.accountId,
                stateId: queuedWrappedState.stateId,
                data: queuedWrappedState.data as LiberdusTypes.Accounts,
                timestamp: txTimestamp,
              }
            }),
          )
        }
        if (to) {
          targetKeyShardusAddr = toShardusAddress(to)
          promises.push(
            dapp.getLocalOrRemoteAccount(targetKeyShardusAddr).then((queuedWrappedState) => {
              wrappedStates[to] = {
                accountId: queuedWrappedState.accountId,
                stateId: queuedWrappedState.stateId,
                data: queuedWrappedState.data as LiberdusTypes.Accounts,
                timestamp: txTimestamp,
              }
            }),
          )
        }

        if (
          tx.type === TXTypes.transfer ||
          tx.type === TXTypes.message ||
          tx.type === TXTypes.read ||
          tx.type === TXTypes.toll ||
          tx.type === TXTypes.update_toll_required ||
          tx.type === TXTypes.reclaim_toll
        ) {
          promises.push(
            dapp.getLocalOrRemoteAccount(tx.chatId).then((queuedWrappedState) => {
              wrappedStates[tx.chatId] = {
                accountId: queuedWrappedState.accountId,
                stateId: queuedWrappedState.stateId,
                data: queuedWrappedState.data as LiberdusTypes.Accounts,
                timestamp: txTimestamp,
              }
            }),
          )
        }

        promises.push(
          dapp.getLocalOrRemoteAccount(networkAccount).then((queuedWrappedState) => {
            wrappedStates[networkAccount] = {
              accountId: queuedWrappedState.accountId,
              stateId: queuedWrappedState.stateId,
              data: queuedWrappedState.data as LiberdusTypes.Accounts,
              timestamp: txTimestamp,
            }
          }),
        )

        await Promise.allSettled(promises)

        if (
          AccountsStorage?.cachedNetworkAccount &&
          utils.isEqualOrOlderVersion('2.3.4', AccountsStorage.cachedNetworkAccount.current.activeVersion) &&
          tx.type === TXTypes.update_toll_required
        ) {
          // this tx is not supported yet in versions less than 2.3.5
          return { status: false, reason: 'Tx PreCrack Skipped - update_toll_required not supported in this version' }
        }
        if (
          AccountsStorage?.cachedNetworkAccount &&
          utils.isEqualOrNewerVersion('2.3.5', AccountsStorage.cachedNetworkAccount.current.activeVersion) &&
          tx.type === TXTypes.update_chat_toll
        ) {
          // this tx is deprecated in versions 2.3.5 and later
          return { status: false, reason: 'Tx PreCrack Skipped - update_chat_toll deprecated in this version' }
        }

        // if no chat account is provided, we create a temporary one
        if (tx.chatId && wrappedStates[tx.chatId] == null) {
          const tempChatAccount = create.chatAccount(tx.chatId, tx)
          console.log('Creating temporary chat account for tx', tx.chatId, tempChatAccount)
          wrappedStates[tx.chatId] = {
            accountId: tempChatAccount.id,
            stateId: tempChatAccount.hash,
            data: tempChatAccount as LiberdusTypes.Accounts,
            timestamp: tempChatAccount.timestamp,
          }
        }

        console.log('Running txPreCrackData', tx, wrappedStates)
        const res = transactions[tx.type].validate(tx, wrappedStates, { success: false, reason: 'Tx Validation Fails' }, dapp)
        if (res.success === false) {
          return { status: false, reason: res.reason }
        } else {
          return { status: true, reason: 'Tx PreCrack Success' }
        }
      } catch (e) {
        console.error('Error in txPreCrackData', e)
        return { status: false, reason: 'Error in txPreCrackData - ' + e.message }
      }
    },
    calculateTxId(tx: ShardusTypes.OpaqueTransaction) {
      return utils.generateTxId(tx)
    },
    getCachedRIAccountData: function (addressList: string[]): Promise<ShardusTypes.WrappedData[]> {
      console.log(`Not implemented getCachedRIAccountData`)
      return null
    },
    setCachedRIAccountData: function (accountRecords: unknown[]): Promise<void> {
      console.log(`Not implemented setCachedRIAccountData`)
      return null
    },
    async getNetworkAccount(): Promise<ShardusTypes.WrappedData> {
      const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      return account
    },
    async signAppData(type: string, hash: string, nodesToSign: number, originalAppData: any): Promise<ShardusTypes.SignAppDataResult> {
      nestedCountersInstance.countEvent('liberdus-staking', 'calling signAppData')
      const appData = originalAppData
      const fail: ShardusTypes.SignAppDataResult = { success: false, signature: null }
      try {
        /* prettier-ignore */
        if (logFlags.dapp_verbose) console.log('Running signAppData', type, hash, nodesToSign, appData)

        if (type === 'sign-stake-cert') {
          if (nodesToSign != 5) return fail
          const stakeCert = appData as StakeCert
          if (!stakeCert.nominator || !stakeCert.nominee || !stakeCert.stake || !stakeCert.certExp) {
            nestedCountersInstance.countEvent('liberdus-staking', 'signAppData format failed')
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`signAppData format failed ${type} ${Utils.safeStringify(stakeCert)} `)
            return fail
          }
          const currentTimestamp = dapp.shardusGetTime()
          if (stakeCert.certExp < currentTimestamp) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', 'signAppData cert expired')
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`signAppData cert expired ${type} ${Utils.safeStringify(stakeCert)} `)
            return fail
          }
          const minStakeRequiredUsd = AccountsStorage.cachedNetworkAccount.current.stakeRequiredUsd
          const minStakeRequired = utils.scaleByStabilityFactor(minStakeRequiredUsd, AccountsStorage.cachedNetworkAccount)
          const stakeAmount = stakeCert.stake
          if (stakeAmount < minStakeRequired) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', 'signAppData stake amount lower than required')
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`signAppData stake amount lower than required ${type} ${Utils.safeStringify(stakeCert)} `)
            return fail
          }
          const nominatorAccount = await dapp.getLocalOrRemoteAccount(stakeCert.nominator)
          if (!nominatorAccount) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', 'could not find nominator account')
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`could not find nominator account ${type} ${Utils.safeStringify(stakeCert)} `)
            return fail
          }
          const nominatorUserAccount = nominatorAccount.data as LiberdusTypes.UserAccount
          if (!nominatorUserAccount.operatorAccountInfo) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', 'operatorAccountInfo missing from nominator')
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`operatorAccountInfo missing from nominator ${type} ${Utils.safeStringify(stakeCert)} `)
            return fail
          }
          if (stakeCert.stake != nominatorUserAccount.operatorAccountInfo.stake) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', 'operatorAccountInfo missing from nominator')
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`stake amount in cert and operator account does not match ${type} ${Utils.safeStringify(stakeCert)} ${Utils.safeStringify(nominatorUserAccount)} `)
            return fail
          }
          if (stakeCert.nominee != nominatorUserAccount.operatorAccountInfo.nominee) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', 'nominee in cert and operator account does not match')
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`nominee in cert and operator account does not match ${type} ${Utils.safeStringify(stakeCert)} ${Utils.safeStringify(nominatorUserAccount)} `)
            return fail
          }

          delete stakeCert.sign
          delete stakeCert.signs
          const signedCert: StakeCert = dapp.signAsNode(stakeCert)
          const result: ShardusTypes.SignAppDataResult = { success: true, signature: signedCert.sign }
          if (LiberdusFlags.VerboseLogs) console.log(`signAppData passed ${type} ${Utils.safeStringify(stakeCert)}`)
          nestedCountersInstance.countEvent('liberdus-staking', 'sign-stake-cert - passed')
          return result
        } else if (type === 'sign-remove-node-cert') {
          if (nodesToSign != 5) return fail
          const removeNodeCert = appData as RemoveNodeCert
          if (!removeNodeCert.nodePublicKey || !removeNodeCert.cycle) {
            nestedCountersInstance.countEvent('liberdus-remove-node', 'signAppData format failed')
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`signAppData format failed ${type} ${Utils.safeStringify(removeNodeCert)} `)
            return fail
          }
          const latestCycles = dapp.getLatestCycles()
          const currentCycle = latestCycles[0]
          if (!currentCycle) {
            /* prettier-ignore */
            if (logFlags.error) console.log('No cycle records found', latestCycles)
            return fail
          }
          if (removeNodeCert.cycle !== currentCycle.counter) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-remove-node', 'cycle in cert does not match current cycle')
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`cycle in cert does not match current cycle ${type} ${Utils.safeStringify(removeNodeCert)}, current: ${currentCycle.counter}`)
            return fail
          }

          const nodeAccount = await dapp.getLocalOrRemoteAccount(removeNodeCert.nodePublicKey)
          // TODO: validate the account is actually a node account
          const nodeAccountData = nodeAccount.data as LiberdusTypes.NodeAccount
          if (Penalty.isLowStake(nodeAccountData) === false) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-remove-node', 'node locked stake is not below minStakeRequired')
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`node locked stake is not below minStakeRequired ${type} ${Utils.safeStringify(removeNodeCert)}, cachedNetworkAccount: ${Utils.safeStringify(AccountsStorage.cachedNetworkAccount)} `)
            return fail
          }

          const signedCert: RemoveNodeCert = dapp.signAsNode(removeNodeCert)
          const result: ShardusTypes.SignAppDataResult = { success: true, signature: signedCert.sign }
          if (LiberdusFlags.VerboseLogs) console.log(`signAppData passed ${type} ${Utils.safeStringify(removeNodeCert)}`)
          nestedCountersInstance.countEvent('liberdus-staking', 'sign-stake-cert - passed')
          return result
        }
      } catch (e) {
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log(`signAppData failed: ${type} ${Utils.safeStringify(QueryCertificate.stakeCert)}, error: ${Utils.safeStringify(e)}`)
        nestedCountersInstance.countEvent('liberdus-staking', 'sign-stake-cert - fail uncaught')
      }
      return fail
    },
    getJoinData() {
      nestedCountersInstance.countEvent('liberdus-staking', 'calling getJoinData')
      const joinData: LiberdusTypes.AppJoinData = {
        version,
        stakeCert: QueryCertificate.stakeCert,
        adminCert,
      }
      return joinData
    },
    validateJoinRequest(data, mode: P2P.ModesTypes.Record['mode'] | null, latestCycle: ShardusTypes.Cycle, minNodes: number) {
      /* prettier-ignore */
      if (LiberdusFlags.VerboseLogs)
        console.log(
          `validateJoinRequest minNodes: ${minNodes}, active: ${latestCycle.active}, syncing ${latestCycle.syncing}, mode: ${mode}, flag: ${LiberdusFlags.AdminCertEnabled}`,
        )

      try {
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest ${Utils.safeStringify(data)}`)
        if (!data.appJoinData) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: !data.appJoinData`)
          return {
            success: false,
            reason: `Join request node doesn't provide the app join data.`,
            fatal: true,
          }
        }

        const appJoinData = data.appJoinData as LiberdusTypes.AppJoinData

        const minVersion = AccountsStorage.cachedNetworkAccount.current.minVersion
        if (!utils.isEqualOrNewerVersion(minVersion, appJoinData.version)) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: old version`)
          return {
            success: false,
            reason: `version number is old. minVersion is ${minVersion}. Join request node app version is ${appJoinData.version}`,
            fatal: true,
          }
        }

        const latestVersion = AccountsStorage.cachedNetworkAccount.current.latestVersion

        if (latestVersion && appJoinData.version && !utils.isEqualOrOlderVersion(latestVersion, appJoinData.version)) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: version number is newer than latest`)
          return {
            success: false,
            reason: `version number is newer than latest. The latest allowed app version is ${latestVersion}. Join request node app version is ${appJoinData.version}`,
            fatal: true,
          }
        }

        // Staking is only enabled when flag is on
        const stakingEnabled = LiberdusFlags.StakingEnabled
        // If staking is not enabled, we don't need to check for stake certificate
        if (!stakingEnabled) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest success: staking is not enabled`)
          return {
            success: true,
            reason: 'Join Request validated',
            fatal: false,
          }
        }

        if (LiberdusFlags.ModeEnabled && (mode === 'forming' || mode === 'restart')) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest success: mode is forming or restart`)
          return {
            success: true,
            reason: 'Join Request validated',
            fatal: false,
          }
        }

        const nodeAcc = data.sign.owner
        //Checks for adminCert or goldenTicket
        if (appJoinData.adminCert) {
          if (LiberdusFlags.AdminCertEnabled === false) {
            /* prettier-ignore */
            if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: adminCert is not enabled`)
            return {
              success: false,
              reason: 'Admin certificate is not enabled',
              fatal: true,
            }
          }
          const adminCert: AdminCert = appJoinData.adminCert
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-mode', 'validateJoinRequest: adminCert exists')

          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest: adminCert ${Utils.safeStringify(adminCert)}`)

          const currentTimestamp = dapp.shardusGetTime()
          if (!adminCert.certExp || adminCert.certExp < currentTimestamp) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-mode', 'validateJoinRequest fail: !adminCert.certExp || adminCert.certExp < currentTimestamp')
            return {
              success: false,
              reason: 'No admin certificate or certificate has expired',
              fatal: false,
            }
          }

          if (!adminCert.nominee) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-mode', 'validateJoinRequest fail: !adminCert.nominee')
            return {
              success: false,
              reason: 'No nominee in admin certificate',
              fatal: true,
            }
          }

          if (!adminCert.sign || !adminCert.sign.owner || !adminCert.sign.sig) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-mode', 'validateJoinRequest fail: !adminCert.sign')
            return {
              success: false,
              reason: 'No signature in admin certificate',
              fatal: true,
            }
          }

          if (typeof adminCert.goldenTicket === 'boolean') {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-mode', 'validateJoinRequest fail: typeof adminCert.goldenTicket === boolean')
            return {
              success: false,
              reason: 'No goldenTicket in admin certificate',
              fatal: true,
            }
          }

          // check for adminCert nominee
          if (nodeAcc !== adminCert.nominee) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-mode', 'validateJoinRequest fail: nodeAcc !== adminCert.nominee')
            return {
              success: false,
              reason: 'Nominator mismatch',
              fatal: true,
            }
          }
          const pkClearance = dapp.getDevPublicKey(adminCert.sign.owner)
          // check for invalid signature for AdminCert
          if (pkClearance == null) {
            return {
              success: false,
              reason: 'Unauthorized! no getDevPublicKey defined',
              fatal: true,
            }
          }
          if (pkClearance && (!dapp.crypto.verify(adminCert, pkClearance) || dapp.ensureKeySecurity(pkClearance, DevSecurityLevel.High) === false)) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-mode', 'validateJoinRequest fail: !shardus.crypto.verify(adminCert, shardus.getDevPublicKeyMaxLevel())')
            return {
              success: false,
              reason: 'Invalid signature for AdminCert',
              fatal: true,
            }
          }
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-mode', 'validateJoinRequest success: adminCert')
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log('validateJoinRequest success: adminCert')
          return {
            success: true,
            reason: 'Join Request validated',
            fatal: false,
          }
        }

        const stake_cert: StakeCert = appJoinData.stakeCert
        if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest ${Utils.safeStringify(stake_cert)}`)

        const tx_time = data.joinRequestTimestamp as number

        if (stake_cert == null) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', 'validateJoinRequest fail: stake_cert == null')
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: stake_cert == null`)
          return {
            success: false,
            reason: `Join request node doesn't provide the stake certificate.`,
            fatal: true,
          }
        }

        if (!stake_cert.nominee || nodeAcc !== stake_cert.nominee) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', 'validateJoinRequest fail: nodeAcc !== stake_cert.nominee')
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: nodeAcc !== stake_cert.nominee`)
          return {
            success: false,
            reason: `Nominated address and tx signature owner doesn't match, nominee: ${stake_cert.nominee}, sign owner: ${nodeAcc}`,
            fatal: true,
          }
        }

        if (!stake_cert.certExp || tx_time > stake_cert.certExp) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', 'validateJoinRequest fail: tx_time > stake_cert.certExp')
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: tx_time > stake_cert.certExp ${tx_time} > ${stake_cert.certExp}`)
          return {
            success: false,
            reason: `Certificate has expired at ${stake_cert.certExp}`,
            fatal: false,
          }
        }

        const serverConfig = config.server
        const two_cycle_ms = serverConfig.p2p.cycleDuration * 2 * 1000

        // stake certification should not expired for at least 2 cycle.
        if (dapp.shardusGetTime() + two_cycle_ms > stake_cert.certExp) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', 'validateJoinRequest fail: cert expires soon')
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: cert expires soon ${dapp.shardusGetTime() + two_cycle_ms} > ${stake_cert.certExp}`)
          return {
            success: false,
            reason: `Certificate will be expired really soon.`,
            fatal: false,
          }
        }

        const minStakeRequiredUsd = AccountsStorage.cachedNetworkAccount.current.stakeRequiredUsd
        const minStakeRequired = utils.scaleByStabilityFactor(minStakeRequiredUsd, AccountsStorage.cachedNetworkAccount)

        const stakedAmount = stake_cert.stake

        if (!stakedAmount || stakedAmount === BigInt(0) || stakedAmount < minStakeRequired) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', 'validateJoinRequest fail: stake_cert.stake < minStakeRequired')
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: stake_cert.stake < minStakeRequired ${stakedAmount} < ${minStakeRequired}`)
          return {
            success: false,
            reason: `Minimum stake amount requirement does not meet.`,
            fatal: false,
          }
        }

        const requiredSig = getNodeCountForCertSignatures()
        const { success, reason } = dapp.validateClosestActiveNodeSignatures(stake_cert, stake_cert.signs, requiredSig, 5, 2)
        if (success) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', 'validateJoinRequest success: stake_cert')
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log('validateJoinRequest success: stake_cert')
          return {
            success: true,
            reason: 'Join Request validated',
            fatal: false,
          }
        }
        /* prettier-ignore */
        nestedCountersInstance.countEvent('liberdus-staking', `validateJoinRequest fail: ${reason}`)
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: ${reason}`)
        return {
          success: false,
          reason,
          fatal: true,
        }
      } catch (e) {
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest exception: ${e}`)
        /* prettier-ignore */
        nestedCountersInstance.countEvent('liberdus-staking', `validateJoinRequest fail: exception: ${e} `)
        return {
          success: false,
          reason: `validateJoinRequest fail: exception: ${e}`,
          fatal: true,
        }
      }
    },
    validateArchiverJoinRequest(data) {
      try {
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log(`validateArchiverJoinRequest ${Utils.safeStringify(data)}`)
        if (!data.appData) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateArchiverJoinRequest fail: !data.appData`)
          return {
            success: false,
            reason: `Join request Archiver doesn't provide the app data (appData).`,
            fatal: true,
          }
        }
        const { appData } = data
        const { minVersion } = AccountsStorage.cachedNetworkAccount.current.archiver
        if (!utils.isEqualOrNewerVersion(minVersion, appData.version)) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateArchiverJoinRequest() fail: old version`)
          return {
            success: false,
            reason: `Archiver Version number is old. Our Archiver version is: ${minVersion}. Join Archiver app version is ${appData.version}`,
            fatal: true,
          }
        }

        const { latestVersion } = AccountsStorage.cachedNetworkAccount.current.archiver
        if (latestVersion && appData.version && !utils.isEqualOrOlderVersion(latestVersion, appData.version)) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateArchiverJoinRequest() fail: version number is newer than latest`)
          return {
            success: false,
            reason: `Archiver Version number is newer than latest. The latest allowed Archiver version is ${latestVersion}. Join Archiver app version is ${appData.version}`,
            fatal: true,
          }
        }
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log(`validateArchiverJoinRequest() Successful!`)
        return {
          success: true,
          reason: 'Archiver-Join Request Validated!',
          fatal: false,
        }
      } catch (e) {
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log(`validateArchiverJoinRequest exception: ${e}`)
        return {
          success: false,
          reason: `validateArchiverJoinRequest fail: exception: ${e}`,
          fatal: true,
        }
      }
    },
    async isReadyToJoin(
      latestCycle: ShardusTypes.Cycle,
      publicKey: string,
      activeNodes: P2P.P2PTypes.Node[],
      mode: P2P.ModesTypes.Record['mode'],
    ): Promise<boolean> {
      const networkAccount = AccountsStorage.cachedNetworkAccount
      if (networkAccount) {
        if (!utils.isValidVersion(networkAccount.current.minVersion, networkAccount.current.latestVersion, version)) {
          const tag = 'version out-of-date; please update and restart'
          const message = 'node version is out-of-date; please update node to latest version'
          dapp.shutdownFromDapp(tag, message, false)
          return false
        }
      }

      isReadyToJoinLatestValue = false
      mustUseAdminCert = false

      //process golden ticket first
      if (adminCert && adminCert.certExp > dapp.shardusGetTime() && adminCert?.goldenTicket === true) {
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log('Join req with admincert and golden ticket')
        isReadyToJoinLatestValue = true
        mustUseAdminCert = true
        /* prettier-ignore */
        nestedCountersInstance.countEvent('liberdus-staking', 'goldenTicket available, isReadyToJoin = true')
        return true
      }

      if (LiberdusFlags.StakingEnabled === false) {
        isReadyToJoinLatestValue = true
        /* prettier-ignore */
        nestedCountersInstance.countEvent('liberdus-staking', 'staking disabled, isReadyToJoin = true')
        return true
      }

      if (LiberdusFlags.ModeEnabled === true && (mode === 'forming' || mode === 'restart')) {
        /* prettier-ignore */
        nestedCountersInstance.countEvent('liberdus-staking', 'staking enabled, network in forming/restart mode, isReadyToJoin = true')
        isReadyToJoinLatestValue = true
        return true
      }
      /* prettier-ignore */
      if (logFlags.important_as_error) console.log(`active: ${latestCycle.active}, syncing: ${latestCycle.syncing}, flag: ${LiberdusFlags.AdminCertEnabled}`)
      // check for LiberdusFlags for mode + check if mode is not equal to processing and validate adminCert
      if (LiberdusFlags.AdminCertEnabled === true && mode !== 'processing') {
        /* prettier-ignore */
        if (logFlags.important_as_error) console.log('entered admin cert conditon mode:' + mode)
        if (adminCert) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`checkAdminCert ${Utils.safeStringify(adminCert)}`)
          if (adminCert.certExp > dapp.shardusGetTime()) {
            isReadyToJoinLatestValue = true
            mustUseAdminCert = true
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', 'valid admin cert, isReadyToJoin = true')
            /* prettier-ignore */
            if (logFlags.important_as_error) console.log('valid admin cert, isReadyToJoin = true')
            return true
          } else {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', 'adminCert present but expired, this blocks joining')
            /* prettier-ignore */
            if (logFlags.important_as_error) console.log('admin cert present but expired, this blocks joining')
            return false
          }
        }
        /* prettier-ignore */
        nestedCountersInstance.countEvent('liberdus-staking', 'adminCert expected not ready to join, this blocks joining')
        /* prettier-ignore */
        if (logFlags.important_as_error) console.log('admin cert required but missing, this blocks joining')
        return false // this will stop us from joining the normal way
      }
      if (LiberdusFlags.AdminCertEnabled === true && mode === 'processing') {
        /* prettier-ignore */
        nestedCountersInstance.countEvent('liberdus-staking', 'AdminCertEnabled=true but mode is processing')
      }
      if (adminCert && !LiberdusFlags.AdminCertEnabled) {
        /* prettier-ignore */
        nestedCountersInstance.countEvent('liberdus-staking', 'adminCert present but AdminCertEnabled=false')
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest: AdminCert available but not utilized due to configuration`)
      }

      /* prettier-ignore */
      if (logFlags.important_as_error) console.log(`Running isReadyToJoin cycle:${latestCycle.counter} publicKey: ${publicKey}`)
      // handle first time staking setup
      if (lastCertTimeTxTimestamp === 0) {
        // inject setCertTimeTx for the first time
        /* prettier-ignore */
        nestedCountersInstance.countEvent('liberdus-staking', 'lastCertTimeTxTimestamp === 0 first time or expired')

        const response = await SetCertTime.injectSetCertTimeTx(dapp, publicKey, activeNodes)
        if (response == null) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', `failed call to injectSetCertTimeTx 1 reason: response is null`)
          return false
        }
        if (!response.success) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', `failed call to injectSetCertTimeTx 1 reason: ${(response as LiberdusTypes.ValidatorError).reason}`)
          return false
        }

        // set lastCertTimeTxTimestamp and cycle
        lastCertTimeTxTimestamp = dapp.shardusGetTime()
        lastCertTimeTxCycle = latestCycle.counter

        // return false and query/check again in next cycle
        return false
      }

      const isCertTimeExpired = lastCertTimeTxCycle > 0 && latestCycle.counter - lastCertTimeTxCycle > SetCertTime.getCertCycleDuration()
      if (isCertTimeExpired) {
        nestedCountersInstance.countEvent('liberdus-staking', 'stakeCert expired and need to be renewed')
        const response = await SetCertTime.injectSetCertTimeTx(dapp, publicKey, activeNodes)
        if (response == null) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', `failed call to injectSetCertTimeTx 2 reason: response is null`)
          return false
        }
        if (!response.success) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', `failed call to injectSetCertTimeTx 2 reason: ${(response as LiberdusTypes.ValidatorError).reason}`)
          return false
        }
        QueryCertificate.removeStakeCert() //clear stake cert, so we will know to query for it again
        // set lastCertTimeTxTimestamp and cycle
        lastCertTimeTxTimestamp = dapp.shardusGetTime()
        lastCertTimeTxCycle = latestCycle.counter
        // return false and query/check again in next cycle
        return false
      }

      //if we have stakeCert, check its time
      if (QueryCertificate.stakeCert != null) {
        nestedCountersInstance.countEvent('liberdus-staking', `stakeCert is not null`)

        const remainingValidTime = QueryCertificate.stakeCert.certExp - dapp.shardusGetTime()
        const certStartTimestamp = QueryCertificate.stakeCert.certExp - SetCertTime.getCertCycleDuration() * configs.ONE_SECOND * latestCycle.duration
        const certEndTimestamp = QueryCertificate.stakeCert.certExp
        const expiredPercentage = (dapp.shardusGetTime() - certStartTimestamp) / (certEndTimestamp - certStartTimestamp)
        const isExpiringSoon = expiredPercentage >= 0.7
        // if the cert is expired 70% or more
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs)
          console.log(`cert != null, remainingValidTime: ${remainingValidTime}, expiredPercentage: ${expiredPercentage}, isExpiringSoon: ${isExpiringSoon}`)

        if (isExpiringSoon) {
          nestedCountersInstance.countEvent('liberdus-staking', 'stakeCert is expired or expiring soon')
          const response = await SetCertTime.injectSetCertTimeTx(dapp, publicKey, activeNodes)
          if (response == null) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', `failed call to injectSetCertTimeTx 2 reason: response is null`)
            return false
          }
          if (!response.success) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', `failed call to injectSetCertTimeTx 2 reason: ${(response as LiberdusTypes.ValidatorError).reason}`)
            return false
          }
          QueryCertificate.removeStakeCert() //clear stake cert, so we will know to query for it again
          lastCertTimeTxTimestamp = dapp.shardusGetTime()
          lastCertTimeTxCycle = latestCycle.counter
          // return false and check again in next cycle
          return false
        } else {
          const isValid = true
          // todo: validate the cert here
          if (!isValid) {
            nestedCountersInstance.countEvent('liberdus-staking', 'invalid cert, isReadyToJoin = false')
            return false
          }

          nestedCountersInstance.countEvent('liberdus-staking', 'valid cert, isReadyToJoin = true')
          /* prettier-ignore */
          if (logFlags.important_as_error) {
            console.log('valid cert, isReadyToJoin = true ', QueryCertificate.stakeCert)
          }

          isReadyToJoinLatestValue = true
          return true
        }
      }
      //if stake cert is null and we have set cert time before then query for the cert
      if (lastCertTimeTxTimestamp > 0 && QueryCertificate.stakeCert == null) {
        // we have already submitted setCertTime
        // query the certificate from the network
        const res = await QueryCertificate.queryCertificate(dapp, publicKey, activeNodes)
        /* prettier-ignore */
        if (logFlags.important_as_error) console.log('queryCertificate', res)
        if (!res.success) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', `call to queryCertificate failed with reason: ${(res as LiberdusTypes.ValidatorError).reason}`)

          // if we injected setCertTimeTx more than 3 cycles ago but still cannot get new cert, we need to inject it again
          if (
            latestCycle.counter - lastCertTimeTxCycle > 3 ||
            dapp.shardusGetTime() - lastCertTimeTxTimestamp > 3 * configs.ONE_SECOND * latestCycle.duration
          ) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', `call to queryCertificate failed for 3 consecutive cycles, will inject setCertTimeTx again`)
            lastCertTimeTxTimestamp = 0
          }

          return false
        }
        const signedStakeCert = (res as QueryCertificate.CertSignaturesResult).signedStakeCert
        if (signedStakeCert == null) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', `signedStakeCert is null`)
          return false
        }
        const remainingValidTime = signedStakeCert.certExp - dapp.shardusGetTime()

        const certStartTimestamp = signedStakeCert.certExp - SetCertTime.getCertCycleDuration() * configs.ONE_SECOND * latestCycle.duration
        const certEndTimestamp = signedStakeCert.certExp
        const expiredPercentage = (dapp.shardusGetTime() - certStartTimestamp) / (certEndTimestamp - certStartTimestamp)
        const isNewCertExpiringSoon = expiredPercentage >= 0.7
        /* prettier-ignore */
        if (logFlags.important_as_error)
          console.log(
            `stakeCert received. remainingValidTime: ${remainingValidTime} expiredPercent: ${expiredPercentage}, isNewCertExpiringSoon: ${isNewCertExpiringSoon}`,
          )

        // if queried cert is going to expire soon, inject a new setCertTimeTx
        if (isNewCertExpiringSoon) {
          /* prettier-ignore */
          nestedCountersInstance.countEvent('liberdus-staking', 'new stakeCert is expiring soon. will inject' + ' setCertTimeTx again')

          QueryCertificate.removeStakeCert() //clear stake cert, so we will know to query for it again
          const response = await SetCertTime.injectSetCertTimeTx(dapp, publicKey, activeNodes)
          if (response == null) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', `failed call to injectSetCertTimeTx 3 reason: response is null`)
            return false
          }
          if (!response.success) {
            /* prettier-ignore */
            nestedCountersInstance.countEvent('liberdus-staking', `failed call to injectSetCertTimeTx 3 reason: ${(response as LiberdusTypes.ValidatorError).reason}`)
            return false
          }

          lastCertTimeTxTimestamp = dapp.shardusGetTime()
          lastCertTimeTxCycle = latestCycle.counter
          // return false and check again in next cycle
          return false
        } else {
          const isValid = true
          // todo: validate the cert here
          if (!isValid) {
            nestedCountersInstance.countEvent('liberdus-staking', 'invalid cert, isReadyToJoin = false')
            return false
          }
          // cert if valid and not expiring soon
          QueryCertificate.addStakeCert(signedStakeCert)

          nestedCountersInstance.countEvent('liberdus-staking', 'valid cert, isReadyToJoin = true')
          /* prettier-ignore */
          if (logFlags.important_as_error) console.log('valid cert, isReadyToJoin = true ', QueryCertificate.stakeCert)

          isReadyToJoinLatestValue = true
          return true
        }
      }

      // avoid returning undefined, what if the calling code was refactored to check "=== false"...
      /* prettier-ignore */
      nestedCountersInstance.countEvent('liberdus-staking', `end of function with no earlier return`)
      return false
    },
    getNodeInfoAppData() {
      let minVersion = ''
      let activeVersion = ''
      let latestVersion = ''
      const cachedNetworkAccount = AccountsStorage.cachedNetworkAccount
      if (cachedNetworkAccount) {
        minVersion = cachedNetworkAccount.current.minVersion
        activeVersion = cachedNetworkAccount.current.activeVersion
        latestVersion = cachedNetworkAccount.current.latestVersion
      }
      const liberdusNodeInfo: LiberdusTypes.NodeInfoAppData = {
        appVersion: version,
        minVersion,
        activeVersion,
        latestVersion,
        operatorCLIVersion,
        operatorGUIVersion,
      }
      return liberdusNodeInfo
    },
    async eventNotify(data: ShardusTypes.ShardusEvent) {
      if (LiberdusFlags.StakingEnabled === false) return
      if (LiberdusFlags.VerboseLogs) console.log(`Running eventNotify`, data)

      const nodeId = dapp.getNodeId()
      const node = dapp.getNode(nodeId)

      console.log('eventNotify', data.type, data.publicKey)
      // skip for own node
      if (!dapp.p2p.isFirstSeed && data.nodeId === nodeId && data.type !== 'node-activated') {
        console.log('eventNotify', 'skipping for own node', data.type, data.publicKey)
        return
      }

      if (node == null) {
        if (LiberdusFlags.VerboseLogs) console.log(`node is null`, data.publicKey)
        console.log('eventNotify', 'node is null', data.publicKey)
        return
      }

      if (node.status !== 'active' && data.type !== 'node-activated') {
        /* prettier-ignore */
        if (logFlags.dapp_verbose) console.log('This node is not active yet')
        console.log('eventNotify', 'This node is not active yet', data.publicKey)
        return
      }

      const eventType = data.type
      nestedCountersInstance.countEvent('eventNotify', `eventType: ${eventType}`)

      // Waiting a bit here to make sure that shardus.getLatestCycles gives the latest cycle
      await utils._sleep(1000)
      const latestCycles: ShardusTypes.Cycle[] = dapp.getLatestCycles(10)
      const currentCycle = latestCycles[0]
      if (!currentCycle) {
        /* prettier-ignore */
        if (logFlags.error) console.log('No cycle records found', latestCycles)
        console.log('eventNotify', 'No cycle records found', latestCycles, eventType, data.publicKey)
        return
      }

      // TODO: see if it's fine; what if getClosestNodes gives only recently activatd nodes
      // skip if this node is also activated in the same cycle
      const currentlyActivatedNode = currentCycle.activated.includes(nodeId)
      if (currentlyActivatedNode) {
        console.log('eventNotify', 'skipping for currentlyActivatedNode', data.publicKey, eventType)
        return
      }

      if (eventType === 'node-activated') {
        const closestNodes = dapp.getClosestNodes(data.publicKey, 5)
        for (const id of closestNodes) {
          if (id === nodeId) {
            nestedCountersInstance.countEvent('liberdus-staking', `${eventType}: injectInitRewardTx`)
            const txData = {
              startTime: data.time,
              publicKey: data.publicKey,
              nodeId: data.nodeId,
            } as LiberdusTypes.NodeInitTxData
            console.log('node-activated', 'injectInitRewardTx', data.publicKey, txData)
            dapp.addNetworkTx('nodeInitReward', dapp.signAsNode(txData), data.publicKey)
          }
        }
      } else if (eventType === 'node-deactivated') {
        // todo: aamir check the timestamp and cycle the first time we see this event
        // Limit the nodes that send this to the 5 closest to the node id
        const closestNodes = dapp.getClosestNodes(data.publicKey, 5)
        const ourId = dapp.getNodeId()
        for (const id of closestNodes) {
          if (id === ourId) {
            nestedCountersInstance.countEvent('liberdus-staking', `${eventType}: injectClaimRewardTx`)
            const txData = {
              start: data.activeCycle,
              end: data.cycleNumber,
              endTime: data.time,
              publicKey: data.publicKey,
              nodeId: data.nodeId,
            } as LiberdusTypes.NodeRewardTxData
            console.log('node-deactivates', 'injectClaimRewardTx', data.publicKey, txData)
            dapp.addNetworkTx('nodeReward', dapp.signAsNode(txData), data.publicKey)
          }
        }
      } else if (
        eventType === 'node-left-early' &&
        AccountsStorage.cachedNetworkAccount.current.enableNodeSlashing === true &&
        AccountsStorage.cachedNetworkAccount.current.slashing.enableLeftNetworkEarlySlashing
      ) {
        let nodeLostCycle
        let nodeDroppedCycle
        for (const cycle of latestCycles) {
          if (cycle.apoptosized.includes(data.nodeId)) {
            nodeDroppedCycle = cycle.counter
          } else if (cycle.lost.includes(data.nodeId)) {
            nodeLostCycle = cycle.counter
          }
        }
        if (nodeLostCycle && nodeDroppedCycle && nodeLostCycle < nodeDroppedCycle) {
          const violationData: LiberdusTypes.LeftNetworkEarlyViolationData = {
            nodeLostCycle,
            nodeDroppedCycle,
            nodeDroppedTime: data.time,
          }
          nestedCountersInstance.countEvent('liberdus-staking', `node-left-early: injectPenaltyTx`)
          await Penalty.injectPenaltyTX(dapp, data, violationData)
        } else {
          nestedCountersInstance.countEvent('liberdus-staking', `node-left-early: event skipped`)
          /* prettier-ignore */
          if (logFlags.dapp_verbose) console.log(`node-left-early event skipped`, data, nodeLostCycle, nodeDroppedCycle)
        }
      } else if (
        eventType === 'node-sync-timeout' &&
        AccountsStorage.cachedNetworkAccount.current.enableNodeSlashing === true &&
        AccountsStorage.cachedNetworkAccount.current.slashing.enableSyncTimeoutSlashing
      ) {
        let violationData: LiberdusTypes.SyncingTimeoutViolationData
        for (const cycle of latestCycles) {
          if (cycle.lostSyncing.includes(data.nodeId) && cycle.counter === data.cycleNumber) {
            violationData = {
              nodeLostCycle: data.cycleNumber,
              nodeDroppedTime: data.time,
            }
            nestedCountersInstance.countEvent('liberdus-staking', `node-sync-timeout: injectPenaltyTx`)
            await Penalty.injectPenaltyTX(dapp, data, violationData)
          }
        }
        if (!violationData) {
          console.log(`node-sync-timeout validation failed: Node-ID: (${data.nodeId}) not found in lostSyncing`)
          return
        }
      } else if (
        eventType === 'node-refuted' &&
        AccountsStorage.cachedNetworkAccount.current.enableNodeSlashing === true &&
        AccountsStorage.cachedNetworkAccount.current.slashing.enableNodeRefutedSlashing
      ) {
        let nodeRefutedCycle
        for (const cycle of latestCycles) {
          if (cycle.refuted.includes(data.nodeId)) {
            nodeRefutedCycle = cycle.counter
          }
        }
        if (nodeRefutedCycle === data.cycleNumber) {
          const violationData: LiberdusTypes.NodeRefutedViolationData = {
            nodeRefutedCycle: nodeRefutedCycle,
            nodeRefutedTime: data.time,
          }
          nestedCountersInstance.countEvent('liberdus-staking', `node-refuted: injectPenaltyTx`)
          await Penalty.injectPenaltyTX(dapp, data, violationData)
        } else {
          nestedCountersInstance.countEvent('liberdus-staking', `node-refuted: event skipped`)
          /* prettier-ignore */
          if (logFlags.dapp_verbose) console.log(`node-refuted event skipped`, data, nodeRefutedCycle)
        }
      } else if (eventType === 'try-network-transaction') {
        /* prettier-ignore */
        if (logFlags.dapp_verbose) console.log('event', `try-network-transaction`, Utils.safeStringify(data))
        nestedCountersInstance.countEvent('event', `try-network-transaction`)
        if (data?.additionalData.type === 'nodeReward') {
          console.log('event', `running injectClaimrewardTxWithRetry nodeReward`, Utils.safeStringify(data))
          console.log('nodereward tx data 1', data.additionalData.hash)
          if (dapp.fastIsPicked(1)) {
            console.log('nodereward tx data 2', data.additionalData.hash)
            const result = await ClaimReward.injectClaimRewardTx(dapp, data)
            /* prettier-ignore */
            if (logFlags.dapp_verbose) console.log('INJECTED_CLAIM_REWARD_TX', result)
          }
        } else if (data?.additionalData.type === 'nodeInitReward') {
          /* prettier-ignore */
          if (logFlags.dapp_verbose) console.log('event', `running injectInitRewardTx nodeInitReward`, Utils.safeStringify(data))
          if (dapp.fastIsPicked(1)) {
            console.log('nodeInitReward tx data 2', data.additionalData.hash)
            const result = await InitReward.injectInitRewardTx(dapp, data)
            /* prettier-ignore */
            if (logFlags.dapp_verbose) console.log('INJECTED_INIT_REWARD_TIMES_TX', result)
          }
        }
      }
    },
    // Note: this logic is added to the archive server; any changes here should have to be done in the archive server as well
    async updateNetworkChangeQueue(account: LiberdusTypes.WrappedAccount, appData: any) {
      const patchAndUpdate = async (existingObject: any, changeObj: any, parentPath = ''): Promise<void> => {
        /* eslint-disable security/detect-object-injection */
        for (const [key, value] of Object.entries(changeObj)) {
          if (existingObject[key] != null) {
            if (typeof value === 'object') {
              await patchAndUpdate(existingObject[key], value, parentPath === '' ? key : parentPath + '.' + key)
            } else {
              if (key === 'activeVersion') {
                await onActiveVersionChange(value as string)
              }
              existingObject[key] = value
            }
          }
        }
        /* eslint-enable security/detect-object-injection */
      }

      const networkAccount: LiberdusTypes.NetworkAccount = account.data
      await patchAndUpdate(networkAccount.current, appData)
      // TODO: look into updating the timestamp also
      // Increase the timestamp by 1 second
      const nodeId = dapp.getNodeId()
      const node = dapp.getNode(nodeId)
      if (node.status === 'active') {
        networkAccount.timestamp += configs.ONE_SECOND // ( this has issue when a newly joined node updates its config )
      }
      networkAccount.hash = this.calculateAccountHash(networkAccount)
      account.stateId = networkAccount.hash
      account.timestamp = networkAccount.timestamp
      return [account]
    },

    // Note: this logic is added to the archive server; any changes here should have to be done in the archive server as well
    async pruneNetworkChangeQueue(account: LiberdusTypes.WrappedAccount, currentCycle: number) {
      const networkAccount: LiberdusTypes.NetworkAccount = account.data
      const listOfChanges = account.data.listOfChanges

      const generatePathKeys = (obj: any, prefix = ''): string[] => {
        /* eslint-disable security/detect-object-injection */
        let paths: string[] = []

        // Loop over each key in the object
        for (const key of Object.keys(obj)) {
          // If the value corresponding to this key is an object (and not an array or null),
          // then recurse into it.
          if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            paths = paths.concat(generatePathKeys(obj[key], prefix + key + '.'))
          } else {
            // Otherwise, just append this key to the path.
            paths.push(prefix + key)
          }
        }
        return paths
        /* eslint-enable security/detect-object-injection */
      }

      const configsMap = new Map()
      const keepAliveCount = shardusConfig.stateManager.configChangeMaxChangesToKeep
      for (let i = listOfChanges.length - 1; i >= 0; i--) {
        const thisChange = listOfChanges[i]
        let keepAlive = false

        let appConfigs = []
        if (thisChange.appData) {
          appConfigs = generatePathKeys(thisChange.appData, 'appdata.')
        }
        const shardusConfigs: string[] = generatePathKeys(thisChange.change)

        const allConfigs = appConfigs.concat(shardusConfigs)

        for (const config of allConfigs) {
          if (!configsMap.has(config)) {
            configsMap.set(config, 1)
            keepAlive = true
          } else if (configsMap.get(config) < keepAliveCount) {
            configsMap.set(config, configsMap.get(config) + 1)
            keepAlive = true
          }
        }

        if (currentCycle - thisChange.cycle <= shardusConfig.stateManager.configChangeMaxCyclesToKeep) {
          keepAlive = true
        }

        if (keepAlive == false) {
          listOfChanges.splice(i, 1)
        }
      }
      // TODO: look into updating the timestamp also
      // Increase the timestamp by 1 second
      const nodeId = dapp.getNodeId()
      const node = dapp.getNode(nodeId)
      if (node.status === 'active') {
        networkAccount.timestamp += configs.ONE_SECOND // ( this has issue when a newly joined node updates its config )
      }

      networkAccount.hash = this.calculateAccountHash(networkAccount)
      account.stateId = networkAccount.hash
      account.timestamp = networkAccount.timestamp
      return [account]
    },
    canStayOnStandby(joinInfo: P2P.JoinTypes.JoinRequest): { canStay: boolean; reason: string } {
      if (joinInfo) {
        const appJoinData = joinInfo?.appJoinData as LiberdusTypes.AppJoinData

        if (AccountsStorage.cachedNetworkAccount == null) {
          //We need to enhance the early config getting to also get other values of the global account
          //so we know what versions the network is.  this is a stopgap!
          return { canStay: true, reason: 'dont have network account yet. cant boot anything!' }
        }

        const minVersion = AccountsStorage.cachedNetworkAccount.current.minVersion
        if (!utils.isEqualOrNewerVersion(minVersion, appJoinData.version)) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: old version`)
          return {
            canStay: false,
            reason: `canStayOnStandby: standby node version: ${appJoinData.version} < minVersion ${minVersion}`,
          }
        }

        const latestVersion = AccountsStorage.cachedNetworkAccount.current.latestVersion

        if (latestVersion && appJoinData.version && !utils.isEqualOrOlderVersion(latestVersion, appJoinData.version)) {
          /* prettier-ignore */
          if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: version number is newer than latest`)
          return {
            canStay: false,
            reason: `version number is newer than latest. The latest allowed app version is ${latestVersion}. Join request node app version is ${appJoinData.version}`,
            //fatal: true,
          }
        }
      }

      return { canStay: true, reason: '' }
    },
    verifyMultiSigs: function (
      rawPayload: object,
      sigs: ShardusTypes.Sign[],
      allowedPubkeys: { [pubkey: string]: ShardusTypes.DevSecurityLevel },
      minSigRequired: number,
      requiredSecurityLevel: ShardusTypes.DevSecurityLevel,
    ): boolean {
      return utils.verifyMultiSigs(rawPayload, sigs, allowedPubkeys, minSigRequired, requiredSecurityLevel)
    },
    binarySerializeObject(identifier: string, obj): Buffer {
      try {
        switch (identifier) {
          case 'AppData':
            return serializeAccounts(obj).getBuffer()
          default:
            return Buffer.from(Utils.safeStringify(obj), 'utf8')
        }
      } catch (e) {
        return Buffer.from(Utils.safeStringify(obj), 'utf8')
      }
    },
    binaryDeserializeObject(identifier: string, buffer: Buffer) {
      try {
        switch (identifier) {
          case 'AppData':
            return deserializeAccounts(buffer)
          default:
            return Utils.safeJsonParse(buffer.toString('utf8'))
        }
      } catch (e) {
        return Utils.safeJsonParse(buffer.toString('utf8'))
      }
    },
    beforeStateAccountFilter(account: ShardusTypes.WrappedData) {
      return false
    },
    isNGT: (tx: ShardusTypes.OpaqueTransaction): boolean => {
      const INIT_REWARD_TX = TXTypes.init_reward
      const CLAIM_REWARD_TX = TXTypes.claim_reward
      const NGT_TYPES = [INIT_REWARD_TX, CLAIM_REWARD_TX]
      return NGT_TYPES.includes(tx?.['type'])
    },
    verifyAppJoinData: (data: unknown): string[] | null => {
      // [TODO] Implement this function
      return null
    },
  })

  dapp.registerExceptionHandler()
}

async function fetchNetworkAccountFromArchiver(): Promise<LiberdusTypes.NetworkAccount> {
  //make a trustless query which will check 3 random archivers and call the endpoint with hash=true
  let archiverList = getFinalArchiverList()
  archiverList = utils.getRandom(archiverList, archiverList.length >= 3 ? 3 : archiverList.length)
  const values: {
    hash: string
    archiver: Archiver
  }[] = []
  for (const archiver of archiverList) {
    const archiverUrl = `http://${archiver.ip}:${archiver.port}/get-network-account?hash=true`
    try {
      const res = await axios.get<{
        networkAccountHash: string
        sign: {
          owner: string
          sig: string
        }
      }>(archiverUrl)
      if (!res.data) {
        /* prettier-ignore */
        nestedCountersInstance.countEvent('network-config-operation', 'failure: did not get network account from archiver private key. Use default configs.')
        throw new Error(`fetchNetworkAccountFromArchiver() from pk:${archiver.publicKey} returned null`)
      }
      /* prettier-ignore */
      if (LiberdusFlags.VerboseLogs) console.log(`[fetchNetworkAccountFromArchiver] data: ${JSON.stringify(res.data)}`)
      const isFromArchiver = archiver.publicKey === res.data.sign.owner
      /* prettier-ignore */
      if (LiberdusFlags.VerboseLogs) console.log(`[fetchNetworkAccountFromArchiver] isFronArchiver: ${isFromArchiver}`)
      if (!isFromArchiver) {
        throw new Error(`The response signature is not the same from archiver pk:${archiver.publicKey}`)
      }
      const isResponseVerified = crypto.verifyObj(res.data, true)
      /* prettier-ignore */
      if (LiberdusFlags.VerboseLogs) console.log(`[fetchNetworkAccountFromArchiver] isResponseVerified: ${isResponseVerified}`)
      if (!isResponseVerified) {
        throw new Error(`The response signature is not the same from archiver pk:${archiver.publicKey}`)
      }
      values.push({
        hash: res.data.networkAccountHash as string,
        archiver,
      })
    } catch (ex) {
      //dont let one bad archiver crash us !
      /* prettier-ignore */
      nestedCountersInstance.countEvent('network-config-operation', `error: ${ex?.message}`)
      console.error(`[fetchNetworkAccountFromArchiver] ERROR retrieving/processing data from archiver ${archiverUrl}: `, ex)
    }
  }

  //make sure there was a majority winner for the hash
  const majorityValue = utils.findMajorityResult(values, (v) => v.hash)
  /* prettier-ignore */
  if (LiberdusFlags.VerboseLogs) console.log(`[fetchNetworkAccountFromArchiver] majorityValue: ${Utils.safeStringify(majorityValue)}`)
  if (!majorityValue) {
    /* prettier-ignore */
    nestedCountersInstance.countEvent('network-config-operation', 'failure: no majority found for archivers get-network-account result. Use default configs.')
    throw new Error(`no majority found for archivers get-network-account result `)
  }
  const url = `http://${majorityValue.archiver.ip}:${majorityValue.archiver.port}/get-network-account?hash=false`
  try {
    const res = await axios.get<{ networkAccount: any; sign: any }>(url)
    /* prettier-ignore */
    if (LiberdusFlags.VerboseLogs) console.log(`[fetchNetworkAccountFromArchiver] data: ${Utils.safeStringify(res?.data)}`)
    if (!res.data) {
      /* prettier-ignore */
      nestedCountersInstance.countEvent('network-config-operation', 'failure: did not get network account from archiver private key, returned null. Use default configs.')
      throw new Error(`get-network-account from archiver pk:${majorityValue.archiver.publicKey} returned null`)
    }

    if (LiberdusFlags.enableArchiverNetworkAccountValidation) {
      // basic validation of the data to make sure we won't get unexpected errors
      if (!res.data.networkAccount || !res.data.networkAccount.data || !res.data.networkAccount.data.hash) {
        throw new Error(`get-network-account from archiver pk:${majorityValue.archiver.publicKey} returned malformed data: ${Utils.safeStringify(res.data)}`)
      }

      nestedCountersInstance.countEvent('network-config-operation', 'success: got network account from winning archiver')

      // verify the 'winning' archiver's signature of the network account matches that of the response body signature
      const isResponseVerified = res.data.sign.owner === majorityValue.archiver.publicKey && crypto.verifyObj(res.data, true)
      if (!isResponseVerified) {
        nestedCountersInstance.countEvent(
          'network-config-operation',
          'failure: The response signature is not the same from archiver pk:${majorityValue.archiver.publicKey}',
        )
        throw new Error(`The response signature is not the same from archiver pk:${majorityValue.archiver.publicKey}`)
      }

      // verify that the hash was not spoofed by the archiver, rehash the network account and compare
      const rehashedNetworkAccount = crypto.hashObj(res.data.networkAccount.data)
      if (rehashedNetworkAccount !== majorityValue.hash) {
        nestedCountersInstance.countEvent('network-config-operation', 'failure: The rehashed network account is not the same as the majority hash')
        throw new Error(
          `The rehashed network account is not the same as the majority hash. rehashed: ${rehashedNetworkAccount}, majority: ${majorityValue.hash}`,
        )
      }
    }

    return res.data.networkAccount.data as LiberdusTypes.NetworkAccount
  } catch (ex) {
    console.error(`[fetchNetworkAccountFromArchiver] ERROR retrieving/processing data from archiver ${url}: `, ex)
    /* prettier-ignore */
    nestedCountersInstance.countEvent('network-config-operation', `error: ${ex?.message}`)
    throw new Error(`Not able to fetch get-network-account result from archiver `)
  }
}

async function updateConfigFromNetworkAccount(
  inputConfig: ShardusTypes.ShardusConfiguration,
  networkAccount: LiberdusTypes.NetworkAccount,
): Promise<ShardusTypes.ShardusConfiguration> {
  console.log(`[updateConfigFromNetworkAccount] inputConfig: ${Utils.safeStringify(inputConfig)}, networkAccount: ${Utils.safeStringify(networkAccount)}`)
  // Clone config with rfdc
  const config = rfdc()(inputConfig)

  // Extract changes from the networkAccount
  const changes = networkAccount.listOfChanges

  // Validate changes
  if (!changes || !Array.isArray(changes)) {
    /* prettier-ignore */
    if (LiberdusFlags.VerboseLogs) console.log('updateConfigFromNetworkAccount(): No changes to apply to the config.')
    /* prettier-ignore */
    nestedCountersInstance.countEvent('network-config-operation', 'success: no changes because no changes to apply to the config.')
    return config
  }

  // Iterate through changes and apply them
  for (const change of changes) {
    // Apply changes using patchObject function
    utils.patchConfig(config, change.change)
  }

  /* prettier-ignore */
  if (LiberdusFlags.VerboseLogs) console.log('updateConfigFromNetworkAccount(): Successfully applied changes to the config.')
  /* prettier-ignore */
  nestedCountersInstance.countEvent('network-config-operation', 'success: applied changes to config')

  // Return the patched config
  return config
}

// CODE THAT GETS EXECUTED WHEN NODES START
;(async (): Promise<void> => {
  await setupArchiverDiscovery({
    customArchiverList: config.server.p2p?.existingArchivers,
  })
  config.server.p2p.existingArchivers = getFinalArchiverList()
  let networkAccount: LiberdusTypes.NetworkAccount

  /**
   * Standby nodes will sync network config very early here.
   *
   * This `networkAccount` will only be used to help build/update a config and will not be stored as a local account.
   * Later, when a node joins, it can get the network account as part of the normal sync process.
   * Initially, use `someactivenode:<externalPort>/account/0x00000000...` to get the network account.
   * You would need to get a list of active nodes from the archiver to know which one to ask.
   *
   * const networkAccount = await getTrustlessNetworkAccount();
   *
   * This needs the logic to patch a config.
   * It will also have to call its own function:
   *
   * const patchedConfig = updateConfigFromNetworkAccount(config, networkAccount);
   *
   * Use `patchedConfig` instead of `config` below.
   */

  let configToLoad

  try {
    // Attempt to get and patch config. Error if unable to get config.
    networkAccount = await fetchNetworkAccountFromArchiver()
    /* prettier-ignore */
    if (LiberdusFlags.VerboseLogs) console.log(`[index] networkAccount: ${Utils.safeStringify(networkAccount)}`)
    AccountsStorage.setCachedNetworkAccount(networkAccount)
    configToLoad = await updateConfigFromNetworkAccount(config, networkAccount)
    if (LiberdusFlags.VerboseLogs) console.log(`[index] configToLoad: ${Utils.safeStringify(configToLoad)}`)
  } catch (error) {
    configToLoad = config
    /* prettier-ignore */
    nestedCountersInstance.countEvent('network-config-operation', 'Error: Use default configs.')
    /* prettier-ignore */
    if (LiberdusFlags.VerboseLogs) console.log(`Error: ${utils.formatErrorMessage(error)} \nUsing default configs`)
  }

  dapp = shardusFactory(configToLoad)
  shardusConfig = dapp.config

  registerAPI(dapp)
  configShardusNetworkTransactions(dapp)
  shardusSetup()
  initAjvSchemas()

  dapp.registerExternalGet('accounts', async (req, res): Promise<void> => {
    const accounts = await AccountsStorage.debugGetAllAccounts()
    res.json({ accounts })
  })

  const cycleInterval = configs.cycleDuration * configs.ONE_SECOND

  let issueGenerated = false
  let tallyGenerated = false
  let applyGenerated = false

  let devIssueGenerated = false
  let devTallyGenerated = false
  let devApplyGenerated = false

  let node: any
  let nodeId: string
  let nodeAddress: string
  let lastReward: number
  let cycleData: ShardusTypes.Cycle
  let currentTime: number
  let luckyNodes: string[]
  const expected = dapp.shardusGetTime() + cycleInterval
  let drift: number
  let lastMaintainedCycle: number

  await dapp.start()

  // THIS CODE IS CALLED ON EVERY NODE ON EVERY CYCLE
  async function networkMaintenance(): Promise<NodeJS.Timeout> {
    dapp.log('New maintenance cycle has started')
    Penalty.clearOldPenaltyTxs(dapp)
    currentTime = dapp.shardusGetTime()
    drift = currentTime - expected
    let network: LiberdusTypes.NetworkAccount
    try {
      const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      network = account.data as LiberdusTypes.NetworkAccount
      ;[cycleData] = dapp.getLatestCycles()
      luckyNodes = dapp.getClosestNodes(cycleData.previous, LiberdusFlags.numberOfLuckyNodes)
      nodeId = dapp.getNodeId()
      node = dapp.getNode(nodeId)
      nodeAddress = node.address
      if (cycleData.counter <= lastMaintainedCycle) {
        dapp.log(`Cycle ${cycleData.counter} has already been maintained. Waiting for next maintenance cycle`)
        return setTimeout(networkMaintenance, getNextMaintenanceCycleStart(cycleData))
      }
    } catch (err) {
      dapp.log('ERR: ', err)
      console.log('ERR: ', err)
      return setTimeout(networkMaintenance, 100)
    }
    lastMaintainedCycle = cycleData.counter

    const driftFromCycleStart = currentTime - cycleData.start * 1000
    if (LiberdusFlags.VerboseLogs) {
      dapp.log('driftFromCycleStart: ', driftFromCycleStart, currentTime, cycleData.start * 1000)
      dapp.log('lastMaintainedCycle: ', lastMaintainedCycle)
      dapp.log('payAddress: ', process.env.PAY_ADDRESS)
      dapp.log('cycleData: ', cycleData.counter)
      dapp.log('luckyNode: ', luckyNodes)
      dapp.log('nodeId: ', nodeId)
      dapp.log('nodeAddress: ', nodeAddress)
      dapp.log('windows: ', network.windows)
      dapp.log('nextWindows: ', network.nextWindows)
      dapp.log('devWindows: ', network.devWindows)
      dapp.log('nextDevWindows: ', network.nextDevWindows)
      dapp.log('current: ', network.current)
      dapp.log('next: ', network.next)
      dapp.log('developerFund: ', network.developerFund)
      dapp.log('nextDeveloperFund: ', network.nextDeveloperFund)
      dapp.log('issue: ', network.issue)
      dapp.log('devIssue: ', network.devIssue)
    }
    if (LiberdusFlags.enableDAOTransactions === false) {
      if (LiberdusFlags.VerboseLogs) dapp.log('DAO transactions are disabled')
      return setTimeout(networkMaintenance, getNextMaintenanceCycleStart(cycleData))
    }

    const isProcessingMode = cycleData.mode === 'processing'
    if (network.windows == null) {
      if (isProcessingMode && luckyNodes.includes(nodeId)) {
        // start network DAO time windows
        dapp.log('Starting network windows', luckyNodes, nodeId)
        await utils.startNetworkWindows(nodeAddress, nodeId, dapp)
        nestedCountersInstance.countEvent('liberdus', 'start_network_windows')
      }
      return setTimeout(networkMaintenance, getNextMaintenanceCycleStart(cycleData))
    }

    // reset the DAO windows if it has been too long
    if (currentTime > network.windows.proposalWindow[0] && currentTime - network.windows.proposalWindow[0] > TOTAL_DAO_DURATION * 3) {
      if (isProcessingMode && luckyNodes.includes(nodeId)) {
        dapp.log('Resetting network windows', luckyNodes, nodeId)
        await utils.startNetworkWindows(nodeAddress, nodeId, dapp)
        nestedCountersInstance.countEvent('liberdus', 'reset_network_windows')
      }
      return setTimeout(networkMaintenance, getNextMaintenanceCycleStart(cycleData))
    }

    const isInProposalWindow = currentTime >= network.windows.proposalWindow[0] && currentTime <= network.windows.proposalWindow[1]
    const isInDevProposalWindow = currentTime >= network.devWindows.devProposalWindow[0] && currentTime <= network.devWindows.devProposalWindow[1]

    const isInGraceWindow = currentTime >= network.windows.graceWindow[0] && currentTime <= network.windows.graceWindow[1]
    const isInDevGraceWindow = currentTime >= network.devWindows.devGraceWindow[0] && currentTime <= network.devWindows.devGraceWindow[1]

    const isInApplyWindow = currentTime >= network.windows.applyWindow[0] && currentTime <= network.windows.applyWindow[1]
    const isInDevApplyWindow = currentTime >= network.devWindows.devApplyWindow[0] && currentTime <= network.devWindows.devApplyWindow[1]
    const skipConsensus = cycleData.active === 1

    dapp.log(
      `Cycle: ${cycleData.counter}, isInProposalWindow: ${isInProposalWindow}, isInDevProposalWindow: ${isInDevProposalWindow}, isInGraceWindow: ${isInGraceWindow}, isInDevGraceWindow: ${isInDevGraceWindow}, isInApplyWindow: ${isInApplyWindow}, isProcessingMode: ${isProcessingMode}`,
    )

    if (isProcessingMode === false || luckyNodes.includes(nodeId) === false) {
      dapp.log(`We are not lucky node for cycle ${cycleData.counter}. We are waiting for next maintenance cycle`)
      return setTimeout(networkMaintenance, getNextMaintenanceCycleStart(cycleData))
    }
    dapp.log(`We are lucky node for cycle ${cycleData.counter}`)

    // from this point, we are lucky node and in processing mode
    const issueAccountId = utils.calculateIssueId(network.issue)
    const issueAccount = await dapp.getLocalOrRemoteAccount(issueAccountId)

    const devIssueAccountId = utils.calculateDevIssueId(network.devIssue)
    const devIssueAccount = await dapp.getLocalOrRemoteAccount(devIssueAccountId)

    dapp.log('latest issueAccount: ', issueAccountId, issueAccount?.data)
    dapp.log('latest devIssueAccount: ', devIssueAccountId, devIssueAccount?.data)

    // ISSUE: create a new issue so that people can submit proposals/votes
    if (isInProposalWindow) {
      if (issueAccount == null) {
        dapp.log(`issueAccount is null, we need to submit a new issue for issue: ${network.issue}`)
        await utils.generateIssue(nodeAddress, nodeId, dapp, skipConsensus)
        issueGenerated = true
        tallyGenerated = false
        applyGenerated = false
      }
    }

    // DEV_ISSUE: create new funding issue so that developers can request funds/votes
    if (isInDevProposalWindow) {
      if (devIssueAccount == null) {
        dapp.log(`devIssueAccount is null, we need to submit a new dev issue for devIssue: ${network.devIssue}`)
        await utils._sleep(3000) // this is to wait a moment for above issue tx to be processed
        await utils.generateDevIssue(nodeAddress, nodeId, dapp, skipConsensus)
        devIssueGenerated = true
        devTallyGenerated = false
        devApplyGenerated = false
      }
    }

    // TALLY: count the votes for the proposals (network params)
    // todo: we may not want to tally as soon as the grace window starts
    if (isInGraceWindow) {
      const issueAccountData = issueAccount?.data as LiberdusTypes.IssueAccount
      const issueWinner = issueAccountData.winnerId
      const tallied = issueAccountData.tallied
      if (!tallied) {
        dapp.log(`Issue is not tallied yet, we need to tally the votes for issue: ${network.issue}`)
        await utils.tallyVotes(nodeAddress, nodeId, dapp, skipConsensus)
        issueGenerated = false
        tallyGenerated = true
        applyGenerated = false
      }
    }

    // DEV_TALLY: count the votes for the dev proposals (developer fund)
    if (isInDevGraceWindow) {
      const devIssueAccountData = devIssueAccount?.data as LiberdusTypes.DevIssueAccount
      const devIssueWinners = devIssueAccountData.winners
      const tallied = devIssueAccountData.tallied
      if (!tallied) {
        dapp.log(`devIssue is not tallied yet, we need to tally the votes for devIssue: ${network.devIssue}`)
        await utils._sleep(3000) // this is to wait a moment for above tally tx to be processed
        await utils.tallyDevVotes(nodeAddress, nodeId, dapp, skipConsensus)
        devIssueGenerated = false
        devTallyGenerated = true
        devApplyGenerated = false
      }
    }

    // PARAMETER tx should initiate apply_parameters tx (i.e. apply the winning network parameters)
    if (isInApplyWindow) {
      const issueAccountData = issueAccount?.data as LiberdusTypes.IssueAccount
      const isIssueActive = issueAccountData.active
      if (isIssueActive) {
        // still active means it has not been applied the parameters
        dapp.log(`issueAccount is still active in applyWindows, we need to apply the parameters for issue: ${network.issue}`)
        await utils.injectParameterTx(nodeAddress, nodeId, dapp, skipConsensus)
        issueGenerated = false
        tallyGenerated = false
        applyGenerated = true
      }
    }

    // DEV_PARAMETER tx should initiate apply_dev_parameters tx (i.e. apply the winning fundings)
    if (isInDevApplyWindow) {
      const devIssueAccountData = devIssueAccount?.data as LiberdusTypes.DevIssueAccount
      const isDevIssueActive = devIssueAccountData.active
      if (isDevIssueActive) {
        // still active means it has not been applied the dev parameters
        dapp.log(`devIssueAccount is still active in devApplyWindows, we need to apply the dev parameters for devIssue: ${network.devIssue}`)
        await utils._sleep(3000) // this is to wait a moment for above parameter tx to be processed
        await utils.injectDevParameters(nodeAddress, nodeId, dapp, skipConsensus)
        devIssueGenerated = false
        devTallyGenerated = false
        devApplyGenerated = true
      }
    }

    if (isProcessingMode) {
      // LOOP THROUGH IN-MEMORY DEVELOPER_FUND
      for (const payment of network.developerFund) {
        // PAY DEVELOPER IF THE network.current TIME IS GREATER THAN THE PAYMENT TIME
        if (currentTime >= payment.timestamp) {
          if (luckyNodes.includes(nodeId)) {
            utils.releaseDeveloperFunds(payment, nodeAddress, nodeId, dapp)
          }
        }
      }
    }

    dapp.log('issueGenerated: ', issueGenerated)
    dapp.log('tallyGenerated: ', tallyGenerated)
    dapp.log('applyGenerated: ', applyGenerated)

    dapp.log('devIssueGenerated: ', devIssueGenerated)
    dapp.log('devTallyGenerated: ', devTallyGenerated)
    dapp.log('devApplyGenerated: ', devApplyGenerated)

    return setTimeout(networkMaintenance, getNextMaintenanceCycleStart(cycleData))
  }

  function getNextMaintenanceCycleStart(currentCycle: ShardusTypes.Cycle): number {
    const cycleInterval = configs.cycleDuration * configs.ONE_SECOND
    const currentCycleStartMs = currentCycle.start * 1000
    let nextCycleStartMs = currentCycleStartMs + cycleInterval
    const now = dapp.shardusGetTime()
    if (nextCycleStartMs <= now) {
      nextCycleStartMs += cycleInterval
    }
    const timeUntilNextCycle = nextCycleStartMs - now
    dapp.log(`Scheduling next network maintenance in ${timeUntilNextCycle} ms. now: ${now}, nextCycleStartMs: ${nextCycleStartMs}`)
    return timeUntilNextCycle
  }

  dapp.on('active', async (): Promise<NodeJS.Timeout> => {
    if (dapp.p2p.isFirstSeed) {
      await utils._sleep(configs.ONE_SECOND * configs.cycleDuration * 2)
    }
    dapp.registerCacheTopic('receipt', LiberdusFlags.cacheMaxCycleAge, LiberdusFlags.cacheMaxItemPerTopic)
    const [currentCycle] = dapp.getLatestCycles()
    return setTimeout(networkMaintenance, getNextMaintenanceCycleStart(currentCycle))
  })
})()
