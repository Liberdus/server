import fs from 'fs'
import path from 'path'
import Prop from 'dot-prop'
import heapdump from 'heapdump'
import axios from 'axios'
import Decimal from 'decimal.js'
import shardus from 'shardus-global-server'
import * as crypto from 'shardus-crypto-utils'
import Shardus = require('shardus-global-server/src/shardus/shardus-types')
import stringify = require('fast-stable-stringify')
import './@types'
import _ from 'lodash'
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
// import _ from 'lodash'

// THE ENTIRE APP STATE FOR THIS NODE
let accounts: { [id: string]: Account } = {}
const networkAccount = '0'.repeat(64)

// HELPFUL TIME CONSTANTS IN MILLISECONDS
const ONE_SECOND = 1000
const ONE_MINUTE = 60 * ONE_SECOND
// const ONE_HOUR = 60 * ONE_MINUTE
// const ONE_DAY = 24 * ONE_HOUR
// const ONE_WEEK = 7 * ONE_DAY
// const ONE_YEAR = 365 * ONE_DAY

const TIME_FOR_PROPOSALS = ONE_MINUTE + ONE_SECOND * 30
const TIME_FOR_VOTING = ONE_MINUTE + ONE_SECOND * 30
const TIME_FOR_GRACE = ONE_MINUTE + ONE_SECOND * 30
const TIME_FOR_APPLY = ONE_MINUTE + ONE_SECOND * 30

const TIME_FOR_DEV_PROPOSALS = ONE_MINUTE + ONE_SECOND * 30
const TIME_FOR_DEV_VOTING = ONE_MINUTE + ONE_SECOND * 30
const TIME_FOR_DEV_GRACE = ONE_MINUTE + ONE_SECOND * 30
const TIME_FOR_DEV_APPLY = ONE_MINUTE + ONE_SECOND * 30

// MIGHT BE USEFUL TO HAVE TIME CONSTANTS IN THE FORM OF CYCLES
const cycleDuration = 15

// INITIAL NETWORK PARAMETERS FOR LIBERDUS
const INITIAL_PARAMETERS: NetworkParameters = {
  title: 'Initial parameters',
  description: 'These are the initial network parameters liberdus started with',
  nodeRewardInterval: ONE_MINUTE,
  nodeRewardAmount: 10,
  nodePenalty: 100,
  transactionFee: 0.001,
  stakeRequired: 500,
  maintenanceInterval: ONE_MINUTE * 10,
  maintenanceFee: 0.01,
  proposalFee: 500,
  devProposalFee: 20,
}

let config: any = {}

if (process.env.BASE_DIR) {
  if (fs.existsSync(path.join(process.env.BASE_DIR, 'config.json'))) {
    config = JSON.parse(fs.readFileSync(path.join(process.env.BASE_DIR, 'config.json')).toString())
  }
  config.server.baseDir = process.env.BASE_DIR
}

if (process.env.APP_IP) {
  Prop.set(config, 'server.ip', {
    externalIp: process.env.APP_IP,
    internalIp: process.env.APP_IP,
  })
}

// CONFIGURATION PARAMETERS PASSED INTO SHARDUS
Prop.set(config, 'server.p2p', {
  cycleDuration: cycleDuration,
  existingArchivers: JSON.parse(
    process.env.APP_SEEDLIST || '[{ "ip": "127.0.0.1", "port": 4000, "publicKey": "758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3" }]',
  ),
  maxNodesPerCycle: 10,
  minNodes: 10,
  maxNodes: 10,
  minNodesToAllowTxs: 1,
  maxNodesToRotate: 1,
  maxPercentOfDelta: 40,
})
Prop.set(config, 'server.loadDetection', {
  queueLimit: 1000,
  desiredTxTime: 15,
  highThreshold: 0.8,
  lowThreshold: 0.2,
})
Prop.set(config, 'server.reporting', {
  recipient: `http://${process.env.APP_MONITOR || '0.0.0.0'}:3000/api`,
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
        maxLogSize: 1000000000,
        backups: 10,
      },
      shardDump: {
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
    },
  },
})

const dapp = shardus(config)

