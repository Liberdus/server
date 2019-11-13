const fs = require('fs')
const path = require('path')
const shardus = require('shardus-global-server')
const crypto = require('shardus-crypto-utils')
const stringify = require('fast-stable-stringify')
const { set } = require('dot-prop')
crypto('64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347')

/**
 * @typedef {import('shardus-enterprise-server/src/shardus')} Shardus
 * @typedef {import('shardus-enterprise-server/src/shardus').App} App
 * @typedef {import('shardus-enterprise-server/src/shardus').IncomingTransaction} IncomingTransaction
 * @typedef {import('shardus-enterprise-server/src/shardus').IncomingTransactionResult} IncomingTransactionResult
 * @implements {App}
 */

// THE ENTIRE APP STATE FOR THIS NODE
let accounts = {}

// CHANGE THIS TO YOUR WALLET ACCOUNT FOR TESTING LOCALLY
const ADMIN_ADDRESS = '1d488e0b637df2462b54af4b5ae1e0ebde02e0745d50941d47c8869a6abe2755'

// HELPFUL TIME CONSTANTS IN MILLISECONDS
const ONE_SECOND = 1000
const ONE_MINUTE = 60 * ONE_SECOND
const ONE_HOUR = 60 * ONE_MINUTE
const ONE_DAY = 24 * ONE_HOUR
const ONE_WEEK = 7 * ONE_DAY
const ONE_YEAR = 365 * ONE_DAY

// MIGHT BE USEFUL TO HAVE TIME CONSTANTS IN THE FORM OF CYCLES
const CYCLE_DURATION = 15
const CYCLES_PER_MINUTE = (ONE_MINUTE / 1000) / CYCLE_DURATION
const CYCLES_PER_HOUR = 60 * CYCLES_PER_MINUTE
const CYCLES_PER_DAY = 24 * CYCLES_PER_HOUR
const CYCLES_PER_WEEK = 7 * CYCLES_PER_DAY
const CYCLES_PER_YEAR = 365 * CYCLES_PER_DAY

// DYNAMIC NETWORK PARAMETERS THAT ARE SUBJECT TO CHANGE AS PROPOSALS GET PASSED
let NODE_REWARD_INTERVAL
let NODE_REWARD_AMOUNT
let NODE_PENALTY
let TRANSACTION_FEE
let STAKE_REQUIRED
let MAINTENANCE_INTERVAL
let MAINTENANCE_FEE
let PROPOSAL_FEE
let DEV_PROPOSAL_FEE

// DYNAMIC VARIABLES TO HELP NODES DETERMINE
// WHEN TO SUBMIT ISSUE, DEV_ISSUE, TALLY, DEV_TALLY, APPLY_PARAMETERS, APPLY_DEV_PARAMETERS
let LAST_ISSUE_TIME
let LAST_DEV_ISSUE_TIME
let PROPOSAL_WINDOW
let DEV_PROPOSAL_WINDOW
let VOTING_WINDOW
let DEV_VOTING_WINDOW
let GRACE_WINDOW
let DEV_GRACE_WINDOW
let APPLY_WINDOW
let DEV_APPLY_WINDOW
let WINNER_FOUND
let DEV_WINNERS_FOUND
let PARAMS_APPLIED
let DEV_PARAMS_APPLIED

// VARIABLE FOR HELPING NODES DETERMINE WHEN TO RELEASE DEVELOPER FUNDS
let DEVELOPER_FUND

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
  cycleDuration: 15,
  seedList: 'http://127.0.0.1:4000/api/seednodes',
  maxNodesPerCycle: 10,
  minNodes: 20,
  maxNodes: 60,
  maxNodesToRotate: 1,
  maxPercentOfDelta: 40
})
set(config, 'server.loadDetection', {
  queueLimit: 1000,
  desiredTxTime: 5,
  highThreshold: 0.8,
  lowThreshold: 0.2
})
set(config, 'server.reporting', {
  interval: 1
})
set(config, 'server.rateLimiting', {
  limitRate: true,
  loadLimit: 0.5
})
set(config, 'server.sharding', {
  nodesPerConsensusGroup: 3
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
    }
    // categories: {
    //   default: { appenders: ['out'], level: 'fatal' },
    //   app: { appenders: ['app', 'errors'], level: 'TRACE' },
    //   main: { appenders: ['main', 'errors'], level: 'fatal' },
    //   fatal: { appenders: ['fatal'], level: 'fatal' },
    //   net: { appenders: ['net'], level: 'fatal' },
    //   playback: { appenders: ['playback'], level: 'fatal' }
    // }
  }
})

const dapp = shardus(config)

// INITIAL PARAMETERS THE NODES SET WHEN THEY BECOME ACTIVE
async function initParameters () {
  const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  // IF THE NETWORK ACCOUNT HAS BEEN INITIALIZED
  if (account) {
    NODE_REWARD_INTERVAL = account.data.nodeRewardInterval
    NODE_REWARD_AMOUNT = account.data.nodeRewardAmount
    NODE_PENALTY = account.data.nodePenalty
    TRANSACTION_FEE = account.data.transactionFee
    STAKE_REQUIRED = account.data.stakeRequired
    MAINTENANCE_INTERVAL = account.data.maintenanceInterval
    MAINTENANCE_FEE = account.data.maintenanceFee
    PROPOSAL_FEE = account.data.proposalFee
    DEV_PROPOSAL_FEE = account.data.devProposalFee
    LAST_ISSUE_TIME = account.data.lastIssueTime
    LAST_DEV_ISSUE_TIME = account.data.lastDevIssueTime
    PROPOSAL_WINDOW = account.data.proposalWindow
    DEV_PROPOSAL_WINDOW = account.data.devProposalWindow
    VOTING_WINDOW = account.data.votingWindow
    DEV_VOTING_WINDOW = account.data.devVotingWindow
    GRACE_WINDOW = account.data.graceWindow
    DEV_GRACE_WINDOW = account.data.devGraceWindow
    APPLY_WINDOW = account.data.applyWindow
    DEV_APPLY_WINDOW = account.data.devApplyWindow
    WINNER_FOUND = account.data.winnerFound
    DEV_WINNERS_FOUND = account.data.devWinnersFound
    PARAMS_APPLIED = account.data.paramsApplied
    DEV_PARAMS_APPLIED = account.data.devParamsApplied
    DEVELOPER_FUND = account.data.developerFund
  } else {
    // APPLY DEFAULT STARTING PARAMETERS
    NODE_REWARD_INTERVAL = ONE_MINUTE
    NODE_REWARD_AMOUNT = 10
    NODE_PENALTY = 100
    TRANSACTION_FEE = 0.001
    STAKE_REQUIRED = 500
    MAINTENANCE_INTERVAL = ONE_MINUTE * 2
    MAINTENANCE_FEE = 0.0001
    PROPOSAL_FEE = 500
    DEV_PROPOSAL_FEE = 200
    LAST_ISSUE_TIME = null
    LAST_DEV_ISSUE_TIME = null
    PROPOSAL_WINDOW = null
    DEV_PROPOSAL_WINDOW = null
    VOTING_WINDOW = null
    DEV_VOTING_WINDOW = null
    GRACE_WINDOW = null
    DEV_GRACE_WINDOW = null
    APPLY_WINDOW = null
    DEV_APPLY_WINDOW = null
    WINNER_FOUND = null
    DEV_WINNERS_FOUND = null
    PARAMS_APPLIED = null
    DEV_PARAMS_APPLIED = null
    DEVELOPER_FUND = []
  }
}

