import execa from 'execa'
import { resolve } from 'path'
import * as crypto from 'shardus-crypto-utils'
import fs from 'fs'
import axios from 'axios'

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

const HOST = 'localhost:9001'

const walletFile = resolve('./wallet.json')
let walletEntries = {}

const network = '0'.repeat(64)
let networkParams: any

function saveEntries(entries, file) {
  const stringifiedEntries = JSON.stringify(entries, null, 2)
  fs.writeFileSync(file, stringifiedEntries)
}

function createEntry(name, id) {
  const account = createAccount()
  if (typeof id === 'undefined' || id === null) {
    id = crypto.hash(name)
  }
  account.id = id
  walletEntries[name] = account
  saveEntries(walletEntries, walletFile)
  return account
}

function createAccount(keys = crypto.generateKeypair()) {
  return {
    address: keys.publicKey,
    keys,
    id: '',
  }
}

async function _sleep(ms = 0): Promise<NodeJS.Timeout> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function injectTx(tx) {
  try {
    const res = await axios.post(`http://${HOST}/inject`, tx)
    return res.data
  } catch (err) {
    return err.message
  }
}

try {
  walletEntries = require(walletFile)
} catch (e) {
  saveEntries(walletEntries, walletFile)
  console.log(`Created wallet file '${walletFile}'.`)
}

// QUERY'S THE CURRENT NETWORK PARAMETERS
async function queryParameters() {
  const res = await axios.get(`http://${HOST}/network/parameters`)
  if (res.data.error) {
    return res.data.error
  } else {
    return res.data.parameters
  }
}

// QUERY'S THE CURRENT PHASE OF THE DYNAMIC PARAMETER SYSTEM
async function queryWindow() {
  const res = await axios.get(`http://${HOST}/network/windows/all`)
  if (res.data.error) {
    return res.data.error
  } else {
    const { windows, devWindows } = res.data
    const timestamp = Date.now()
    let windowTime, devWindowTime
    if (inRange(timestamp, windows.proposalWindow)) windowTime = { proposals: Math.round((windows.proposalWindow[1] - timestamp) / 1000) }
    else if (inRange(timestamp, windows.votingWindow)) windowTime = { voting: Math.round((windows.votingWindow[1] - timestamp) / 1000) }
    else if (inRange(timestamp, windows.graceWindow)) windowTime = { grace: Math.round((windows.graceWindow[1] - timestamp) / 1000) }
    else if (inRange(timestamp, windows.applyWindow)) windowTime = { apply: Math.round((windows.applyWindow[1] - timestamp) / 1000) }
    else windowTime = { apply: Math.round((windows.proposalWindow[0] - timestamp) / 1000) }

    if (inRange(timestamp, devWindows.devProposalWindow)) devWindowTime = { devProposals: Math.round((devWindows.devProposalWindow[1] - timestamp) / 1000) }
    else if (inRange(timestamp, devWindows.devVotingWindow)) devWindowTime = { devVoting: Math.round((devWindows.devVotingWindow[1] - timestamp) / 1000) }
    else if (inRange(timestamp, devWindows.devGraceWindow)) devWindowTime = { devGrace: Math.round((devWindows.devGraceWindow[1] - timestamp) / 1000) }
    else if (inRange(timestamp, devWindows.devApplyWindow)) devWindowTime = { devApply: Math.round((devWindows.devApplyWindow[1] - timestamp) / 1000) }
    else devWindowTime = { devApply: Math.round((devWindows.devProposalWindow[0] - timestamp) / 1000) }
    return { window: windowTime, devWindow: devWindowTime }
  }
  function inRange(now, times) {
    return now > times[0] && now < times[1]
  }
}

async function getAccountData(id) {
  try {
    const res = await axios.get(`http://${HOST}/account/${id}`)
    return res.data.account
  } catch (err) {
    return err.message
  }
}

