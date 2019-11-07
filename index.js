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
let DEV_FUND_INTERVAL
let DEV_FUND_AMOUNT
let PROPOSAL_FEE
let DEV_PROPOSAL_FEE

// DYNAMIC VARIABLES TO HELP THE NODES DETERMINE
// WHEN TO SUBMIT ISSUES, OR TALLY VOTES, OR APPLY PARAMETERS
let LAST_ISSUE_TIME
let PROPOSAL_WINDOW
let VOTING_WINDOW
let GRACE_WINDOW
let APPLY_WINDOW
let WINNER_FOUND
let PARAMS_APPLIED

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
    },
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
  if (account) {
    NODE_REWARD_INTERVAL = account.data.nodeRewardInterval
    NODE_REWARD_AMOUNT = account.data.nodeRewardAmount
    NODE_PENALTY = account.data.nodePenalty
    TRANSACTION_FEE = account.data.transactionFee
    STAKE_REQUIRED = account.data.stakeRequired
    MAINTENANCE_INTERVAL = account.data.maintenanceInterval
    MAINTENANCE_FEE = account.data.maintenanceFee
    DEV_FUND_INTERVAL = account.data.devFundInterval
    DEV_FUND_AMOUNT = account.data.devFundAmount
    PROPOSAL_FEE = account.data.proposalFee
    DEV_PROPOSAL_FEE = account.data.devProposalFee
    LAST_ISSUE_TIME = account.data.lastIssueTime
    PROPOSAL_WINDOW = account.data.proposalWindow
    VOTING_WINDOW = account.data.votingWindow
    GRACE_WINDOW = account.data.graceWindow
    APPLY_WINDOW = account.data.applyWindow
    WINNER_FOUND = account.data.winnerFound
    PARAMS_APPLIED = account.data.paramsApplied
  } else {
    NODE_REWARD_INTERVAL = ONE_MINUTE
    NODE_REWARD_AMOUNT = 10
    NODE_PENALTY = 100
    TRANSACTION_FEE = 0.001
    STAKE_REQUIRED = 500
    MAINTENANCE_INTERVAL = ONE_MINUTE * 2
    MAINTENANCE_FEE = 0.0001
    DEV_FUND_INTERVAL = ONE_DAY
    DEV_FUND_AMOUNT = 10000
    PROPOSAL_FEE = 500
    DEV_PROPOSAL_FEE = 200
    LAST_ISSUE_TIME = null
    PROPOSAL_WINDOW = null
    VOTING_WINDOW = null
    GRACE_WINDOW = null
    APPLY_WINDOW = null
    WINNER_FOUND = null
    PARAMS_APPLIED = null
  }
}

function createAccount (obj = {}) {
  const account = Object.assign(
    {
      timestamp: Date.now(),
      id: crypto.randomBytes(),
      data: {
        balance: 0,
        toll: 1,
        chats: {},
        friends: {},
        transactions: []
      }
    },
    obj
  )
  account.hash = crypto.hashObj(account)
  return account
}

function createAlias (obj = {}) {
  const alias = Object.assign(
    {
      timestamp: Date.now()
    },
    obj
  )
  alias.hash = crypto.hashObj(alias)
  return alias
}

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
    devFundInterval: ONE_DAY,
    devFundAmount: 10000,
    proposalFee: 500,
    devProposalFee: 20,
    issueCount: 0,
    devProposalCount: 0
  }, obj)
  account.hash = crypto.hashObj(account)
  return account
}

function createIssue (obj = {}) {
  const issue = Object.assign(
    {
      timestamp: Date.now(),
      proposalCount: 0
    },
    obj
  )
  issue.hash = crypto.hashObj(issue)
  return issue
}

function createProposal (obj = {}) {
  const proposal = Object.assign(
    {
      timestamp: Date.now(),
      power: 0
    },
    obj
  )
  proposal.hash = crypto.hashObj(proposal)
  return proposal
}

function createDevProposal (obj = {}) {
  const devProposal = Object.assign(
    {
      timestamp: Date.now(),
      approve: 0,
      reject: 0
    },
    obj
  )
  devProposal.hash = crypto.hashObj(devProposal)
  return devProposal
}

// API
dapp.registerExternalPost('inject', async (req, res) => {
  const result = dapp.put(req.body)
  res.json({ result })
})