// CREATE A USER ACCOUNT
function createAccount (obj = {}) {
  const account = Object.assign({
    timestamp: Date.now(),
    id: crypto.randomBytes(),
    data: {
      balance: 5000,
      toll: 1,
      chats: {},
      friends: {},
      transactions: []
    }
  }, obj)
  account.hash = crypto.hashObj(account)
  return account
}

// CREATE A NODE ACCOUNT FOR MINING
function createNode (obj = {}) {
  const account = Object.assign({
    timestamp: Date.now(),
    id: crypto.randomBytes(),
    balance: 0
  }, obj)
  account.hash = crypto.hashObj(account)
  return account
}

// CREATE AN ALIAS ACCOUNT
function createAlias (obj = {}) {
  const alias = Object.assign({
    timestamp: Date.now()
  }, obj)
  alias.hash = crypto.hashObj(alias)
  return alias
}

// CREATE THE INITIAL NETWORK ACCOUNT
function createNetworkAccount (obj = {}) {
  const account = Object.assign({
    timestamp: Date.now(),
    id: '0'.repeat(64),
    nodeRewardInterval: ONE_MINUTE,
    nodeRewardAmount: 10,
    nodePenalty: 100,
    transactionFee: 0.001,
    stakeRequired: 500,
    maintenanceInterval: ONE_MINUTE * 2,
    maintenanceFee: 0.0001,
    proposalFee: 500,
    devProposalFee: 20,
    issueCount: 0,
    devIssueCount: 0,
    developerFund: []
  }, obj)
  account.hash = crypto.hashObj(account)
  return account
}

// CREATE AN ISSUE ACCOUNT
function createIssue (obj = {}) {
  const issue = Object.assign({
    timestamp: Date.now(),
    proposals: [],
    proposalCount: 0
  }, obj)
  issue.hash = crypto.hashObj(issue)
  return issue
}

// CREATE A DEV_ISSUE ACCOUNT
function createDevIssue (obj = {}) {
  const devIssue = Object.assign({
    timestamp: Date.now(),
    devProposals: [],
    winners: [],
    devProposalCount: 0
  }, obj)
  devIssue.hash = crypto.hashObj(devIssue)
  return devIssue
}

// CREATE A PROPOSAL ACCOUNT
function createProposal (obj = {}) {
  const proposal = Object.assign({
    timestamp: Date.now(),
    power: 0
  }, obj)
  proposal.hash = crypto.hashObj(proposal)
  return proposal
}

// CREATE A DEV_PROPOSAL ACCOUNT
function createDevProposal (obj = {}) {
  const devProposal = Object.assign({
    timestamp: Date.now(),
    approve: 0,
    reject: 0
  }, obj)
  devProposal.hash = crypto.hashObj(devProposal)
  return devProposal
}

// API
dapp.registerExternalPost('inject', async (req, res) => {
  try {
    const result = dapp.put(req.body)
    res.json({ result })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('network/parameters/node', async (req, res) => {
  try {
    const parameters = {
      NODE_REWARD_INTERVAL,
      NODE_REWARD_AMOUNT,
      NODE_PENALTY,
      TRANSACTION_FEE,
      STAKE_REQUIRED,
      MAINTENANCE_INTERVAL,
      MAINTENANCE_FEE,
      PROPOSAL_FEE,
      DEV_PROPOSAL_FEE
    }
    res.json({ parameters })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('network/parameters', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    res.json({ parameters: network.data })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues', async (req, res) => {
  try {
    const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const issueCount = account.data.issueCount
    const issues = []
    for (let i = 1; i <= issueCount; i++) {
      let issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${i}`))
      issues.push(issue.data)
    }
    res.json({ issues })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues/latest', async (req, res) => {
  try {
    const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const count = account.data.issueCount
    const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${count}`))
    res.json({ issue: issue.data })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues/count', async (req, res) => {
  try {
    const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const issueCount = account.data.issueCount
    res.json({ issueCount })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues/dev', async (req, res) => {
  try {
    const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const devIssueCount = account.data.devIssueCount
    const devIssues = []
    for (let i = 1; i <= devIssueCount; i++) {
      let devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${i}`))
      devIssues.push(devIssue.data)
    }
    res.json({ devIssues })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues/dev/latest', async (req, res) => {
  try {
    const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const count = account.data.devIssueCount
    const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${count}`))
    res.json({ devIssue: devIssue.data })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('issues/dev/count', async (req, res) => {
  try {
    const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const devIssueCount = account.data.devIssueCount
    res.json({ devIssueCount })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const issueCount = network.data.issueCount
    const proposals = []
    for (let i = 1; i <= issueCount; i++) {
      let issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${i}`))
      let proposalCount = issue.data.proposalCount
      for (let j = 1; j <= proposalCount; j++) {
        let proposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${i}-proposal-${j}`))
        proposals.push(proposal.data)
      }
    }
    res.json({ proposals })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals/latest', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const issueCount = network.data.issueCount
    const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${issueCount}`))
    const proposalCount = issue.data.proposalCount
    const proposals = []
    for (let i = 1; i <= proposalCount; i++) {
      let proposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${issueCount}-proposal-${i}`))
      proposals.push(proposal.data)
    }
    res.json({ proposals })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals/count', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const issueCount = network.data.issueCount
    const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${issueCount}`))
    if (!issue) {
      res.json({ error: 'No issues have been created yet' })
    }
    const proposalCount = issue.data.proposalCount
    res.json({ proposalCount })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals/dev', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const devIssueCount = network.data.devIssueCount
    const devProposals = []
    for (let i = 1; i <= devIssueCount; i++) {
      let devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${i}`))
      let devProposalCount = devIssue.data.devProposalCount
      for (let j = 1; j <= devProposalCount; j++) {
        let devProposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${i}-dev-proposal-${j}`))
        devProposals.push(devProposal.data)
      }
    }
    res.json({ devProposals })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals/dev/latest', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const devIssueCount = network.data.devIssueCount
    const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${devIssueCount}`))
    const devProposalCount = issue.data.devProposalCount
    const devProposals = []
    for (let i = 1; i <= devProposalCount; i++) {
      let devProposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${devIssueCount}-dev-proposal-${i}`))
      devProposals.push(devProposal.data)
    }
    res.json({ devProposals })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('proposals/dev/count', async (req, res) => {
  try {
    const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
    const devIssueCount = network.data.devIssueCount
    const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${devIssueCount}`))
    if (!devIssue) {
      res.json({ error: 'No devIssues have been created yet' })
    }
    const devProposalCount = devIssue.data.devProposalCount
    res.json({ devProposalCount })
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id', async (req, res) => {
  try {
    const id = req.params['id']
    const account = await dapp.getLocalOrRemoteAccount(id)
    res.json({ account: account.data })
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id/alias', async (req, res) => {
  try {
    const id = req.params['id']
    const account = await dapp.getLocalOrRemoteAccount(id)
    res.json({ handle: account.data.alias })
  } catch (error) {
    res.json({ error })
  }
})

