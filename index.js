const fs = require('fs')
const path = require('path')
const shardus = require('shardus-global-server')
const crypto = require('shardus-crypto-utils')
const stringify = require('fast-stable-stringify')
const axios = require('axios')
const { set } = require('dot-prop')
const _ = require('lodash')
crypto('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

/**
 * @typedef {import('shardus-enterprise-server/src/shardus')} Shardus
 * @typedef {import('shardus-enterprise-server/src/shardus').App} App
 * @typedef {import('shardus-enterprise-server/src/shardus').IncomingTransaction} IncomingTransaction
 * @typedef {import('shardus-enterprise-server/src/shardus').IncomingTransactionResult} IncomingTransactionResult
 * @implements {App}
 */

// THE ENTIRE APP STATE FOR THIS NODE
let accounts = {}
const networkAccount = '0'.repeat(64)

// DYNAMIC LOCAL DATA HELD BY THE NODES
let IN_SYNC = false
let CURRENT, NEXT
let WINDOWS, NEXT_WINDOWS, DEV_WINDOWS, NEXT_DEV_WINDOWS
let ISSUE, DEV_ISSUE

// VARIABLE FOR HELPING NODES DETERMINE WHEN TO RELEASE DEVELOPER FUNDS
let DEVELOPER_FUND, NEXT_DEVELOPER_FUND

// HELPFUL TIME CONSTANTS IN MILLISECONDS
const ONE_SECOND = 1000
const ONE_MINUTE = 60 * ONE_SECOND
const ONE_HOUR = 60 * ONE_MINUTE
const ONE_DAY = 24 * ONE_HOUR
const ONE_WEEK = 7 * ONE_DAY
const ONE_YEAR = 365 * ONE_DAY

const TIME_FOR_PROPOSALS = ONE_MINUTE * 2
const TIME_FOR_VOTING = ONE_MINUTE * 2
const TIME_FOR_GRACE = ONE_MINUTE + ONE_SECOND * 30
const TIME_FOR_APPLY = ONE_MINUTE + ONE_SECOND * 30

const TIME_FOR_DEV_PROPOSALS = ONE_MINUTE * 2
const TIME_FOR_DEV_VOTING = ONE_MINUTE * 2
const TIME_FOR_DEV_GRACE = ONE_MINUTE + ONE_SECOND * 30
const TIME_FOR_DEV_APPLY = ONE_MINUTE + ONE_SECOND * 30

// MIGHT BE USEFUL TO HAVE TIME CONSTANTS IN THE FORM OF CYCLES
const cycleDuration = 15
const CYCLES_PER_MINUTE = ONE_MINUTE / 1000 / cycleDuration
const CYCLES_PER_HOUR = 60 * CYCLES_PER_MINUTE
const CYCLES_PER_DAY = 24 * CYCLES_PER_HOUR
const CYCLES_PER_WEEK = 7 * CYCLES_PER_DAY
const CYCLES_PER_YEAR = 365 * CYCLES_PER_DAY

let config = {}

if (process.env.BASE_DIR) {
  if (fs.existsSync(path.join(process.env.BASE_DIR, 'config.json'))) {
    config = JSON.parse(
      fs.readFileSync(path.join(process.env.BASE_DIR, 'config.json'))
    )
  }
  config.server.baseDir = process.env.BASE_DIR
}

// CONFIGURATION PARAMETERS PASSED INTO SHARDUS
set(config, 'server.p2p', {
  cycleDuration: cycleDuration,
  existingArchivers: JSON.parse(process.env.APP_SEEDLIST || '[{ "ip": "127.0.0.1", "port": 4000, "publicKey": "758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3" }]'),
  maxNodesPerCycle: 1,
  minNodes: 60,
  maxNodes: 60,
  minNodesToAllowTxs: 1,
  maxNodesToRotate: 1,
  maxPercentOfDelta: 40
})

if (process.env.APP_IP) {
  set(config, 'server.ip', {
    externalIp: process.env.APP_IP,
    internalIp: process.env.APP_IP
  })
}

set(config, 'server.loadDetection', {
  queueLimit: 1000,
  desiredTxTime: 15,
  highThreshold: 0.8,
  lowThreshold: 0.2
})
set(config, 'server.reporting', {
  recipient: `http://${process.env.APP_MONITOR || '0.0.0.0'}:3000/api`,
  interval: 1
})
set(config, 'server.rateLimiting', {
  limitRate: true,
  loadLimit: 0.5
})
set(config, 'server.sharding', {
  nodesPerConsensusGroup: 5
})
set(config, 'logs', {
  dir: './logs',
  files: { main: '', fatal: '', net: '' },
  options: {
    appenders: {
      out: { type: 'file', maxLogSize: 10000000, backups: 10 },
      app: {
        type: 'file',
        maxLogSize: 10000000,
        backups: 10
      },
      errorFile: {
        type: 'file',
        maxLogSize: 10000000,
        backups: 10
      },
      errors: {
        type: 'logLevelFilter',
        level: 'ERROR',
        appender: 'errorFile'
      },
      main: {
        type: 'file',
        maxLogSize: 10000000,
        backups: 10
      },
      fatal: {
        type: 'file',
        maxLogSize: 10000000,
        backups: 10
      },
      net: {
        type: 'file',
        maxLogSize: 10000000,
        backups: 10
      },
      playback: {
        type: 'file',
        maxLogSize: 10000000,
        backups: 10
      }
    },
    categories: {
      default: { appenders: ['out'], level: 'fatal' },
      app: { appenders: ['app', 'errors'], level: 'fatal' },
      main: { appenders: ['main', 'errors'], level: 'fatal' },
      fatal: { appenders: ['fatal'], level: 'fatal' },
      net: { appenders: ['net'], level: 'fatal' },
      playback: { appenders: ['playback'], level: 'fatal' }
    }
  }
})

const dapp = shardus(config)

// INITIAL PARAMETERS THE NODES SET WHEN THEY BECOME ACTIVE
async function syncParameters (timestamp) {
  const account = await dapp.getLocalOrRemoteAccount(networkAccount)
  // IF THE NETWORK ACCOUNT HAS BEEN INITIALIZED
  if (account && account.data) {
    CURRENT = account.data.current
    NEXT = account.data.next
    WINDOWS = account.data.windows
    NEXT_WINDOWS = account.data.nextWindows
    ISSUE = account.data.issue
    IN_SYNC = true
  } else {
    const proposalWindow = [timestamp, timestamp + TIME_FOR_PROPOSALS]
    const votingWindow = [
      proposalWindow[1],
      proposalWindow[1] + TIME_FOR_VOTING
    ]
    const graceWindow = [votingWindow[1], votingWindow[1] + TIME_FOR_GRACE]
    const applyWindow = [graceWindow[1], graceWindow[1] + TIME_FOR_APPLY]

    CURRENT = {
      nodeRewardInterval: ONE_MINUTE * 2,
      nodeRewardAmount: 10,
      nodePenalty: 100,
      transactionFee: 0.001,
      stakeRequired: 500,
      maintenanceInterval: ONE_MINUTE,
      maintenanceFee: 0.01,
      proposalFee: 500,
      devProposalFee: 20
    }
    NEXT = {}
    WINDOWS = {
      proposalWindow,
      votingWindow,
      graceWindow,
      applyWindow
    }
    NEXT_WINDOWS = {}
    ISSUE = 1
  }
}

async function syncDevParameters (timestamp) {
  const account = await dapp.getLocalOrRemoteAccount(networkAccount)
  // IF THE NETWORK ACCOUNT HAS BEEN INITIALIZED
  if (account && account.data) {
    DEV_WINDOWS = account.data.devWindows
    NEXT_DEV_WINDOWS = account.data.nextDevWindows
    DEVELOPER_FUND = account.data.developerFund
    NEXT_DEVELOPER_FUND = account.data.nextDeveloperFund
    DEV_ISSUE = account.data.devIssue
    IN_SYNC = true
  } else {
    const devProposalWindow = [timestamp, timestamp + TIME_FOR_DEV_PROPOSALS]
    const devVotingWindow = [
      devProposalWindow[1],
      devProposalWindow[1] + TIME_FOR_DEV_VOTING
    ]
    const devGraceWindow = [
      devVotingWindow[1],
      devVotingWindow[1] + TIME_FOR_DEV_GRACE
    ]
    const devApplyWindow = [
      devGraceWindow[1],
      devGraceWindow[1] + TIME_FOR_DEV_APPLY
    ]

    DEV_WINDOWS = {
      devProposalWindow,
      devVotingWindow,
      devGraceWindow,
      devApplyWindow
    }
    NEXT_DEV_WINDOWS = {}
    DEVELOPER_FUND = []
    NEXT_DEVELOPER_FUND = []
    DEV_ISSUE = 1
  }
}

// CREATE A USER ACCOUNT
function createAccount (accountId, timestamp) {
  const account = {
    id: accountId,
    data: {
      balance: 5000,
      toll: 1,
      chats: {},
      friends: {},
      transactions: []
    },
    lastMaintenance: timestamp,
    timestamp: 0
  }
  account.hash = crypto.hashObj(account)
  return account
}

// CREATE A NODE ACCOUNT FOR MINING
function createNode (accountId) {
  const account = {
    id: accountId,
    balance: 0,
    hash: '',
    timestamp: 0
  }
  account.hash = crypto.hashObj(account)
  return account
}

function createChat (accountId) {
  const chat = {
    id: accountId,
    messages: [],
    timestamp: 0
  }
  chat.hash = crypto.hashObj(chat)
  return chat
}

// CREATE AN ALIAS ACCOUNT
function createAlias (accountId) {
  const alias = {
    id: accountId,
    hash: '',
    timestamp: 0
  }
  alias.hash = crypto.hashObj(alias)
  return alias
}

// CREATE THE INITIAL NETWORK ACCOUNT
function createNetworkAccount (accountId) {
  const account = {
    id: accountId,
    current: CURRENT,
    next: {},
    windows: WINDOWS,
    nextWindows: {},
    devWindows: DEV_WINDOWS,
    nextDevWindows: {},
    issue: ISSUE,
    devIssue: DEV_ISSUE,
    developerFund: [],
    nextDeveloperFund: [],
    hash: '',
    timestamp: 0
  }
  account.hash = crypto.hashObj(account)
  return account
}

// CREATE AN ISSUE ACCOUNT
function createIssue (accountId) {
  const issue = {
    id: accountId,
    proposals: [],
    proposalCount: 0,
    hash: '',
    timestamp: 0
  }
  issue.hash = crypto.hashObj(issue)
  return issue
}

// CREATE A DEV_ISSUE ACCOUNT
function createDevIssue (accountId) {
  const devIssue = {
    id: accountId,
    devProposals: [],
    devProposalCount: 0,
    hash: '',
    timestamp: 0
  }
  devIssue.hash = crypto.hashObj(devIssue)
  return devIssue
}

// CREATE A PROPOSAL ACCOUNT
function createProposal (accountId) {
  const proposal = {
    id: accountId,
    power: 0,
    totalVotes: 0,
    hash: '',
    timestamp: 0
  }
  proposal.hash = crypto.hashObj(proposal)
  return proposal
}

// CREATE A DEV_PROPOSAL ACCOUNT
function createDevProposal (accountId) {
  const devProposal = {
    id: accountId,
    approve: 0,
    reject: 0,
    totalVotes: 0,
    hash: '',
    timestamp: 0
  }
  devProposal.hash = crypto.hashObj(devProposal)
  return devProposal
}

// API
dapp.registerExternalPost('inject', async (req, res) => {
  try {
    const result = dapp.put(req.body)
    res.json({ result })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('network/parameters/node', async (req, res) => {
  try {
    // console.log(ISSUE, DEV_ISSUE)
    res.json({
      parameters: {
        CURRENT,
        NEXT,
        ISSUE,
        DEV_ISSUE,
        DEVELOPER_FUND,
        NEXT_DEVELOPER_FUND,
        WINDOWS,
        NEXT_WINDOWS,
        DEV_WINDOWS,
        NEXT_DEV_WINDOWS,
        IN_SYNC
      }
    })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('network/parameters/node/next', async (req, res) => {
  try {
    res.json({ parameters: NEXT })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('network/parameters', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
    res.json({
      parameters: {
        CURRENT: network.data.current,
        NEXT: network.data.next,
        DEVELOPER_FUND: network.data.developerFund,
        NEXT_DEVELOPER_FUND: network.data.nextDeveloperFund,
        WINDOWS: network.data.windows,
        DEV_WINDOWS: network.data.devWindows,
        NEXT_WINDOWS: network.data.nextWindows,
        NEXT_DEV_WINDOWS: network.data.nextDevWindows,
        ISSUE: network.data.issue,
        DEV_ISSUE: network.data.devIssue
      }
    })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('network/parameters/next', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
    res.json({ parameters: network.data.next })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('network/windows/all', async (req, res) => {
  try {
    res.json({
      windows: WINDOWS,
      devWindows: DEV_WINDOWS
    })
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('network/windows', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
    res.json({ windows: network.data.windows })
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('network/windows/dev', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
    res.json({ devWindows: network.data.devWindows })
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('issues', async (req, res) => {
  try {
    const issues = []
    for (let i = 1; i <= ISSUE; i++) {
      let issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${i}`))
      if (issue && issue.data) {
        issues.push(issue.data)
      }
    }
    res.json({ issues })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues/latest', async (req, res) => {
  try {
    const issue = await dapp.getLocalOrRemoteAccount(
      crypto.hash(`issue-${ISSUE}`)
    )
    res.json({ issue: issue && issue.data })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues/count', async (req, res) => {
  try {
    res.json({ count: ISSUE })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues/dev', async (req, res) => {
  try {
    const devIssues = []
    for (let i = 1; i <= DEV_ISSUE; i++) {
      let devIssue = await dapp.getLocalOrRemoteAccount(
        crypto.hash(`dev-issue-${i}`)
      )
      if (devIssue && devIssue.data) {
        devIssues.push(devIssue.data)
      }
    }
    res.json({ devIssues })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues/dev/latest', async (req, res) => {
  try {
    const devIssue = await dapp.getLocalOrRemoteAccount(
      crypto.hash(`dev-issue-${DEV_ISSUE}`)
    )
    res.json({ devIssue: devIssue && devIssue.data })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues/dev/count', async (req, res) => {
  try {
    res.json({ count: DEV_ISSUE })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals', async (req, res) => {
  try {
    const proposals = []
    for (let i = 1; i <= ISSUE; i++) {
      let issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${i}`))
      let proposalCount = issue && issue.data.proposalCount
      for (let j = 1; j <= proposalCount; j++) {
        let proposal = await dapp.getLocalOrRemoteAccount(
          crypto.hash(`issue-${i}-proposal-${j}`)
        )
        if (proposal && proposal.data) {
          proposals.push(proposal.data)
        }
      }
    }
    res.json({ proposals })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals/latest', async (req, res) => {
  try {
    const issue = await dapp.getLocalOrRemoteAccount(
      crypto.hash(`issue-${ISSUE}`)
    )
    const proposalCount = issue && issue.data.proposalCount
    const proposals = []
    for (let i = 1; i <= proposalCount; i++) {
      let proposal = await dapp.getLocalOrRemoteAccount(
        crypto.hash(`issue-${ISSUE}-proposal-${i}`)
      )
      if (proposal && proposal.data) {
        proposals.push(proposal.data)
      }
    }
    res.json({ proposals })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals/count', async (req, res) => {
  try {
    const issue = await dapp.getLocalOrRemoteAccount(
      crypto.hash(`issue-${ISSUE}`)
    )
    res.json({ count: issue && issue.data.proposalCount })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals/dev', async (req, res) => {
  try {
    const devProposals = []
    for (let i = 1; i <= DEV_ISSUE; i++) {
      let devIssue = await dapp.getLocalOrRemoteAccount(
        crypto.hash(`dev-issue-${i}`)
      )
      let devProposalCount = devIssue && devIssue.data.devProposalCount
      for (let j = 1; j <= devProposalCount; j++) {
        let devProposal = await dapp.getLocalOrRemoteAccount(
          crypto.hash(`dev-issue-${i}-dev-proposal-${j}`)
        )
        if (devProposal && devProposal.data) {
          devProposals.push(devProposal.data)
        }
      }
    }
    res.json({ devProposals })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals/dev/latest', async (req, res) => {
  try {
    const issue = await dapp.getLocalOrRemoteAccount(
      crypto.hash(`dev-issue-${DEV_ISSUE}`)
    )
    const devProposalCount = issue && issue.data.devProposalCount
    const devProposals = []
    for (let i = 1; i <= devProposalCount; i++) {
      let devProposal = await dapp.getLocalOrRemoteAccount(
        crypto.hash(`dev-issue-${DEV_ISSUE}-dev-proposal-${i}`)
      )
      if (devProposal && devProposal.data) {
        devProposals.push(devProposal.data)
      }
    }
    res.json({ devProposals })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals/dev/count', async (req, res) => {
  try {
    const devIssue = await dapp.getLocalOrRemoteAccount(
      crypto.hash(`dev-issue-${DEV_ISSUE}`)
    )
    res.json({ count: devIssue && devIssue.data.devProposalCount })
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id', async (req, res) => {
  try {
    const id = req.params['id']
    const account = await dapp.getLocalOrRemoteAccount(id)
    res.json({ account: account && account.data })
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id/alias', async (req, res) => {
  try {
    const id = req.params['id']
    const account = await dapp.getLocalOrRemoteAccount(id)
    res.json({ handle: account && account.data.alias })
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id/transactions', async (req, res) => {
  try {
    const id = req.params['id']
    const account = await dapp.getLocalOrRemoteAccount(id)
    res.json({ transactions: account && account.data.data.transactions })
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id/balance', async (req, res) => {
  try {
    const id = req.params['id']
    const account = await dapp.getLocalOrRemoteAccount(id)
    if (account) {
      res.json({ balance: account && account.data.data.balance })
    } else {
      res.json({ error: 'No account with the given id' })
    }
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id/toll', async (req, res) => {
  try {
    const id = req.params['id']
    const account = await dapp.getLocalOrRemoteAccount(id)
    if (account) {
      res.json({ toll: account.data.data.toll })
    } else {
      res.json({ error: 'No account with the given id' })
    }
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('address/:name', async (req, res) => {
  try {
    const name = req.params['name']
    const account = await dapp.getLocalOrRemoteAccount(name)
    if (account && account.data) {
      res.json({ address: account.data.address })
    } else {
      res.json({ error: 'No account exists for the given handle' })
    }
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id/:friendId/toll', async (req, res) => {
  const id = req.params['id']
  const friendId = req.params['friendId']
  if (!id) {
    res.json({
      error: 'No provided id in the route: account/:id/:friendId/toll'
    })
  }
  if (!friendId) {
    res.json({
      error: 'No provided friendId in the route: account/:id/:friendId/toll'
    })
  }
  try {
    const account = await dapp.getLocalOrRemoteAccount(id)
    if (account && account.data.data.friends[friendId]) {
      res.json({ toll: 0 })
    } else if (account) {
      res.json({ toll: account.data.data.toll })
    } else {
      res.json({ error: 'No account found with the given id' })
    }
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id/friends', async (req, res) => {
  try {
    const id = req.params['id']
    const account = await dapp.getLocalOrRemoteAccount(id)
    if (account) {
      res.json({ friends: account.data.data.friends })
    } else {
      res.json({ error: 'No account for given id' })
    }
  } catch (error) {
    // console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id/recentMessages', async (req, res) => {
  try {
    const id = req.params['id']
    let messages = []
    const account = await dapp.getLocalOrRemoteAccount(id)
    if (account) {
      Object.values(account.data.data.chats).forEach(chat => {
        messages.push(...chat.messages)
      })
      res.json({ messages: messages })
    } else {
      res.json({ error: 'No account for given id' })
    }
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('accounts', async (req, res) => {
  res.json({ accounts })
})

dapp.registerExternalGet('messages/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params
    const chat = await dapp.getLocalOrRemoteAccount(chatId)
    // console.log(chatId)
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
    // console.log(error)
    res.json({ error })
  }
})

// SDK SETUP FUNCTIONS
dapp.setup({
  async sync () {
    if (dapp.p2p.isFirstSeed) {
      await _sleep(ONE_SECOND * 20)
      const timestamp = Date.now()
      const nodeId = dapp.getNodeId()
      const address = dapp.getNode(nodeId).address
      const proposalWindow = [timestamp, timestamp + TIME_FOR_PROPOSALS]
      const votingWindow = [
        proposalWindow[1],
        proposalWindow[1] + TIME_FOR_VOTING
      ]
      const graceWindow = [votingWindow[1], votingWindow[1] + TIME_FOR_GRACE]
      const applyWindow = [graceWindow[1], graceWindow[1] + TIME_FOR_APPLY]

      const devProposalWindow = [timestamp, timestamp + TIME_FOR_DEV_PROPOSALS]
      const devVotingWindow = [
        devProposalWindow[1],
        devProposalWindow[1] + TIME_FOR_DEV_VOTING
      ]
      const devGraceWindow = [
        devVotingWindow[1],
        devVotingWindow[1] + TIME_FOR_DEV_GRACE
      ]
      const devApplyWindow = [
        devGraceWindow[1],
        devGraceWindow[1] + TIME_FOR_DEV_APPLY
      ]
      CURRENT = {
        nodeRewardInterval: ONE_MINUTE * 2,
        nodeRewardAmount: 10,
        nodePenalty: 100,
        transactionFee: 0.01,
        stakeRequired: 500,
        maintenanceInterval: 600000,
        maintenanceFee: 0,
        proposalFee: 500,
        devProposalFee: 100
      }
      NEXT = {}
      WINDOWS = {
        proposalWindow,
        votingWindow,
        graceWindow,
        applyWindow
      }
      NEXT_WINDOWS = {}
      DEV_WINDOWS = {
        devProposalWindow,
        devVotingWindow,
        devGraceWindow,
        devApplyWindow
      }
      NEXT_DEV_WINDOWS = {}
      DEVELOPER_FUND = []
      NEXT_DEVELOPER_FUND = []
      ISSUE = 1
      DEV_ISSUE = 1
      IN_SYNC = true
      dapp.set({
        type: 'issue',
        nodeId,
        from: address,
        to: networkAccount,
        issue: crypto.hash(`issue-${ISSUE}`),
        proposal: crypto.hash(`issue-${ISSUE}-proposal-1`),
        timestamp: Date.now()
      })
      dapp.set({
        type: 'dev_issue',
        nodeId,
        from: address,
        to: networkAccount,
        devIssue: crypto.hash(`dev-issue-${DEV_ISSUE}`),
        timestamp: Date.now()
      })
      await _sleep(ONE_SECOND * 10)
    } else {
      let account = await dapp.getRemoteAccount(networkAccount)
      while (!account) {
        await _sleep(1000)
        account = await dapp.getRemoteAccount(networkAccount)
      }
      if (account && account.data) {
        CURRENT = account.data.current
        NEXT = account.data.next
        WINDOWS = account.data.windows
        DEV_WINDOWS = account.data.devWindows
        NEXT_WINDOWS = account.data.nextWindows
        NEXT_DEV_WINDOWS = account.data.nextDevWindows
        DEVELOPER_FUND = account.data.developerFund
        NEXT_DEVELOPER_FUND = account.data.nextDeveloperFund
        ISSUE = account.data.issue
        DEV_ISSUE = account.data.devIssue
        IN_SYNC = true
      } else {
        // console.log('ERROR???')
      }
    }
  },
  validateTransaction (tx, wrappedStates) {
    const response = {
      result: 'fail',
      reason: 'Transaction is not valid.'
    }

    const from = wrappedStates[tx.from] && wrappedStates[tx.from].data
    const to = wrappedStates[tx.to] && wrappedStates[tx.to].data

    switch (tx.type) {
      case 'snapshot': {
        // if (tx.sign.owner !== ADMIN_ADDRESS) {
        //   response.reason = 'not signed by ADMIN account'
        //   return response
        // }
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'email': {
        const source = wrappedStates[tx.signedTx.from] && wrappedStates[tx.signedTx.from].data
        if (!source) {
          response.reason = 'no account associated with address in signed tx'
          return response
        }
        if (tx.signedTx.sign.owner !== tx.signedTx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx.signedTx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (tx.signedTx.emailHash !== crypto.hash(tx.email)) {
          response.reason = 'Hash of the email does not match the signed email hash'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'gossip_email_hash': {
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'verify': {
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (typeof from.verified !== 'string') {
          response.reason = 'From account has not been sent a verification email'
          return response
        }
        if (from.verified === true) {
          response.reason = 'From account has already been verified'
          return response
        }
        if (crypto.hash(tx.code) !== from.verified) {
          response.reason = 'Hash of code in tx does not match the hash of the verification code sent'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'register': {
        const alias = wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!alias) {
          response.reason = 'Alias account was not found for some reason'
          return response
        }
        if (alias.inbox === tx.alias) {
          response.reason = 'This alias is already taken'
          return response
        }
        // if (from.data.balance < CURRENT.transactionFee) {
        //   response.reason = "From account doesn't have enough tokens to cover the transaction fee"
        //   return response
        // }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'create': {
        if (to === undefined || to === null) {
          response.reason = "target account doesn't exist"
          return response
        }
        if (tx.amount < 1) {
          response.reason = 'create amount needs to be positive (1 or greater)'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'transfer': {
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from === undefined || from === null) {
          response.reason = "from account doesn't exist"
          return response
        }
        if (to === undefined || to === null) {
          response.reason = "To account doesn't exist"
          return response
        }
        if (from.data.balance < tx.amount + CURRENT.transactionFee) {
          response.reason =
            "from account doesn't have sufficient balance to cover the transaction"
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'distribute': {
        const recipients = tx.recipients.map(
          recipientId => wrappedStates[recipientId].data
        )
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from === undefined || from === null) {
          response.reason = "from account doesn't exist"
          return response
        }
        recipients.forEach(recipient => {
          if (!recipient) {
            response.reason = 'no account for one of the recipients'
            return response
          }
        })
        if (
          from.data.balance <
          recipients.length * tx.amount + CURRENT.transactionFee
        ) {
          response.reason =
            "from account doesn't have sufficient balance to cover the transaction"
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'message': {
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (typeof from === 'undefined' || from === null) {
          response.reason = '"from" account does not exist.'
          return response
        }
        if (typeof to === 'undefined' || to === null) {
          response.reason = '"target" account does not exist.'
          return response
        }
        if (to.data.friends[tx.from]) {
          if (from.data.balance < 1) {
            response.reason = 'from account does not have sufficient funds.'
            return response
          }
        } else {
          if (from.data.balance < to.data.toll + CURRENT.transactionFee) {
            response.reason = 'from account does not have sufficient funds.'
            return response
          }
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'toll': {
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!from) {
          response.reason = 'from account does not exist'
          return response
        }
        if (from.data.balance < CURRENT.transactionFee) {
          response.reason =
            'from account does not have sufficient funds to complete toll transaction'
          return response
        }
        if (!tx.toll) {
          response.reason = 'Toll was not defined in the transaction'
          return response
        }
        if (tx.toll < 1) {
          response.reason = 'Toll must be greater than or equal to 1'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'friend': {
        if (typeof from === 'undefined' || from === null) {
          response.reason = 'from account does not exist'
          return response
        }
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from.data.balance < CURRENT.transactionFee) {
          response.reason =
            "From account doesn't have enough tokens to cover the transaction fee"
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'remove_friend': {
        if (typeof from === 'undefined' || from === null) {
          response.reason = 'from account does not exist'
          return response
        }
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from.data.balance < CURRENT.transactionFee) {
          response.reason =
            "From account doesn't have enough tokens to cover the transaction fee"
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'stake': {
        if (typeof from === 'undefined' || from === null) {
          response.reason = 'from account does not exist'
          return response
        }
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from.data.balance < CURRENT.stakeRequired) {
          response.reason = `From account has insufficient balance, the cost required to operate a node is ${CURRENT.stakeRequired}`
          return response
        }
        if (tx.stake < CURRENT.stakeRequired) {
          response.reason = `Stake amount sent: ${tx.stake} is less than the cost required to operate a node: ${CURRENT.stakeRequired}`
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'node_reward': {
        // const network = wrappedStates[tx.network] && wrappedStates[tx.network].data
        // console.log(network.current.nodeRewardInterval)
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   console.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        // if (
        //   tx.timestamp - nodeInfo.activeTimestamp <
        //   CURRENT.nodeRewardInterval
        // ) {
        //   response.reason = 'Too early for this node to get paid'
        //   return response
        // }
        if (!from) {
          response.result = 'pass'
          response.reason = 'This transaction in valid'
          return response
        }
        if (from) {
          if (!from.nodeRewardTime) {
            response.result = 'pass'
            response.reason = 'This transaction in valid'
            return response
          }
          if (tx.timestamp - from.nodeRewardTime < CURRENT.nodeRewardInterval) {
            response.reason = 'Too early for this node to get paid'
            return response
          }
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'snapshot_claim': {
        if (from === undefined || from === null) {
          response.reason = "from account doesn't exist"
          return response
        }
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from.claimedSnapshot) {
          response.reason = 'Already claimed tokens from the snapshot'
          return response
        }
        if (!to) {
          response.reason =
            'Snapshot account does not exist yet, OR wrong snapshot address provided in the "to" field'
          return response
        }
        if (!to.snapshot) {
          response.reason = 'Snapshot hasnt been taken yet'
          return response
        }
        if (!to.snapshot[tx.from]) {
          response.reason =
            'Your address did not hold any ULT on the Ethereum blockchain during the snapshot'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'issue': {
        const issue = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   console.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (issue.active) {
          response.reason = 'Issue is already active'
          return response
        }
        let issueHash = crypto.hash(`issue-${to.issue}`)
        if (issueHash !== tx.issue) {
          response.reason = `issue id (${issueHash}) does not match current network issue (${tx.issue})`
          return response
        }
        let proposalHash = crypto.hash(`issue-${to.issue}-proposal-1`)
        if (proposalHash !== tx.proposal) {
          response.reason = `The current default proposalHash (${proposalHash}) does not match the one in this issue tx (${tx.proposal})`
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_issue': {
        const devIssue =
          wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   console.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (devIssue.active) {
          response.reason = 'devIssue is already active'
          return response
        }
        let devIssueHash = crypto.hash(`dev-issue-${to.devIssue}`)
        if (devIssueHash !== tx.devIssue) {
          response.reason = `devIssue id (${devIssueHash}) does not match current network devIssue (${tx.devIssue})`
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'proposal': {
        const issue = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        const parameters = tx.parameters
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!issue) {
          response.reason = "Issue doesn't exist"
          return response
        }
        if (!issue.active) {
          response.reason = 'This issue is no longer active'
          return response
        }
        if (
          tx.proposal !==
          crypto.hash(`issue-${ISSUE}-proposal-${issue.proposalCount + 1}`)
        ) {
          response.reason = 'Must give the next issue proposalCount hash'
          return response
        }
        if (from.data.balance < CURRENT.proposalFee + CURRENT.transactionFee) {
          response.reason =
            'From account has insufficient balance to submit a proposal'
          return response
        }
        if (parameters.transactionFee < 0) {
          response.reason = 'Min transaction fee permitted is 0'
          return response
        }
        if (parameters.transactionFee > 10) {
          response.reason = 'Max transaction fee permitted is 10'
          return response
        }
        if (parameters.maintenanceFee > 0.1) {
          response.reason = 'Max maintenanceFee fee permitted is 10%'
          return response
        }
        if (parameters.maintenanceFee < 0) {
          response.reason = 'Min maintenanceFee fee permitted is 0%'
          return response
        }
        if (parameters.maintenanceInterval > 1000000000000) {
          response.reason = 'Max maintenanceInterval permitted is 1000000000000'
          return response
        }
        if (parameters.maintenanceInterval < 600000) {
          response.reason = 'Min maintenanceInterval permitted is 600000 (10 minutes)'
          return response
        }
        if (parameters.nodeRewardInterval < 60000) {
          response.reason = 'Min nodeRewardInterval permitted is 60000 (1 minute)'
          return response
        }
        if (parameters.nodeRewardInterval > 900000000000) {
          response.reason = 'Max nodeRewardInterval fee permitted is 900000000000'
          return response
        }
        if (parameters.nodeRewardAmount < 0) {
          response.reason = 'Min nodeRewardAmount permitted is 0 tokens'
          return response
        }
        if (parameters.nodeRewardAmount > 1000000000) {
          response.reason = 'Max nodeRewardAmount permitted is 1000000000'
          return response
        }
        if (parameters.proposalFee < 0) {
          response.reason = 'Min proposalFee permitted is 0 tokens'
          return response
        }
        if (parameters.proposalFee > 1000000000) {
          response.reason = 'Max proposalFee permitted is 1000000000 tokens'
          return response
        }
        if (parameters.devProposalFee < 0) {
          response.reason = 'Min devProposalFee permitted is 0 tokens'
          return response
        }
        if (parameters.devProposalFee > 1000000000) {
          response.reason = 'Max devProposalFee permitted is 1000000000 tokens'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_proposal': {
        const devIssue =
          wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data

        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!devIssue) {
          response.reason = "devIssue doesn't exist"
          return response
        }
        if (!devIssue.active) {
          response.reason = 'This devIssue is no longer active'
          return response
        }
        if (
          tx.devProposal !==
          crypto.hash(
            `dev-issue-${DEV_ISSUE}-dev-proposal-${devIssue.devProposalCount +
              1}`
          )
        ) {
          response.reason = 'Must give the next devIssue devProposalCount hash'
          return response
        }
        if (from.data.balance < CURRENT.devProposalFee + CURRENT.transactionFee) {
          response.reason =
            'From account has insufficient balance to submit a devProposal'
          return response
        }
        if (tx.payments.reduce((acc, payment) => acc + payment.amount, 0) > 1) {
          response.reason = 'tx payment amounts added up to more than 100%'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'vote': {
        const proposal =
          wrappedStates[tx.proposal] && wrappedStates[tx.proposal].data
        const issue = wrappedStates[tx.issue] && wrappedStates[tx.issue].data

        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!issue) {
          response.reason = "issue doesn't exist"
          return response
        }
        if (!issue.active) {
          response.reason = 'issue no longer active'
          return response
        }
        if (!proposal) {
          response.reason = "Proposal doesn't exist"
          return response
        }
        if (tx.amount <= 0) {
          response.reason = 'Must send tokens to vote'
          return response
        }
        if (from.data.balance < tx.amount + CURRENT.transactionFee) {
          response.reason =
            'From account has insufficient balance to cover the amount sent in the transaction'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_vote': {
        const devProposal =
          wrappedStates[tx.devProposal] && wrappedStates[tx.devProposal].data
        const devIssue =
          wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data

        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!devProposal) {
          response.reason = "devProposal doesn't exist"
          return response
        }
        if (!devIssue) {
          response.reason = "devIssue doesn't exist"
          return response
        }
        if (!devIssue.active) {
          response.reason = 'devIssue no longer active'
          return response
        }
        if (tx.amount <= 0) {
          response.reason = 'Must send tokens in order to vote'
          return response
        }
        if (from.data.balance < tx.amount + CURRENT.transactionFee) {
          response.reason =
            'From account has insufficient balance to cover the amount sent in the transaction'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'tally': {
        const issue = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        const proposals = tx.proposals.map(id => wrappedStates[id].data)

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   console.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (!issue) {
          response.reason = "Issue doesn't exist"
          return response
        }
        if (!issue.active) {
          response.reason = 'This issue is no longer active'
          return response
        }
        if (issue.winner) {
          response.reason =
            'The winner for this issue has already been determined'
          return response
        }
        if (to.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (proposals.length !== issue.proposalCount) {
          response.reason =
            'The number of proposals sent in with the transaction dont match the issues proposalCount'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_tally': {
        const devIssue =
          wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
        const devProposals = tx.devProposals.map(id => wrappedStates[id].data)

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   console.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (!devIssue) {
          response.reason = "devIssue doesn't exist"
          return response
        }
        if (!devIssue.active) {
          response.reason = 'This devIssue is no longer active'
          return response
        }
        if (devIssue.winners !== undefined) {
          response.reason =
            'The winners for this devIssue has already been determined'
          return response
        }
        if (to.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (devProposals.length !== devIssue.devProposalCount) {
          response.reason =
            'The number of devProposals sent in with the transaction dont match the devIssue proposalCount'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_parameters': {
        const issue = wrappedStates[tx.issue].data

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   console.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (!issue) {
          response.reason = "Issue doesn't exist"
          return response
        }
        if (!issue.active) {
          response.reason = 'This issue is no longer active'
          return response
        }
        if (to.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_dev_parameters': {
        const devIssue = wrappedStates[tx.devIssue].data

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   console.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (!devIssue) {
          response.reason = "devIssue doesn't exist"
          return response
        }
        if (!devIssue.active) {
          response.reason = 'This devIssue is no longer active'
          return response
        }
        if (to.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'developer_payment': {
        const developer = wrappedStates[tx.developer] && wrappedStates[tx.developer].data
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   console.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (to.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (!to.developerFund.some(payment => payment.id === tx.payment.id)) {
          // console.log(to.developerFund, tx.payment)
          response.reason = 'This payment doesnt exist'
          return response
        }
        if (tx.developer !== tx.payment.address) {
          response.reason = 'tx developer does not match address in payment'
          return response
        }
        if (tx.timestamp < tx.payment.timestamp) {
          response.reason = 'This payment is not ready to be released'
          return response
        }
        if (!developer || !developer.data) {
          response.reason = 'No account exists for the passed in tx.developer'
          return response
        }
        if (typeof developer.data.balance === 'string') {
          response.reason = 'developer.data.balance is a string for some reason'
          return response
        }
        if (typeof tx.payment.amount === 'string') {
          response.reason = 'payment.amount is a string for some reason'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
    }
  },
  // THIS NEEDS TO BE FAST, BUT PROVIDES BETTER RESPONSE IF SOMETHING GOES WRONG
  validateTxnFields (tx) {
    // Validate tx fields here
    let result = 'pass'
    let reason = 'This transaction is valid!'
    let txnTimestamp = tx.timestamp

    if (typeof tx.type !== 'string') {
      result = 'fail'
      reason = '"type" must be a string.'
      throw new Error(reason)
    }

    if (typeof txnTimestamp !== 'number') {
      result = 'fail'
      reason = '"timestamp" must be a number.'
      throw new Error(reason)
    }

    switch (tx.type) {
      case 'snapshot': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          result = 'fail'
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (tx.to !== networkAccount) {
          result = 'fail'
          reason = '"To" must be ' + networkAccount
          throw new Error(reason)
        }
        if (typeof tx.snapshot !== 'object') {
          result = 'fail'
          reason = '"Snapshot" must be an object.'
          throw new Error(reason)
        }
        break
      }
      case 'email': {
        if (typeof tx.signedTx !== 'object') {
          result = 'fail'
          reason = '"signedTx" must be an object.'
          throw new Error(reason)
        }
        const signedTx = tx.signedTx
        if (signedTx) {
          if (typeof signedTx !== 'object') {
            result = 'fail'
            reason = '"signedTx" must be a object.'
            throw new Error(reason)
          }
          if (typeof signedTx.sign !== 'object') {
            result = 'fail'
            reason = '"sign" property on signedTx must be an object.'
            throw new Error(reason)
          }
          if (typeof signedTx.from !== 'string') {
            result = 'fail'
            reason = '"From" must be a string.'
            throw new Error(reason)
          }
          if (typeof signedTx.emailHash !== 'string') {
            result = 'fail'
            reason = '"emailHash" must be a string.'
            throw new Error(reason)
          }
        }
        if (typeof tx.email !== 'string') {
          result = 'fail'
          reason = '"email" must be a string.'
          throw new Error(reason)
        }
        if (tx.email.length > 30) {
          result = 'fail'
          reason = '"Email" length must be less than 31 characters (30 max)'
          throw new Error(reason)
        }
        break
      }
      case 'verify': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.code !== 'string') {
          result = 'fail'
          reason = '"Code" must be a string.'
          throw new Error(reason)
        }
        if (tx.code.length !== 6) {
          result = 'fail'
          reason = '"Code" length must be 6 digits.'
          throw new Error(reason)
        }
        if (typeof parseInt(tx.code) !== 'number') {
          result = 'fail'
          reason = '"Code" must be parseable to an integer.'
          throw new Error(reason)
        }
        break
      }
      case 'register': {
        if (typeof tx.aliasHash !== 'string') {
          result = 'fail'
          reason = '"aliasHash" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.alias !== 'string') {
          result = 'fail'
          reason = '"alias" must be a string.'
          throw new Error(reason)
        }
        if (tx.alias.length >= 20) {
          result = 'fail'
          reason = '"alias" must be less than 21 characters (20 max)'
          throw new Error(reason)
        }
        break
      }
      case 'create': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          result = 'fail'
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          result = 'fail'
          reason = '"Amount" must be a number.'
          throw new Error(reason)
        }
        break
      }
      case 'transfer': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          result = 'fail'
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          result = 'fail'
          reason = '"Amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount <= 0) {
          result = 'fail'
          reason = '"Amount" must be a positive number.'
          throw new Error(reason)
        }
        break
      }
      case 'distribute': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (Array.isArray(tx.recipients) !== true) {
          result = 'fail'
          reason = '"Recipients" must be an array.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          result = 'fail'
          reason = '"Amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount <= 0) {
          result = 'fail'
          reason = '"Amount" must be a positive number.'
          throw new Error(reason)
        }
        break
      }
      case 'message': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          result = 'fail'
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.message !== 'string') {
          result = 'fail'
          reason = '"Message" must be a string.'
          throw new Error(reason)
        }
        if (tx.message.length > 5000) {
          result = 'fail'
          reason = '"Message" length must be less than 5000 characters.'
          throw new Error(reason)
        }
        break
      }
      case 'toll': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.toll !== 'number') {
          result = 'fail'
          reason = '"Toll" must be a number.'
          throw new Error(reason)
        }
        if (tx.toll < 1) {
          result = 'fail'
          reason = 'Minimum "toll" allowed is 1 token'
          throw new Error(reason)
        }
        if (tx.toll > 1000000) {
          result = 'fail'
          reason = 'Maximum toll allowed is 1,000,000 tokens.'
          throw new Error(reason)
        }
        break
      }
      case 'friend': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          result = 'fail'
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.alias !== 'string') {
          result = 'fail'
          reason = '"Message" must be a string.'
          throw new Error(reason)
        }
        break
      }
      case 'remove_friend': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          result = 'fail'
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        break
      }
      case 'stake': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.stake !== 'number') {
          result = 'fail'
          reason = '"Stake" must be a number.'
          throw new Error(reason)
        }
        break
      }
      case 'snapshot_claim': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          result = 'fail'
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        break
      }
      case 'proposal': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.proposal !== 'string') {
          result = 'fail'
          reason = '"Proposal" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.issue !== 'string') {
          result = 'fail'
          reason = '"Issue" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.parameters !== 'object') {
          result = 'fail'
          reason = '"Parameters" must be an object.'
          throw new Error(reason)
        }
        if (
          tx.timestamp < WINDOWS.proposalWindow[0] ||
          tx.timestamp > WINDOWS.proposalWindow[1]
        ) {
          result = 'fail'
          reason = '"Network is not currently accepting issues or proposals"'
          throw new Error(reason)
        }
        break
      }
      case 'dev_proposal': {
        if (typeof tx.devIssue !== 'string') {
          result = 'fail'
          reason = '"devIssue" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.devProposal !== 'string') {
          result = 'fail'
          reason = '"devProposal" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.totalAmount !== 'number') {
          result = 'fail'
          reason = '"totalAmount" must be a number.'
          throw new Error(reason)
        }
        if (tx.totalAmount < 1) {
          result = 'fail'
          reason = 'Minimum "totalAmount" allowed is 1 token'
          throw new Error(reason)
        }
        if (tx.totalAmount > 100000) {
          result = 'fail'
          reason = 'Maximum "totalAmount" allowed is 100,000 tokens'
          throw new Error(reason)
        }
        if (Array.isArray(tx.payments) !== true) {
          result = 'fail'
          reason = '"payments" must be an array.'
          throw new Error(reason)
        }
        if (typeof tx.description !== 'string') {
          result = 'fail'
          reason = '"description" must be a string.'
          throw new Error(reason)
        }
        if (tx.description.length < 1) {
          result = 'fail'
          reason = 'Minimum "description" character count is 1'
          throw new Error(reason)
        }
        if (tx.description.length > 1000) {
          result = 'fail'
          reason = 'Maximum "description" character count is 1000'
          throw new Error(reason)
        }
        if (typeof tx.payAddress !== 'string') {
          result = 'fail'
          reason = '"payAddress" must be a string.'
          throw new Error(reason)
        }
        if (tx.payAddress.length !== 64) {
          result = 'fail'
          reason = '"payAddress" length must be 64 characters (A valid public address)'
          throw new Error(reason)
        }
        if (
          tx.timestamp < DEV_WINDOWS.devProposalWindow[0] ||
          tx.timestamp > DEV_WINDOWS.devProposalWindow[1]
        ) {
          result = 'fail'
          reason = 'Network is not accepting dev proposals'
          throw new Error(reason)
        }
        break
      }
      case 'vote': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          result = 'fail'
          reason = '"amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount < 1) {
          result = 'fail'
          reason = 'Minimum voting "amount" allowed is 1 token'
          throw new Error(reason)
        }
        if (typeof tx.issue !== 'string') {
          result = 'fail'
          reason = '"issue" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.proposal !== 'string') {
          result = 'fail'
          reason = '"Proposal" must be a string.'
          throw new Error(reason)
        }
        if (
          tx.timestamp < WINDOWS.votingWindow[0] ||
          tx.timestamp > WINDOWS.votingWindow[1]
        ) {
          result = 'fail'
          reason = 'Network is not currently accepting votes'
          throw new Error(reason)
        }
        break
      }
      case 'dev_vote': {
        if (typeof tx.from !== 'string') {
          result = 'fail'
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          result = 'fail'
          reason = '"amount" must be a number.'
          throw new Error(reason)
        }
        if (typeof tx.amount < 1) {
          result = 'fail'
          reason = 'Minimum voting "amount" allowed is 1 token'
          throw new Error(reason)
        }
        if (typeof tx.approve !== 'boolean') {
          result = 'fail'
          reason = '"approve" must be a boolean.'
          throw new Error(reason)
        }
        if (typeof tx.devProposal !== 'string') {
          result = 'fail'
          reason = '"devProposal" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.devIssue !== 'string') {
          result = 'fail'
          reason = '"devIssue" must be a string.'
          throw new Error(reason)
        }
        if (
          tx.timestamp < DEV_WINDOWS.devVotingWindow[0] ||
          tx.timestamp > DEV_WINDOWS.devVotingWindow[1]
        ) {
          result = 'fail'
          reason = 'Network is not currently accepting dev votes'
          throw new Error(reason)
        }
        break
      }
      case 'developer_payment': {
        if (typeof tx.payment !== 'object') {
          result = 'fail'
          reason = '"Payment" must be an object.'
          throw new Error(reason)
        }
        if (typeof tx.payment.amount !== 'number') {
          result = 'fail'
          reason = '"payment.amount" must be a number.'
          throw new Error(reason)
        }
      }
    }

    return {
      result,
      reason,
      txnTimestamp
    }
  },
  apply (tx, wrappedStates) {
    let from = wrappedStates[tx.from] && wrappedStates[tx.from].data
    let to = wrappedStates[tx.to] && wrappedStates[tx.to].data
    // Validate the tx
    const { result, reason } = this.validateTransaction(tx, wrappedStates)

    if (result !== 'pass') {
      throw new Error(
        `invalid transaction, reason: ${reason}. tx: ${stringify(tx)}`
      )
    }

    // Create an applyResponse which will be used to tell Shardus that the tx has been applied
    let txId
    if (!tx.sign) {
      txId = crypto.hashObj(tx)
    } else {
      txId = crypto.hashObj(tx, true) // compute from tx
    }
    const applyResponse = dapp.createApplyResponse(txId, tx.timestamp)

    // Apply the tx
    switch (tx.type) {
      case 'snapshot': {
        to.snapshot = tx.snapshot
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        // console.log('Applied snapshot tx', txId, to)
        break
      }
      // TODO: Have nodes determine who actually sends the email
      case 'email': {
        const source = wrappedStates[tx.signedTx.from] && wrappedStates[tx.signedTx.from].data
        const nodeId = dapp.getNodeId()
        const { address } = dapp.getNode(nodeId)
        let [closest] = dapp.getClosestNodes(tx.signedTx.from, 5)
        if (nodeId === closest) {
          const baseNumber = 99999
          const randomNumber = Math.floor((Math.random() * 899999)) + 1
          const verificationNumber = baseNumber + randomNumber

          axios.post('http://arimaa.com/mailAPI/index.cgi', {
            from: 'liberdus.verify',
            to: `${tx.email}`,
            subject: 'Verify your email for liberdus',
            message: `Please verify your email address by sending a "verify" transaction with the number: ${verificationNumber}`,
            secret: 'Liberdus'
          })

          dapp.put({
            type: 'gossip_email_hash',
            nodeId,
            account: source.id,
            from: address,
            emailHash: tx.signedTx.emailHash,
            verified: crypto.hash(`${verificationNumber}`),
            timestamp: Date.now()
          })
        }
        // console.log('Applied email tx', txId, source)
        break
      }
      case 'gossip_email_hash': {
        // const targets = tx.targets.map(target => wrappedStates[target].data)
        const account = wrappedStates[tx.account].data
        account.emailHash = tx.emailHash
        account.verified = tx.verified
        account.timestamp = tx.timestamp
        // console.log('Applied gossip_email_hash tx', txId, from, account)
        break
      }
      case 'verify': {
        from.verified = true
        from.timestamp = tx.timestamp
        // console.log('Applied verify tx', txId, from)
        break
      }
      case 'register': {
        let alias = wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data
        // from.data.balance -= CURRENT.transactionFee
        // from.data.balance -= maintenanceAmount(tx.timestamp, from)
        alias.inbox = tx.alias
        from.alias = tx.alias
        alias.address = tx.from
        // from.data.transactions.push({ ...tx, txId })
        alias.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        // console.log('Applied register tx', txId, from)
        break
      }
      case 'create': {
        to.data.balance += tx.amount
        to.timestamp = tx.timestamp

        // to.data.transactions.push({ ...tx, txId })
        // console.log('Applied create tx', txId, to)
        break
      }
      case 'transfer': {
        from.data.balance -= tx.amount + CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from)
        to.data.balance += tx.amount
        from.data.transactions.push({ ...tx, txId })
        to.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        // console.log('Applied transfer tx', txId, from, to)
        break
      }
      case 'distribute': {
        const recipients = tx.recipients.map(
          recipientId => wrappedStates[recipientId].data
        )
        from.data.balance -= CURRENT.transactionFee
        // from.data.transactions.push({ ...tx, txId })
        recipients.forEach(recipient => {
          from.data.balance -= tx.amount
          recipient.data.balance += tx.amount
          // recipient.data.transactions.push({ ...tx, txId })
        })
        from.data.balance -= maintenanceAmount(tx.timestamp, from)
        // console.log('Applied distribute transaction', txId, from, recipients)
        break
      }
      case 'message': {
        const chat = wrappedStates[tx.chatId].data
        from.data.balance -= CURRENT.transactionFee
        if (!to.data.friends[from.id]) {
          from.data.balance -= to.data.toll
          to.data.balance += to.data.toll
        }
        from.data.balance -= maintenanceAmount(tx.timestamp, from)

        // TODO: Chat data between two accounts should be stored in one place
        if (!from.data.chats[tx.to]) from.data.chats[tx.to] = tx.chatId
        if (!to.data.chats[tx.from]) to.data.chats[tx.from] = tx.chatId

        chat.messages.push(tx.message)
        // from.data.transactions.push({ ...tx, txId })
        // to.data.transactions.push({ ...tx, txId })

        chat.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp

        // console.log('Applied message tx', txId, chat, from, to)
        break
      }
      case 'toll': {
        from.data.balance -= CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from)
        from.data.toll = tx.toll
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        // console.log('Applied toll tx', txId, from)
        break
      }
      case 'friend': {
        from.data.balance -= CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from)
        from.data.friends[tx.to] = tx.alias
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        // console.log('Applied friend tx', txId, from)
        break
      }
      case 'remove_friend': {
        from.data.friends[tx.to] = null
        from.timestamp = tx.timestamp
        // from.data.transactions.push({ ...tx, txId })
        // console.log('Applied remove_friend tx', txId, from)
        break
      }
      case 'stake': {
        from.data.balance -= tx.stake
        from.data.balance -= maintenanceAmount(tx.timestamp, from)
        from.data.stake = tx.stake
        from.timestamp = tx.timestamp
        // from.data.transactions.push({ ...tx, txId })
        // console.log('Applied stake tx', txId, from)
        break
      }
      case 'node_reward': {
        // let network = wrappedStates[tx.network] && wrappedStates[tx.network].data
        // console.log(network.current.nodeRewardAmount)
        to.balance += CURRENT.nodeRewardAmount
        from.nodeRewardTime = tx.timestamp
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        // console.log('Applied node_reward tx', txId, from, to)
        break
      }
      case 'snapshot_claim': {
        from.data.balance += to.snapshot[tx.from]
        to.snapshot[tx.from] = 0
        // from.data.transactions.push({ ...tx, txId })
        from.claimedSnapshot = true
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        // console.log('Applied snapshot_claim tx', txId, from, to)
        break
      }
      case 'issue': {
        const issue = wrappedStates[tx.issue].data
        const proposal = wrappedStates[tx.proposal].data

        proposal.parameters = to.current
        proposal.parameters.title = 'Default parameters'
        proposal.parameters.description = 'Keep the current network parameters as they are'
        proposal.number = 1

        issue.number = to.issue
        issue.active = true
        issue.proposals.push(proposal.id)
        issue.proposalCount++

        issue.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        // console.log('Applied issue tx', from, issue, proposal)
        break
      }
      case 'dev_issue': {
        const devIssue = wrappedStates[tx.devIssue].data

        devIssue.number = to.devIssue
        devIssue.active = true

        devIssue.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        // console.log('Applied dev_issue tx', from, devIssue)
        break
      }
      case 'proposal': {
        const proposal = wrappedStates[tx.proposal].data
        const issue = wrappedStates[tx.issue].data

        from.data.balance -= CURRENT.proposalFee
        from.data.balance -= CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from)

        proposal.parameters = tx.parameters
        issue.proposalCount++
        proposal.number = issue.proposalCount
        issue.proposals.push(proposal.id)

        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        // console.log('Applied proposal tx', txId, from, issue, proposal)
        break
      }
      case 'dev_proposal': {
        const devIssue = wrappedStates[tx.devIssue].data
        const devProposal = wrappedStates[tx.devProposal].data

        from.data.balance -= CURRENT.devProposalFee
        from.data.balance -= CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from)

        devProposal.totalAmount = tx.totalAmount
        devProposal.payAddress = tx.payAddress
        devProposal.title = tx.title
        devProposal.description = tx.description
        devProposal.payments = tx.payments
        devIssue.devProposalCount++
        devProposal.number = devIssue.devProposalCount
        devIssue.devProposals.push(devProposal.id)

        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        devProposal.timestamp = tx.timestamp
        // console.log(
        //   'Applied dev_proposal tx',
        //   txId,
        //   from,
        //   devIssue,
        //   devProposal
        // )
        break
      }
      case 'vote': {
        const proposal = wrappedStates[tx.proposal].data
        from.data.balance -= tx.amount
        from.data.balance -= CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from)
        proposal.power += tx.amount
        proposal.totalVotes++

        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        // console.log('Applied vote tx', txId, from, proposal)
        break
      }
      case 'dev_vote': {
        const devProposal = wrappedStates[tx.devProposal].data

        from.data.balance -= tx.amount
        from.data.balance -= CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from)

        if (tx.approve) {
          devProposal.approve += tx.amount
        } else {
          devProposal.reject += tx.amount
        }

        devProposal.totalVotes++
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        devProposal.timestamp = tx.timestamp
        // console.log('Applied dev_vote tx', txId, from, devProposal)
        break
      }
      case 'tally': {
        const issue = wrappedStates[tx.issue].data
        const margin = 100 / (2 * (issue.proposalCount + 1)) / 100

        let defaultProposal =
          wrappedStates[crypto.hash(`issue-${issue.number}-proposal-1`)].data
        let sortedProposals = tx.proposals
          .map(id => wrappedStates[id].data)
          .sort((a, b) => a.power < b.power)
        let winner = defaultProposal

        for (const proposal of sortedProposals) {
          proposal.winner = false
        }

        if (sortedProposals.length >= 2) {
          const firstPlace = sortedProposals[0]
          const secondPlace = sortedProposals[1]
          const marginToWin = secondPlace.power + margin * secondPlace.power
          if (firstPlace.power > marginToWin) {
            winner = firstPlace
          }
        }

        winner.winner = true // CHICKEN DINNER
        to.next = winner.parameters
        to.nextWindows.proposalWindow = [
          to.windows.applyWindow[1],
          to.windows.applyWindow[1] + TIME_FOR_PROPOSALS
        ]
        to.nextWindows.votingWindow = [
          to.nextWindows.proposalWindow[1],
          to.nextWindows.proposalWindow[1] + TIME_FOR_VOTING
        ]
        to.nextWindows.graceWindow = [
          to.nextWindows.votingWindow[1],
          to.nextWindows.votingWindow[1] + TIME_FOR_GRACE
        ]
        to.nextWindows.applyWindow = [
          to.nextWindows.graceWindow[1],
          to.nextWindows.graceWindow[1] + TIME_FOR_APPLY
        ]
        issue.winner = winner.id

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        winner.timestamp = tx.timestamp
        // console.log('Applied tally tx', txId, issue, winner)
        break
      }
      case 'dev_tally': {
        const devIssue = wrappedStates[tx.devIssue].data
        const devProposals = tx.devProposals.map(id => wrappedStates[id].data)
        devIssue.winners = []
        for (const devProposal of devProposals) {
          if (
            devProposal.approve >
            devProposal.reject + devProposal.reject * 0.15
          ) {
            devProposal.approved = true
            let payments = []
            for (const payment of devProposal.payments) {
              payments.push({
                timestamp: tx.timestamp + TIME_FOR_DEV_GRACE + payment.delay,
                amount: payment.amount * devProposal.totalAmount,
                address: devProposal.payAddress,
                id: crypto.hashObj(payment)
              })
            }
            to.nextDeveloperFund = [...to.nextDeveloperFund, ...payments]
            devProposal.timestamp = tx.timestamp
            devIssue.winners.push(devProposal.id)
          } else {
            devProposal.approved = false
            devProposal.timestamp = tx.timestamp
          }
        }

        to.nextDeveloperFund.sort((a, b) => a.timestamp - b.timestamp)

        to.nextDevWindows.devProposalWindow = [
          to.devWindows.devApplyWindow[1],
          to.devWindows.devApplyWindow[1] + TIME_FOR_DEV_PROPOSALS
        ]
        to.nextDevWindows.devVotingWindow = [
          to.nextDevWindows.devProposalWindow[1],
          to.nextDevWindows.devProposalWindow[1] + TIME_FOR_DEV_VOTING
        ]
        to.nextDevWindows.devGraceWindow = [
          to.nextDevWindows.devVotingWindow[1],
          to.nextDevWindows.devVotingWindow[1] + TIME_FOR_DEV_GRACE
        ]
        to.nextDevWindows.devApplyWindow = [
          to.nextDevWindows.devGraceWindow[1],
          to.nextDevWindows.devGraceWindow[1] + TIME_FOR_DEV_APPLY
        ]

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        // console.log(
        //   'Applied dev_tally tx',
        //   txId,
        //   from,
        //   to,
        //   devIssue,
        //   devProposals
        // )
        break
      }
      case 'apply_parameters': {
        const issue = wrappedStates[tx.issue].data

        to.current = to.next
        to.next = {}
        to.windows = to.nextWindows
        to.nextWindows = {}
        to.issue++

        issue.active = false

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        // console.log('Applied apply_parameters tx', txId, from, issue, to)
        break
      }
      case 'apply_dev_parameters': {
        const devIssue = wrappedStates[tx.devIssue].data

        to.devWindows = to.nextDevWindows
        to.nextDevWindows = {}
        to.developerFund = [...to.developerFund, ...to.nextDeveloperFund]
        to.nextDeveloperFund = []
        to.devIssue++

        devIssue.active = false

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        // console.log('Applied apply_dev_parameters tx', txId, devIssue, to)
        break
      }
      case 'developer_payment': {
        const developer = wrappedStates[tx.developer].data
        // console.log('DEVELOPER_BALANCE: ', developer.data.balance)
        // console.log('PAYMENT_AMOUNT: ', tx.payment.amount)
        developer.data.balance += tx.payment.amount
        to.developerFund = to.developerFund.filter(
          payment => payment.id !== tx.payment.id
        )
        // DEVELOPER_FUND = DEVELOPER_FUND.filter(payment => payment.id !== tx.payment.id)
        // developer.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        developer.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        // console.log('Applied developer_payment tx', txId, from, to, developer)
        break
      }
    }
    return applyResponse
  },
  getKeyFromTransaction (tx) {
    const result = {
      sourceKeys: [],
      targetKeys: [],
      allKeys: [],
      timestamp: tx.timestamp
    }
    switch (tx.type) {
      case 'snapshot':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'email':
        result.sourceKeys = [tx.signedTx.from]
        break
      case 'gossip_email_hash':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.account]
        break
      case 'verify':
        result.sourceKeys = [tx.from]
        break
      case 'register':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.aliasHash]
        break
      case 'create':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'transfer':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'distribute':
        result.targetKeys = tx.recipients
        result.sourceKeys = [tx.from]
        break
      case 'message':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.chatId]
        break
      case 'toll':
        result.sourceKeys = [tx.from]
        break
      case 'friend':
        result.sourceKeys = [tx.from]
        break
      case 'remove_friend':
        result.sourceKeys = [tx.from]
        break
      case 'node_reward':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'bond':
        result.sourceKeys = [tx.from]
        break
      case 'claim_reward':
        result.sourceKeys = [tx.from]
        break
      case 'snapshot_claim':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'issue':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.issue, tx.proposal]
        break
      case 'dev_issue':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.devIssue]
        break
      case 'proposal':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.issue, tx.proposal]
        break
      case 'dev_proposal':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devIssue, tx.devProposal]
        break
      case 'vote':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.issue, tx.proposal]
        break
      case 'dev_vote':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devIssue, tx.devProposal]
        break
      case 'tally':
        result.sourceKeys = [tx.from]
        result.targetKeys = [...tx.proposals, tx.issue, tx.to]
        break
      case 'dev_tally':
        result.sourceKeys = [tx.from]
        result.targetKeys = [...tx.devProposals, tx.devIssue, tx.to]
        break
      case 'apply_parameters':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.issue]
        break
      case 'apply_dev_parameters':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.devIssue]
        break
      case 'developer_payment':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.developer, tx.to]
        break
    }
    result.allKeys = result.allKeys.concat(result.sourceKeys, result.targetKeys)
    return result
  },
  getStateId (accountAddress, mustExist = true) {
    const account = accounts[accountAddress]
    if (
      (typeof account === 'undefined' || account === null) &&
      mustExist === true
    ) {
      throw new Error('Could not get stateId for account ' + accountAddress)
    }
    const stateId = account.hash
    return stateId
  },
  deleteLocalAccountData () {
    accounts = {}
  },
  setAccountData (accountRecords) {
    for (let account of accountRecords) {
      // possibly need to clone this so others lose their ref
      accounts[account.id] = account
    }
  },
  getRelevantData (accountId, tx) {
    let account = accounts[accountId]
    let accountCreated = false
    // Create the account if it doesn't exist
    if (typeof account === 'undefined' || account === null) {
      if (accountId === networkAccount) {
        account = createNetworkAccount(accountId)
        accounts[accountId] = account
        accountCreated = true
      }
      if (tx.type === 'message') {
        if (accountId === tx.chatId) {
          account = createChat(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'dev_proposal') {
        if (accountId === tx.devProposal) {
          account = createDevProposal(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'dev_issue') {
        if (accountId === tx.devIssue) {
          account = createDevIssue(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'proposal') {
        if (accountId === tx.proposal) {
          account = createProposal(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'issue') {
        if (accountId === tx.issue) {
          account = createIssue(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
        if (accountId === tx.proposal) {
          account = createProposal(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'node_reward') {
        if (accountId === tx.from && accountId === tx.to) {
          account = createNode(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'register') {
        if (accountId === tx.aliasHash) {
          account = createAlias(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      }
    }
    if (typeof account === 'undefined' || account === null) {
      if (tx.nodeId) {
        account = createNode(accountId)
        accounts[accountId] = account
        accountCreated = true
      } else {
        account = createAccount(accountId, tx.timestamp)
        accounts[accountId] = account
        accountCreated = true
      }
    }
    // Wrap it for Shardus
    const wrapped = dapp.createWrappedResponse(
      accountId,
      accountCreated,
      account.hash,
      account.timestamp,
      account
    )
    return wrapped
  },
  updateAccountFull (wrappedData, localCache, applyResponse) {
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
      accountCreated
    )
  },
  // TODO: This might be useful in making some optimizations
  updateAccountPartial (wrappedData, localCache, applyResponse) {
    this.updateAccountFull(wrappedData, localCache, applyResponse)
  },
  getAccountDataByRange (accountStart, accountEnd, tsStart, tsEnd, maxRecords) {
    const results = []
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
        timestamp: account.timestamp
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
  getAccountData (accountStart, accountEnd, maxRecords) {
    const results = []
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
        timestamp: account.timestamp
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
  getAccountDataByList (addressList) {
    const results = []
    for (const address of addressList) {
      const account = accounts[address]
      if (account) {
        const wrapped = {
          accountId: account.id,
          stateId: account.hash,
          data: account,
          timestamp: account.timestamp
        }
        results.push(wrapped)
      }
    }
    results.sort((a, b) => a.accountId < b.accountId)
    return results
  },
  calculateAccountHash (account) {
    account.hash = '' // Not sure this is really necessary
    account.hash = crypto.hashObj(account)
    return account.hash
  },
  resetAccountData (accountBackupCopies) {
    for (let recordData of accountBackupCopies) {
      accounts[recordData.id] = recordData
    }
  },
  deleteAccountData (addressList) {
    for (const address of addressList) {
      delete accounts[address]
    }
  },
  getAccountDebugValue (wrappedAccount) {
    return `${stringify(wrappedAccount)}`
  },
  close () {
    // console.log('Shutting down server...')
  }
})

dapp.registerExceptionHandler()

// HELPER METHOD TO WAIT
async function _sleep (ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function maintenanceAmount (timestamp, account) {
  let amount
  if (timestamp - account.lastMaintenance < CURRENT.maintenanceInterval) {
    amount = 0
  } else {
    amount =
      account.data.balance *
      (CURRENT.maintenanceFee *
        Math.floor(
          (timestamp - account.lastMaintenance) / CURRENT.maintenanceInterval
        ))
    account.lastMaintenance = timestamp
  }
  return amount
}

// NODE_REWARD TRANSACTION FUNCTION
function nodeReward (address, nodeId) {
  const payAddress = address
  const tx = {
    type: 'node_reward',
    timestamp: Date.now(),
    nodeId: nodeId,
    from: address,
    to: payAddress
  }
  dapp.put(tx)
}

// ISSUE TRANSACTION FUNCTION
async function generateIssue (address, nodeId) {
  const tx = {
    type: 'issue',
    nodeId,
    from: address,
    to: networkAccount,
    issue: crypto.hash(`issue-${ISSUE}`),
    proposal: crypto.hash(`issue-${ISSUE}-proposal-1`),
    timestamp: Date.now()
  }
  dapp.put(tx)
  // console.log('GENERATED_ISSUE: ', nodeId)
}

// DEV_ISSUE TRANSACTION FUNCTION
async function generateDevIssue (address, nodeId) {
  const tx = {
    type: 'dev_issue',
    nodeId,
    from: address,
    to: networkAccount,
    devIssue: crypto.hash(`dev-issue-${DEV_ISSUE}`),
    timestamp: Date.now()
  }
  dapp.put(tx)
  // console.log('GENERATED_DEV_ISSUE: ', nodeId)
}

// TALLY TRANSACTION FUNCTION
async function tallyVotes (address, nodeId) {
  let issue = await dapp.getLocalOrRemoteAccount(
    crypto.hash(`issue-${ISSUE}`)
  )
  try {
    const tx = {
      type: 'tally',
      nodeId,
      from: address,
      to: networkAccount,
      issue: issue.data.id,
      proposals: issue.data.proposals,
      timestamp: Date.now()
    }
    dapp.put(tx)
    // console.log('GENERATED_TALLY: ', nodeId)
  } catch (err) {
    // console.log('ERR: ', err)
    await _sleep(1000)
    return tallyVotes(address, nodeId)
  }
}

// DEV_TALLY TRANSACTION FUNCTION
async function tallyDevVotes (address, nodeId) {
  try {
    const devIssue = await dapp.getLocalOrRemoteAccount(
      crypto.hash(`dev-issue-${DEV_ISSUE}`)
    )
    const tx = {
      type: 'dev_tally',
      nodeId: nodeId,
      from: address,
      to: networkAccount,
      devIssue: devIssue.data.id,
      devProposals: devIssue.data.devProposals,
      timestamp: Date.now()
    }
    dapp.put(tx)
    // console.log('GENERATED_DEV_TALLY: ', nodeId)
  } catch (err) {
    // console.log('ERR: ', err)
    await _sleep(1000)
    return tallyDevVotes(address, nodeId)
  }
}

// APPLY_PARAMETERS TRANSACTION FUNCTION
async function applyParameters (address, nodeId) {
  const tx = {
    type: 'apply_parameters',
    nodeId,
    from: address,
    to: networkAccount,
    issue: crypto.hash(`issue-${ISSUE}`),
    timestamp: Date.now()
  }
  dapp.put(tx)
  // console.log('GENERATED_APPLY: ', nodeId)
}

// APPLY_DEV_PARAMETERS TRANSACTION FUNCTION
async function applyDevParameters (address, nodeId) {
  const tx = {
    type: 'apply_dev_parameters',
    nodeId: nodeId,
    from: address,
    to: networkAccount,
    devIssue: crypto.hash(`dev-issue-${DEV_ISSUE}`),
    timestamp: Date.now()
  }
  dapp.put(tx)
  // console.log('GENERATED_DEV_APPLY: ', nodeId)
}

// RELEASE DEVELOPER FUNDS FOR A PAYMENT
function releaseDeveloperFunds (payment, address, nodeId) {
  const tx = {
    type: 'developer_payment',
    nodeId: nodeId,
    from: address,
    to: networkAccount,
    developer: payment.address,
    payment: payment,
    timestamp: Date.now()
  }
  dapp.put(tx)
  // console.log('GENERATED_DEV_FUND_RELEASE: ', nodeId)
}

// CODE THAT GETS EXECUTED WHEN NODES START
;(async () => {
  const cycleInterval = cycleDuration * ONE_SECOND

  let issueGenerated = false
  let tallyGenerated = false
  let applyGenerated = false

  let devIssueGenerated = false
  let devTallyGenerated = false
  let devApplyGenerated = false

  let syncedNextParams = true
  let syncedNextDevParams = true

  let nodeId
  let nodeAddress
  let cycleStartTimestamp
  let lastReward
  let expectedInterval
  let cycleData
  let luckyNode

  await dapp.start()

  dapp.p2p.on('active', async () => {
    if (dapp.p2p.isFirstSeed) {
      await _sleep(ONE_SECOND * 20)
    }
    let [cycleData] = dapp.getLatestCycles()
    nodeId = dapp.getNodeId()
    nodeAddress = dapp.getNode(nodeId).address
    cycleStartTimestamp = cycleData.start * 1000
    lastReward = cycleStartTimestamp
    expectedInterval = cycleStartTimestamp + cycleInterval
    return setTimeout(networkMaintenance, expectedInterval - Date.now())
  })

  // THIS CODE IS CALLED ON EVERY NODE ON EVERY CYCLE
  async function networkMaintenance () {
    expectedInterval += cycleInterval

    try {
      [cycleData] = dapp.getLatestCycles()
      cycleStartTimestamp = cycleData.start * 1000
      ;([luckyNode] = dapp.getClosestNodes(cycleData.marker, 2))
      nodeId = dapp.getNodeId()
      nodeAddress = dapp.getNode(nodeId).address
    } catch (err) {
      // console.log('ERR: ', err)
      return setTimeout(networkMaintenance, 1000)
    }

    // console.log(
    //   `
    //   CYCLE_DATA: `,
    //   cycleData,
    //   `
    //   luckyNode: `,
    //   luckyNode,
    //   `
    //   IN_SYNC: `,
    //   IN_SYNC,
    //   `
    //   CURRENT: `,
    //   CURRENT,
    //   `
    //   NEXT: `,
    //   NEXT,
    //   `
    //   DEVELOPER_FUND: `,
    //   DEVELOPER_FUND,
    //   `
    //   NEXT_DEVELOPER_FUND: `,
    //   NEXT_DEVELOPER_FUND,
    //   `
    //   ISSUE: `,
    //   ISSUE,
    //   `
    //   DEV_ISSUE: `,
    //   DEV_ISSUE,
    //   `
    //   nodeId: `,
    //   nodeId,
    //   `
    // `
    // )

    if (_.isEmpty(CURRENT) || _.isEmpty(WINDOWS) || _.isEmpty(DEV_WINDOWS)) {
      IN_SYNC = false
    }

    if (!IN_SYNC) {
      await syncParameters(cycleStartTimestamp + cycleInterval)
      await syncDevParameters(cycleStartTimestamp + cycleInterval)
      return setTimeout(networkMaintenance, 1000)
    }

    // THIS IS FOR NODE_REWARD
    if (cycleStartTimestamp - lastReward > CURRENT.nodeRewardInterval) {
      nodeReward(nodeAddress, nodeId)
      lastReward = cycleStartTimestamp
    }

    // AUTOMATIC (ISSUE | TALLY | APPLY_PARAMETERS) TRANSACTION GENERATION
    // IS THE NETWORK READY TO GENERATE A NEW ISSUE?
    // console.log(
    //   'ISSUE_DEBUG ---------- ',
    //   'ISSUE_GENERATED: ', issueGenerated,
    //   'LUCKY_NODE: ', luckyNode,
    //   'NODE_ID: ', nodeId,
    //   'CYCLE_START_TIME: ', cycleStartTimestamp,
    //   'ISSUE_WINDOW_START_TIME: ', WINDOWS.proposalWindow[0],
    //   'ISSUE_WINDOW_END_TIME: ', WINDOWS.proposalWindow[1],
    //   'WITHIN_ISSUE_WINDOW: ', cycleStartTimestamp >= WINDOWS.proposalWindow[0] &&
    //     cycleStartTimestamp <= WINDOWS.proposalWindow[1]
    // )

    if (
      cycleStartTimestamp >= WINDOWS.proposalWindow[0] &&
      cycleStartTimestamp <= WINDOWS.proposalWindow[1]
    ) {
      if (!issueGenerated) {
        if (nodeId === luckyNode && ISSUE > 1) {
          await generateIssue(nodeAddress, nodeId)
        }
        issueGenerated = true
        applyGenerated = false
      }
    }

    // console.log(
    //   'TALLY_DEBUG ---------- ',
    //   'TALLY_GENERATED: ', tallyGenerated,
    //   'LUCKY_NODE: ', luckyNode,
    //   'NODE_ID: ', nodeId,
    //   'CYCLE_START_TIME: ', cycleStartTimestamp,
    //   'TALLY_WINDOW_START_TIME: ', WINDOWS.graceWindow[0],
    //   'TALLY_WINDOW_END_TIME: ', WINDOWS.graceWindow[1],
    //   'WITHIN_TALLY_WINDOW: ', cycleStartTimestamp >= WINDOWS.graceWindow[0] &&
    //     cycleStartTimestamp <= WINDOWS.graceWindow[1]
    // )

    // IF THE WINNER FOR THE PROPOSAL HASN'T BEEN DETERMINED YET AND ITS PAST THE VOTING_WINDOW
    if (
      cycleStartTimestamp >= WINDOWS.graceWindow[0] &&
      cycleStartTimestamp <= WINDOWS.graceWindow[1]
    ) {
      if (!syncedNextParams) {
        await syncParameters(cycleStartTimestamp)
        syncedNextParams = true
      }
      if (!tallyGenerated) {
        if (nodeId === luckyNode) {
          await tallyVotes(nodeAddress, nodeId)
        }
        tallyGenerated = true
        syncedNextParams = false
      }
    }

    // console.log(
    //   'APPLY_DEBUG ---------- ',
    //   'APPLY_GENERATED: ', applyGenerated,
    //   'LUCKY_NODE: ', luckyNode,
    //   'NODE_ID: ', nodeId,
    //   'CYCLE_START_TIME: ', cycleStartTimestamp,
    //   'APPLY_WINDOW_START_TIME: ', WINDOWS.applyWindow[0],
    //   'APPLY_WINDOW_END_TIME: ', WINDOWS.applyWindow[1],
    //   'WITHIN_APPLY_WINDOW: ', cycleStartTimestamp >= WINDOWS.applyWindow[0] &&
    //     cycleStartTimestamp <= WINDOWS.applyWindow[1]
    // )

    // IF THE WINNING PARAMETERS HAVENT BEEN APPLIED YET AND IT'S PAST THE GRACE_WINDOW
    if (
      cycleStartTimestamp >= WINDOWS.applyWindow[0] &&
      cycleStartTimestamp <= WINDOWS.applyWindow[1]
    ) {
      if (!applyGenerated) {
        if (nodeId === luckyNode) {
          await applyParameters(nodeAddress, nodeId)
        }
        WINDOWS = NEXT_WINDOWS
        NEXT_WINDOWS = {}
        CURRENT = NEXT
        NEXT = {}
        ISSUE++
        applyGenerated = true
        issueGenerated = false
        tallyGenerated = false
      }
    }

    // console.log(
    //   'DEV_ISSUE_DEBUG ---------- ',
    //   'DEV_ISSUE_GENERATED: ', tallyGenerated,
    //   'LUCKY_NODE: ', luckyNode,
    //   'NODE_ID: ', nodeId,
    //   'CYCLE_START_TIME: ', cycleStartTimestamp,
    //   'DEV_ISSUE_WINDOW_START_TIME: ', DEV_WINDOWS.devProposalWindow[0],
    //   'DEV_ISSUE_WINDOW_END_TIME: ', DEV_WINDOWS.devProposalWindow[1],
    //   'WITHIN_DEV_ISSUE_WINDOW: ', cycleStartTimestamp >= DEV_WINDOWS.devProposalWindow[0] &&
    //     cycleStartTimestamp <= DEV_WINDOWS.devProposalWindow[1]
    // )

    // AUTOMATIC (DEV_ISSUE | DEV_TALLY | APPLY_DEV_PARAMETERS) TRANSACTION GENERATION
    // IS THE NETWORK READY TO GENERATE A NEW DEV_ISSUE?
    if (
      cycleStartTimestamp >= DEV_WINDOWS.devProposalWindow[0] &&
      cycleStartTimestamp <= DEV_WINDOWS.devProposalWindow[1]
    ) {
      if (!devIssueGenerated) {
        if (nodeId === luckyNode && DEV_ISSUE >= 2) {
          await generateDevIssue(nodeAddress, nodeId)
        }
        devIssueGenerated = true
        devApplyGenerated = false
      }
    }

    // console.log(
    //   'DEV_TALLY_DEBUG ---------- ',
    //   'DEV_TALLY_GENERATED: ', devTallyGenerated,
    //   'LUCKY_NODE: ', luckyNode,
    //   'NODE_ID: ', nodeId,
    //   'CYCLE_START_TIME: ', cycleStartTimestamp,
    //   'DEV_TALLY_WINDOW_START_TIME: ', DEV_WINDOWS.devGraceWindow[0],
    //   'DEV_TALLY_WINDOW_END_TIME: ', DEV_WINDOWS.devGraceWindow[1],
    //   'WITHIN_DEV_TALLY_WINDOW: ', cycleStartTimestamp >= DEV_WINDOWS.devGraceWindow[0] &&
    //     cycleStartTimestamp <= DEV_WINDOWS.devGraceWindow[1]
    // )

    // IF THE WINNERS FOR THE DEV PROPOSALS HAVEN'T BEEN DETERMINED YET AND ITS PAST THE DEV_VOTING_WINDOW
    if (
      cycleStartTimestamp >= DEV_WINDOWS.devGraceWindow[0] &&
      cycleStartTimestamp <= DEV_WINDOWS.devGraceWindow[1]
    ) {
      if (!syncedNextDevParams) {
        await syncDevParameters(cycleStartTimestamp)
        syncedNextDevParams = true
      }
      if (!devTallyGenerated) {
        if (nodeId === luckyNode) {
          await tallyDevVotes(nodeAddress, nodeId)
        }
        devTallyGenerated = true
        syncedNextDevParams = false
      }
    }

    // console.log(
    //   'DEV_APPLY_DEBUG ---------- ',
    //   'DEV_APPLY_GENERATED: ', devApplyGenerated,
    //   'LUCKY_NODE: ', luckyNode,
    //   'NODE_ID: ', nodeId,
    //   'CYCLE_START_TIME: ', cycleStartTimestamp,
    //   'DEV_APPLY_WINDOW_START_TIME: ', DEV_WINDOWS.devApplyWindow[0],
    //   'DEV_APPLY_WINDOW_END_TIME: ', DEV_WINDOWS.devApplyWindow[1],
    //   'WITHIN_DEV_APPLY_WINDOW: ', cycleStartTimestamp >= DEV_WINDOWS.devApplyWindow[0] &&
    //     cycleStartTimestamp <= DEV_WINDOWS.devApplyWindow[1]
    // )

    // IF THE WINNING DEV PARAMETERS HAVENT BEEN APPLIED YET AND IT'S PAST THE DEV_GRACE_WINDOW
    if (
      cycleStartTimestamp >= DEV_WINDOWS.devApplyWindow[0] &&
      cycleStartTimestamp <= DEV_WINDOWS.devApplyWindow[1]
    ) {
      if (!devApplyGenerated) {
        if (nodeId === luckyNode) {
          await applyDevParameters(nodeAddress, nodeId)
        }
        DEV_WINDOWS = NEXT_DEV_WINDOWS
        NEXT_DEV_WINDOWS = {}
        DEVELOPER_FUND = [...DEVELOPER_FUND, ...NEXT_DEVELOPER_FUND]
        NEXT_DEVELOPER_FUND = []
        DEV_ISSUE++
        devApplyGenerated = true
        devIssueGenerated = false
        devTallyGenerated = false
      }
    }

    // LOOP THROUGH IN-MEMORY DEVELOPER_FUND
    for (const payment of DEVELOPER_FUND) {
      // PAY DEVELOPER IF THE CURRENT TIME IS GREATER THAN THE PAYMENT TIME
      if (cycleStartTimestamp >= payment.timestamp) {
        if (nodeId === luckyNode) {
          releaseDeveloperFunds(payment, nodeAddress, nodeId)
        }
        DEVELOPER_FUND = DEVELOPER_FUND.filter(p => p.id !== payment.id)
      }
    }

    // return setTimeout(networkMaintenance, expectedInterval - cycleStartTimestamp) NO GOOD
    return setTimeout(networkMaintenance, expectedInterval - Date.now())
  }
})()