dapp.registerExternalGet('network/parameters/node', async (req, res) => {
  const parameters = {
    NODE_REWARD_INTERVAL,
    NODE_REWARD_AMOUNT,
    NODE_PENALTY,
    TRANSACTION_FEE,
    STAKE_REQUIRED,
    MAINTENANCE_INTERVAL,
    MAINTENANCE_FEE,
    DEV_FUND_INTERVAL,
    DEV_FUND_AMOUNT,
    PROPOSAL_FEE,
    DEV_PROPOSAL_FEE
  }
  res.json({ parameters })
})

dapp.registerExternalGet('network/parameters', async (req, res) => {
  const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  try {
    res.json({ parameters: network.data })
  } catch (err) {
    res.json({ error: err })
  }
})

dapp.registerExternalGet('issues', async (req, res) => {
  const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const issueCount = account.data.issueCount
  const issues = []
  for (let i = 1; i <= issueCount; i++) {
    let issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${i}`))
    issues.push(issue.data)
  }
  res.json({ issues })
})

dapp.registerExternalGet('issues/latest', async (req, res) => {
  const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = account.data.issueCount
  const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${count}`))
  res.json({ issue: issue.data })
})

dapp.registerExternalGet('issues/count', async (req, res) => {
  const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const issueCount = account.data.issueCount
  res.json({ issueCount })
})

dapp.registerExternalGet('proposals', async (req, res) => {
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
})

dapp.registerExternalGet('proposals/latest', async (req, res) => {
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
})

dapp.registerExternalGet('proposals/count', async (req, res) => {
  const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const issueCount = network.data.issueCount
  const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${issueCount}`))
  if (!issue) {
    res.json({ error: 'No issues have been created yet' })
  }
  const proposalCount = issue.data.proposalCount
  res.json({ proposalCount })
})

dapp.registerExternalGet('proposals/dev', async (req, res) => {
  const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = account.data.devProposalCount
  const devProposals = []
  for (let i = 1; i <= count; i++) {
    let devProposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-proposal-${i}`))
    devProposals.push(devProposal.data)
  }
  res.json({ devProposals })
})

