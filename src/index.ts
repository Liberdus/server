import fs from 'fs'
import path from 'path'
import Prop from 'dot-prop'
import heapdump from 'heapdump'
import shardus from 'shardus-global-server'
import * as crypto from 'shardus-crypto-utils'
import * as configs from './config'
import Shardus = require('shardus-global-server/src/shardus/shardus-types')
import stringify = require('fast-stable-stringify')
import './@types'
import _ from 'lodash'
import dotenv from 'dotenv'
import transactions from './transactions'
import create from './accounts'

dotenv.config()
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

// THE ENTIRE APP STATE FOR THIS NODE
let accounts: { [id: string]: Accounts } = {}

let config: any = {}

if (process.env.BASE_DIR) {
  if (fs.existsSync(path.join(process.env.BASE_DIR, 'config.json'))) {
    config = JSON.parse(fs.readFileSync(path.join(process.env.BASE_DIR, 'config.json')).toString())
  }
  Prop.set(config, 'server.baseDir', process.env.BASE_DIR)
}

if (process.env.APP_IP) {
  Prop.set(config, 'server.ip', {
    externalIp: process.env.APP_IP,
    internalIp: process.env.APP_IP,
  })
}

// CONFIGURATION PARAMETERS PASSED INTO SHARDUS
Prop.set(config, 'server.p2p', {
  cycleDuration: configs.cycleDuration,
  existingArchivers: config.server.p2p.existingArchivers ||
    JSON.parse(process.env.APP_SEEDLIST || 'false') || [
      {
        ip: '127.0.0.1',
        port: 4000,
        publicKey: '758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3',
      },
    ],
  minNodesToAllowTxs: 1,
  minNodes: 50,
  maxNodes: 50,
  maxJoinedPerCycle: 3,
  maxSyncingPerCycle: 5,
  maxRotatedPerCycle: 1,
})
Prop.set(config, 'server.loadDetection', {
  queueLimit: 1000,
  desiredTxTime: 15,
  highThreshold: 0.8,
  lowThreshold: 0.2,
})
Prop.set(config, 'server.reporting', {
  recipient: config.server.reporting.recipient || `http://${process.env.APP_MONITOR || '0.0.0.0'}:3000/api`,
  interval: 1,
})
Prop.set(config, 'server.rateLimiting', {
  limitRate: false,
  loadLimit: 0.5,
})
Prop.set(config, 'server.sharding', {
  nodesPerConsensusGroup: 5,
})
Prop.set(config, 'logs', {
  dir: './logs',
  files: { main: '', fatal: '', net: '', app: '' },
  options: {
    appenders: {
      app: {
        type: 'file',
        maxLogSize: 100000000,
        backups: 10,
      },
      errorFile: {
        type: 'file',
        maxLogSize: 100000000,
        backups: 10,
      },
      errors: {
        type: 'logLevelFilter',
        level: 'ERROR',
        appender: 'errorFile',
      },
      main: {
        type: 'file',
        maxLogSize: 1000000000,
        backups: 10,
      },
      fatal: {
        type: 'file',
        maxLogSize: 100000000,
        backups: 10,
      },
      net: {
        type: 'file',
        maxLogSize: 100000000,
        backups: 10,
      },
      playback: {
        type: 'file',
        maxLogSize: 100000000,
        backups: 10,
      },
      shardDump: {
        type: 'file',
        maxLogSize: 100000000,
        backups: 10,
      },
      statsDump: {
        type: 'file',
        maxLogSize: 100000000,
        backups: 10,
      },
    },
    categories: {
      default: { appenders: ['out'], level: 'fatal' },
      app: { appenders: ['app', 'errors'], level: 'trace' },
      main: { appenders: ['main', 'errors'], level: 'trace' },
      fatal: { appenders: ['fatal'], level: 'fatal' },
      net: { appenders: ['net'], level: 'trace' },
      playback: { appenders: ['playback'], level: 'trace' },
      shardDump: { appenders: ['shardDump'], level: 'trace' },
      statsDump: { appenders: ['statsDump'], level: 'trace' },
    },
  },
})

