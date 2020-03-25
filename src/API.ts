import { dapp, networkAccount, accounts } from './'
import { NODE_PARAMS } from './parameters'
import * as heapdump from 'heapdump'
import * as crypto from 'shardus-crypto-utils'
import config from './config'
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

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
  'network/parameters/node',
  async (_req, res): Promise<void> => {
    try {
      res.json({
        parameters: {
          CURRENT: NODE_PARAMS.CURRENT,
          NEXT: NODE_PARAMS.NEXT,
          ISSUE: NODE_PARAMS.ISSUE,
          DEV_ISSUE: NODE_PARAMS.DEV_ISSUE,
          DEVELOPER_FUND: NODE_PARAMS.DEVELOPER_FUND,
          NEXT_DEVELOPER_FUND: NODE_PARAMS.NEXT_DEVELOPER_FUND,
          WINDOWS: NODE_PARAMS.WINDOWS,
          NEXT_WINDOWS: NODE_PARAMS.NEXT_WINDOWS,
          DEV_WINDOWS: NODE_PARAMS.DEV_WINDOWS,
          NEXT_DEV_WINDOWS: NODE_PARAMS.NEXT_DEV_WINDOWS,
          IN_SYNC: NODE_PARAMS.IN_SYNC,
        },
      })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'network/parameters/node/next',
  async (_req, res): Promise<void> => {
    try {
      res.json({ parameters: NODE_PARAMS.NEXT })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'network/parameters',
  async (_req, res): Promise<void> => {
    try {
      const account = await dapp.getLocalOrRemoteAccount(networkAccount)
      const network: NetworkAccount = account.data
      res.json({
        parameters: {
          CURRENT: network.current,
          NEXT: network.next,
          DEVELOPER_FUND: network.developerFund,
          NEXT_DEVELOPER_FUND: network.nextDeveloperFund,
          WINDOWS: network.windows,
          DEV_WINDOWS: network.devWindows,
          NEXT_WINDOWS: network.nextWindows,
          NEXT_DEV_WINDOWS: network.nextDevWindows,
          ISSUE: network.issue,
          DEV_ISSUE: network.devIssue,
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
  async (_req, res): Promise<void> => {
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
  async (_req, res): Promise<void> => {
    try {
      res.json({
        windows: NODE_PARAMS.WINDOWS,
        devWindows: NODE_PARAMS.DEV_WINDOWS,
      })
    } catch (error) {
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'network/windows',
  async (_req, res): Promise<void> => {
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
  async (_req, res): Promise<void> => {
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
  async (_req, res): Promise<void> => {
    try {
      const issues = []
      for (let i = 1; i <= NODE_PARAMS.ISSUE; i++) {
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
  async (_req, res): Promise<void> => {
    try {
      const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${NODE_PARAMS.ISSUE}`))
      res.json({ issue: issue && issue.data })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'issues/count',
  async (_req, res): Promise<void> => {
    try {
      res.json({ count: NODE_PARAMS.ISSUE })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'issues/dev',
  async (_req, res): Promise<void> => {
    try {
      const devIssues = []
      for (let i = 1; i <= NODE_PARAMS.DEV_ISSUE; i++) {
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
  async (_req, res): Promise<void> => {
    try {
      const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${NODE_PARAMS.DEV_ISSUE}`))
      res.json({ devIssue: devIssue && devIssue.data })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'issues/dev/count',
  async (_req, res): Promise<void> => {
    try {
      res.json({ count: NODE_PARAMS.DEV_ISSUE })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'proposals',
  async (_req, res): Promise<void> => {
    try {
      const proposals = []
      for (let i = 1; i <= NODE_PARAMS.ISSUE; i++) {
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
  async (_req, res): Promise<void> => {
    try {
      const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${NODE_PARAMS.ISSUE}`))
      const proposalCount = issue && issue.data.proposalCount
      const proposals = []
      for (let i = 1; i <= proposalCount; i++) {
        const proposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${NODE_PARAMS.ISSUE}-proposal-${i}`))
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
  async (_req, res): Promise<void> => {
    try {
      const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${NODE_PARAMS.ISSUE}`))
      res.json({ count: issue && issue.data.proposalCount })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  },
)

dapp.registerExternalGet(
  'proposals/dev',
  async (_req, res): Promise<void> => {
    try {
      const devProposals = []
      for (let i = 1; i <= NODE_PARAMS.DEV_ISSUE; i++) {
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
  async (_req, res): Promise<void> => {
    try {
      const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${NODE_PARAMS.DEV_ISSUE}`))
      const devProposalCount = issue && issue.data.devProposalCount
      const devProposals = []
      for (let i = 1; i <= devProposalCount; i++) {
        const devProposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${NODE_PARAMS.DEV_ISSUE}-dev-proposal-${i}`))
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
  async (_req, res): Promise<void> => {
    try {
      const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${NODE_PARAMS.DEV_ISSUE}`))
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
        Object.values(account.data.data.chats).forEach((chat: { messages: object[] }) => {
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
  async (_req, res): Promise<void> => {
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

dapp.registerExternalGet('debug/dump', (_req, res): void => {
  const D = new Date()
  const dateString = D.getDate() + '-' + (D.getMonth() + 1) + '-' + D.getFullYear() + '_' + D.getHours() + ':' + D.getMinutes()
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

dapp.registerExternalPost('debug/exit', req => {
  try {
    process.exit(req.body.code)
  } catch (err) {
    console.log(err)
  }
})