dapp.registerExternalGet('proposals/dev/latest', async (req, res) => {
  const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = account.data.devProposalCount
  const devProposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-proposal-${count}`))
  res.json({ devProposal: devProposal.data })
})

dapp.registerExternalGet('proposals/dev/count', async (req, res) => {
  const account = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const devProposalCount = account.data.devProposalCount
  res.json({ devProposalCount })
})

dapp.registerExternalGet('account/:id', async (req, res) => {
  const id = req.params['id']
  const account = await dapp.getLocalOrRemoteAccount(id)
  res.json({ account: account.data })
})

dapp.registerExternalGet('account/:id/handle', async (req, res) => {
  const id = req.params['id']
  const account = await dapp.getLocalOrRemoteAccount(id)
  if (account) {
    res.json({ handle: account.data.handle })
  } else {
    res.json({ error: 'No account with the given id' })
  }
})

dapp.registerExternalGet('account/:id/balance', async (req, res) => {
  const id = req.params['id']
  const account = await dapp.getLocalOrRemoteAccount(id)
  if (account) {
    res.json({ balance: account.data.data.balance })
  } else {
    res.json({ error: 'No account with the given id' })
  }
})

dapp.registerExternalGet('account/:id/toll', async (req, res) => {
  const id = req.params['id']
  const account = await dapp.getLocalOrRemoteAccount(id)
  if (account) {
    res.json({ toll: account.data.data.toll })
  } else {
    res.json({ error: 'No account with the given id' })
  }
})

dapp.registerExternalGet('address/:name', async (req, res) => {
  const name = req.params['name']
  const account = await dapp.getLocalOrRemoteAccount(name)
  const address = account && account.data.address
  if (address) {
    res.json({ address })
  } else {
    res.json({ error: 'No account exists for the given handle' })
  }
})

dapp.registerExternalGet('account/:id/:friendId/toll', async (req, res) => {
  const id = req.params['id']
  const friendId = req.params['friendId']
  if (!friendId) {
    res.json({ error: 'No provided friendId' })
  }
  const account = await dapp.getLocalOrRemoteAccount(id)
  if (account && account.data.data.friends[friendId]) {
    res.json({ toll: 1 })
  } else if (account) {
    res.json({ toll: account.data.data.toll })
  } else {
    res.json({ error: 'No account found with the given id' })
  }
})

dapp.registerExternalGet('account/:id/friends', async (req, res) => {
  const id = req.params['id']
  const account = await dapp.getLocalOrRemoteAccount(id)
  if (account) {
    res.json({ friends: account.data.data.friends })
  } else {
    res.json({ error: 'No account for given id' })
  }
})

dapp.registerExternalGet('account/:id/transactions', async (req, res) => {
  const id = req.params['id']
  const account = await dapp.getLocalOrRemoteAccount(id)
  if (account) {
    res.json({ transactions: account.data.data.transactions })
  } else {
    res.json({ error: 'No account for given id' })
  }
})

dapp.registerExternalGet('account/:id/recentMessages', async (req, res) => {
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
})

dapp.registerExternalGet('accounts', async (req, res) => {
  res.json({ accounts })
})

dapp.registerExternalGet('messages/:accountId/:chatId', async (req, res) => {
  const { accountId, chatId } = req.params
  const account = await dapp.getLocalOrRemoteAccount(accountId)
  if (!account) {
    res.json({ error: "Account doesn't exist" })
    res.end()
    return
  }
  if (!account.data.data.chats[chatId]) {
    res.json({ error: 'no chat history for this request' })
    res.end()
  } else {
    let messages = [...account.data.data.chats[chatId].messages]
    res.json({ messages })
  }
})

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
        const alias = wrappedStates[tx.alias] && wrappedStates[tx.alias].data
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (alias.inbox === tx.handle) {
          response.reason = 'This handle is already taken'
          return response
        }
        if (tx.handle && tx.handle.length >= 17) {
          response.reason = 'Handle must be less than 17 characters'
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
        if (from.data.balance < (recipients.length * tx.amount) + (recipients.length * TRANSACTION_FEE)) {
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
        if (tx.amount < 1) {
          response.reason = 'Must send at least 1 token with the message transaction'
          return response
        }
        if (to.data.friends[tx.from]) {
          if (from.data.balance < 1) {
            response.reason = 'from account does not have sufficient funds.'
            return response
          }
        } else {
          if (from.data.balance < tx.amount + TRANSACTION_FEE || from.data.balance < to.data.toll + TRANSACTION_FEE) {
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
        if (from.data.balance < 1 + TRANSACTION_FEE) {
          response.reason = 'from account does not have sufficient funds.'
          return response
        }
        if (tx.amount < 1 + TRANSACTION_FEE) {
          response.reason = 'Must burn 1 token in order to set a toll'
          return response
        }
        if (typeof toll === 'undefined' || tx.toll === null) {
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
        if (from.data.balance < tx.amount + TRANSACTION_FEE || tx.amount < 1 + TRANSACTION_FEE) {
          response.reason = "Not enough tokens to cover transaction, or didn't send enough token with the transaction"
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
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'bond': {
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
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!to) {
          response.reason = 'Must give the network account address in the to field'
          return response
        }
        if (to.activeDevProposal) {
          response.reason = 'Only 1 devProposal can be active at a time'
          return response
        }
        if (tx.devProposal !== crypto.hash(`dev-proposal-${to.devProposalCount + 1}`)) {
          response.reason = 'Must give the next devProposalAccount hash'
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
        const devProposal = wrappedStates[tx.devProposal] && wrappedStates[tx.devProposal].data

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
        const devProposal = wrappedStates[tx.devProposal] && wrappedStates[tx.devProposal].data

        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!devProposal) {
          response.reason = 'devProposal not found'
          return response
        }
        if (!devProposal.approved) {
          response.reason = 'This devProposal was not approved'
          return response
        }
        if (tx.timestamp - devProposal.approvalTime < ONE_MINUTE * 3) {
          response.reason = 'Must wait 3 minutes after the tally before applying'
          return response
        }
        if (tx.from !== devProposal.payAddress) {
          response.reason = 'This transaction must be made by the account receiving the funds'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      }
      default:
        response.reason = 'Unknown transaction type'
        return response
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
      throw new Error(
        `invalid transaction, reason: ${reason}. tx: ${stringify(tx)}`
      )
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
        let alias = wrappedStates[tx.alias] && wrappedStates[tx.alias].data
        alias.inbox = tx.handle
        from.handle = tx.handle
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        console.log('Applied register tx', txId, accounts[tx.from])
        break
      }
      case 'create': {
        to.data.balance += tx.amount
        to.timestamp = tx.timestamp
        console.log('Applied create tx', txId, to)
        break
      }
      case 'transfer': {
        from.data.balance -= (tx.amount + TRANSACTION_FEE)
        to.data.balance += tx.amount
        // from.data.transactions.push({ ...tx, txId });
        // to.data.transactions.push({ ...tx, txId });
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        console.log('Applied transfer tx', txId, from, to)
        break
      }
      case 'distribute': {
        const recipients = tx.recipients.map(recipientId => wrappedStates[recipientId].data)
        recipients.forEach(recipient => {
          from.data.balance -= (tx.amount + TRANSACTION_FEE)
          recipient.data.balance += tx.amount
        })
        console.log('Applied distribute transaction', txId, recipients)
        break
      }
      case 'message': {
        from.data.balance -= (tx.amount + TRANSACTION_FEE)
        to.data.balance += tx.amount

        if (!from.data.chats[tx.to]) from.data.chats[tx.to] = { messages: [tx.message] }
        else from.data.chats[tx.to].messages.push(tx.message)

        if (!to.data.chats[tx.from]) to.data.chats[tx.from] = { messages: [tx.message] }
        else to.data.chats[tx.from].messages.push(tx.message)

        // from.data.transactions.push({ ...tx, txId })
        // to.data.transactions.push({ ...tx, txId })

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp

        console.log('Applied message tx', txId, from, to)
        break
      }
      case 'toll': {
        from.data.balance -= (tx.amount + TRANSACTION_FEE)
        from.data.toll = tx.toll
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        console.log('Applied toll tx', txId, from)
        break
      }
      case 'friend': {
        from.data.balance -= (tx.amount + TRANSACTION_FEE)
        from.data.friends[tx.to] = tx.handle
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        console.log('Applied friend tx', txId, from)
        break
      }
      case 'remove_friend': {
        from.data.friends[tx.to] = null
        from.timestamp = tx.timestamp
        console.log('Applied remove_friend tx', txId, from)
        break
      }
      case 'bond': {
        from.data.stake = tx.stake
        from.timestamp = tx.timestamp
        console.log('Applied bond tx', txId, from)
        break
      }
      case 'node_reward': {
        to.data.balance += NODE_REWARD_AMOUNT
        from.nodeRewardTime = tx.timestamp
        // target.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        console.log('Applied node_reward tx', txId, from, to)
        break
      }
      case 'snapshot_claim': {
        from.data.balance += to.snapshot[tx.from]
        to.snapshot[tx.from] = 0
        // target.data.transactions.push({ ...tx, txId });
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
        DEV_FUND_INTERVAL = to.devFundInterval
        DEV_FUND_AMOUNT = to.devFundAmount
        PROPOSAL_FEE = to.proposalFee
        DEV_PROPOSAL_FEE = to.devProposalFee

        to.lastIssueTime = tx.timestamp - (ONE_MINUTE * 4)
        // to.proposalWindow = [to.lastIssueTime, to.lastIssueTime + ONE_MINUTE]
        // to.votingWindow = [to.proposalWindow[1], to.proposalWindow[1] + ONE_MINUTE]
        // to.graceWindow = [to.votingWindow[1], to.votingWindow[1] + ONE_MINUTE]
        // to.applyWindow = [to.graceWindow[1], to.graceWindow[1] + ONE_MINUTE]

        LAST_ISSUE_TIME = to.lastIssueTime
        // PROPOSAL_WINDOW = to.proposalWindow
        // VOTING_WINDOW = to.votingWindow
        // GRACE_WINDOW = to.graceWindow
        // APPLY_WINDOW = to.applyWindow

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
        DEV_FUND_INTERVAL = to.devFundInterval
        DEV_FUND_AMOUNT = to.devFundAmount
        PROPOSAL_FEE = to.proposalFee
        DEV_PROPOSAL_FEE = to.devProposalFee

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        console.log('Applied update_parameters tx', txId, from, to)
        break
      }
      case 'maintenance': {
        const targets = tx.targets.map(targetId => wrappedStates[targetId].data)
        if (from.data.balance > 0) {
          from.data.balance -= (from.data.balance * MAINTENANCE_FEE)
          from.lastMaintenance = tx.timestamp
          from.timestamp = tx.timestamp
        }

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
        issue.proposalCount++
        issue.active = true
        issue.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        console.log('Applied issue tx', from, to, issue)
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
        proposal.devFundInterval = tx.parameters.devFundInterval
        proposal.devFundAmount = tx.parameters.devFundAmount
        proposal.proposalFee = tx.parameters.proposalFee
        proposal.devProposalFee = tx.parameters.devProposalFee
        proposal.number = issue.proposalCount + 1
        proposal.totalVotes = 0
        issue.proposalCount++

        from.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        console.log('Applied proposal tx', txId, from, issue, proposal)
        break
      }
      case 'dev_proposal': {
        const devProposal = wrappedStates[tx.proposal].data
        from.data.balance -= DEV_PROPOSAL_FEE
        devProposal.active = true
        devProposal.funds = tx.funds
        devProposal.interval = tx.interval
        devProposal.payAddress = tx.payAddress
        devProposal.totalVotes = 0
        to.devProposalCount++
        to.activeDevProposal = true
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        devProposal.timestamp = tx.timestamp
        console.log('Applied dev_proposal tx', txId, devProposal)
        break
      }
      case 'vote': {
        const proposal = wrappedStates[tx.proposal].data
        from.data.balance -= tx.amount
        proposal.power += tx.amount
        proposal.totalVotes++
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

        console.log('MARGIN', margin)
        console.log('DEFAULT', defaultProposal)
        console.log('SORTED', sortedProposals)

        let winner

        if (sortedProposals.length >= 2) {
          const firstPlace = sortedProposals[0]
          const secondPlace = sortedProposals[1]
          const marginToWin = secondPlace.power + (margin * secondPlace.power)
          console.log('FIRST_PLACE', firstPlace)
          console.log('SECOND_PLACE', secondPlace)
          console.log('MARGIN_TO_WIN', marginToWin)
          if (firstPlace.power > marginToWin) {
            winner = firstPlace
          } else {
            winner = defaultProposal
          }
        } else {
          winner = defaultProposal
        }

        console.log('WINNER', winner)

        issue.winner = winner.id
        to.winnerFound = true
        WINNER_FOUND = true

        issue.timestamp = tx.timestamp
        winner.timestamp = tx.timestamp
        console.log('Applied tally tx', txId, issue, winner)
        break
      }
      case 'dev_tally': {
        const devProposal = wrappedStates[tx.devProposal].data
        if (devProposal.approve > (devProposal.reject + (devProposal.reject * 0.15))) {
          devProposal.approved = true
          devProposal.approvalTime = tx.timestamp
        } else {
          devProposal.approved = false
        }
        devProposal.active = false
        to.activeDevProposal = false
        devProposal.timestamp = tx.timestamp
        console.log('Applied dev_tally tx', txId, from, devProposal)
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
        to.devFundInterval = winner.devFundInterval
        to.devFundAmount = winner.devFundAmount
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
        DEV_FUND_INTERVAL = winner.devFundInterval
        DEV_FUND_AMOUNT = winner.devFundAmount
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
        const devProposal = wrappedStates[tx.devProposal].data
        from.data.balance += devProposal.funds
        devProposal.funds = 0
        from.timestamp = tx.timestamp
        devProposal.timestamp = tx.timestamp
        console.log('Applied apply_dev_parameters tx', txId, from, devProposal)
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
        result.targetKeys = [tx.from, tx.alias]
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
      case 'proposal':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.issue, tx.proposal]
        break
      case 'dev_proposal':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.devProposal]
        break
      case 'vote':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.issue, tx.proposal]
        break
      case 'dev_vote':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devProposal]
        break
      case 'tally':
        result.sourceKeys = [tx.from]
        result.targetKeys = [...tx.proposals, tx.issue, tx.to]
        break
      case 'dev_tally':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.devProposal]
        break
      case 'apply_parameters':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.issue, tx.proposal]
        break
      case 'apply_dev_parameters':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devProposal]
        break
    }
    result.allKeys = result.allKeys.concat(
      result.sourceKeys,
      result.targetKeys
    )
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
    console.log('setAccountData: ', accountRecords)
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
      if (tx.type === 'register') {
        if (accountId === tx.alias) {
          account = createAlias({
            id: accountId,
            address: tx.srcAcc,
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
      account = createAccount({
        id: accountId,
        timestamp: 0
      })
      accounts[accountId] = account
      accountCreated = true
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
    updatedAccount.hash = ''
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
    account.hash = ''
    account.hash = crypto.hashObj(account)
    return account.hash
  },
  resetAccountData (accountBackupCopies) {
    for (let recordData of accountBackupCopies) {
      console.log('recordData: ', recordData)
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

async function _sleep (ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function selfReward () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const tgtAcc = /* payAcc || */ address
  const tx = {
    type: 'node_reward',
    timestamp: Date.now(),
    nodeId: nodeId,
    from: address,
    to: tgtAcc,
    amount: NODE_REWARD_AMOUNT
  }
  dapp.put(tx)
}

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

async function tallyVotes () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = network.data.issueCount
  const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${count}`))
  const proposals = []
  for (let i = 1; i <= issue.data.proposalCount; i++) {
    let proposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${count}-proposal-${i}`))
    proposals.push(proposal.data.id)
  }
  const tx = {
    type: 'tally',
    nodeId,
    from: address,
    to: network.data.id,
    issue: issue.data.id,
    proposals: proposals,
    timestamp: Date.now()
  }
  dapp.put(tx)
}

async function applyParameters () {
  const nodeId = dapp.getNodeId()
  const { address } = dapp.getNode(nodeId)
  const network = await dapp.getLocalOrRemoteAccount('0'.repeat(64))
  const count = network.data.issueCount
  const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${count}`))
  const proposal = issue.data.winner
  const tx = {
    type: 'apply_parameters',
    nodeId,
    from: address,
    to: network.data.id,
    issue: issue.data.id,
    proposal,
    timestamp: Date.now()
  }
  dapp.put(tx)
}