// CREATE A USER ACCOUNT
function createAccount(accountId: string, timestamp: number): UserAccount {
  const account: UserAccount = {
    id: accountId,
    data: {
      balance: 5000,
      toll: 1,
      chats: {},
      friends: {},
      transactions: [],
    },
    alias: null,
    emailHash: null,
    verified: false,
    hash: '',
    claimedSnapshot: false,
    lastMaintenance: timestamp,
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}

// CREATE A NODE ACCOUNT FOR MINING
function createNode(accountId: string): NodeAccount {
  const account: NodeAccount = {
    id: accountId,
    balance: 0,
    nodeRewardTime: 0,
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}

function createChat(accountId: string): ChatAccount {
  const chat: ChatAccount = {
    id: accountId,
    messages: [],
    timestamp: 0,
    hash: '',
  }
  chat.hash = crypto.hashObj(chat)
  return chat
}

// CREATE AN ALIAS ACCOUNT
function createAlias(accountId: string): AliasAccount {
  const alias: AliasAccount = {
    id: accountId,
    hash: '',
    inbox: '',
    address: '',
    timestamp: 0,
  }
  alias.hash = crypto.hashObj(alias)
  return alias
}

// CREATE THE INITIAL NETWORK ACCOUNT
function createNetworkAccount(accountId: string, timestamp: number): NetworkAccount {
  const proposalWindow = [timestamp, timestamp + TIME_FOR_PROPOSALS]
  const votingWindow = [proposalWindow[1], proposalWindow[1] + TIME_FOR_VOTING]
  const graceWindow = [votingWindow[1], votingWindow[1] + TIME_FOR_GRACE]
  const applyWindow = [graceWindow[1], graceWindow[1] + TIME_FOR_APPLY]

  const devProposalWindow = [timestamp, timestamp + TIME_FOR_DEV_PROPOSALS]
  const devVotingWindow = [devProposalWindow[1], devProposalWindow[1] + TIME_FOR_DEV_VOTING]
  const devGraceWindow = [devVotingWindow[1], devVotingWindow[1] + TIME_FOR_DEV_GRACE]
  const devApplyWindow = [devGraceWindow[1], devGraceWindow[1] + TIME_FOR_DEV_APPLY]

  const account: NetworkAccount = {
    id: accountId,
    current: INITIAL_PARAMETERS,
    next: {},
    windows: {
      proposalWindow,
      votingWindow,
      graceWindow,
      applyWindow,
    },
    nextWindows: {},
    devWindows: {
      devProposalWindow,
      devVotingWindow,
      devGraceWindow,
      devApplyWindow,
    },
    nextDevWindows: {},
    developerFund: [],
    nextDeveloperFund: [],
    issue: 1,
    devIssue: 1,
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  console.log('INITIAL_HASH: ', account.hash)
  return account
}

// CREATE AN ISSUE ACCOUNT
function createIssue(accountId: string): IssueAccount {
  const issue: IssueAccount = {
    id: accountId,
    active: null,
    proposals: [],
    proposalCount: 0,
    number: null,
    winner: null,
    hash: '',
    timestamp: 0,
  }
  issue.hash = crypto.hashObj(issue)
  return issue
}

// CREATE A DEV_ISSUE ACCOUNT
function createDevIssue(accountId: string): DevIssueAccount {
  const devIssue: DevIssueAccount = {
    id: accountId,
    devProposals: [],
    devProposalCount: 0,
    winners: [],
    hash: '',
    active: null,
    number: null,
    timestamp: 0,
  }
  devIssue.hash = crypto.hashObj(devIssue)
  return devIssue
}

// CREATE A PROPOSAL ACCOUNT
function createProposal(accountId: string, parameters: NetworkParameters): ProposalAccount {
  const proposal: ProposalAccount = {
    id: accountId,
    power: 0,
    totalVotes: 0,
    winner: false,
    parameters,
    number: null,
    hash: '',
    timestamp: 0,
  }
  proposal.hash = crypto.hashObj(proposal)
  return proposal
}

// CREATE A DEV_PROPOSAL ACCOUNT
function createDevProposal(accountId: string): DevProposalAccount {
  const devProposal: DevProposalAccount = {
    id: accountId,
    title: null,
    description: null,
    approve: 0,
    reject: 0,
    totalVotes: 0,
    totalAmount: null,
    payAddress: '',
    payments: [],
    approved: null,
    number: null,
    hash: '',
    timestamp: 0,
  }
  devProposal.hash = crypto.hashObj(devProposal)
  return devProposal
}

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
      const account = await dapp.getLocalOrRemoteAccount(networkAccount)
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
      const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
      const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
      const network = await dapp.getLocalOrRemoteAccount(networkAccount)
      res.json({ devWindows: network.data.devWindows })
    } catch (error) {
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'issues',
  async (req, res): Promise<void> => {
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
      const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
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
        res.json({ toll: account.data.data.toll })
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
      if (account && account.data.data.friends[friendId]) {
        res.json({ toll: 0 })
      } else if (account) {
        res.json({ toll: account.data.data.toll })
      } else {
        res.json({ error: 'No account found with the given id' })
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
    amount = account.data.balance * (network.current.maintenanceFee * Math.floor((timestamp - account.lastMaintenance) / network.current.maintenanceInterval))
    account.lastMaintenance = timestamp
  }
  if (typeof amount === 'number') return amount
  else return 0
}

// SDK SETUP FUNCTIONS
dapp.setup({
  async sync(): Promise<void> {
    if (dapp.p2p.isFirstSeed) {
      await _sleep(ONE_SECOND * 20)

      const nodeId = dapp.getNodeId()
      const address = dapp.getNode(nodeId).address
      const when = Date.now() + ONE_SECOND * 10

      dapp.setGlobal(
        networkAccount,
        {
          type: 'init_network',
          // nodeId,
          // from: address,
          timestamp: when,
          network: networkAccount,
        },
        when,
        networkAccount,
      )

      dapp.log('GENERATED_NETWORK: ', nodeId)

      await _sleep(ONE_SECOND * 20)

      dapp.set({
        type: 'issue',
        network: networkAccount,
        nodeId,
        from: address,
        issue: crypto.hash(`issue-${1}`),
        proposal: crypto.hash(`issue-${1}-proposal-1`),
        timestamp: Date.now(),
      })

      dapp.set({
        type: 'dev_issue',
        network: networkAccount,
        nodeId,
        from: address,
        devIssue: crypto.hash(`dev-issue-${1}`),
        timestamp: Date.now(),
      })

      await _sleep(ONE_SECOND * 10)
    } else {
      while (!(await dapp.getLocalOrRemoteAccount(networkAccount))) {
        console.log('waiting..')
      }
    }
  },
  validateTransaction(tx: any, wrappedStates: { [id: string]: WrappedAccount }): Shardus.IncomingTransactionResult {
    const response: Shardus.IncomingTransactionResult = {
      success: false,
      reason: 'Transaction is not valid.',
      txnTimestamp: tx.timestamp,
    }

    const from = wrappedStates[tx.from] && wrappedStates[tx.from].data
    const to = wrappedStates[tx.to] && wrappedStates[tx.to].data

    switch (tx.type) {
      case 'init_network': {
        response.success = true
        response.reason = 'This transaction is valid'
        return response
      }
      case 'snapshot': {
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'email': {
        const source: UserAccount = wrappedStates[tx.signedTx.from] && wrappedStates[tx.signedTx.from].data
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
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'gossip_email_hash': {
        response.success = true
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
        if (typeof from.verified === 'boolean') {
          response.reason = 'From account has already been verified'
          return response
        }
        if (crypto.hash(tx.code) !== from.verified) {
          response.reason = 'Hash of code in tx does not match the hash of the verification code sent'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'register': {
        const alias: AliasAccount = wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data
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
        response.success = true
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
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'transfer': {
        const network: NetworkAccount = wrappedStates[tx.network].data
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
        if (from.data.balance < tx.amount + network.current.transactionFee) {
          response.reason = "from account doesn't have sufficient balance to cover the transaction"
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'distribute': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const recipients: UserAccount[] = tx.recipients.map((id: string) => wrappedStates[id].data)
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
        for (const user of recipients) {
          if (!user) {
            response.reason = 'no account for one of the recipients'
            return response
          }
        }
        if (from.data.balance < recipients.length * tx.amount + network.current.transactionFee) {
          response.reason = "from account doesn't have sufficient balance to cover the transaction"
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'message': {
        const network: NetworkAccount = wrappedStates[tx.network].data
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
          if (from.data.balance < to.data.toll + network.current.transactionFee) {
            response.reason = 'from account does not have sufficient funds.'
            return response
          } else {
            response.success = true
            response.reason = 'This transaction is valid!'
            return response
          }
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'toll': {
        const network: NetworkAccount = wrappedStates[tx.network].data
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
        if (from.data.balance < network.current.transactionFee) {
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
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'friend': {
        const network: NetworkAccount = wrappedStates[tx.network].data
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
        if (from.data.balance < network.current.transactionFee) {
          response.reason = "From account doesn't have enough tokens to cover the transaction fee"
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'remove_friend': {
        const network: NetworkAccount = wrappedStates[tx.network].data
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
        if (from.data.balance < network.current.transactionFee) {
          response.reason = "From account doesn't have enough tokens to cover the transaction fee"
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'stake': {
        const network: NetworkAccount = wrappedStates[tx.network].data
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
        if (from.data.balance < network.current.stakeRequired) {
          response.reason = `From account has insufficient balance, the cost required to operate a node is ${network.current.stakeRequired}`
          return response
        }
        if (tx.stake < network.current.stakeRequired) {
          response.reason = `Stake amount sent: ${tx.stake} is less than the cost required to operate a node: ${network.current.stakeRequired}`
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'node_reward': {
        const network = wrappedStates[tx.network].data
        let nodeInfo
        try {
          nodeInfo = dapp.getNode(tx.nodeId)
        } catch (err) {
          dapp.log(err)
        }
        if (!nodeInfo) {
          response.reason = 'no nodeInfo'
          return response
        }
        if (tx.timestamp - nodeInfo.activeTimestamp < network.current.nodeRewardInterval) {
          response.reason = 'Too early for this node to get paid'
          return response
        }
        if (!from) {
          response.success = true
          response.reason = 'This transaction in valid'
          return response
        }
        if (from) {
          if (!from.nodeRewardTime) {
            response.success = true
            response.reason = 'This transaction in valid'
            return response
          }
          if (tx.timestamp - from.nodeRewardTime < network.current.nodeRewardInterval) {
            response.reason = 'Too early for this node to get paid'
            return response
          }
        }
        response.success = true
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
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'issue': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (issue.active !== null) {
          response.reason = 'Issue is already active'
          return response
        }
        const networkIssueHash = crypto.hash(`issue-${network.issue}`)
        if (tx.issue !== networkIssueHash) {
          response.reason = `issue hash (${tx.issue}) does not match current network issue hash (${networkIssueHash})`
          return response
        }
        const networkProposalHash = crypto.hash(`issue-${network.issue}-proposal-1`)
        if (tx.proposal !== networkProposalHash) {
          response.reason = `proposalHash (${tx.proposal}) does not match the current default network proposal (${networkProposalHash})`
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_issue': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (devIssue.active !== null) {
          response.reason = 'devIssue is already active'
          return response
        }
        const networkDevIssueHash = crypto.hash(`dev-issue-${network.devIssue}`)
        if (tx.devIssue !== networkDevIssueHash) {
          response.reason = `devIssue hash (${tx.devIssue}) does not match current network devIssue (${networkDevIssueHash})`
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'proposal': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        const parameters: NetworkParameters = tx.parameters
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
        if (issue.number !== network.issue) {
          response.reason = 'This issue number ${issue.number} does not match the current network issue ${network.issue}'
          return response
        }
        if (issue.active === false) {
          response.reason = 'This issue is no longer active'
          return response
        }
        if (tx.proposal !== crypto.hash(`issue-${network.issue}-proposal-${issue.proposalCount + 1}`)) {
          response.reason = 'Must give the next issue proposalCount hash'
          return response
        }
        if (from.data.balance < network.current.proposalFee + network.current.transactionFee) {
          response.reason = 'From account has insufficient balance to submit a proposal'
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
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_proposal': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data

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
        if (devIssue.number !== network.issue) {
          response.reason = 'This issue number ${issue.number} does not match the current network issue ${network.issue}'
          return response
        }
        if (devIssue.active === false) {
          response.reason = 'This devIssue is no longer active'
          return response
        }
        if (tx.devProposal !== crypto.hash(`dev-issue-${network.devIssue}-dev-proposal-${devIssue.devProposalCount + 1}`)) {
          response.reason = 'Must give the next devIssue devProposalCount hash'
          return response
        }
        if (from.data.balance < network.current.devProposalFee + network.current.transactionFee) {
          response.reason = 'From account has insufficient balance to submit a devProposal'
          return response
        }
        if (tx.payments.reduce((acc: number, payment: DeveloperPayment) => new Decimal(payment.amount).plus(acc), 0) > 1) {
          response.reason = 'tx payment amounts added up to more than 100%'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'vote': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const proposal: ProposalAccount = wrappedStates[tx.proposal] && wrappedStates[tx.proposal].data
        const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data

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
        if (issue.number !== network.issue) {
          response.reason = `This issue number ${issue.number} does not match the current network issue ${network.issue}`
          return response
        }
        if (issue.active === false) {
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
        if (from.data.balance < tx.amount + network.current.transactionFee) {
          response.reason = 'From account has insufficient balance to cover the amount sent in the transaction'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_vote': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const devProposal: DevProposalAccount = wrappedStates[tx.devProposal] && wrappedStates[tx.devProposal].data
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data

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
        if (devIssue.number !== network.devIssue) {
          response.reason = `This devIssue number ${devIssue.number} does not match the current network devIssue ${network.issue}`
          return response
        }
        if (devIssue.active === false) {
          response.reason = 'devIssue no longer active'
          return response
        }
        if (tx.amount <= 0) {
          response.reason = 'Must send tokens in order to vote'
          return response
        }
        if (from.data.balance < tx.amount + network.current.transactionFee) {
          response.reason = 'From account has insufficient balance to cover the amount sent in the transaction'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'tally': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        const proposals: ProposalAccount[] = tx.proposals.map((id: string) => wrappedStates[id].data)

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (network.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (!issue) {
          response.reason = "Issue doesn't exist"
          return response
        }
        if (issue.number !== network.issue) {
          response.reason = `This issue number ${issue.number} does not match the current network issue ${network.issue}`
          return response
        }
        if (issue.active === false) {
          response.reason = 'This issue is no longer active'
          return response
        }
        if (issue.winner !== null) {
          response.reason = 'The winner for this issue has already been determined'
          return response
        }
        if (proposals.length !== issue.proposalCount) {
          response.reason = 'The number of proposals sent in with the transaction dont match the issues proposalCount'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_tally': {
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_tally': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
        const devProposals: DevProposalAccount[] = tx.devProposals.map((id: string) => wrappedStates[id].data)

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (!devIssue) {
          response.reason = "devIssue doesn't exist"
          return response
        }
        if (devIssue.number !== network.issue) {
          response.reason = 'This issue number ${issue.number} does not match the current network issue ${network.issue}'
          return response
        }
        if (devIssue.active === false) {
          response.reason = 'This devIssue is no longer active'
          return response
        }
        if (Array.isArray(devIssue.winners) && devIssue.winners.length > 0) {
          response.reason = 'The winners for this devIssue has already been determined'
          return response
        }
        if (network.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (devProposals.length !== devIssue.devProposalCount) {
          response.reason = 'The number of devProposals sent in with the transaction dont match the devIssue proposalCount'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_dev_tally': {
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'parameters': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const issue: IssueAccount = wrappedStates[tx.issue].data

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (network.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (!issue) {
          response.reason = "Issue doesn't exist"
          return response
        }
        if (issue.active === false) {
          response.reason = 'This issue is no longer active'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_parameters': {
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_parameters': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (network.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (!devIssue) {
          response.reason = "devIssue doesn't exist"
          return response
        }
        if (devIssue.number !== network.issue) {
          response.reason = 'This issue number ${issue.number} does not match the current network issue ${network.issue}'
          return response
        }
        if (devIssue.active === false) {
          response.reason = 'This devIssue is no longer active'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_dev_parameters': {
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'developer_payment': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const developer: UserAccount = wrappedStates[tx.developer] && wrappedStates[tx.developer].data
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (tx.timestamp < tx.payment.timestamp) {
          response.reason = 'This payment is not ready to be released'
          return response
        }
        if (network.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (!network.developerFund.some((payment: DeveloperPayment) => payment.id === tx.payment.id)) {
          response.reason = 'This payment doesnt exist'
          return response
        }
        if (!developer || !developer.data) {
          response.reason = 'No account exists for the passed in tx.developer'
          return response
        }
        if (tx.developer !== tx.payment.address) {
          response.reason = 'tx developer does not match address in payment'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_developer_payment': {
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      default: {
        response.success = false
        response.reason = 'Unknown transaction type'
        return response
      }
    }
  },
  // THIS NEEDS TO BE FAST, BUT PROVIDES BETTER RESPONSE IF SOMETHING GOES WRONG
  validateTxnFields(tx: any): Shardus.IncomingTransactionResult {
    // Validate tx fields here
    let success = true
    let reason = 'This transaction is valid!'
    const txnTimestamp = tx.timestamp

    if (typeof tx.type !== 'string') {
      success = false
      reason = '"type" must be a string.'
      throw new Error(reason)
    }

    if (typeof txnTimestamp !== 'number') {
      success = false
      reason = '"timestamp" must be a number.'
      throw new Error(reason)
    }

    switch (tx.type) {
      case 'init_network': {
        break
      }
      case 'snapshot': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (tx.to !== networkAccount) {
          success = false
          reason = '"To" must be ' + networkAccount
          throw new Error(reason)
        }
        if (typeof tx.snapshot !== 'object') {
          success = false
          reason = '"Snapshot" must be an object.'
          throw new Error(reason)
        }
        break
      }
      case 'email': {
        if (typeof tx.signedTx !== 'object') {
          success = false
          reason = '"signedTx" must be an object.'
          throw new Error(reason)
        }
        const signedTx = tx.signedTx
        if (signedTx) {
          if (typeof signedTx !== 'object') {
            success = false
            reason = '"signedTx" must be a object.'
            throw new Error(reason)
          }
          if (typeof signedTx.sign !== 'object') {
            success = false
            reason = '"sign" property on signedTx must be an object.'
            throw new Error(reason)
          }
          if (typeof signedTx.from !== 'string') {
            success = false
            reason = '"From" must be a string.'
            throw new Error(reason)
          }
          if (typeof signedTx.emailHash !== 'string') {
            success = false
            reason = '"emailHash" must be a string.'
            throw new Error(reason)
          }
        }
        if (typeof tx.email !== 'string') {
          success = false
          reason = '"email" must be a string.'
          throw new Error(reason)
        }
        if (tx.email.length > 30) {
          success = false
          reason = '"Email" length must be less than 31 characters (30 max)'
          throw new Error(reason)
        }
        break
      }
      case 'verify': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.code !== 'string') {
          success = false
          reason = '"Code" must be a string.'
          throw new Error(reason)
        }
        if (tx.code.length !== 6) {
          success = false
          reason = '"Code" length must be 6 digits.'
          throw new Error(reason)
        }
        if (typeof parseInt(tx.code) !== 'number') {
          success = false
          reason = '"Code" must be parseable to an integer.'
          throw new Error(reason)
        }
        break
      }
      case 'register': {
        if (typeof tx.aliasHash !== 'string') {
          success = false
          reason = '"aliasHash" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.alias !== 'string') {
          success = false
          reason = '"alias" must be a string.'
          throw new Error(reason)
        }
        if (tx.alias.length >= 20) {
          success = false
          reason = '"alias" must be less than 21 characters (20 max)'
          throw new Error(reason)
        }
        break
      }
      case 'create': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"Amount" must be a number.'
          throw new Error(reason)
        }
        break
      }
      case 'transfer': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"Amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount <= 0) {
          success = false
          reason = '"Amount" must be a positive number.'
          throw new Error(reason)
        }
        break
      }
      case 'distribute': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (Array.isArray(tx.recipients) !== true) {
          success = false
          reason = '"Recipients" must be an array.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"Amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount <= 0) {
          success = false
          reason = '"Amount" must be a positive number.'
          throw new Error(reason)
        }
        break
      }
      case 'node_reward': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string'
          throw new Error(reason)
        }
        if (typeof tx.nodeId !== 'string') {
          success = false
          reason = '"nodeId" must be a string'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string'
          throw new Error(reason)
        }
        break
      }
      case 'message': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.message !== 'string') {
          success = false
          reason = '"Message" must be a string.'
          throw new Error(reason)
        }
        if (tx.message.length > 5000) {
          success = false
          reason = '"Message" length must be less than 5000 characters.'
          throw new Error(reason)
        }
        break
      }
      case 'toll': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.toll !== 'number') {
          success = false
          reason = '"Toll" must be a number.'
          throw new Error(reason)
        }
        if (tx.toll < 1) {
          success = false
          reason = 'Minimum "toll" allowed is 1 token'
          throw new Error(reason)
        }
        if (tx.toll > 1000000) {
          success = false
          reason = 'Maximum toll allowed is 1,000,000 tokens.'
          throw new Error(reason)
        }
        break
      }
      case 'friend': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.alias !== 'string') {
          success = false
          reason = '"Message" must be a string.'
          throw new Error(reason)
        }
        break
      }
      case 'remove_friend': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        break
      }
      case 'stake': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.stake !== 'number') {
          success = false
          reason = '"Stake" must be a number.'
          throw new Error(reason)
        }
        break
      }
      case 'snapshot_claim': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        break
      }
      case 'proposal': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.proposal !== 'string') {
          success = false
          reason = '"Proposal" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.issue !== 'string') {
          success = false
          reason = '"Issue" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.parameters !== 'object') {
          success = false
          reason = '"Parameters" must be an object.'
          throw new Error(reason)
        }
        // if (tx.timestamp < network.windows.proposalWindow[0] || tx.timestamp > network.windows.proposalWindow[1]) {
        //   success = false
        //   reason = '"Network is not currently accepting issues or proposals"'
        //   throw new Error(reason)
        // }
        break
      }
      case 'dev_proposal': {
        if (typeof tx.devIssue !== 'string') {
          success = false
          reason = '"devIssue" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.devProposal !== 'string') {
          success = false
          reason = '"devProposal" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.totalAmount !== 'number') {
          success = false
          reason = '"totalAmount" must be a number.'
          throw new Error(reason)
        }
        if (tx.totalAmount < 1) {
          success = false
          reason = 'Minimum "totalAmount" allowed is 1 token'
          throw new Error(reason)
        }
        if (tx.totalAmount > 100000) {
          success = false
          reason = 'Maximum "totalAmount" allowed is 100,000 tokens'
          throw new Error(reason)
        }
        if (Array.isArray(tx.payments) !== true) {
          success = false
          reason = '"payments" must be an array.'
          throw new Error(reason)
        }
        if (typeof tx.description !== 'string') {
          success = false
          reason = '"description" must be a string.'
          throw new Error(reason)
        }
        if (tx.description.length < 1) {
          success = false
          reason = 'Minimum "description" character count is 1'
          throw new Error(reason)
        }
        if (tx.description.length > 1000) {
          success = false
          reason = 'Maximum "description" character count is 1000'
          throw new Error(reason)
        }
        if (typeof tx.payAddress !== 'string') {
          success = false
          reason = '"payAddress" must be a string.'
          throw new Error(reason)
        }
        if (tx.payAddress.length !== 64) {
          success = false
          reason = '"payAddress" length must be 64 characters (A valid public address)'
          throw new Error(reason)
        }
        // if (tx.timestamp < network.devWindows.devProposalWindow[0] || tx.timestamp > network.devWindows.devProposalWindow[1]) {
        //   success = false
        //   reason = 'Network is not accepting dev proposals'
        //   throw new Error(reason)
        // }
        break
      }
      case 'vote': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount < 1) {
          success = false
          reason = 'Minimum voting "amount" allowed is 1 token'
          throw new Error(reason)
        }
        if (typeof tx.issue !== 'string') {
          success = false
          reason = '"issue" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.proposal !== 'string') {
          success = false
          reason = '"Proposal" must be a string.'
          throw new Error(reason)
        }
        // if (tx.timestamp < network.windows.votingWindow[0] || tx.timestamp > network.windows.votingWindow[1]) {
        //   success = false
        //   reason = 'Network is not currently accepting votes'
        //   throw new Error(reason)
        // }
        break
      }
      case 'dev_vote': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount < 1) {
          success = false
          reason = 'Minimum voting "amount" allowed is 1 token'
          throw new Error(reason)
        }
        if (typeof tx.approve !== 'boolean') {
          success = false
          reason = '"approve" must be a boolean.'
          throw new Error(reason)
        }
        if (typeof tx.devProposal !== 'string') {
          success = false
          reason = '"devProposal" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.devIssue !== 'string') {
          success = false
          reason = '"devIssue" must be a string.'
          throw new Error(reason)
        }
        // if (tx.timestamp < network.devWindows.devVotingWindow[0] || tx.timestamp > network.devWindows.devVotingWindow[1]) {
        //   success = false
        //   reason = 'Network is not currently accepting dev votes'
        //   throw new Error(reason)
        // }
        break
      }
      case 'developer_payment': {
        if (typeof tx.payment !== 'object') {
          success = false
          reason = '"Payment" must be an object.'
          throw new Error(reason)
        }
        if (typeof tx.payment.amount !== 'number') {
          success = false
          reason = '"payment.amount" must be a number.'
          throw new Error(reason)
        }
        break
      }
      default: {
        return {
          success,
          reason,
          txnTimestamp,
        }
      }
    }

    return {
      success,
      reason,
      txnTimestamp,
    }
  },
  apply(tx: any, wrappedStates: { [id: string]: WrappedAccount }) {
    const from = wrappedStates[tx.from] && wrappedStates[tx.from].data
    const to = wrappedStates[tx.to] && wrappedStates[tx.to].data
    // Validate the tx
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

    // Apply the tx
    switch (tx.type) {
      case 'init_network': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        network.timestamp = tx.timestamp
        console.log(`init_network NETWORK_ACCOUNT: ${stringify(network)}`)
        // from.timestamp = tx.timestamp
        dapp.log('Applied init_network transaction', network)
        break
      }
      case 'snapshot': {
        to.snapshot = tx.snapshot
        to.timestamp = tx.timestamp
        dapp.log('Applied snapshot tx', to)
        break
      }
      case 'email': {
        const source: UserAccount = wrappedStates[tx.signedTx.from].data
        const nodeId = dapp.getNodeId()
        const { address } = dapp.getNode(nodeId)
        const [closest] = dapp.getClosestNodes(tx.signedTx.from, 5)
        if (nodeId === closest) {
          const baseNumber = 99999
          const randomNumber = Math.floor(Math.random() * 899999) + 1
          const verificationNumber = baseNumber + randomNumber

          axios.post('http://arimaa.com/mailAPI/index.cgi', {
            from: 'liberdus.verify',
            to: `${tx.email}`,
            subject: 'Verify your email for liberdus',
            message: `Please verify your email address by sending a "verify" transaction with the number: ${verificationNumber}`,
            secret: 'Liberdus',
          })

          dapp.put({
            type: 'gossip_email_hash',
            nodeId,
            account: source.id,
            from: address,
            emailHash: tx.signedTx.emailHash,
            verified: crypto.hash(`${verificationNumber}`),
            timestamp: Date.now(),
          })
        }
        dapp.log('Applied email tx', source)
        break
      }
      case 'gossip_email_hash': {
        // const targets = tx.targets.map(target => wrappedStates[target].data)
        const account: UserAccount = wrappedStates[tx.account].data
        account.emailHash = tx.emailHash
        account.verified = tx.verified
        account.timestamp = tx.timestamp
        dapp.log('Applied gossip_email_hash tx', account)
        break
      }
      case 'verify': {
        from.verified = true
        from.timestamp = tx.timestamp
        dapp.log('Applied verify tx', from)
        break
      }
      case 'register': {
        const alias: AliasAccount = wrappedStates[tx.aliasHash].data
        // from.data.balance -= network.current.transactionFee
        // from.data.balance -= maintenanceAmount(tx.timestamp, from)
        alias.inbox = tx.alias
        from.alias = tx.alias
        alias.address = tx.from
        // from.data.transactions.push({ ...tx, txId })
        alias.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        dapp.log('Applied register tx', from, alias)
        break
      }
      case 'create': {
        to.data.balance += tx.amount
        to.timestamp = tx.timestamp

        // to.data.transactions.push({ ...tx, txId })
        dapp.log('Applied create tx', to)
        break
      }
      case 'transfer': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        from.data.balance -= tx.amount + network.current.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, network)
        to.data.balance += tx.amount
        from.data.transactions.push({ ...tx, txId })
        to.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        dapp.log('Applied transfer tx', from, to)
        break
      }
      case 'distribute': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const recipients: UserAccount[] = tx.recipients.map((id: string) => wrappedStates[id].data)
        from.data.balance -= network.current.transactionFee
        // from.data.transactions.push({ ...tx, txId })
        for (const user of recipients) {
          from.data.balance -= tx.amount
          user.data.balance += tx.amount
          // recipient.data.transactions.push({ ...tx, txId })
        }
        from.data.balance -= maintenanceAmount(tx.timestamp, from, network)
        dapp.log('Applied distribute transaction', from, recipients)
        break
      }
      case 'message': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const chat = wrappedStates[tx.chatId].data
        from.data.balance -= network.current.transactionFee
        if (!to.data.friends[from.id]) {
          from.data.balance -= to.data.toll
          to.data.balance += to.data.toll
        }
        from.data.balance -= maintenanceAmount(tx.timestamp, from, network)

        if (!from.data.chats[tx.to]) from.data.chats[tx.to] = tx.chatId
        if (!to.data.chats[tx.from]) to.data.chats[tx.from] = tx.chatId

        chat.messages.push(tx.message)
        // from.data.transactions.push({ ...tx, txId })
        // to.data.transactions.push({ ...tx, txId })

        chat.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp

        dapp.log('Applied message tx', chat, from, to)
        break
      }
      case 'toll': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        from.data.balance -= network.current.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, network)
        from.data.toll = tx.toll
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        dapp.log('Applied toll tx', from)
        break
      }
      case 'friend': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        from.data.balance -= network.current.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, network)
        from.data.friends[tx.to] = tx.alias
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        dapp.log('Applied friend tx', from)
        break
      }
      case 'remove_friend': {
        from.data.friends[tx.to] = null
        from.timestamp = tx.timestamp
        // from.data.transactions.push({ ...tx, txId })
        dapp.log('Applied remove_friend tx', from)
        break
      }
      case 'stake': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        from.data.balance -= tx.stake
        from.data.balance -= maintenanceAmount(tx.timestamp, from, network)
        from.data.stake = tx.stake
        from.timestamp = tx.timestamp
        // from.data.transactions.push({ ...tx, txId })
        dapp.log('Applied stake tx', from)
        break
      }
      case 'node_reward': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        to.balance += network.current.nodeRewardAmount
        from.nodeRewardTime = tx.timestamp
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        dapp.log('Applied node_reward tx', from, to)
        break
      }
      case 'snapshot_claim': {
        from.data.balance += to.snapshot[tx.from]
        to.snapshot[tx.from] = 0
        // from.data.transactions.push({ ...tx, txId })
        from.claimedSnapshot = true
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        dapp.log('Applied snapshot_claim tx', from, to)
        break
      }
      case 'issue': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const issue: IssueAccount = wrappedStates[tx.issue].data
        const proposal: ProposalAccount = wrappedStates[tx.proposal].data

        proposal.parameters = _.cloneDeep(network.current)
        proposal.parameters.title = 'Default parameters'
        proposal.parameters.description = 'Keep the current network parameters as they are'
        proposal.number = 1

        issue.number = network.issue
        issue.active = true
        issue.proposals.push(proposal.id)
        issue.proposalCount++

        from.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        dapp.log('Applied issue tx', issue, proposal)
        break
      }
      case 'dev_issue': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data

        devIssue.number = network.devIssue
        devIssue.active = true

        from.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        dapp.log('Applied dev_issue tx', devIssue)
        break
      }
      case 'proposal': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const proposal: ProposalAccount = wrappedStates[tx.proposal].data
        const issue: IssueAccount = wrappedStates[tx.issue].data

        from.data.balance -= network.current.proposalFee
        from.data.balance -= network.current.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, network)

        proposal.parameters = tx.parameters
        issue.proposalCount++
        proposal.number = issue.proposalCount
        issue.proposals.push(proposal.id)

        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        dapp.log('Applied proposal tx', from, issue, proposal)
        break
      }
      case 'dev_proposal': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data
        const devProposal: DevProposalAccount = wrappedStates[tx.devProposal].data

        from.data.balance -= network.current.devProposalFee
        from.data.balance -= network.current.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, network)

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
        dapp.log('Applied dev_proposal tx', from, devIssue, devProposal)
        break
      }
      case 'vote': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const proposal: ProposalAccount = wrappedStates[tx.proposal].data
        from.data.balance -= tx.amount
        from.data.balance -= network.current.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, network)
        proposal.power += tx.amount
        proposal.totalVotes++

        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        dapp.log('Applied vote tx', from, proposal)
        break
      }
      case 'dev_vote': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const devProposal: DevProposalAccount = wrappedStates[tx.devProposal].data

        from.data.balance -= tx.amount
        from.data.balance -= network.current.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, network)

        if (tx.approve) {
          devProposal.approve += tx.amount
        } else {
          devProposal.reject += tx.amount
        }

        devProposal.totalVotes++
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        devProposal.timestamp = tx.timestamp
        dapp.log('Applied dev_vote tx', from, devProposal)
        break
      }
      case 'tally': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const issue: IssueAccount = wrappedStates[tx.issue].data
        const margin = 100 / (2 * (issue.proposalCount + 1)) / 100

        const defaultProposal: ProposalAccount = wrappedStates[crypto.hash(`issue-${issue.number}-proposal-1`)].data
        const sortedProposals: ProposalAccount[] = tx.proposals
          .map((id: string) => wrappedStates[id].data)
          .sort((a: ProposalAccount, b: ProposalAccount) => a.power < b.power)
        let winner = defaultProposal

        for (const proposal of sortedProposals) {
          proposal.winner = false
        }

        if (sortedProposals.length >= 2) {
          const firstPlace = sortedProposals[0]
          const secondPlace = sortedProposals[1]
          const marginToWin = secondPlace.power + margin * secondPlace.power
          if (firstPlace.power >= marginToWin) {
            winner = firstPlace
          }
        }

        winner.winner = true // CHICKEN DINNER
        const next = winner.parameters
        const nextWindows: Windows = {
          proposalWindow: [network.windows.applyWindow[1], network.windows.applyWindow[1] + TIME_FOR_PROPOSALS],
          votingWindow: [network.windows.applyWindow[1] + TIME_FOR_PROPOSALS, network.windows.applyWindow[1] + TIME_FOR_PROPOSALS + TIME_FOR_VOTING],
          graceWindow: [
            network.windows.applyWindow[1] + TIME_FOR_PROPOSALS + TIME_FOR_VOTING,
            network.windows.applyWindow[1] + TIME_FOR_PROPOSALS + TIME_FOR_VOTING + TIME_FOR_GRACE,
          ],
          applyWindow: [
            network.windows.applyWindow[1] + TIME_FOR_PROPOSALS + TIME_FOR_VOTING + TIME_FOR_GRACE,
            network.windows.applyWindow[1] + TIME_FOR_PROPOSALS + TIME_FOR_VOTING + TIME_FOR_GRACE + TIME_FOR_APPLY,
          ],
        }

        const when = tx.timestamp + ONE_SECOND * 10

        dapp.setGlobal(
          networkAccount,
          {
            type: 'apply_tally',
            timestamp: when,
            network: networkAccount,
            next,
            nextWindows,
          },
          when,
          networkAccount,
        )

        issue.winner = winner.id

        from.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        winner.timestamp = tx.timestamp
        dapp.log('Applied tally tx', issue, winner)
        break
      }
      case 'apply_tally': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        network.next = tx.next
        network.nextWindows = tx.nextWindows
        network.timestamp = tx.timestamp
        dapp.log(`APPLIED TALLY GLOBAL ${stringify(network)} ===`)
        break
      }
      case 'dev_tally': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data
        const devProposals: DevProposalAccount[] = tx.devProposals.map((id: string) => wrappedStates[id].data)
        let nextDeveloperFund: DeveloperPayment[] = []

        for (const devProposal of devProposals) {
          if (devProposal.approve >= devProposal.reject + devProposal.reject * 0.15) {
            devProposal.approved = true
            const payments = []
            for (const payment of devProposal.payments) {
              payments.push({
                timestamp: tx.timestamp + TIME_FOR_DEV_GRACE + payment.delay,
                amount: payment.amount * devProposal.totalAmount,
                address: devProposal.payAddress,
                id: crypto.hashObj(payment),
              })
            }
            nextDeveloperFund = [...network.nextDeveloperFund, ...payments]
            devProposal.timestamp = tx.timestamp
            devIssue.winners.push(devProposal.id)
          } else {
            devProposal.approved = false
            devProposal.timestamp = tx.timestamp
          }
        }

        const nextDevWindows: DevWindows = {
          devProposalWindow: [network.devWindows.devApplyWindow[1], network.devWindows.devApplyWindow[1] + TIME_FOR_DEV_PROPOSALS],
          devVotingWindow: [
            network.devWindows.devApplyWindow[1] + TIME_FOR_DEV_PROPOSALS,
            network.devWindows.devApplyWindow[1] + TIME_FOR_DEV_PROPOSALS + TIME_FOR_DEV_VOTING,
          ],
          devGraceWindow: [
            network.devWindows.devApplyWindow[1] + TIME_FOR_DEV_PROPOSALS + TIME_FOR_DEV_VOTING,
            network.devWindows.devApplyWindow[1] + TIME_FOR_DEV_PROPOSALS + TIME_FOR_DEV_VOTING + TIME_FOR_DEV_GRACE,
          ],
          devApplyWindow: [
            network.devWindows.devApplyWindow[1] + TIME_FOR_DEV_PROPOSALS + TIME_FOR_DEV_VOTING + TIME_FOR_DEV_GRACE,
            network.devWindows.devApplyWindow[1] + TIME_FOR_DEV_PROPOSALS + TIME_FOR_DEV_VOTING + TIME_FOR_DEV_GRACE + TIME_FOR_DEV_APPLY,
          ],
        }

        const when = tx.timestamp + ONE_SECOND * 10

        dapp.setGlobal(
          networkAccount,
          {
            type: 'apply_dev_tally',
            timestamp: when,
            network: networkAccount,
            nextDeveloperFund,
            nextDevWindows,
          },
          when,
          networkAccount,
        )

        from.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        dapp.log('Applied dev_tally tx', devIssue, devProposals)
        break
      }
      case 'apply_dev_tally': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        network.nextDeveloperFund = tx.nextDeveloperFund
        network.nextDevWindows = tx.nextDevWindows
        network.timestamp = tx.timestamp
        dapp.log(`=== APPLIED DEV_TALLY GLOBAL ${stringify(network)} ===`)
        break
      }
      case 'parameters': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const issue: IssueAccount = wrappedStates[tx.issue].data

        const when = tx.timestamp + ONE_SECOND * 10

        dapp.setGlobal(
          networkAccount,
          {
            type: 'apply_parameters',
            timestamp: when,
            network: networkAccount,
            current: network.next,
            next: {},
            windows: network.nextWindows,
            nextWindows: {},
            issue: network.issue + 1,
          },
          when,
          networkAccount,
        )

        issue.active = false

        from.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        dapp.log('Applied parameters tx', issue)
        break
      }
      case 'apply_parameters': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        network.current = tx.current
        network.next = tx.next
        network.windows = tx.windows
        network.nextWindows = tx.nextWindows
        network.issue = tx.issue
        network.timestamp = tx.timestamp
        dapp.log(`=== APPLIED PARAMETERS GLOBAL ${stringify(network)} ===`)
        break
      }
      case 'dev_parameters': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data
        const when = tx.timestamp + ONE_SECOND * 10

        dapp.setGlobal(
          networkAccount,
          {
            type: 'apply_dev_parameters',
            timestamp: when,
            network: networkAccount,
            devWindows: network.nextDevWindows,
            nextDevWindows: {},
            developerFund: [...network.developerFund, ...network.nextDeveloperFund].sort((a, b) => a.timestamp - b.timestamp),
            nextDeveloperFund: [],
            devIssue: network.devIssue + 1,
          },
          when,
          networkAccount,
        )

        devIssue.active = false

        from.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        dapp.log('Applied dev_parameters tx', from, devIssue)
        break
      }
      case 'apply_dev_parameters': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        network.devWindows = tx.devWindows
        network.nextDevWindows = tx.nextDevWindows
        network.developerFund = tx.developerFund
        network.nextDeveloperFund = tx.nextDeveloperFund
        network.devIssue = tx.devIssue
        network.timestamp = tx.timestamp
        break
      }
      case 'developer_payment': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        const developer: UserAccount = wrappedStates[tx.developer].data
        developer.data.balance += tx.payment.amount

        const when = tx.timestamp + ONE_SECOND * 10

        dapp.setGlobal(
          networkAccount,
          {
            type: 'apply_developer_payment',
            timestamp: when,
            network: networkAccount,
            developerFund: network.developerFund.filter((payment: DeveloperPayment) => payment.id !== tx.payment.id),
          },
          when,
          networkAccount,
        )

        developer.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        dapp.log('Applied developer_payment tx', from, developer)
        break
      }
      case 'apply_developer_payment': {
        const network: NetworkAccount = wrappedStates[tx.network].data
        network.developerFund = tx.developerFund
        network.timestamp = tx.timestamp
        dapp.log(`=== APPLIED DEV_PAYMENT GLOBAL ${stringify(network)} ===`)
        break
      }
    }
    return applyResponse
  },
  getKeyFromTransaction(tx: any): Shardus.TransactionKeys {
    const result: TransactionKeys = {
      sourceKeys: [],
      targetKeys: [],
      allKeys: [],
      timestamp: tx.timestamp,
    }
    switch (tx.type) {
      case 'init_network':
        // result.sourceKeys = [tx.from]
        result.targetKeys = [tx.network]
        break
      case 'snapshot':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.network]
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
        result.targetKeys = [tx.to, tx.network]
        break
      case 'distribute':
        result.sourceKeys = [tx.from]
        result.targetKeys = [...tx.recipients, tx.network]
        break
      case 'message':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.chatId, tx.network]
        break
      case 'toll':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.network]
        break
      case 'friend':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.network]
        break
      case 'remove_friend':
        result.sourceKeys = [tx.from]
        break
      case 'node_reward':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.network]
        break
      case 'stake':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.network]
        break
      case 'claim_reward':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.network]
        break
      case 'snapshot_claim':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.network]
        break
      case 'issue':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.issue, tx.proposal, tx.network]
        break
      case 'dev_issue':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devIssue, tx.network]
        break
      case 'proposal':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.issue, tx.proposal, tx.network]
        break
      case 'dev_proposal':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devIssue, tx.devProposal, tx.network]
        break
      case 'vote':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.issue, tx.proposal, tx.network]
        break
      case 'dev_vote':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devIssue, tx.devProposal, tx.network]
        break
      case 'tally':
        result.sourceKeys = [tx.from]
        result.targetKeys = [...tx.proposals, tx.issue, tx.network]
        break
      case 'apply_tally':
        result.targetKeys = [tx.network]
        break
      case 'dev_tally':
        result.sourceKeys = [tx.from]
        result.targetKeys = [...tx.devProposals, tx.devIssue, tx.network]
        break
      case 'apply_dev_tally':
        result.targetKeys = [tx.network]
        break
      case 'parameters':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.network, tx.issue]
        break
      case 'apply_parameters':
        result.targetKeys = [tx.network]
        break
      case 'dev_parameters':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devIssue, tx.network]
        break
      case 'apply_dev_parameters':
        result.targetKeys = [tx.network]
        break
      case 'developer_payment':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.developer, tx.network]
        break
      case 'apply_developer_payment':
        result.targetKeys = [tx.network]
        break
    }
    result.allKeys = result.allKeys.concat(result.sourceKeys, result.targetKeys)
    return result
  },
  getStateId(accountAddress: string, mustExist = true): string {
    const account = accounts[accountAddress]
    if ((typeof account === 'undefined' || account === null) && mustExist === true) {
      throw new Error('Could not get stateId for account ' + accountAddress)
    }
    const stateId = account.hash
    return stateId
  },
  deleteLocalAccountData(): void {
    accounts = {}
  },
  setAccountData(accountRecords: Account[]): void {
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
      if (accountId === networkAccount) {
        account = createNetworkAccount(accountId, tx.timestamp)
        accounts[accountId] = account
        accountCreated = true
      } else if (tx.type === 'issue') {
        if (accountId === tx.issue) {
          account = createIssue(accountId)
          accounts[accountId] = account
          accountCreated = true
        } else if (accountId === tx.proposal) {
          account = createProposal(accountId, tx.parameters)
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'dev_issue') {
        if (accountId === tx.devIssue) {
          account = createDevIssue(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'dev_proposal') {
        if (accountId === tx.devProposal) {
          account = createDevProposal(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'proposal') {
        if (accountId === tx.proposal) {
          account = createProposal(accountId, tx.parameters)
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'register') {
        if (accountId === tx.aliasHash) {
          account = createAlias(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'message') {
        if (accountId === tx.chatId) {
          account = createChat(accountId)
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'node_reward') {
        if (accountId === tx.from && accountId === tx.to) {
          account = createNode(accountId)
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
    console.log(`calculateAccountHash NETWORK_ACCOUNT before: ${stringify(account)}`)
    account.hash = '' // Not sure this is really necessary
    account.hash = crypto.hashObj(account)
    console.log(`calculateAccountHash NETWORK_ACCOUNT after: ${stringify(account)}`)
    return account.hash
  },
  resetAccountData(accountBackupCopies: Account[]): void {
    console.log('RESET_ACCOUNT_DATA', stringify(accountBackupCopies))
    for (const recordData of accountBackupCopies) {
      accounts[recordData.id] = recordData
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
})

dapp.registerExceptionHandler()

// NODE_REWARD TRANSACTION FUNCTION
function nodeReward(address: string, nodeId: string): void {
  const payAddress = address
  const tx = {
    type: 'node_reward',
    network: networkAccount,
    nodeId: nodeId,
    from: address,
    to: payAddress,
    timestamp: Date.now(),
  }
  dapp.put(tx)
}

// ISSUE TRANSACTION FUNCTION
async function generateIssue(address: string, nodeId: string): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(networkAccount)
  const network: NetworkAccount = account.data
  const tx = {
    type: 'issue',
    network: networkAccount,
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
  const account = await dapp.getLocalOrRemoteAccount(networkAccount)
  const network: NetworkAccount = account.data
  const tx = {
    type: 'dev_issue',
    network: networkAccount,
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
    const account = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${network.data.issue}`))
    const issue: IssueAccount = account.data
    const tx = {
      type: 'tally',
      nodeId,
      from: address,
      network: networkAccount,
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
    const network = await dapp.getLocalOrRemoteAccount(networkAccount)
    const account = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${network.data.devIssue}`))
    const devIssue: DevIssueAccount = account.data
    const tx = {
      type: 'dev_tally',
      nodeId,
      from: address,
      network: networkAccount,
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
  const account = await dapp.getLocalOrRemoteAccount(networkAccount)
  const network: NetworkAccount = account.data
  const tx = {
    type: 'parameters',
    nodeId,
    from: address,
    network: networkAccount,
    issue: crypto.hash(`issue-${network.issue}`),
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_APPLY: ', nodeId)
}

// APPLY_DEV_PARAMETERS TRANSACTION FUNCTION
async function applyDevParameters(address: string, nodeId: string): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(networkAccount)
  const network: NetworkAccount = account.data
  const tx = {
    type: 'dev_parameters',
    nodeId,
    from: address,
    network: networkAccount,
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
    network: networkAccount,
    developer: payment.address,
    payment: payment,
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_DEV_FUND_RELEASE: ', nodeId)
}

// CODE THAT GETS EXECUTED WHEN NODES START
;(async (): Promise<void> => {
  const cycleInterval = cycleDuration * ONE_SECOND

  let network: NetworkAccount

  let issueGenerated = false
  let tallyGenerated = false
  let applyGenerated = false

  let devIssueGenerated = false
  let devTallyGenerated = false
  let devApplyGenerated = false

  let nodeId: string
  let nodeAddress: string
  let lastReward: number
  let cycleData: Shardus.Cycle
  let cycleStartTimestamp: number
  let luckyNode: string
  let expected = Date.now() + cycleInterval
  let drift: number

  await dapp.start()

  // THIS CODE IS CALLED ON EVERY NODE ON EVERY CYCLE
  async function networkMaintenance(): Promise<NodeJS.Timeout> {
    drift = Date.now() - expected

    try {
      const account = await dapp.getLocalOrRemoteAccount(networkAccount)
      network = account.data
      ;[cycleData] = dapp.getLatestCycles()
      cycleStartTimestamp = cycleData.start * 1000
      ;[luckyNode] = dapp.getClosestNodes(cycleData.marker, 3)
      nodeId = dapp.getNodeId()
      nodeAddress = dapp.getNode(nodeId).address
    } catch (err) {
      dapp.log('ERR: ', err)
      console.log('ERR: ', err)
      return setTimeout(networkMaintenance, 100)
    }

    dapp.log('cycleData: ', cycleData)
    dapp.log('luckyNode: ', luckyNode)
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
    if (cycleStartTimestamp - lastReward > network.current.nodeRewardInterval) {
      nodeReward(nodeAddress, nodeId)
      lastReward = cycleStartTimestamp
    }

    // ISSUE
    if (cycleStartTimestamp >= network.windows.proposalWindow[0] && cycleStartTimestamp <= network.windows.proposalWindow[1]) {
      if (!issueGenerated && network.issue > 1) {
        if (nodeId === luckyNode) {
          await generateIssue(nodeAddress, nodeId)
        }
        issueGenerated = true
        tallyGenerated = false
        applyGenerated = false
      }
    }

    // TALLY
    if (cycleStartTimestamp >= network.windows.graceWindow[0] && cycleStartTimestamp <= network.windows.graceWindow[1]) {
      if (!tallyGenerated) {
        if (nodeId === luckyNode) {
          await tallyVotes(nodeAddress, nodeId)
        }
        issueGenerated = false
        tallyGenerated = true
        applyGenerated = false
      }
    }

    // APPLY
    if (cycleStartTimestamp >= network.windows.applyWindow[0] && cycleStartTimestamp <= network.windows.applyWindow[1]) {
      if (!applyGenerated) {
        if (nodeId === luckyNode) {
          await applyParameters(nodeAddress, nodeId)
        }
        issueGenerated = false
        tallyGenerated = false
        applyGenerated = true
      }
    }

    // DEV_ISSUE
    if (cycleStartTimestamp >= network.devWindows.devProposalWindow[0] && cycleStartTimestamp <= network.devWindows.devProposalWindow[1]) {
      if (!devIssueGenerated && network.devIssue > 1) {
        if (nodeId === luckyNode) {
          await generateDevIssue(nodeAddress, nodeId)
        }
        devIssueGenerated = true
        devTallyGenerated = false
        devApplyGenerated = false
      }
    }

    // DEV_TALLY
    if (cycleStartTimestamp >= network.devWindows.devGraceWindow[0] && cycleStartTimestamp <= network.devWindows.devGraceWindow[1]) {
      if (!devTallyGenerated) {
        if (nodeId === luckyNode) {
          await tallyDevVotes(nodeAddress, nodeId)
        }
        devIssueGenerated = false
        devTallyGenerated = true
        devApplyGenerated = false
      }
    }

    // DEV_APPLY
    if (cycleStartTimestamp >= network.devWindows.devApplyWindow[0] && cycleStartTimestamp <= network.devWindows.devApplyWindow[1]) {
      if (!devApplyGenerated) {
        if (nodeId === luckyNode) {
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
      if (cycleStartTimestamp >= payment.timestamp) {
        if (nodeId === luckyNode) {
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

    expected += cycleInterval
    return setTimeout(networkMaintenance, Math.max(0, cycleInterval - drift))
  }

  dapp.p2p.on(
    'active',
    async (): Promise<NodeJS.Timeout> => {
      if (dapp.p2p.isFirstSeed) {
        await _sleep(ONE_SECOND * cycleDuration * 2)
      }
      lastReward = Date.now()
      return setTimeout(networkMaintenance, cycleInterval)
    },
  )
})()
