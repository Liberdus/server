import execa from 'execa'
import { resolve } from 'path'
import * as crypto from 'shardus-crypto-utils'
import fs from 'fs'
import axios from 'axios'
import * as utils from '../testUtils'
import { util } from 'prettier'

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

const HOST = 'localhost:9001'

const walletFile = resolve('./wallet.json')
let walletEntries = {}

let networkParams: any

const wallet1 = 'testWallet1'
const wallet2 = 'testWallet2'
let account1: any
let account2: any

function saveEntries(entries, file) {
  const stringifiedEntries = JSON.stringify(entries, null, 2)
  fs.writeFileSync(file, stringifiedEntries)
}

function createEntry(name, id) {
  const account = utils.createAccount()
  if (typeof id === 'undefined' || id === null) {
    id = crypto.hash(name)
  }
  account.id = id
  walletEntries[name] = account
  saveEntries(walletEntries, walletFile)
  return account
}

try {
  walletEntries = require(walletFile)
} catch (e) {
  saveEntries(walletEntries, walletFile)
  console.log(`Created wallet file '${walletFile}'.`)
}

export const transactionsTest = () =>
  describe('Submits and applies transactions successfully', () => {
    it('Creates 2 accounts and submits the "register" transaction for both', async () => {
      account1 = createEntry(wallet1, null)
      account2 = createEntry(wallet2, null)

      await utils.injectTx(
        {
          type: 'register',
          aliasHash: crypto.hash(wallet1),
          from: account1.address,
          alias: wallet1,
          timestamp: Date.now(),
        },
        account1,
      )

      await utils.injectTx(
        {
          type: 'register',
          aliasHash: crypto.hash(wallet2),
          from: account2.address,
          alias: wallet2,
          timestamp: Date.now(),
        },
        account2,
      )

      await utils._sleep(8500)
      let res = await axios.get(`http://${HOST}/address/${crypto.hash(wallet1)}`)
      expect(res.data.address).toBe(account1.address)
      res = await axios.get(`http://${HOST}/address/${crypto.hash(wallet2)}`)
      expect(res.data.address).toBe(account2.address)
    })

    it('Submits a "create" transaction for both accounts with 500 tokens', async () => {
      await utils.injectTx(
        {
          type: 'create',
          from: '0'.repeat(64),
          to: account1.address,
          amount: 500,
          timestamp: Date.now(),
        },
        account1,
        false,
      )

      await utils.injectTx(
        {
          type: 'create',
          from: '0'.repeat(64),
          to: account2.address,
          amount: 500,
          timestamp: Date.now(),
        },
        account2,
        false,
      )

      await utils._sleep(8500)
      let accountData1 = await utils.getAccountData(account1.address)
      let accountData2 = await utils.getAccountData(account2.address)
      expect(accountData1.data.balance).toBe(550)
      expect(accountData2.data.balance).toBe(550)
    })

    it('Submits a "proposal" transaction with both accounts', async () => {
      await utils.waitForWindow('proposal')

      await utils.injectTx(
        {
          type: 'proposal',
          from: account1.address,
          proposal: crypto.hash(`issue-${1}-proposal-${2}`),
          issue: crypto.hash(`issue-${1}`),
          parameters: {
            title: 'Account1 proposal',
            description: 'This is a test proposal submitted by account1. It will change the "nodeRewardAmount" parameter to 100.',
            nodeRewardInterval: 3600000,
            nodeRewardAmount: 100,
            nodePenalty: 10,
            transactionFee: 0.001,
            stakeRequired: 5,
            maintenanceInterval: 86400000,
            maintenanceFee: 0,
            proposalFee: 50,
            devProposalFee: 50,
            faucetAmount: 10,
            defaultToll: 1,
          },
          timestamp: Date.now(),
        },
        account1,
      )

      await utils._sleep(8500)
      let proposal1 = await utils.getAccountData(crypto.hash(`issue-${1}-proposal-${2}`))
      expect(proposal1.parameters).toEqual({
        title: 'Account1 proposal',
        description: 'This is a test proposal submitted by account1. It will change the "nodeRewardAmount" parameter to 100.',
        nodeRewardInterval: 3600000,
        nodeRewardAmount: 100,
        nodePenalty: 10,
        transactionFee: 0.001,
        stakeRequired: 5,
        maintenanceInterval: 86400000,
        maintenanceFee: 0,
        proposalFee: 50,
        devProposalFee: 50,
        faucetAmount: 10,
        defaultToll: 1,
      })

      await utils.injectTx(
        {
          type: 'proposal',
          from: account2.address,
          proposal: crypto.hash(`issue-${1}-proposal-${3}`),
          issue: crypto.hash(`issue-${1}`),
          parameters: {
            title: 'Account2 proposal',
            description: 'This is a test proposal submitted by account2. It will change the "defaultToll" parameter to 10.',
            nodeRewardInterval: 3600000,
            nodeRewardAmount: 1,
            nodePenalty: 10,
            transactionFee: 0.001,
            stakeRequired: 5,
            maintenanceInterval: 86400000,
            maintenanceFee: 0,
            proposalFee: 50,
            devProposalFee: 50,
            faucetAmount: 10,
            defaultToll: 10,
          },
          timestamp: Date.now(),
        },
        account2,
      )

      await utils._sleep(8500)
      let proposal2 = await utils.getAccountData(crypto.hash(`issue-${1}-proposal-${3}`))
      expect(proposal2.parameters).toEqual({
        title: 'Account2 proposal',
        description: 'This is a test proposal submitted by account2. It will change the "defaultToll" parameter to 10.',
        nodeRewardInterval: 3600000,
        nodeRewardAmount: 1,
        nodePenalty: 10,
        transactionFee: 0.001,
        stakeRequired: 5,
        maintenanceInterval: 86400000,
        maintenanceFee: 0,
        proposalFee: 50,
        devProposalFee: 50,
        faucetAmount: 10,
        defaultToll: 10,
      })
    })

    it('Submits a "dev_proposal" transaction with both accounts', async () => {
      utils.injectTx(
        {
          type: 'dev_proposal',
          from: account1.address,
          devIssue: crypto.hash(`dev-issue-${1}`),
          devProposal: crypto.hash(`dev-issue-${1}-dev-proposal-${1}`),
          totalAmount: 10000,
          payments: [
            {
              amount: 0.2,
              delay: 0,
            },
            {
              amount: 0.2,
              delay: 20000,
            },
            {
              amount: 0.2,
              delay: 40000,
            },
            {
              amount: 0.2,
              delay: 60000,
            },
            {
              amount: 0.2,
              delay: 80000,
            },
          ],
          title: 'Test dev proposal for account1',
          description: 'This developer proposal will be unit tested',
          payAddress: account1.address,
          timestamp: Date.now(),
        },
        account1,
      )

      await utils._sleep(8500)

      utils.injectTx(
        {
          type: 'dev_proposal',
          from: account2.address,
          devIssue: crypto.hash(`dev-issue-${1}`),
          devProposal: crypto.hash(`dev-issue-${1}-dev-proposal-${2}`),
          totalAmount: 10000,
          payments: [
            {
              amount: 0.2,
              delay: 0,
            },
            {
              amount: 0.2,
              delay: 20000,
            },
            {
              amount: 0.2,
              delay: 40000,
            },
            {
              amount: 0.2,
              delay: 60000,
            },
            {
              amount: 0.2,
              delay: 80000,
            },
          ],
          title: 'Test dev proposal for account2',
          description: 'This developer proposal will be unit tested',
          payAddress: account2.address,
          timestamp: Date.now(),
        },
        account2,
      )

      await utils._sleep(8500)
      let devProposal1 = await utils.getAccountData(crypto.hash(`dev-issue-${1}-dev-proposal-${1}`))
      let devProposal2 = await utils.getAccountData(crypto.hash(`dev-issue-${1}-dev-proposal-${2}`))
      expect(devProposal1.payAddress).toEqual(account1.address)
      expect(devProposal2.payAddress).toEqual(account2.address)
    })

    it('Submits "transfer" transactions between both accounts', async () => {
      networkParams = await utils.queryParameters()
      await utils.injectTx(
        {
          type: 'transfer',
          from: account1.address,
          to: account2.address,
          amount: 50,
          timestamp: Date.now(),
        },
        account1,
      )

      await utils._sleep(8500)
      let accountData1 = await utils.getAccountData(account1.address)
      let accountData2 = await utils.getAccountData(account2.address)
      expect(accountData1.data.balance).toBeCloseTo(400 - networkParams.current.transactionFee * 3)
      expect(accountData2.data.balance).toBeCloseTo(500 - networkParams.current.transactionFee * 2)

      await utils.injectTx(
        {
          type: 'transfer',
          from: account2.address,
          to: account1.address,
          amount: 50,
          timestamp: Date.now(),
        },
        account2,
      )

      await utils._sleep(8500)
      accountData1 = await utils.getAccountData(account1.address)
      accountData2 = await utils.getAccountData(account2.address)
      expect(accountData1.data.balance).toBeCloseTo(450 - networkParams.current.transactionFee * 3)
      expect(accountData2.data.balance).toBeCloseTo(450 - networkParams.current.transactionFee * 3)
    })

    it('Submits a "Toll" transaction successfully', async () => {
      await utils.injectTx(
        {
          type: 'toll',
          from: account1.address,
          toll: 25,
          timestamp: Date.now(),
        },
        account1,
      )

      await utils._sleep(8500)
      let accountData1 = await utils.getAccountData(account1.address)
      expect(accountData1.data.toll).toBe(25)
    })

    it('Submits a "message" transaction successfully', async () => {
      const message = JSON.stringify({
        body: 'Test message',
        handle: 'testWallet1',
        timestamp: Date.now(),
      })
      const encryptedMsg = crypto.encrypt(message, crypto.convertSkToCurve(account2.keys.secretKey), crypto.convertPkToCurve(account1.keys.publicKey))

      await utils.injectTx(
        {
          type: 'message',
          from: account2.address,
          to: account1.address,
          chatId: crypto.hash([account2.address, account1.address].sort((a, b) => a - b).join('')),
          message: encryptedMsg,
          timestamp: Date.now(),
        },
        account2,
      )

      await utils._sleep(8500)
      let accountData1 = await utils.getAccountData(account1.address)
      let accountData2 = await utils.getAccountData(account2.address)
      expect(accountData1.data.balance).toBeCloseTo(475 - networkParams.current.transactionFee * 3)
      expect(accountData2.data.balance).toBeCloseTo(425 - networkParams.current.transactionFee * 4)
    })

    it('Submits a "friend" transaction successfully', async () => {
      await utils.injectTx(
        {
          type: 'friend',
          alias: wallet2,
          from: account1.address,
          to: account2.address,
          timestamp: Date.now(),
        },
        account1,
      )
      await utils._sleep(8500)

      let accountData1 = await utils.getAccountData(account1.address)
      expect(accountData1.data.friends[account2.address]).toBe(wallet2)

      const message = JSON.stringify({
        body: 'Test message after friend transaction',
        handle: wallet2,
        timestamp: Date.now(),
      })
      const encryptedMsg = crypto.encrypt(message, crypto.convertSkToCurve(account2.keys.secretKey), crypto.convertPkToCurve(account1.keys.publicKey))

      await utils.injectTx(
        {
          type: 'message',
          from: account2.address,
          to: account1.address,
          chatId: crypto.hash([account2.address, account1.address].sort((a, b) => a - b).join('')),
          message: encryptedMsg,
          timestamp: Date.now(),
        },
        account2,
      )

      await utils._sleep(8500)

      accountData1 = await utils.getAccountData(account1.address)
      let accountData2 = await utils.getAccountData(account2.address)
      expect(accountData1.data.balance).toBeCloseTo(475 - networkParams.current.transactionFee * 5)
      expect(accountData2.data.balance).toBeCloseTo(425 - networkParams.current.transactionFee * 5)
    })

    it('Submits a "remove_friend" transaction successfully', async () => {
      await utils.injectTx(
        {
          type: 'remove_friend',
          from: account1.address,
          to: account2.address,
          timestamp: Date.now(),
        },
        account1,
      )
      await utils._sleep(8500)

      const message = JSON.stringify({
        body: 'Test message after friend transaction',
        handle: wallet2,
        timestamp: Date.now(),
      })
      const encryptedMsg = crypto.encrypt(message, crypto.convertSkToCurve(account2.keys.secretKey), crypto.convertPkToCurve(account1.keys.publicKey))

      await utils.injectTx(
        {
          type: 'message',
          from: account2.address,
          to: account1.address,
          chatId: crypto.hash([account2.address, account1.address].sort((a, b) => a - b).join('')),
          message: encryptedMsg,
          timestamp: Date.now(),
        },
        account2,
      )

      await utils._sleep(8500)

      let accountData1 = await utils.getAccountData(account1.address)
      let accountData2 = await utils.getAccountData(account2.address)
      expect(accountData1.data.friends).toEqual({})
      expect(accountData1.data.balance).toBeCloseTo(500 - networkParams.current.transactionFee * 5)
      expect(accountData2.data.balance).toBeCloseTo(400 - networkParams.current.transactionFee * 6)
    })

    it('Submits a "stake" transaction successfully', async () => {
      networkParams = await utils.queryParameters()
      await utils.injectTx(
        {
          type: 'stake',
          from: account1.address,
          stake: networkParams.current.stakeRequired,
          timestamp: Date.now(),
        },
        account1,
      )
      await utils._sleep(8500)
      let accountData1 = await utils.getAccountData(account1.address)
      expect(accountData1.data.stake).toBe(networkParams.current.stakeRequired)
    })

    // TODO: Figure out way to test this because of the time needed to wait
    // it('Submits a "remove_stake" transaction successfully', async () => {
    //   let accountData1 = await utils.getAccountData(account1.address)

    //   await utils.injectTx(
    //     {
    //       type: 'remove_stake',
    //       network,
    //       from: account1.address,
    //       stake: accountData1.data.stake,
    //       timestamp: Date.now(),
    //     },
    //     account1,
    //   )
    //   await utils._sleep(8500)
    //   accountData1 = await utils.getAccountData(account1.address)
    //   expect(accountData1.data.stake).toBe(0)
    // })

    it('Submits "vote" transaction successfully', async () => {
      await utils.waitForWindow('voting')
      await utils.injectTx(
        {
          type: 'vote',
          from: account1.address,
          issue: crypto.hash(`issue-${1}`),
          proposal: crypto.hash(`issue-${1}-proposal-${2}`),
          amount: 50,
          timestamp: Date.now(),
        },
        account1,
      )

      await utils._sleep(8500)
      let proposalData = await utils.getAccountData(crypto.hash(`issue-${1}-proposal-${2}`))
      expect(proposalData.power).toBe(50)
    })

    it('Submits "dev_vote" transaction successfully', async () => {
      await utils.waitForWindow('devVoting')
      await utils.injectTx(
        {
          type: 'dev_vote',
          from: account1.address,
          devIssue: crypto.hash(`dev-issue-${1}`),
          devProposal: crypto.hash(`dev-issue-${1}-dev-proposal-${1}`),
          amount: 50,
          approve: true,
          timestamp: Date.now(),
        },
        account1,
      )
      await utils._sleep(8500)
      let proposalData = await utils.getAccountData(crypto.hash(`dev-issue-${1}-dev-proposal-${1}`))
      expect(proposalData.approve).toBe(50)
    })

    it('Ensures the proposal was approved successfully', async () => {
      await utils.waitForWindow('grace')
      networkParams = await utils.queryParameters()
      let proposalData = await utils.getAccountData(crypto.hash(`issue-${1}-proposal-${2}`))
      expect(proposalData.winner).toBe(true)
      expect(networkParams.next).toEqual({
        title: 'Account1 proposal',
        description: 'This is a test proposal submitted by account1. It will change the "nodeRewardAmount" parameter to 100.',
        nodeRewardInterval: 3600000,
        nodeRewardAmount: 100,
        nodePenalty: 10,
        transactionFee: 0.001,
        stakeRequired: 5,
        maintenanceInterval: 86400000,
        maintenanceFee: 0,
        proposalFee: 50,
        devProposalFee: 50,
        faucetAmount: 10,
        defaultToll: 1,
      })
    })

    it('Ensures the developer proposal was approved successfully', async () => {
      await utils.waitForWindow('devGrace')
      let devProposal1 = await utils.getAccountData(crypto.hash(`dev-issue-${1}-dev-proposal-${1}`))
      let devProposal2 = await utils.getAccountData(crypto.hash(`dev-issue-${1}-dev-proposal-${2}`))
      expect(devProposal1.approved).toBe(true)
      expect(devProposal2.approved).toBe(false)
      networkParams = await utils.queryParameters()
      expect(networkParams.nextDeveloperFund).toEqual(Array(5).fill(expect.any(Object)))
    })

    it('Ensures the proposal was applied successfully', async () => {
      await utils.waitForWindow('apply')
      networkParams = await utils.queryParameters()
      expect(networkParams.current).toEqual({
        title: 'Account1 proposal',
        description: 'This is a test proposal submitted by account1. It will change the "nodeRewardAmount" parameter to 100.',
        nodeRewardInterval: 3600000,
        nodeRewardAmount: 100,
        nodePenalty: 10,
        transactionFee: 0.001,
        stakeRequired: 5,
        maintenanceInterval: 86400000,
        maintenanceFee: 0,
        proposalFee: 50,
        devProposalFee: 50,
        faucetAmount: 10,
        defaultToll: 1,
      })
    })

    it('Ensures the developer proposal was applied successfully', async () => {
      await utils.waitForWindow('devApply')
      networkParams = await utils.queryParameters()
      expect(networkParams.developerFund).toEqual(Array(5).fill(expect.any(Object)))
    })

    it('Ensures that the next issue account is generated', async () => {
      await utils.waitForWindow('proposals')
      let issue2 = await utils.getAccountData(crypto.hash(`issue-2`))
      expect(issue2).toBeDefined()
      expect(issue2.number).toBe(2)
    })

    it('Ensures that the next dev_issue account is generated', async () => {
      await utils.waitForWindow('devProposals')
      let devIssue2 = await utils.getAccountData(crypto.hash(`dev-issue-2`))
      expect(devIssue2).toBeDefined()
      expect(devIssue2.number).toBe(2)
    })

    it('Ensures that a developer payment is made to account1', async () => {
      let accountData1 = await utils.getAccountData(account1.address)
      expect(accountData1.data.balance).toBeGreaterThan(2000)
    })
  })
