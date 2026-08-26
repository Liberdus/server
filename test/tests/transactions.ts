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


  })