//account type constants. not sure if best practice, open to suggestions.
const UserAccount = 'UserAccount'
const NodeAccount = 'NodeAccount'
const ChatAccount = 'ChatAccount'
const AliasAccount = 'AliasAccount'
const DevIssueAccount = 'DevIssueAccount'
const IssueAccount = 'IssueAccount'
const NetworkAccount = 'NetworkAccount'
const ProposalAccount = 'ProposalAccount'
const DevProposalAccount = 'DevProposalAccount'
const UndeterminedAccountType = 'undetermined'

const dapp = shardus(config)

// API
dapp.registerExternalPost(
  'inject',
  async (req, res): Promise<void> => {
    try {
      const result = dapp.put(req.body)
      res.json({ result })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'network/parameters',
  async (req, res): Promise<void> => {
    try {
      const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      const network: NetworkAccount = account.data
      res.json({
        parameters: {
          current: network.current,
          next: network.next,
          developerFund: network.developerFund,
          nextDeveloperFund: network.nextDeveloperFund,
          windows: network.windows,
          devWindows: network.devWindows,
          nextWindows: network.nextWindows,
          nextDevWindows: network.nextDevWindows,
          issue: network.issue,
          devIssue: network.devIssue,
        },
      })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'network/parameters/next',
  async (req, res): Promise<void> => {
    try {
      const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      res.json({ parameters: network.data.next })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'network/windows/all',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      res.json({
        windows: network.data.windows,
        devWindows: network.data.devWindows,
      })
    } catch (error) {
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'network/windows',
  async (req, res): Promise<void> => {
    try {
      const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      res.json({ windows: network.data.windows })
    } catch (error) {
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'network/windows/dev',
  async (req, res): Promise<void> => {
    try {
      const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      res.json({ devWindows: network.data.devWindows })
    } catch (error) {
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'issues',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      const issues = []
      for (let i = 1; i <= network.data.issue; i++) {
        const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${i}`))
        if (issue && issue.data) {
          issues.push(issue.data)
        }
      }
      res.json({ issues })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'issues/latest',
  async (req, res): Promise<void> => {
    try {
      const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${network.data.issue}`))
      res.json({ issue: issue && issue.data })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'issues/count',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      res.json({ count: network.data.issue })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'issues/dev',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      const devIssues = []
      for (let i = 1; i <= network.data.devIssue; i++) {
        const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${i}`))
        if (devIssue && devIssue.data) {
          devIssues.push(devIssue.data)
        }
      }
      res.json({ devIssues })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'issues/dev/latest',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${network.data.devIssue}`))
      res.json({ devIssue: devIssue && devIssue.data })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'issues/dev/count',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      res.json({ count: network.data.devIssue })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'proposals',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      const proposals = []
      for (let i = 1; i <= network.data.issue; i++) {
        const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${i}`))
        const proposalCount = issue && issue.data.proposalCount
        for (let j = 1; j <= proposalCount; j++) {
          const proposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${i}-proposal-${j}`))
          if (proposal && proposal.data) {
            proposals.push(proposal.data)
          }
        }
      }
      res.json({ proposals })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'proposals/latest',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${network.data.issue}`))
      const proposalCount = issue && issue.data.proposalCount
      const proposals = []
      for (let i = 1; i <= proposalCount; i++) {
        const proposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${network.data.issue}-proposal-${i}`))
        if (proposal && proposal.data) {
          proposals.push(proposal.data)
        }
      }
      res.json({ proposals })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'proposals/count',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${network.data.issue}`))
      res.json({ count: issue && issue.data.proposalCount })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'proposals/dev',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      const devProposals = []
      for (let i = 1; i <= network.data.devIssue; i++) {
        const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${i}`))
        const devProposalCount = devIssue && devIssue.data.devProposalCount
        for (let j = 1; j <= devProposalCount; j++) {
          const devProposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${i}-dev-proposal-${j}`))
          if (devProposal && devProposal.data) {
            devProposals.push(devProposal.data)
          }
        }
      }
      res.json({ devProposals })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'proposals/dev/latest',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${network.data.devIssue}`))
      const devProposalCount = issue && issue.data.devProposalCount
      const devProposals = []
      for (let i = 1; i <= devProposalCount; i++) {
        const devProposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${network.data.devIssue}-dev-proposal-${i}`))
        if (devProposal && devProposal.data) {
          devProposals.push(devProposal.data)
        }
      }
      res.json({ devProposals })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'proposals/dev/count',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    try {
      const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${network.data.devIssue}`))
      res.json({ count: devIssue && devIssue.data.devProposalCount })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'account/:id',
  async (req, res): Promise<void> => {
    try {
      const id = req.params['id']
      const account = await dapp.getLocalOrRemoteAccount(id)
      res.json({ account: account && account.data })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'account/:id/alias',
  async (req, res): Promise<void> => {
    try {
      const id = req.params['id']
      const account = await dapp.getLocalOrRemoteAccount(id)
      res.json({ handle: account && account.data.alias })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'account/:id/transactions',
  async (req, res): Promise<void> => {
    try {
      const id = req.params['id']
      const account = await dapp.getLocalOrRemoteAccount(id)
      res.json({ transactions: account && account.data.data.transactions })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'account/:id/balance',
  async (req, res): Promise<void> => {
    try {
      const id = req.params['id']
      const account = await dapp.getLocalOrRemoteAccount(id)
      if (account) {
        res.json({ balance: account && account.data.data.balance })
      } else {
        res.json({ error: 'No account with the given id' })
      }
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'account/:id/toll',
  async (req, res): Promise<void> => {
    try {
      const id = req.params['id']
      const account = await dapp.getLocalOrRemoteAccount(id)
      if (account) {
        if (account.data.data.toll === null) {
          const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
          res.json({ toll: network.data.current.defaultToll })
        } else {
          res.json({ toll: account.data.data.toll })
        }
      } else {
        res.json({ error: 'No account with the given id' })
      }
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'address/:name',
  async (req, res): Promise<void> => {
    try {
      const name = req.params['name']
      const account = await dapp.getLocalOrRemoteAccount(name)
      if (account && account.data) {
        res.json({ address: account.data.address })
      } else {
        res.json({ error: 'No account exists for the given handle' })
      }
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'account/:id/:friendId/toll',
  async (req, res): Promise<void> => {
    const id = req.params['id']
    const friendId = req.params['friendId']
    if (!id) {
      res.json({
        error: 'No provided id in the route: account/:id/:friendId/toll',
      })
    }
    if (!friendId) {
      res.json({
        error: 'No provided friendId in the route: account/:id/:friendId/toll',
      })
    }
    try {
      const account = await dapp.getLocalOrRemoteAccount(id)
      if (account) {
        if (account.data.data.friends[friendId]) {
          res.json({ toll: 0 })
        } else {
          if (account.data.data.toll === null) {
            const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
            res.json({ toll: network.data.current.defaultToll })
          } else {
            res.json({ toll: account.data.data.toll })
          }
        }
      } else {
        res.json({ error: 'No account with the given id' })
      }
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'account/:id/friends',
  async (req, res): Promise<void> => {
    try {
      const id = req.params['id']
      const account = await dapp.getLocalOrRemoteAccount(id)
      if (account) {
        res.json({ friends: account.data.data.friends })
      } else {
        res.json({ error: 'No account for given id' })
      }
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'account/:id/recentMessages',
  async (req, res): Promise<void> => {
    try {
      const id = req.params['id']
      const messages: object[] = []
      const account = await dapp.getLocalOrRemoteAccount(id)
      if (account) {
        Object.values(account.data.data.chats).forEach((chat: any) => {
          messages.push(...chat.messages)
        })
        res.json({ messages: messages })
      } else {
        res.json({ error: 'No account for given id' })
      }
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'accounts',
  async (req, res): Promise<void> => {
    res.json({ accounts })
  },
)

dapp.registerExternalGet(
  'messages/:chatId',
  async (req, res): Promise<void> => {
    try {
      const { chatId } = req.params
      const chat = await dapp.getLocalOrRemoteAccount(chatId)
      if (!chat) {
        res.json({ error: "Chat doesn't exist" })
        return
      }
      if (!chat.data.messages) {
        res.json({ error: 'no chat history for this request' })
      } else {
        res.json({ messages: chat.data.messages })
      }
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet('debug/dump', (req, res): void => {
  const D = new Date()
  const dateString = D.getDate() + '_' + (D.getMonth() + 1) + '_' + D.getFullYear() + '_' + D.getHours() + '_' + D.getMinutes()
  // 16-5-2015 9:50
  heapdump.writeSnapshot(`${config.server.baseDir}/logs/ ` + dateString + '.heapsnapshot', (error, filename) => {
    if (error) {
      console.log(error)
      res.json({ error })
    } else {
      console.log('dump written to', filename)
      res.json({ success: 'Dump was written to ' + filename })
    }
  })
})

dapp.registerExternalPost('debug/exit', (req: { body: { code: number } }) => {
  try {
    process.exit(req.body.code)
  } catch (err) {
    console.log(err)
  }
})

// HELPER METHOD TO WAIT
async function _sleep(ms = 0): Promise<NodeJS.Timeout> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function maintenanceAmount(timestamp: number, account: UserAccount, network: NetworkAccount): number {
  let amount: number
  if (timestamp - account.lastMaintenance < network.current.maintenanceInterval) {
    amount = 0
  } else {
    amount =
      account.data.balance * (1 - Math.pow(1 - network.current.maintenanceFee, (timestamp - account.lastMaintenance) / network.current.maintenanceInterval))
    account.lastMaintenance = timestamp
  }
  if (typeof amount === 'number') return amount
  else return 0
}

// SDK SETUP FUNCTIONS
dapp.setup({
  async sync(): Promise<void> {
    if (dapp.p2p.isFirstSeed) {
      await _sleep(configs.ONE_SECOND * 5)

      const nodeId = dapp.getNodeId()
      const address = dapp.getNode(nodeId).address
      console.log('GET_NODE', dapp.getNode(nodeId))
      const when = Date.now() + configs.ONE_SECOND * 10
      const existingNetworkAccount = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      if (existingNetworkAccount) {
        dapp.log('NETWORK_ACCOUNT ALREADY EXISTED: ', existingNetworkAccount)
        await _sleep(configs.ONE_SECOND * 5)
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

        dapp.log('GENERATED_NEW_NETWORK: ', nodeId)
        await _sleep(configs.ONE_SECOND * 5)

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
        await _sleep(configs.ONE_SECOND * 10)
      }
    } else {
      while (!(await dapp.getLocalOrRemoteAccount(configs.networkAccount))) {
        console.log('waiting..')
        await _sleep(1000)
      }
    }
  },
  validateTransaction(tx: any, wrappedStates: { [id: string]: WrappedAccount }): Shardus.IncomingTransactionResult {
    const response: Shardus.IncomingTransactionResult = {
      success: false,
      reason: 'Transaction is not valid.',
      txnTimestamp: tx.timestamp,
    }

    return transactions[tx.type].validate(tx, wrappedStates, response, dapp)
  },
  // THIS NEEDS TO BE FAST, BUT PROVIDES BETTER RESPONSE IF SOMETHING GOES WRONG
  validateTxnFields(tx: any): Shardus.IncomingTransactionResult {
    // Validate tx fields here
    const response: Shardus.IncomingTransactionResult = {
      success: true,
      reason: 'This transaction is valid!',
      txnTimestamp: tx.timestamp,
    }

    if (typeof tx.type !== 'string') {
      response.success = false
      response.reason = '"type" must be a string.'
      throw new Error(response.reason)
    }

    if (typeof tx.timestamp !== 'number') {
      response.success = false
      response.reason = '"timestamp" must be a number.'
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
    const applyResponse: Shardus.ApplyResponse = dapp.createApplyResponse(txId, tx.timestamp)

    transactions[tx.type].apply(tx, txId, wrappedStates, dapp)

    return applyResponse
  },
  getKeyFromTransaction(tx: any): Shardus.TransactionKeys {
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
  getRelevantData(accountId: string, tx: any): Shardus.WrappedResponse {
    let account: any = accounts[accountId]
    let accountCreated = false
    // Create the account if it doesn't exist
    if (typeof account === 'undefined' || account === null) {
      if (accountId === configs.networkAccount) {
        account = create.networkAccount(accountId, tx.timestamp)
        //accounts[accountId] = account
        accountCreated = true
      } else if (tx.type === 'issue') {
        if (accountId === tx.issue) {
          account = create.issueAccount(accountId)
          //accounts[accountId] = account
          accountCreated = true
        } else if (accountId === tx.proposal) {
          account = create.proposalAccount(accountId, tx.parameters)
          //accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'dev_issue') {
        if (accountId === tx.devIssue) {
          account = create.devIssueAccount(accountId)
          //accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'dev_proposal') {
        if (accountId === tx.devProposal) {
          account = create.devProposalAccount(accountId)
          //accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'proposal') {
        if (accountId === tx.proposal) {
          account = create.proposalAccount(accountId, tx.parameters)
          //accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'register') {
        if (accountId === tx.aliasHash) {
          account = create.aliasAccount(accountId)
          //accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'message') {
        if (accountId === tx.chatId) {
          account = create.chatAccount(accountId)
          //accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'node_reward') {
        if (accountId === tx.from && accountId === tx.to) {
          account = create.nodeAccount(accountId)
          //accounts[accountId] = account
          accountCreated = true
        } else {
          if (accountId === tx.to) {
            account = create.userAccount(accountId, tx.timestamp)
            //accounts[accountId] = account
            accountCreated = true
          } else {
            account = create.nodeAccount(accountId)
            //accounts[accountId] = account
            accountCreated = true
          }
        }
      }
    }
    if (typeof account === 'undefined' || account === null) {
      if (tx.nodeId) {
        account = create.nodeAccount(accountId)
        //accounts[accountId] = account
        accountCreated = true
      } else {
        account = create.userAccount(accountId, tx.timestamp)
        //accounts[accountId] = account
        accountCreated = true
      }
    }
    // Wrap it for Shardus
    const wrapped = dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
    return wrapped
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
      // Return results early if maxRecords reached
      if (results.length >= maxRecords) {
        results.sort((a, b) => a.timestamp - b.timestamp)
        return results
      }
    }
    results.sort((a, b) => a.timestamp - b.timestamp)
    return results
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

    let accType = getAccountType(accountData)
    if (blob.accByType[accType] == null) {
      blob.accByType[accType] = 0
    }
    blob.accByType[accType]++
    blob.totalAccounts++

    if (accType == UserAccount) {
      if (accountData.data.balance != null) {
        let blobBalanceBefore = blob.totalBalance
        let accountBalance = accountData.data.balance
        let totalBalance = blobBalanceBefore + accountBalance

        dapp.log(`stats balance init ${blobBalanceBefore}+${accountBalance}=${totalBalance}  ${stringify(accountData?.id)}`)

        if (totalBalance != null) {
          blob.totalBalance = totalBalance
        } else {
          dapp.log(`error: null balance attempt. dataSummaryInit UserAccount 1 ${accountData?.data.balance} ${stringify(accountData?.id)}`)
        }
      } else {
        dapp.log(`error: null balance attempt. dataSummaryInit UserAccount 2 ${accountData?.data.balance} ${stringify(accountData?.id)}`)
      }
    }
    if (accType == NodeAccount) {
      if (accountData.balance != null) {
        let totalBalance = blob.totalBalance + accountData.balance
        if (totalBalance != null) {
          blob.totalBalance = totalBalance
        } else {
          dapp.log(`error: null balance attempt. dataSummaryInit NodeAccount 1 ${accountData?.balance} ${stringify(accountData?.id)}`)
        }
      } else {
        dapp.log(`error: null balance attempt. dataSummaryInit NodeAccount 2 ${accountData?.balance} ${stringify(accountData?.id)}`)
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
    let accType = getAccountType(accountDataAfter)

    if (accType == UserAccount) {
      let blobBalanceBefore = blob.totalBalance
      let accountBalanceBefore = accountDataBefore?.data?.balance
      let accountBalanceAfter = accountDataAfter?.data?.balance
      let balanceChange = accountDataAfter?.data?.balance - accountDataBefore?.data?.balance

      let totalBalance = blob.totalBalance + balanceChange
      dapp.log(
        `stats balance update ${blobBalanceBefore}+${balanceChange}(${accountBalanceAfter}-${accountBalanceBefore})=${totalBalance}  ${stringify(
          accountDataAfter?.id,
        )}`,
      )

      if (balanceChange != null) {
        totalBalance = blob.totalBalance + balanceChange
        if (totalBalance != null) {
          blob.totalBalance = totalBalance
        } else {
          dapp.log(
            `error: null balance attempt. dataSummaryUpdate UserAccount 1 ${accountDataAfter?.data?.balance} ${stringify(accountDataAfter?.id)} ${
              accountDataBefore?.data?.balance
            } ${stringify(accountDataBefore?.id)}`,
          )
        }
      } else {
        dapp.log(
          `error: null balance attempt. dataSummaryUpdate UserAccount 2 ${accountDataAfter?.data?.balance} ${stringify(accountDataAfter?.id)} ${
            accountDataBefore?.data?.balance
          } ${stringify(accountDataBefore?.id)}`,
        )
      }
    }
    if (accType == NodeAccount) {
      let balanceChange = accountDataAfter?.balance - accountDataBefore?.balance
      if (balanceChange != null) {
        let totalBalance = blob.totalBalance + balanceChange
        if (totalBalance != null) {
          blob.totalBalance = totalBalance
        } else {
          dapp.log(
            `error: null balance attempt. dataSummaryUpdate NodeAccount 1 ${accountDataAfter?.balance} ${stringify(accountDataAfter?.id)} ${
              accountDataBefore?.balance
            } ${stringify(accountDataBefore?.id)}`,
          )
        }
      } else {
        dapp.log(
          `error: null balance attempt. dataSummaryUpdate NodeAccount 2 ${accountDataAfter?.balance} ${stringify(accountDataAfter?.id)} ${
            accountDataBefore?.balance
          } ${stringify(accountDataBefore?.id)}`,
        )
      }
    }
  },
})

function getAccountType(data) {
  if (data == null) {
    return UndeterminedAccountType
  }

  if (data.type != null) {
    return data.type
  }

  //make sure this works on old accounts with no type
  if (data.alias !== undefined) {
    return UserAccount
  }
  if (data.nodeRewardTime !== undefined) {
    return NodeAccount
  }
  if (data.messages !== undefined) {
    return ChatAccount
  }
  if (data.inbox !== undefined) {
    return AliasAccount
  }
  if (data.devProposals !== undefined) {
    return DevIssueAccount
  }
  if (data.proposals !== undefined) {
    return IssueAccount
  }
  if (data.devWindows !== undefined) {
    return NetworkAccount
  }
  if (data.totalVotes !== undefined) {
    if (data.power !== undefined) {
      return ProposalAccount
    }
    if (data.payAddress !== undefined) {
      return DevProposalAccount
    }
  }
  return UndeterminedAccountType
}

dapp.registerExceptionHandler()

// NODE_REWARD TRANSACTION FUNCTION
function nodeReward(address: string, nodeId: string): void {
  const tx = {
    type: 'node_reward',
    network: configs.networkAccount,
    nodeId: nodeId,
    from: address,
    to: process.env.PAY_ADDRESS || address,
    timestamp: Date.now(),
  }
  dapp.put(tx)
  console.log('TX_DATA: ', tx)
  dapp.log('GENERATED_NODE_REWARD: ', nodeId)
}

// ISSUE TRANSACTION FUNCTION
async function generateIssue(address: string, nodeId: string): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network: NetworkAccount = account.data
  const tx = {
    type: 'issue',
    network: configs.networkAccount,
    nodeId,
    from: address,
    issue: crypto.hash(`issue-${network.issue}`),
    proposal: crypto.hash(`issue-${network.issue}-proposal-1`),
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_ISSUE: ', nodeId)
}

// DEV_ISSUE TRANSACTION FUNCTION
async function generateDevIssue(address: string, nodeId: string): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network: NetworkAccount = account.data
  const tx = {
    type: 'dev_issue',
    network: configs.networkAccount,
    nodeId,
    from: address,
    devIssue: crypto.hash(`dev-issue-${network.devIssue}`),
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_DEV_ISSUE: ', nodeId)
}

// TALLY TRANSACTION FUNCTION
async function tallyVotes(address: string, nodeId: string): Promise<void> {
  console.log(`GOT TO TALLY_VOTES FN ${address} ${nodeId}`)
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const account = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${network.data.issue}`))
    if (!account) {
      await _sleep(500)
      return tallyVotes(address, nodeId)
    }
    const issue: IssueAccount = account.data
    const tx = {
      type: 'tally',
      nodeId,
      from: address,
      network: configs.networkAccount,
      issue: issue.id,
      proposals: issue.proposals,
      timestamp: Date.now(),
    }
    dapp.put(tx)
    dapp.log('GENERATED_TALLY: ', nodeId)
  } catch (err) {
    dapp.log('ERR: ', err)
    await _sleep(1000)
    return tallyVotes(address, nodeId)
  }
}

// DEV_TALLY TRANSACTION FUNCTION
async function tallyDevVotes(address: string, nodeId: string): Promise<void> {
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const account = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${network.data.devIssue}`))
    if (!account) {
      await _sleep(500)
      return tallyDevVotes(address, nodeId)
    }
    const devIssue: DevIssueAccount = account.data
    const tx = {
      type: 'dev_tally',
      nodeId,
      from: address,
      network: configs.networkAccount,
      devIssue: devIssue.id,
      devProposals: devIssue.devProposals,
      timestamp: Date.now(),
    }
    dapp.put(tx)
    dapp.log('GENERATED_DEV_TALLY: ', nodeId)
  } catch (err) {
    dapp.log('ERR: ', err)
    await _sleep(1000)
    return tallyDevVotes(address, nodeId)
  }
}

// APPLY_PARAMETERS TRANSACTION FUNCTION
async function applyParameters(address: string, nodeId: string): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network: NetworkAccount = account.data
  const tx = {
    type: 'parameters',
    nodeId,
    from: address,
    network: configs.networkAccount,
    issue: crypto.hash(`issue-${network.issue}`),
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_APPLY: ', nodeId)
}

// APPLY_DEV_PARAMETERS TRANSACTION FUNCTION
async function applyDevParameters(address: string, nodeId: string): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network: NetworkAccount = account.data
  const tx = {
    type: 'dev_parameters',
    nodeId,
    from: address,
    network: configs.networkAccount,
    devIssue: crypto.hash(`dev-issue-${network.devIssue}`),
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_DEV_APPLY: ', nodeId)
}

// RELEASE DEVELOPER FUNDS FOR A PAYMENT
function releaseDeveloperFunds(payment: DeveloperPayment, address: string, nodeId: string): void {
  const tx = {
    type: 'developer_payment',
    nodeId,
    from: address,
    network: configs.networkAccount,
    developer: payment.address,
    payment: payment,
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_DEV_FUND_RELEASE: ', nodeId)
}

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
  let cycleData: Shardus.Cycle
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
      console.log('BEFORE getLocalOrRemoteAccount')
      const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
      console.log('AFTER getLocalOrRemoteAccount')
      network = account.data
      ;[cycleData] = dapp.getLatestCycles()
      console.log(`cycleData: ${stringify(cycleData)}`)
      console.log(cycleData.marker)
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
      nodeReward(nodeAddress, nodeId)
      lastReward = currentTime
    }

    // ISSUE
    if (currentTime >= network.windows.proposalWindow[0] && currentTime <= network.windows.proposalWindow[1]) {
      if (!issueGenerated && network.issue > 1) {
        if (luckyNodes.includes(nodeId)) {
          await generateIssue(nodeAddress, nodeId)
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
          await generateDevIssue(nodeAddress, nodeId)
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
          await tallyVotes(nodeAddress, nodeId)
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
          await applyParameters(nodeAddress, nodeId)
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
          await tallyDevVotes(nodeAddress, nodeId)
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
          await applyDevParameters(nodeAddress, nodeId)
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
          releaseDeveloperFunds(payment, nodeAddress, nodeId)
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
        await _sleep(configs.ONE_SECOND * configs.cycleDuration * 2)
      }
      lastReward = Date.now()
      return setTimeout(networkMaintenance, cycleInterval)
    },
  )
})()
