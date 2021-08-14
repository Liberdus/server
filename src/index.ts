import {shardusFactory, ShardusTypes} from 'shardus-global-server'
import * as crypto from 'shardus-crypto-utils'
import * as configs from './config'
import * as utils from './utils'
import stringify = require('fast-stable-stringify')
import './@types'
import _ from 'lodash'
import dotenv from 'dotenv'
import transactions from './transactions'
import registerAPI from './api'
//import {logFlags} from 'shardus-global-server/build/src/logger'

dotenv.config()
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

// THE ENTIRE APP STATE FOR THIS NODE
let accounts: { [id: string]: Accounts } = {}

const env = process.env
const args = process.argv
let defaultConfig = configs.initConfigFromFile()
let config = configs.overrideDefaultConfig(defaultConfig, env, args)

const dapp = shardusFactory(config)

// let logFlags = {}
// if(dapp.getLogFlags){
//   logFlags = dapp.getLogFlags()
// }
let statsDebugLogs = false


// API
registerAPI(dapp)

dapp.registerExternalGet(
  'accounts',
  async (req, res): Promise<void> => {
    res.json({ accounts })
  },
)

// SDK SETUP FUNCTIONS
dapp.setup({
  async sync(): Promise<void> {
    if (dapp.p2p.isFirstSeed) {
      await utils._sleep(configs.ONE_SECOND * 5)

      const nodeId = dapp.getNodeId()
      const address = dapp.getNode(nodeId).address
      const when = Date.now() + configs.ONE_SECOND * 10
      const existingNetworkAccount = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      if (existingNetworkAccount) {
        dapp.log('NETWORK_ACCOUNT ALREADY EXISTED: ', existingNetworkAccount)
        await utils._sleep(configs.ONE_SECOND * 5)
      } else {
        dapp.setGlobal(
          configs.networkAccount,
          {
            type: 'init_network',
            timestamp: when,
            network: configs.networkAccount,
          },
          when,
          configs.networkAccount,
        )

        dapp.log(`node ${nodeId} GENERATED_A_NEW_NETWORK_ACCOUNT: `)
        await utils._sleep(configs.ONE_SECOND * 10)

        dapp.set({
          type: 'issue',
          network: configs.networkAccount,
          nodeId,
          from: address,
          issue: crypto.hash(`issue-${1}`),
          proposal: crypto.hash(`issue-${1}-proposal-1`),
          timestamp: Date.now(),
        })
        dapp.set({
          type: 'dev_issue',
          network: configs.networkAccount,
          nodeId,
          from: address,
          devIssue: crypto.hash(`dev-issue-${1}`),
          timestamp: Date.now(),
        })
        await utils._sleep(configs.ONE_SECOND * 10)
      }
    } else {
      while (!(await dapp.getLocalOrRemoteAccount(configs.networkAccount))) {
        console.log('waiting..')
        await utils._sleep(1000)
      }
    }
  },
  validateTransaction(tx: any, wrappedStates: { [id: string]: WrappedAccount }): ShardusTypes.IncomingTransactionResult {
    const response: ShardusTypes.IncomingTransactionResult = {
      success: false,
      reason: 'Transaction is not valid.',
      txnTimestamp: tx.timestamp,
    }

    return transactions[tx.type].validate(tx, wrappedStates, response, dapp)
  },
  // THIS NEEDS TO BE FAST, BUT PROVIDES BETTER RESPONSE IF SOMETHING GOES WRONG
  validateTxnFields(tx: any): ShardusTypes.IncomingTransactionResult {
    // Validate tx fields here
    const response: ShardusTypes.IncomingTransactionResult = {
      success: true,
      reason: 'This transaction is valid!',
      txnTimestamp: tx.timestamp,
    }

    if (typeof tx.type !== 'string') {
      response.success = false
      response.reason = 'Tx "type" field must be a string.'
      throw new Error(response.reason)
    }

    if (typeof tx.timestamp !== 'number') {
      response.success = false
      response.reason = 'Tx "timestamp" field must be a number.'
      throw new Error(response.reason)
    }

    return transactions[tx.type].validate_fields(tx, response)
  },
  apply(tx: any, wrappedStates: { [id: string]: WrappedAccount }) {
    const { success, reason } = this.validateTransaction(tx, wrappedStates)

    if (success !== true) {
      throw new Error(`invalid transaction, reason: ${reason}. tx: ${stringify(tx)}`)
    }

    // Create an applyResponse which will be used to tell Shardus that the tx has been applied
    let txId: string
    if (!tx.sign) {
      txId = crypto.hashObj(tx)
    } else {
      txId = crypto.hashObj(tx, true) // compute from tx
    }
    const applyResponse: ShardusTypes.ApplyResponse = dapp.createApplyResponse(txId, tx.timestamp)

    transactions[tx.type].apply(tx, txId, wrappedStates, dapp, applyResponse)

    return applyResponse
  },
  transactionReceiptPass(tx: any, wrappedStates: { [id: string]: WrappedAccount }, applyResponse: ShardusTypes.ApplyResponse) {
    let txId: string
    if (!tx.sign) {
      txId = crypto.hashObj(tx)
    } else {
      txId = crypto.hashObj(tx, true) // compute from tx
    }
    if(transactions[tx.type].transactionReceiptPass) transactions[tx.type].transactionReceiptPass(tx, txId, wrappedStates, dapp, applyResponse)

  },
  getKeyFromTransaction(tx: any): ShardusTypes.TransactionKeys {
    const result: TransactionKeys = {
      sourceKeys: [],
      targetKeys: [],
      allKeys: [],
      timestamp: tx.timestamp,
    }

    return transactions[tx.type].keys(tx, result)
  },
  getStateId(accountAddress: string, mustExist = true): string {
    const account = accounts[accountAddress]
    if ((typeof account === 'undefined' || account === null) && mustExist === true) {
      throw new Error('Could not get stateId for account ' + accountAddress)
    }
    const stateId = account.hash
    return stateId
  },
  getAccountTimestamp(accountAddress: string, mustExist = true): number {
    const account = accounts[accountAddress]
    if ((typeof account === 'undefined' || account === null) && mustExist === true) {
      throw new Error('Could not get getAccountTimestamp for account ' + accountAddress)
    }
    const timestamp = account.timestamp
    return timestamp
  },
  getTimestampAndHashFromAccount(accountData: any): { timestamp: number; hash: string } {
    const account: Accounts = accountData as Accounts
    // if ((typeof account === 'undefined' || account === null)) {
    //   throw new Error(`Could not get getAccountInfo for account ${stringify(accountData)} `)
    // }
    const timestamp = account.timestamp
    const hash = account.hash
    return { timestamp, hash }
  },
  deleteLocalAccountData(): void {
    accounts = {}
  },
  setAccountData(accountRecords: Accounts[]): void {
    for (const account of accountRecords) {
      // possibly need to clone this so others lose their ref
      accounts[account.id] = account
    }
  },
  getRelevantData(accountId: string, tx: any): ShardusTypes.WrappedResponse {
    let account = accounts[accountId]
    let accountCreated = false
    return transactions[tx.type].createRelevantAccount(dapp, account, accountId, tx, accountCreated)
  },
  updateAccountFull(wrappedData, localCache, applyResponse): void {
    const accountId = wrappedData.accountId
    const accountCreated = wrappedData.accountCreated
    const updatedAccount = wrappedData.data
    // Update hash
    const hashBefore = updatedAccount.hash
    updatedAccount.hash = '' // DON'T THINK THIS IS NECESSARY
    const hashAfter = crypto.hashObj(updatedAccount)
    updatedAccount.hash = hashAfter
    // Save updatedAccount to db / persistent storage
    accounts[accountId] = updatedAccount
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
  getAccountDataByRange(accountStart, accountEnd, tsStart, tsEnd, maxRecords): WrappedAccount[] {
    const results: WrappedAccount[] = []
    const start = parseInt(accountStart, 16)
    const end = parseInt(accountEnd, 16)
    // Loop all accounts
    for (const account of Object.values(accounts)) {
      // Skip if not in account id range
      const id = parseInt(account.id, 16)
      if (id < start || id > end) continue
      // Skip if not in timestamp range
      const timestamp = account.timestamp
      if (timestamp < tsStart || timestamp > tsEnd) continue
      // Add to results
      const wrapped = {
        accountId: account.id,
        stateId: account.hash,
        data: account,
        timestamp: account.timestamp,
      }
      results.push(wrapped)

      // oof, much slower to do this but making it up to standard with how a DB needs to sort first.
      // Return results early if maxRecords reached
      // if (results.length >= maxRecords) {
      //   results.sort((a, b) => a.timestamp - b.timestamp)
      //   return results
      // }
    }
    results.sort((a, b) => a.timestamp - b.timestamp)

    let finalResults = results.slice(0, maxRecords)

    return finalResults
  },
  getAccountData(accountStart, accountEnd, maxRecords): WrappedAccount[] {
    const results: WrappedAccount[] = []
    const start = parseInt(accountStart, 16)
    const end = parseInt(accountEnd, 16)
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
  getAccountDataByList(addressList: string[]): WrappedAccount[] {
    const results: WrappedAccount[] = []
    for (const address of addressList) {
      const account = accounts[address]
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
  calculateAccountHash(account): string {
    account.hash = '' // Not sure this is really necessary
    account.hash = crypto.hashObj(account)
    return account.hash
  },
  resetAccountData(accountBackupCopies: any[]): void {
    for (const recordData of accountBackupCopies) {
      const accountData: Accounts = recordData.data
      accounts[accountData.id] = { ...accountData }
    }
  },
  deleteAccountData(addressList: string[]): void {
    stringify('DELETE_ACCOUNT_DATA', stringify(addressList))
    for (const address of addressList) {
      delete accounts[address]
    }
  },
  getAccountDebugValue(wrappedAccount: WrappedAccount): string {
    return `${stringify(wrappedAccount)}`
  },
  canDebugDropTx(tx: any) {
    if(tx.type === 'create'){
      return true
    }
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

    let accType = utils.getAccountType(accountData)
    if (blob.accByType[accType] == null) {
      blob.accByType[accType] = 0
    }
    blob.accByType[accType]++
    blob.totalAccounts++

    if (accType == 'UserAccount') {
      if (accountData.data.balance != null) {
        let blobBalanceBefore = blob.totalBalance
        let accountBalance = accountData.data.balance
        let totalBalance = blobBalanceBefore + accountBalance

        if(statsDebugLogs) dapp.log(`stats balance init ${blobBalanceBefore}+${accountBalance}=${totalBalance}  ${stringify(accountData?.id)}`)

        if (totalBalance != null) {
          blob.totalBalance = totalBalance
        } else {
          if(statsDebugLogs) dapp.log(`error: null balance attempt. dataSummaryInit UserAccount 1 ${accountData?.data.balance} ${stringify(accountData?.id)}`)
        }
      } else {
        if(statsDebugLogs) dapp.log(`error: null balance attempt. dataSummaryInit UserAccount 2 ${accountData?.data.balance} ${stringify(accountData?.id)}`)
      }
    }
    if (accType == 'NodeAccount') {
      if (accountData.balance != null) {
        let totalBalance = blob.totalBalance + accountData.balance
        if (totalBalance != null) {
          blob.totalBalance = totalBalance
        } else {
          if(statsDebugLogs) dapp.log(`error: null balance attempt. dataSummaryInit NodeAccount 1 ${accountData?.balance} ${stringify(accountData?.id)}`)
        }
      } else {
        if(statsDebugLogs) dapp.log(`error: null balance attempt. dataSummaryInit NodeAccount 2 ${accountData?.balance} ${stringify(accountData?.id)}`)
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
    let accType = utils.getAccountType(accountDataAfter)

    if (accType == 'UserAccount') {
      let blobBalanceBefore = blob.totalBalance
      let accountBalanceBefore = accountDataBefore?.data?.balance
      let accountBalanceAfter = accountDataAfter?.data?.balance
      let balanceChange = accountDataAfter?.data?.balance - accountDataBefore?.data?.balance

      let totalBalance = blob.totalBalance + balanceChange
      if(statsDebugLogs) dapp.log(
        `stats balance update ${blobBalanceBefore}+${balanceChange}(${accountBalanceAfter}-${accountBalanceBefore})=${totalBalance}  ${stringify(
          accountDataAfter?.id,
        )}`,
      )

      if (balanceChange != null) {
        totalBalance = blob.totalBalance + balanceChange
        if (totalBalance != null) {
          blob.totalBalance = totalBalance
        } else {
          if(statsDebugLogs) dapp.log(
            `error: null balance attempt. dataSummaryUpdate UserAccount 1 ${accountDataAfter?.data?.balance} ${stringify(accountDataAfter?.id)} ${
              accountDataBefore?.data?.balance
            } ${stringify(accountDataBefore?.id)}`,
          )
        }
      } else {
        if(statsDebugLogs) dapp.log(
          `error: null balance attempt. dataSummaryUpdate UserAccount 2 ${accountDataAfter?.data?.balance} ${stringify(accountDataAfter?.id)} ${
            accountDataBefore?.data?.balance
          } ${stringify(accountDataBefore?.id)}`,
        )
      }
    }
    if (accType == 'NodeAccount') {
      let balanceChange = accountDataAfter?.balance - accountDataBefore?.balance
      if (balanceChange != null) {
        let totalBalance = blob.totalBalance + balanceChange
        if (totalBalance != null) {
          blob.totalBalance = totalBalance
        } else {
          if(statsDebugLogs) dapp.log(
            `error: null balance attempt. dataSummaryUpdate NodeAccount 1 ${accountDataAfter?.balance} ${stringify(accountDataAfter?.id)} ${
              accountDataBefore?.balance
            } ${stringify(accountDataBefore?.id)}`,
          )
        }
      } else {
        if(statsDebugLogs) dapp.log(
          `error: null balance attempt. dataSummaryUpdate NodeAccount 2 ${accountDataAfter?.balance} ${stringify(accountDataAfter?.id)} ${
            accountDataBefore?.balance
          } ${stringify(accountDataBefore?.id)}`,
        )
      }
    }
  },
})

dapp.registerExceptionHandler()

// CODE THAT GETS EXECUTED WHEN NODES START
;(async (): Promise<void> => {
  const cycleInterval = configs.cycleDuration * configs.ONE_SECOND

  let network: NetworkAccount

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
  let expected = Date.now() + cycleInterval
  let drift: number

  await dapp.start()

  // THIS CODE IS CALLED ON EVERY NODE ON EVERY CYCLE
  async function networkMaintenance(): Promise<NodeJS.Timeout> {
    dapp.log('New maintainence cycle has started')
    drift = Date.now() - expected
    currentTime = Date.now()

    try {
      const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      network = account.data
      ;[cycleData] = dapp.getLatestCycles()
      luckyNodes = dapp.getClosestNodes(cycleData.previous, 3)
      nodeId = dapp.getNodeId()
      node = dapp.getNode(nodeId)
      nodeAddress = node.address
    } catch (err) {
      dapp.log('ERR: ', err)
      console.log('ERR: ', err)
      return setTimeout(networkMaintenance, 100)
    }

    dapp.log('payAddress: ', process.env.PAY_ADDRESS)
    dapp.log('cycleData: ', cycleData)
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

    // THIS IS FOR NODE_REWARD
    if (currentTime - lastReward > network.current.nodeRewardInterval) {
      utils.nodeReward(nodeAddress, nodeId, dapp)
      lastReward = currentTime
    }

    // ISSUE
    if (currentTime >= network.windows.proposalWindow[0] && currentTime <= network.windows.proposalWindow[1]) {
      if (!issueGenerated && network.issue > 1) {
        if (luckyNodes.includes(nodeId)) {
          await utils.generateIssue(nodeAddress, nodeId, dapp)
        }
        issueGenerated = true
        tallyGenerated = false
        applyGenerated = false
      }
    }

    // DEV_ISSUE
    if (currentTime >= network.devWindows.devProposalWindow[0] && currentTime <= network.devWindows.devProposalWindow[1]) {
      if (!devIssueGenerated && network.devIssue > 1) {
        if (luckyNodes.includes(nodeId)) {
          await utils.generateDevIssue(nodeAddress, nodeId, dapp)
        }
        devIssueGenerated = true
        devTallyGenerated = false
        devApplyGenerated = false
      }
    }

    // TALLY
    if (currentTime >= network.windows.graceWindow[0] && currentTime <= network.windows.graceWindow[1]) {
      if (!tallyGenerated) {
        if (luckyNodes.includes(nodeId)) {
          await utils.tallyVotes(nodeAddress, nodeId, dapp)
        }
        issueGenerated = false
        tallyGenerated = true
        applyGenerated = false
      }
    }

    // APPLY
    if (currentTime >= network.windows.applyWindow[0] && currentTime <= network.windows.applyWindow[1]) {
      if (!applyGenerated) {
        if (luckyNodes.includes(nodeId)) {
          await utils.applyParameters(nodeAddress, nodeId, dapp)
        }
        issueGenerated = false
        tallyGenerated = false
        applyGenerated = true
      }
    }

    // DEV_TALLY
    if (currentTime >= network.devWindows.devGraceWindow[0] && currentTime <= network.devWindows.devGraceWindow[1]) {
      if (!devTallyGenerated) {
        if (luckyNodes.includes(nodeId)) {
          await utils.tallyDevVotes(nodeAddress, nodeId, dapp)
        }
        devIssueGenerated = false
        devTallyGenerated = true
        devApplyGenerated = false
      }
    }

    // DEV_APPLY
    if (currentTime >= network.devWindows.devApplyWindow[0] && currentTime <= network.devWindows.devApplyWindow[1]) {
      if (!devApplyGenerated) {
        if (luckyNodes.includes(nodeId)) {
          await utils.applyDevParameters(nodeAddress, nodeId, dapp)
        }
        devIssueGenerated = false
        devTallyGenerated = false
        devApplyGenerated = true
      }
    }

    // LOOP THROUGH IN-MEMORY DEVELOPER_FUND
    for (const payment of network.developerFund) {
      // PAY DEVELOPER IF THE network.current TIME IS GREATER THAN THE PAYMENT TIME
      if (currentTime >= payment.timestamp) {
        if (luckyNodes.includes(nodeId)) {
          utils.releaseDeveloperFunds(payment, nodeAddress, nodeId, dapp)
        }
      }
    }

    dapp.log('issueGenerated: ', issueGenerated)
    dapp.log('tallyGenerated: ', tallyGenerated)
    dapp.log('applyGenerated: ', applyGenerated)

    dapp.log('devIssueGenerated: ', devIssueGenerated)
    dapp.log('devTallyGenerated: ', devTallyGenerated)
    dapp.log('devApplyGenerated: ', devApplyGenerated)

    dapp.log('Maintainence cycle has ended')

    expected += cycleInterval
    return setTimeout(networkMaintenance, Math.max(0, cycleInterval - drift))
  }

  dapp.on(
    'active',
    async (): Promise<NodeJS.Timeout> => {
      if (dapp.p2p.isFirstSeed) {
        await utils._sleep(configs.ONE_SECOND * configs.cycleDuration * 2)
      }
      lastReward = Date.now()
      return setTimeout(networkMaintenance, cycleInterval)
    },
  )
})()