(async () => {
  const CYCLE_INTERVAL = CYCLE_DURATION * ONE_SECOND
  await dapp.start()
  await _sleep(CYCLE_INTERVAL + ONE_SECOND)
  await initParameters()

  let expectedInterval = Date.now() + CYCLE_INTERVAL

  setTimeout(networkMaintenance, CYCLE_INTERVAL)

  let cycleData = dapp.getLatestCycles()[0]

  let INITIAL_CYCLE = cycleData.counter
  let CURRENT_CYCLE = cycleData.counter
  let CYCLE_START_TIME
  let CYCLES_ACTIVE
  let TIME_ACTIVE
  let LAST_REWARD = 0
  let LAST_MAINTENANCE = 0

  // THIS CODE IS CALLED ON EVERY NODE ON EVERY CYCLE
  async function networkMaintenance () {
    let drift = Date.now() - expectedInterval
    cycleData = dapp.getLatestCycles()[0]
    CURRENT_CYCLE = cycleData.counter
    CYCLE_START_TIME = cycleData.start * 1000
    CYCLES_ACTIVE = CURRENT_CYCLE - INITIAL_CYCLE
    TIME_ACTIVE = CYCLES_ACTIVE * CYCLE_INTERVAL

    // THIS IS FOR NODE_REWARD
    if (TIME_ACTIVE - LAST_REWARD > NODE_REWARD_INTERVAL) {
      selfReward()
      LAST_REWARD = TIME_ACTIVE
    }

    // THIS IS FOR ACCOUNT_MAINTENANCE
    if (TIME_ACTIVE - LAST_MAINTENANCE > MAINTENANCE_INTERVAL) {
      maintenance()
      LAST_MAINTENANCE = TIME_ACTIVE
    }

    // TODO: COULD STILL BE IMPROVED BUT WHATEVER
    if (LAST_ISSUE_TIME) {
      console.log({
        LAST_ISSUE_TIME,
        PROPOSAL_WINDOW,
        VOTING_WINDOW,
        GRACE_WINDOW,
        APPLY_WINDOW
      })
      // IS THE NETWORK READY TO GENERATE A NEW ISSUE?
      if (CYCLE_START_TIME > LAST_ISSUE_TIME + (ONE_MINUTE * 4)) {
        await generateIssue()
      }

      if (GRACE_WINDOW && APPLY_WINDOW) {
        if (!WINNER_FOUND) {
          // IF THE VOTES FOR THE PROPOSAL HAVENT BEEN COUNTED YET AND ITS PAST THE VOTING_WINDOW
          if (CYCLE_START_TIME > GRACE_WINDOW[0] && CYCLE_START_TIME < GRACE_WINDOW[1]) {
            await tallyVotes()
          }
        }
        if (!PARAMS_APPLIED) {
          // IF THE WINNING PARAMETERS HAVENT BEEN APPLIED YET AND IT'S PAST THE GRACE_WINDOW
          if (CYCLE_START_TIME > APPLY_WINDOW[0] && CYCLE_START_TIME < APPLY_WINDOW[1]) {
            await applyParameters()
          }
        }
      }
    }

    expectedInterval += CYCLE_INTERVAL
    // RESET THE INTERVAL
    setTimeout(networkMaintenance, CYCLE_INTERVAL - drift)
  }
})()