dapp.registerExternalGet('account/:id/balance', async (req, res) => {
  try {
    const id = req.params['id']
    const account = await dapp.getLocalOrRemoteAccount(id)
    if (account) {
      res.json({ balance: account.data.data.balance })
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
    console.log(error)
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
    res.json({ error: 'No provided id in the route: account/:id/:friendId/toll' })
  }
  if (!friendId) {
    res.json({ error: 'No provided friendId in the route: account/:id/:friendId/toll' })
  }
  try {
    const account = await dapp.getLocalOrRemoteAccount(id)
    if (account && account.data.data.friends[friendId]) {
      res.json({ toll: 1 })
    } else if (account) {
      res.json({ toll: account.data.data.toll })
    } else {
      res.json({ error: 'No account found with the given id' })
    }
  } catch (error) {
    console.log(error)
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
    console.log(error)
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

dapp.registerExternalGet('messages/:accountId/:chatId', async (req, res) => {
  try {
    const { accountId, chatId } = req.params
    const account = await dapp.getLocalOrRemoteAccount(accountId)
    if (!account) {
      res.json({ error: "Account doesn't exist" })
      return
    }
    if (!account.data.data.chats[chatId]) {
      res.json({ error: 'no chat history for this request' })
    } else {
      let messages = [...account.data.data.chats[chatId].messages]
      res.json({ messages })
    }
  } catch (error) {
    console.log(error)
    res.json({ error })
  }
})

// SDK SETUP FUNCTIONS
dapp.setup({
  validateTransaction (tx, wrappedStates) {
    const response = {
      result: 'fail',
      reason: 'Transaction is not valid.'
    }

    const from = wrappedStates[tx.from] && wrappedStates[tx.from].data
    const to = wrappedStates[tx.to] && wrappedStates[tx.to].data

    switch (tx.type) {
      case 'snapshot': {
        if (tx.sign.owner !== ADMIN_ADDRESS) {
          response.reason = 'not signed by ADMIN account'
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
        if (alias.inbox === tx.alias) {
          response.reason = 'This alias is already taken'
          return response
        }
        if (tx.alias && tx.alias.length >= 17) {
          response.reason = 'Alias must be less than 17 characters'
          return response
        }
        if (from.data.balance < TRANSACTION_FEE) {
          response.reason = "From account doesn't have enough tokens to cover the transaction fee"
          return response
        }
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
          response.reason = 'create amount needs to be positive'
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
        if (from.data.balance < tx.amount + TRANSACTION_FEE) {
          response.reason = "from account doesn't have sufficient balance to cover the transaction"
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'distribute': {
        const recipients = tx.recipients.map(recipientId => wrappedStates[recipientId].data)
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
        if (from.data.balance < (recipients.length * tx.amount) + TRANSACTION_FEE) {
          response.reason = "from account doesn't have sufficient balance to cover the transaction"
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
          if (from.data.balance < to.data.toll + TRANSACTION_FEE) {
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
        if (from.data.balance < TRANSACTION_FEE) {
          response.reason = 'from account does not have sufficient funds to complete toll transaction'
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
        if (from.data.balance < TRANSACTION_FEE) {
          response.reason = "From account doesn't have enough tokens to cover the transaction fee"
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
        if (from.data.balance < TRANSACTION_FEE) {
          response.reason = "From account doesn't have enough tokens to cover the transaction fee"
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
        if (tx.stake < STAKE_REQUIRED) {
          response.reason = 'Stake requirement not met'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'node_reward': {
        let nodeInfo
        try {
          nodeInfo = dapp.getNode(tx.nodeId)
        } catch (err) {
          console.log(err)
        }
        if (!nodeInfo) {
          response.reason = 'no nodeInfo'
          return response
        }
        if (tx.timestamp - nodeInfo.activeTimestamp < NODE_REWARD_INTERVAL) {
          response.reason = 'Too early for this node to get paid'
          return response
        }
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
          if (tx.timestamp - from.nodeRewardTime < NODE_REWARD_INTERVAL) {
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
          response.reason = 'Snapshot account does not exist yet, OR wrong snapshot address provided in the "to" field'
          return response
        }
        if (!to.snapshot) {
          response.reason = 'Snapshot hasnt been taken yet'
          return response
        }
        if (!to.snapshot[tx.from]) {
          response.reason = 'Your address did not hold any ULT on the Ethereum blockchain during the snapshot'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'initial_parameters': {
        if (tx.sign.owner !== ADMIN_ADDRESS) {
          response.reason = 'not signed by ADMIN account'
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
        if (tx.to !== '0'.repeat(64)) {
          response.reason = 'incorrect "to" address'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'update_parameters': {
        if (tx.sign.owner !== ADMIN_ADDRESS) {
          response.reason = 'not signed by ADMIN account'
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
        if (tx.to !== '0'.repeat(64)) {
          response.reason = 'incorrect "to" address'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'maintenance': {
        let nodeInfo
        try {
          nodeInfo = dapp.getNode(tx.nodeId)
        } catch (err) {
          console.log(err)
        }
        if (!nodeInfo) {
          response.reason = 'no nodeInfo'
          return response
        }
        const targets = tx.targets.map(targetId => wrappedStates[targetId].data)
        for (const target of targets) {
          if (target.lastMaintenance) {
            if (tx.timestamp - target.lastMaintenance < MAINTENANCE_INTERVAL) {
              response.reason = 'Too early for account maintenance'
              return response
            }
          }
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'issue': {
        let nodeInfo
        try {
          nodeInfo = dapp.getNode(tx.nodeId)
        } catch (err) {
          console.log(err)
        }
        if (!nodeInfo) {
          response.reason = 'no nodeInfo'
          return response
        }
        if (tx.to !== '0'.repeat(64)) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (crypto.hash(`issue-${to.issueCount + 1}`) !== tx.issue) {
          response.reason = 'Must give the next network issueCount hash'
          return response
        }
        if (crypto.hash(`issue-${to.issueCount + 1}-proposal-1`) !== tx.proposal) {
          response.reason = 'Must include the default proposal for the current network parameters'
          return response
        }
        if (tx.timestamp - to.lastIssueTime < ONE_MINUTE * 4) {
          response.reason = 'Has not been long enough since the last issue was voted on'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_issue': {
        let nodeInfo
        try {
          nodeInfo = dapp.getNode(tx.nodeId)
        } catch (err) {
          console.log(err)
        }
        if (!nodeInfo) {
          response.reason = 'no nodeInfo'
          return response
        }
        if (tx.to !== '0'.repeat(64)) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (crypto.hash(`dev-issue-${to.devIssueCount + 1}`) !== tx.devIssue) {
          response.reason = 'Must give the next network issueCount hash'
          return response
        }
        if (tx.timestamp - to.lastDevIssueTime < ONE_MINUTE * 4) {
          response.reason = 'Has not been long enough since the last devIssue was voted on'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'proposal': {
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
          response.reason = "Issue doesn't exist"
          return response
        }
        if (!issue.active) {
          response.reason = 'This issue is no longer active'
          return response
        }
        if (tx.proposal !== crypto.hash(`issue-${issue.number}-proposal-${issue.proposalCount + 1}`)) {
          response.reason = 'Must give the next issue proposalCount hash'
          return response
        }
        if (tx.timestamp < PROPOSAL_WINDOW[0] || tx.timestamp > PROPOSAL_WINDOW[1]) {
          response.reason = 'Network is not accepting proposals at this time'
          return response
        }
        if (from.data.balance < PROPOSAL_FEE) {
          response.reason = 'From account has insufficient balance to submit a proposal'
          return response
        }
        if (tx.amount < PROPOSAL_FEE) {
          response.reason = 'Insufficient amount sent in the transaction to submit a proposal'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_proposal': {
        const devIssue = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data

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
        if (tx.devProposal !== crypto.hash(`dev-issue-${devIssue.number}-dev-proposal-${devIssue.devProposalCount + 1}`)) {
          response.reason = 'Must give the next devIssue devProposalCount hash'
          return response
        }
        if (tx.timestamp < DEV_PROPOSAL_WINDOW[0] || tx.timestamp > DEV_PROPOSAL_WINDOW[1]) {
          response.reason = 'Network is not accepting devProposals at this time'
          return response
        }
        if (from.data.balance < DEV_PROPOSAL_FEE) {
          response.reason = 'From account has insufficient balance to submit a devProposal'
          return response
        }
        if (tx.amount < DEV_PROPOSAL_FEE) {
          response.reason = 'Insufficient amount sent in the transaction to submit a devProposal'
          return response
        }
        if (tx.payments.reduce((acc, payment) => acc + payment.amount) > 1) {
          response.reason = 'tx payment amounts added up to more than 100%'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'vote': {
        const issue = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        const proposal = wrappedStates[tx.proposal] && wrappedStates[tx.proposal].data

        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (tx.timestamp < VOTING_WINDOW[0] || tx.timestamp > VOTING_WINDOW[1]) {
          response.reason = 'Network is not accepting votes at this time'
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
        if (!proposal) {
          response.reason = "Proposal doesn't exist"
          return response
        }
        if (tx.amount <= 0) {
          response.reason = 'Must send tokens to vote'
          return response
        }
        if (from.data.balance < tx.amount) {
          response.reason = 'From account has insufficient balance to cover the amount sent in the transaction'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_vote': {
        const devIssue = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
        const devProposal = wrappedStates[tx.devProposal] && wrappedStates[tx.devProposal].data

        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (tx.timestamp < DEV_VOTING_WINDOW[0] || tx.timestamp > DEV_VOTING_WINDOW[1]) {
          response.reason = 'Network is not accepting dev votes at this time'
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
        if (!devProposal) {
          response.reason = "devProposal doesn't exist"
          return response
        }
        if (tx.approve !== true && tx.approve !== false) {
          response.reason = 'Must specify approval tx.approve = (true | false)'
          return response
        }
        if (tx.amount <= 0) {
          response.reason = 'Must send tokens in order to vote'
          return response
        }
        if (from.data.balance < tx.amount) {
          response.reason = 'From account has insufficient balance to cover the amount sent in the transaction'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'tally': {
        const issue = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        const proposals = tx.proposals.map(id => wrappedStates[id].data)

        let nodeInfo
        try {
          nodeInfo = dapp.getNode(tx.nodeId)
        } catch (err) {
          console.log(err)
        }
        if (!nodeInfo) {
          response.reason = 'no nodeInfo'
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
        if (WINNER_FOUND) {
          response.reason = 'The winner for this issue has already been determined'
          return response
        }
        if (issue.winner) {
          response.reason = 'The winner for this issue has already been determined'
          return response
        }
        if (tx.to !== '0'.repeat(64)) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (proposals.length !== issue.proposalCount) {
          response.reason = 'The number of proposals sent in with the transaction dont match the issues proposalCount'
          return response
        }
        if (tx.timestamp < GRACE_WINDOW[0] || tx.timestamp > GRACE_WINDOW[1]) {
          response.reason = 'Network is not ready for determining a winner at this time'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_tally': {
        const devIssue = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
        const devProposals = tx.devProposals.map(id => wrappedStates[id].data)

        let nodeInfo
        try {
          nodeInfo = dapp.getNode(tx.nodeId)
        } catch (err) {
          console.log(err)
        }
        if (!nodeInfo) {
          response.reason = 'no nodeInfo'
          return response
        }
        if (!devIssue) {
          response.reason = "Issue doesn't exist"
          return response
        }
        if (!devIssue.active) {
          response.reason = 'This devIssue is no longer active'
          return response
        }
        if (DEV_WINNERS_FOUND) {
          response.reason = 'The winners for this devIssue has already been determined'
          return response
        }
        if (devIssue.winners.length > 0) {
          response.reason = 'The winners for this devIssue has already been determined'
          return response
        }
        if (tx.to !== '0'.repeat(64)) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (devProposals.length !== devIssue.devProposalCount) {
          response.reason = 'The number of devProposals sent in with the transaction dont match the devIssue proposalCount'
          return response
        }
        if (tx.timestamp < DEV_GRACE_WINDOW[0] || tx.timestamp > DEV_GRACE_WINDOW[1]) {
          response.reason = 'Network is not ready for determining devProposal winners at this time'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_parameters': {
        const issue = wrappedStates[tx.issue].data
        const proposal = wrappedStates[tx.proposal].data

        let nodeInfo
        try {
          nodeInfo = dapp.getNode(tx.nodeId)
        } catch (err) {
          console.log(err)
        }
        if (!nodeInfo) {
          response.reason = 'no nodeInfo'
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
        if (tx.to !== '0'.repeat(64)) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (issue.winner !== proposal.id) {
          response.reason = 'This proposal was not the winner for this issue'
          return response
        }
        if (tx.timestamp < APPLY_WINDOW[0] || tx.timestamp > APPLY_WINDOW[1]) {
          response.reason = 'Network is not ready to apply winning parameters'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_dev_parameters': {
        const devIssue = wrappedStates[tx.devIssue].data
        const devProposals = tx.devProposals.map(id => wrappedStates[id].data)

        let nodeInfo
        try {
          nodeInfo = dapp.getNode(tx.nodeId)
        } catch (err) {
          console.log(err)
        }
        if (!nodeInfo) {
          response.reason = 'no nodeInfo'
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
        if (tx.to !== '0'.repeat(64)) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (tx.timestamp < DEV_APPLY_WINDOW[0] || tx.timestamp > DEV_APPLY_WINDOW[1]) {
          response.reason = 'Network is not ready to apply winning devProposals'
          return response
        }
        for (const devProposal of devProposals) {
          if (!devProposal.approved) {
            response.reason = 'One of the devProposals was not approved'
            return response
          }
          if (!devIssue.winners.includes(devProposal.id)) {
            response.reason = 'One of the devProposals sent with this transaction was not approved'
            return response
          }
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'developer_payment': {
        let nodeInfo
        try {
          nodeInfo = dapp.getNode(tx.nodeId)
        } catch (err) {
          console.log(err)
        }
        if (!nodeInfo) {
          response.reason = 'no nodeInfo'
          return response
        }
        if (tx.to !== '0'.repeat(64)) {
          response.reason = 'To account must be the network account'
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
        let found = false
        for (const payment of to.developerFund) {
          if (payment.id === tx.payment.id) {
            found = true
          }
        }
        if (!found) {
          response.reason = 'This payment was already recieved by the developer'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
    }
  },
  validateTxnFields (tx) {
    // Validate tx fields here
    let result = 'pass'
    let reason = ''
    let txnTimestamp = tx.timestamp

    if (typeof tx.type !== 'string') {
      result = 'fail'
      reason = '"type" must be a string.'
      throw new Error(reason)
    }
    if (!tx.from || typeof tx.from !== 'string') {
      result = 'fail'
      reason = '"srcAddress" must be a string.'
      throw new Error(reason)
    }
    switch (tx.type) {
      case 'message': {
        if (typeof tx.to !== 'string') {
          result = 'fail'
          reason = '"to" is not a string'
          throw new Error(reason)
        }
        if (!tx.to) {
          result = 'fail'
          reason = '"to" does not exist'
          throw new Error(reason)
        }
        break
      }
    }
    if (tx.amount && typeof tx.amount !== 'number') {
      result = 'fail'
      reason = '"amount" must be a number.'
      throw new Error(reason)
    }
    if (typeof txnTimestamp !== 'number') {
      result = 'fail'
      reason = '"timestamp" must be a number.'
      throw new Error(reason)
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
      throw new Error(`invalid transaction, reason: ${reason}. tx: ${stringify(tx)}`)
    }

    // Create an applyResponse which will be used to tell Shardus that the tx has been applied
    const txId = crypto.hashObj(tx) // compute from tx
    const applyResponse = dapp.createApplyResponse(txId, tx.timestamp)

    // Apply the tx
    switch (tx.type) {
      case 'snapshot': {
        to.snapshot = tx.snapshot
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        console.log('Applied snapshot tx', txId, to)
        break
      }
      case 'register': {
        let alias = wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data
        from.data.balance -= TRANSACTION_FEE
        alias.inbox = tx.alias
        from.alias = tx.alias
        alias.address = tx.from
        from.data.transactions.push({ ...tx, txId })
        alias.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        console.log('Applied register tx', txId, from)
        break
      }
      case 'create': {
        to.data.balance += tx.amount
        to.timestamp = tx.timestamp

        to.data.transactions.push({ ...tx, txId })
        console.log('Applied create tx', txId, to)
        break
      }
      case 'transfer': {
        from.data.balance -= (tx.amount + TRANSACTION_FEE)
        to.data.balance += tx.amount
        from.data.transactions.push({ ...tx, txId })
        to.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        console.log('Applied transfer tx', txId, from, to)
        break
      }
      case 'distribute': {
        const recipients = tx.recipients.map(recipientId => wrappedStates[recipientId].data)
        from.data.balance -= TRANSACTION_FEE
        from.data.transactions.push({ ...tx, txId })
        recipients.forEach(recipient => {
          from.data.balance -= tx.amount
          recipient.data.balance += tx.amount
          recipient.data.transactions.push({ ...tx, txId })
        })
        console.log('Applied distribute transaction', txId, from, recipients)
        break
      }
      case 'message': {
        if (to.data.friends[from.id]) {
          from.data.balance -= (1 + TRANSACTION_FEE)
          to.data.balance += 1
        } else {
          from.data.balance -= (to.data.toll + TRANSACTION_FEE)
          to.data.balance += to.data.toll
        }

        if (!from.data.chats[tx.to]) from.data.chats[tx.to] = { messages: [tx.message] }
        else from.data.chats[tx.to].messages.push(tx.message)

        if (!to.data.chats[tx.from]) to.data.chats[tx.from] = { messages: [tx.message] }
        else to.data.chats[tx.from].messages.push(tx.message)

        from.data.transactions.push({ ...tx, txId })
        to.data.transactions.push({ ...tx, txId })

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp

        console.log('Applied message tx', txId, from, to)
        break
      }
      case 'toll': {
        from.data.balance -= TRANSACTION_FEE
        from.data.toll = tx.toll
        from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        console.log('Applied toll tx', txId, from)
        break
      }
      case 'friend': {
        from.data.balance -= TRANSACTION_FEE
        from.data.friends[tx.to] = tx.alias
        from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        console.log('Applied friend tx', txId, from)
        break
      }
      case 'remove_friend': {
        from.data.friends[tx.to] = null
        from.timestamp = tx.timestamp
        from.data.transactions.push({ ...tx, txId })
        console.log('Applied remove_friend tx', txId, from)
        break
      }
      case 'stake': {
        from.data.balance -= tx.stake
        from.data.stake = tx.stake
        from.timestamp = tx.timestamp
        from.data.transactions.push({ ...tx, txId })
        console.log('Applied bond tx', txId, from)
        break
      }
      case 'node_reward': {
        to.balance += NODE_REWARD_AMOUNT
        from.nodeRewardTime = tx.timestamp
        to.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        console.log('Applied node_reward tx', txId, from, to)
        break
      }
      case 'snapshot_claim': {
        from.data.balance += to.snapshot[tx.from]
        to.snapshot[tx.from] = 0
        from.data.transactions.push({ ...tx, txId });
        from.claimedSnapshot = true
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        console.log('Applied snapshot_claim tx', txId, from, to)
        break
      }
      case 'initial_parameters': {
        NODE_REWARD_INTERVAL = to.nodeRewardInterval
        NODE_REWARD_AMOUNT = to.nodeRewardAmount
        NODE_PENALTY = to.nodePenalty
        TRANSACTION_FEE = to.transactionFee
        STAKE_REQUIRED = to.stakeRequired
        MAINTENANCE_INTERVAL = to.maintenanceInterval
        MAINTENANCE_FEE = to.maintenanceFee
        PROPOSAL_FEE = to.proposalFee
        DEV_PROPOSAL_FEE = to.devProposalFee

        to.lastIssueTime = tx.timestamp - (ONE_MINUTE * 4)
        to.lastDevIssueTime = tx.timestamp - (ONE_MINUTE * 4)
        // to.proposalWindow = [to.lastIssueTime, to.lastIssueTime + ONE_MINUTE]
        // to.devProposalWindow = [to.lastDevIssueTime, to.lastDevIssueTime + ONE_MINUTE]
        // to.votingWindow = [to.proposalWindow[1], to.proposalWindow[1] + ONE_MINUTE]
        // to.devVotingWindow = [to.devProposalWindow[1], to.devProposalWindow[1] + ONE_MINUTE]
        // to.graceWindow = [to.votingWindow[1], to.votingWindow[1] + ONE_MINUTE]
        // to.devGraceWindow = [to.devVotingWindow[1], to.devVotingWindow[1] + ONE_MINUTE]
        // to.applyWindow = [to.graceWindow[1], to.graceWindow[1] + ONE_MINUTE]
        // to.devApplyWindow = [to.devGraceWindow[1], to.devGraceWindow[1] + ONE_MINUTE]

        LAST_ISSUE_TIME = to.lastIssueTime
        LAST_DEV_ISSUE_TIME = to.lastDevIssueTime
        // PROPOSAL_WINDOW = to.proposalWindow
        // DEV_PROPOSAL_WINDOW = to.proposalWindow
        // VOTING_WINDOW = to.votingWindow
        // DEV_VOTING_WINDOW = to.votingWindow
        // GRACE_WINDOW = to.graceWindow
        // DEV_GRACE_WINDOW = to.graceWindow
        // APPLY_WINDOW = to.applyWindow
        // DEV_APPLY_WINDOW = to.applyWindow

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        console.log('Applied initial_parameters tx', txId, from, to)
        break
      }
      case 'update_parameters': {
        to.nodeRewardInterval = tx.nodeRewardInterval
        to.nodeRewardAmount = tx.nodeRewardAmount
        to.nodePenalty = tx.nodePenalty
        to.transactionFee = tx.transactionFee
        to.stakeRequired = tx.stakeRequired
        to.maintenanceInterval = tx.maintenanceInterval
        to.maintenanceFee = tx.maintenanceFee
        to.devFundInterval = tx.devFundInterval
        to.devFundAmount = tx.devFundAmount
        to.proposalFee = tx.proposalFee
        to.expenditureFee = tx.expenditureFee

        NODE_REWARD_INTERVAL = to.nodeRewardInterval
        NODE_REWARD_AMOUNT = to.nodeRewardAmount
        NODE_PENALTY = to.nodePenalty
        TRANSACTION_FEE = to.transactionFee
        STAKE_REQUIRED = to.stakeRequired
        MAINTENANCE_INTERVAL = to.maintenanceInterval
        MAINTENANCE_FEE = to.maintenanceFee
        PROPOSAL_FEE = to.proposalFee
        DEV_PROPOSAL_FEE = to.devProposalFee

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        console.log('Applied update_parameters tx', txId, from, to)
        break
      }
      case 'maintenance': {
        const targets = tx.targets.map(targetId => wrappedStates[targetId].data)

        for (const target of targets) {
          if (target.data && target.data.balance > 0) {
            target.data.balance -= target.data.balance * MAINTENANCE_FEE
            target.lastMaintenance = tx.timestamp
            target.timestamp = tx.timestamp
          }
        }

        console.log('Applied maintenance transaction', txId, from, targets)
        break
      }
      case 'issue': {
        const issue = wrappedStates[tx.issue].data
        const proposal = wrappedStates[tx.proposal].data

        proposal.nodeRewardInterval = to.nodeRewardInterval
        proposal.nodeRewardAmount = to.nodeRewardAmount
        proposal.nodePenalty = to.nodePenalty
        proposal.transactionFee = to.transactionFee
        proposal.stakeRequired = to.stakeRequired
        proposal.maintenanceInterval = to.maintenanceInterval
        proposal.maintenanceFee = to.maintenanceFee
        proposal.devFundInterval = to.devFundInterval
        proposal.devFundAmount = to.devFundAmount
        proposal.proposalFee = to.proposalFee
        proposal.devProposalFee = to.devProposalFee
        proposal.power = 0
        proposal.totalVotes = 0
        proposal.number = 1

        to.lastIssueTime = tx.timestamp
        to.proposalWindow = [to.lastIssueTime, to.lastIssueTime + ONE_MINUTE]
        to.votingWindow = [to.proposalWindow[1], to.proposalWindow[1] + ONE_MINUTE]
        to.graceWindow = [to.votingWindow[1], to.votingWindow[1] + ONE_MINUTE]
        to.applyWindow = [to.graceWindow[1], to.graceWindow[1] + ONE_MINUTE]
        to.winnerFound = false
        to.paramsApplied = false

        LAST_ISSUE_TIME = to.lastIssueTime
        PROPOSAL_WINDOW = to.proposalWindow
        VOTING_WINDOW = to.votingWindow
        GRACE_WINDOW = to.graceWindow
        APPLY_WINDOW = to.applyWindow
        WINNER_FOUND = false
        PARAMS_APPLIED = false

        to.issueCount++
        issue.number = to.issueCount
        issue.proposals.push(proposal.id)
        issue.proposalCount++
        issue.active = true
        issue.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        console.log('Applied issue tx', from, to, issue)
        break
      }
      case 'dev_issue': {
        const devIssue = wrappedStates[tx.devIssue].data

        to.lastDevIssueTime = tx.timestamp
        to.devProposalWindow = [to.lastDevIssueTime, to.lastDevIssueTime + ONE_MINUTE]
        to.devVotingWindow = [to.devProposalWindow[1], to.devProposalWindow[1] + ONE_MINUTE]
        to.devGraceWindow = [to.devVotingWindow[1], to.devVotingWindow[1] + ONE_MINUTE]
        to.devApplyWindow = [to.devGraceWindow[1], to.devGraceWindow[1] + ONE_MINUTE]
        to.devWinnersFound = false
        to.devParamsApplied = false

        LAST_DEV_ISSUE_TIME = to.lastDevIssueTime
        DEV_PROPOSAL_WINDOW = to.devProposalWindow
        DEV_VOTING_WINDOW = to.devVotingWindow
        DEV_GRACE_WINDOW = to.devGraceWindow
        DEV_APPLY_WINDOW = to.devApplyWindow
        DEV_WINNERS_FOUND = false
        DEV_PARAMS_APPLIED = false

        to.devIssueCount++
        devIssue.number = to.devIssueCount
        devIssue.active = true
        devIssue.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        console.log('Applied dev_issue tx', from, to, devIssue)
        break
      }
      case 'proposal': {
        const proposal = wrappedStates[tx.proposal].data
        const issue = wrappedStates[tx.issue].data
        from.data.balance -= PROPOSAL_FEE
        proposal.nodeRewardInterval = tx.parameters.nodeRewardInterval
        proposal.nodeRewardAmount = tx.parameters.nodeRewardAmount
        proposal.nodePenalty = tx.parameters.nodePenalty
        proposal.transactionFee = tx.parameters.transactionFee
        proposal.stakeRequired = tx.parameters.stakeRequired
        proposal.maintenanceInterval = tx.parameters.maintenanceInterval
        proposal.maintenanceFee = tx.parameters.maintenanceFee
        proposal.proposalFee = tx.parameters.proposalFee
        proposal.devProposalFee = tx.parameters.devProposalFee
        proposal.number = issue.proposalCount + 1
        proposal.totalVotes = 0
        issue.proposals.push(proposal.id)
        issue.proposalCount++

        from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        console.log('Applied proposal tx', txId, from, issue, proposal)
        break
      }
      case 'dev_proposal': {
        const devIssue = wrappedStates[tx.devIssue].data
        const devProposal = wrappedStates[tx.devProposal].data
        from.data.balance -= DEV_PROPOSAL_FEE

        devProposal.totalAmount = tx.totalAmount
        devProposal.payAddress = tx.payAddress
        devProposal.description = tx.description
        devProposal.payments = tx.payments

        devProposal.number = devIssue.devProposalCount + 1
        devProposal.totalVotes = 0
        devIssue.devProposals.push(devProposal.id)
        devIssue.devProposalCount++

        from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        devProposal.timestamp = tx.timestamp
        console.log('Applied dev_proposal tx', txId, from, devIssue, devProposal)
        break
      }
      case 'vote': {
        const proposal = wrappedStates[tx.proposal].data
        from.data.balance -= tx.amount
        proposal.power += tx.amount
        proposal.totalVotes++

        from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        console.log('Applied vote tx', txId, from, proposal)
        break
      }
      case 'dev_vote': {
        const devProposal = wrappedStates[tx.devProposal].data
        from.data.balance -= tx.amount
        if (tx.approve) {
          devProposal.approve += tx.amount
        } else {
          devProposal.reject += tx.amount
        }

        from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        devProposal.timestamp = tx.timestamp
        console.log('Applied dev_vote tx', txId, from, devProposal)
        break
      }
      case 'tally': {
        const issue = wrappedStates[tx.issue].data
        const margin = (100 / (2 * (issue.proposalCount + 1))) / 100
        let defaultProposal = wrappedStates[crypto.hash(`issue-${issue.number}-proposal-1`)].data
        let sortedProposals = tx.proposals.map(id => wrappedStates[id].data).sort((a, b) => a.power < b.power)
        let winner

        for (const proposal of sortedProposals) {
          proposal.winner = false
        }

        if (sortedProposals.length >= 2) {
          const firstPlace = sortedProposals[0]
          const secondPlace = sortedProposals[1]
          const marginToWin = secondPlace.power + (margin * secondPlace.power)
          if (firstPlace.power > marginToWin) {
            winner = firstPlace
          } else {
            winner = defaultProposal
          }
        } else {
          winner = defaultProposal
        }

        winner.winner = true // CHICKEN DINNER
        issue.winner = winner.id
        to.winnerFound = true
        WINNER_FOUND = true
        to.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        winner.timestamp = tx.timestamp
        console.log('Applied tally tx', txId, issue, winner)
        break
      }
      case 'dev_tally': {
        const devIssue = wrappedStates[tx.devIssue].data
        const devProposals = tx.devProposals.map(id => wrappedStates[id].data)

        for (const devProposal of devProposals) {
          if (devProposal.approve > (devProposal.reject + (devProposal.reject * 0.15))) {
            devProposal.approved = true
            devIssue.winners.push(devProposal.id)
            devProposal.timestamp = tx.timestamp
          } else {
            devProposal.approved = false
            devProposal.timestamp = tx.timestamp
          }
        }

        to.devWinnersFound = true
        DEV_WINNERS_FOUND = true
        to.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        console.log('Applied dev_tally tx', txId, from, to, devIssue, devProposals)
        break
      }
      case 'apply_parameters': {
        const issue = wrappedStates[tx.issue].data
        const winner = wrappedStates[tx.proposal].data

        to.nodeRewardInterval = winner.nodeRewardInterval
        to.nodeRewardAmount = winner.nodeRewardAmount
        to.nodePenalty = winner.nodePenalty
        to.transactionFee = winner.transactionFee
        to.stakeRequired = winner.stakeRequired
        to.maintenanceInterval = winner.maintenanceInterval
        to.maintenanceFee = winner.maintenanceFee
        to.proposalFee = winner.proposalFee
        to.devProposalFee = winner.devProposalFee
        to.paramsApplied = true

        NODE_REWARD_INTERVAL = winner.nodeRewardInterval
        NODE_REWARD_AMOUNT = winner.nodeRewardAmount
        NODE_PENALTY = winner.nodePenalty
        TRANSACTION_FEE = winner.transactionFee
        STAKE_REQUIRED = winner.stakeRequired
        MAINTENANCE_INTERVAL = winner.maintenanceInterval
        MAINTENANCE_FEE = winner.maintenanceFee
        PROPOSAL_FEE = winner.proposalFee
        DEV_PROPOSAL_FEE = winner.devProposalFee
        PARAMS_APPLIED = true

        issue.active = false
        to.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        winner.timestamp = tx.timestamp
        console.log('Applied apply_parameters tx', txId, issue, winner, to)
        break
      }
      case 'apply_dev_parameters': {
        const devIssue = wrappedStates[tx.devIssue].data
        const devProposals = tx.devProposals.map(id => wrappedStates[id].data)

        for (const devProposal of devProposals) {
          let payments = []
          for (const payment of devProposal.payments) {
            payments.push({
              timestamp: tx.timestamp + payment.delay,
              amount: payment.amount * devProposal.totalAmount,
              address: devProposal.payAddress,
              id: crypto.randomBytes()
            })
          }
          to.developerFund = [...to.developerFund, ...payments]
          devProposal.timestamp = tx.timestamp
        }

        to.developerFund.sort((a, b) => a.timestamp - b.timestamp)
        to.devParamsApplied = true
        DEV_PARAMS_APPLIED = true
        DEVELOPER_FUND = to.developerFund
        devIssue.active = false
        to.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        console.log('Applied apply_dev_parameters tx', txId, devIssue, devProposals, to)
        break
      }
      case 'developer_payment': {
        const developer = wrappedStates[tx.developer].data

        developer.data.balance += tx.payment.amount
        to.developerFund = to.developerFund.filter(payment => payment.id !== tx.payment.id)
        DEVELOPER_FUND = to.developerFund

        developer.data.transactions.push({ ...tx, txId })
        developer.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        console.log('Applied developer_payment tx', txId, developer, to)
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
      case 'register':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.aliasHash]
        break
      case 'create':
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
        result.targetKeys = [tx.to]
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
      case 'initial_parameters':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'update_parameters':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'maintenance':
        result.sourceKeys = [tx.from]
        result.targetKeys = tx.targets
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
      case 'dev_tally': {
        result.sourceKeys = [tx.from]
        result.targetKeys = [...tx.devProposals, tx.devIssue, tx.to]
        break
      }
      case 'apply_parameters': {
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.issue, tx.proposal]
        break
      }
      case 'apply_dev_parameters': {
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.devIssue, ...tx.devProposals]
        break
      }
      case 'developer_payment': {
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.developer]
        break
      }
    }
    result.allKeys = result.allKeys.concat(result.sourceKeys, result.targetKeys)
    return result
  },
  getStateId (accountAddress, mustExist = true) {
    const account = accounts[accountAddress]
    if ((typeof account === 'undefined' || account === null) && mustExist === true) {
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
      if (tx.type === 'dev_proposal') {
        if (accountId === tx.devProposal) {
          account = createDevProposal({
            id: accountId,
            timestamp: 0
          })
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'dev_issue') {
        if (accountId === tx.devIssue) {
          account = createDevIssue({
            id: accountId,
            timestamp: 0
          })
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'proposal') {
        if (accountId === tx.proposal) {
          account = createProposal({
            id: accountId,
            timestamp: 0
          })
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'issue') {
        if (accountId === tx.issue) {
          account = createIssue({
            id: accountId,
            timestamp: 0
          })
          accounts[accountId] = account
          accountCreated = true
        }
        if (accountId === tx.proposal) {
          account = createProposal({
            id: accountId,
            timestamp: 0
          })
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'node_reward') {
        if (accountId === tx.from && accountId === tx.to) {
          account = createNode({
            id: accountId,
            timestamp: 0
          })
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'register') {
        if (accountId === tx.aliasHash) {
          account = createAlias({
            id: accountId,
            timestamp: 0
          })
          accounts[accountId] = account
          accountCreated = true
        }
      }
      if (tx.type === 'initial_parameters') {
        if (accountId === '0'.repeat(64)) {
          account = createNetworkAccount({
            id: accountId,
            timestamp: 0
          })
          accounts[accountId] = account
          accountCreated = true
        } else {
          account = createAccount({
            id: accountId,
            timestamp: 0
          })
          accounts[accountId] = account
          accountCreated = true
        }
      }
    }
    if (typeof account === 'undefined' || account === null) {
      if (tx.nodeId) {
        account = createNode({
          id: accountId,
          timestamp: 0
        })
        accounts[accountId] = account
        accountCreated = true
      } else {
        account = createAccount({
          id: accountId,
          timestamp: 0
        })
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
    // updatedAccount.hash = '' DON'T THINK THIS IS NECESSARY
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
    // account.hash = '' ? ?
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
    console.log('Shutting down server...')
  }
})

dapp.registerExceptionHandler()

// HELPER METHOD TO WAIT
async function _sleep (ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// NODE_REWARD TRANSACTION FUNCTION
function nodeReward () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const payAddress = address
  const tx = {
    type: 'node_reward',
    timestamp: Date.now(),
    nodeId: nodeId,
    from: address,
    to: payAddress,
    amount: NODE_REWARD_AMOUNT
  }
  dapp.put(tx)
}

// MAINTENANCE TRANSACTION FUNCTION
function maintenance () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  let targets = Object.keys(accounts).filter(target => target !== address)
  const tx = {
    type: 'maintenance',
    nodeId: nodeId,
    from: address,
    targets: targets,
    timestamp: Date.now()
  }
  dapp.put(tx)
}

// ISSUE TRANSACTION FUNCTION
async function generateIssue () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = account.data.issueCount
  const tx = {
    type: 'issue',
    nodeId,
    from: address,
    to: '0'.repeat(64),
    issue: crypto.hash(`issue-${count + 1}`),
    proposal: crypto.hash(`issue-${count + 1}-proposal-1`),
    timestamp: Date.now()
  }
  dapp.put(tx)
}

// DEV_ISSUE TRANSACTION FUNCTION
async function generateDevIssue () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = account.data.devIssueCount
  const tx = {
    type: 'dev_issue',
    nodeId,
    from: address,
    to: '0'.repeat(64),
    devIssue: crypto.hash(`dev-issue-${count + 1}`),
    timestamp: Date.now()
  }
  dapp.put(tx)
}

// TALLY TRANSACTION FUNCTION
async function tallyVotes () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = network.data.issueCount
  const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${count}`))
  const tx = {
    type: 'tally',
    nodeId,
    from: address,
    to: network.data.id,
    issue: issue.data.id,
    proposals: issue.data.proposals,
    timestamp: Date.now()
  }
  dapp.put(tx)
}

// DEV_TALLY TRANSACTION FUNCTION
async function tallyDevVotes () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = network.data.devIssueCount
  const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${count}`))
  const tx = {
    type: 'dev_tally',
    nodeId: nodeId,
    from: address,
    to: network.data.id,
    devIssue: devIssue.data.id,
    devProposals: devIssue.data.devProposals,
    timestamp: Date.now()
  }
  dapp.put(tx)
}

// APPLY_PARAMETERS TRANSACTION FUNCTION
async function applyParameters () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = network.data.issueCount
  const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${count}`))
  const tx = {
    type: 'apply_parameters',
    nodeId,
    from: address,
    to: network.data.id,
    issue: issue.data.id,
    proposal: issue.data.winner,
    timestamp: Date.now()
  }
  dapp.put(tx)
}

// APPLY_DEV_PARAMETERS TRANSACTION FUNCTION
async function applyDevParameters () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = network.data.devIssueCount
  const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${count}`))
  const tx = {
    type: 'apply_dev_parameters',
    nodeId: nodeId,
    from: address,
    to: network.data.id,
    devIssue: devIssue.data.id,
    devProposals: devIssue.data.winners,
    timestamp: Date.now()
  }
  dapp.put(tx)
}

// RELEASE DEVELOPER FUNDS FOR A PAYMENT
function releaseDeveloperFunds (payment) {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const tx = {
    type: 'developer_payment',
    nodeId: nodeId,
    from: address,
    to: '0'.repeat(64),
    developer: payment.address,
    payment: payment,
    timestamp: Date.now()
  }
  dapp.put(tx)
}

// CODE THAT GETS EXECUTED WHEN NODES START
(async () => {
  const CYCLE_INTERVAL = CYCLE_DURATION * ONE_SECOND
  await dapp.start()
  // WAIT AT LEAST ONE CYCLE BEFORE ATTEMPTING TO QUERY THE NETWORK FOR THE PARAMETERS
  await _sleep(CYCLE_INTERVAL + ONE_SECOND)
  // SYNC THE NODES IN-MEMORY VARIABLES WITH THE NETWORK PARAMETERS
  await initParameters()

  // THIS IS FOR CALCULATING THE INTERVAL DRIFT
  let expectedInterval = Date.now() + CYCLE_INTERVAL
  // GET THE INITIAL CYCLE DATA FROM SHARDUS
  let cycleData = dapp.getLatestCycles()[0]
  console.log(cycleData)

  let INITIAL_CYCLE = cycleData.counter
  let CURRENT_CYCLE = cycleData.counter
  let CYCLE_START_TIME
  let CYCLES_ACTIVE
  let TIME_ACTIVE
  let LAST_REWARD = 0
  let LAST_MAINTENANCE = 0

  setTimeout(networkMaintenance, CYCLE_INTERVAL)

  // THIS CODE IS CALLED ON EVERY NODE ON EVERY CYCLE
  async function networkMaintenance () {
    let drift = Date.now() - expectedInterval
    cycleData = dapp.getLatestCycles()[0]
    console.log(cycleData)
    CURRENT_CYCLE = cycleData.counter
    // CONVERTS FROM SECONDS TO MILLISECONDS FOR COMPARISON WITH TIMESTAMPS
    CYCLE_START_TIME = cycleData.start * 1000
    CYCLES_ACTIVE = CURRENT_CYCLE - INITIAL_CYCLE
    TIME_ACTIVE = CYCLES_ACTIVE * CYCLE_INTERVAL

    // THIS IS FOR NODE_REWARD
    if (TIME_ACTIVE - LAST_REWARD >= NODE_REWARD_INTERVAL) {
      nodeReward()
      LAST_REWARD = TIME_ACTIVE
    }

    // THIS IS FOR ACCOUNT_MAINTENANCE
    if (TIME_ACTIVE - LAST_MAINTENANCE >= MAINTENANCE_INTERVAL) {
      maintenance()
      LAST_MAINTENANCE = TIME_ACTIVE
    }

    // TODO: COULD PROBABLY STILL BE IMPROVED
    // AUTOMATIC (ISSUE | TALLY | APPLY_PARAMETERS) TRANSACTION GENERATION
    if (LAST_ISSUE_TIME) {
      // IS THE NETWORK READY TO GENERATE A NEW ISSUE?
      if (CYCLE_START_TIME >= LAST_ISSUE_TIME + (ONE_MINUTE * 4)) {
        await generateIssue()
      }

      if (GRACE_WINDOW && APPLY_WINDOW) {
        if (!WINNER_FOUND) {
          // IF THE WINNER FOR THE PROPOSAL HASN'T BEEN DETERMINED YET AND ITS PAST THE VOTING_WINDOW
          if (CYCLE_START_TIME >= GRACE_WINDOW[0] && CYCLE_START_TIME <= GRACE_WINDOW[1]) {
            await tallyVotes()
          }
        }
        if (!PARAMS_APPLIED) {
          // IF THE WINNING PARAMETERS HAVENT BEEN APPLIED YET AND IT'S PAST THE GRACE_WINDOW
          if (CYCLE_START_TIME >= APPLY_WINDOW[0] && CYCLE_START_TIME <= APPLY_WINDOW[1]) {
            await applyParameters()
          }
        }
      }
    }

    // AUTOMATIC (DEV_ISSUE | DEV_TALLY | APPLY_DEV_PARAMETERS) TRANSACTION GENERATION
    if (LAST_DEV_ISSUE_TIME) {
      // IS THE NETWORK READY TO GENERATE A NEW DEV_ISSUE?
      if (CYCLE_START_TIME >= LAST_DEV_ISSUE_TIME + (ONE_MINUTE * 4)) {
        await generateDevIssue()
      }

      if (DEV_GRACE_WINDOW && DEV_APPLY_WINDOW) {
        if (!DEV_WINNERS_FOUND) {
          // IF THE WINNERS FOR THE DEV PROPOSALS HAVEN'T BEEN DETERMINED YET AND ITS PAST THE DEV_VOTING_WINDOW
          if (CYCLE_START_TIME >= DEV_GRACE_WINDOW[0] && CYCLE_START_TIME <= DEV_GRACE_WINDOW[1]) {
            await tallyDevVotes()
          }
        }
        if (!DEV_PARAMS_APPLIED) {
          // IF THE WINNING DEV PARAMETERS HAVENT BEEN APPLIED YET AND IT'S PAST THE DEV_GRACE_WINDOW
          if (CYCLE_START_TIME >= DEV_APPLY_WINDOW[0] && CYCLE_START_TIME <= DEV_APPLY_WINDOW[1]) {
            await applyDevParameters()
          }
        }
      }
    }

    // LOOP THROUGH IN-MEMORY DEVELOPER_FUND
    for (const payment of DEVELOPER_FUND) {
      // PAY DEVELOPER IF THE CURRENT TIME IS GREATER THAN THE PAYMENT TIME
      if (CYCLE_START_TIME >= payment.timestamp) {
        releaseDeveloperFunds(payment)
      }
    }

    expectedInterval += CYCLE_INTERVAL
    // RESET THE INTERVAL / ADJUST FOR ANY DELAY
    setTimeout(networkMaintenance, CYCLE_INTERVAL - drift)
  }
})()