it('Spins up a network with 10 nodes successfully', async () => {
  execa.commandSync('shardus create-net 10', { stdio: [0, 1, 2] })
  await _sleep(85000)
  networkParams = await queryParameters()
  expect(networkParams.current).toEqual({
    title: 'Initial parameters',
    description: 'These are the initial network parameters liberdus started with',
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
    defaultToll: 1,
  })
  expect(networkParams.next).toEqual({})
  expect(networkParams.developerFund).toEqual([])
  expect(networkParams.nextDeveloperFund).toEqual([])
  expect(networkParams.windows).toEqual({
    proposalWindow: [expect.any(Number), expect.any(Number)],
    votingWindow: [expect.any(Number), expect.any(Number)],
    graceWindow: [expect.any(Number), expect.any(Number)],
    applyWindow: [expect.any(Number), expect.any(Number)],
  })
  expect(networkParams.devWindows).toEqual({
    devProposalWindow: [expect.any(Number), expect.any(Number)],
    devVotingWindow: [expect.any(Number), expect.any(Number)],
    devGraceWindow: [expect.any(Number), expect.any(Number)],
    devApplyWindow: [expect.any(Number), expect.any(Number)],
  })
  expect(networkParams.nextWindows).toEqual({})
  expect(networkParams.nextDevWindows).toEqual({})
  expect(networkParams.issue).toBe(1)
  expect(networkParams.devIssue).toBe(1)
})

const wallet1 = 'testWallet1'
const wallet2 = 'testWallet2'
let account1: any
let account2: any

describe('Submits transactions successfully', () => {
  it('Creates 2 accounts and submits the "register" transaction for both', async () => {
    account1 = createEntry(wallet1, null)
    account2 = createEntry(wallet2, null)
    let tx = {
      type: 'register',
      aliasHash: crypto.hash(wallet1),
      from: account1.address,
      alias: wallet1,
      timestamp: Date.now(),
    }
    crypto.signObj(tx as any, account1.keys.secretKey, account1.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      expect(res.result.success).toBe(true)
    })
    tx = {
      type: 'register',
      aliasHash: crypto.hash(wallet2),
      from: account2.address,
      alias: wallet2,
      timestamp: Date.now(),
    }
    crypto.signObj(tx as any, account2.keys.secretKey, account2.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      expect(res.result.success).toBe(true)
    })
    await _sleep(15000)
    let res = await axios.get(`http://${HOST}/address/${crypto.hash(wallet1)}`)
    expect(res.data.address).toBe(account1.address)
    res = await axios.get(`http://${HOST}/address/${crypto.hash(wallet2)}`)
    expect(res.data.address).toBe(account2.address)
  })

  it('Submits a "create" transaction for both accounts with 500 tokens', async () => {
    let tx = {
      type: 'create',
      from: '0'.repeat(64),
      to: account1.address,
      amount: 500,
      timestamp: Date.now(),
    }
    injectTx(tx).then(res => {
      console.log(res)
      expect(res.result.success).toBe(true)
    })
    tx = {
      type: 'create',
      from: '0'.repeat(64),
      to: account2.address,
      amount: 500,
      timestamp: Date.now(),
    }
    injectTx(tx).then(res => {
      console.log(res)
      expect(res.result.success).toBe(true)
    })
    await _sleep(15000)
    let accountData1 = await getAccountData(account1.address)
    let accountData2 = await getAccountData(account2.address)
    expect(accountData1.data.balance).toBe(550)
    expect(accountData2.data.balance).toBe(550)
  })

  it('Submits a "proposal" transaction for both accounts', async () => {
    let ready = false
    while (!ready) {
      let windows = await queryWindow()
      if (windows.window.proposals < 60) {
        ready = true
      } else {
        await _sleep(1000)
      }
    }
    let tx = {
      type: 'proposal',
      network,
      from: account1.address,
      proposal: crypto.hash(`issue-${1}-proposal-${2}`),
      issue: crypto.hash(`issue-${1}`),
      parameters: {
        title: 'Account1 proposal',
        description: 'This is a test proposal submitted by account1. It will change the nodeRewardAmount to 100.',
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
    }
    crypto.signObj(tx as any, account1.keys.secretKey, account1.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      expect(res.result.success).toBe(true)
    })
  })
})

it('Stops a network successfully', async () => {
  await _sleep(5000)
  execa.commandSync('shardus stop-net', { stdio: [0, 1, 2] })
  await _sleep(4000)
  expect(true).toBe(true)
})

it('Cleans a network successfully', async () => {
  await _sleep(3000)
  execa.commandSync('shardus clean-net', { stdio: [0, 1, 2] })
  await _sleep(3000)
  execa.commandSync('rm -rf instances')
  expect(true).toBe(true)
})
