import execa from 'execa'
import { resolve } from 'path'
import * as crypto from '@shardus/crypto-utils'
import fs from 'fs'
import axios from 'axios'
import chalkPipe from 'chalk-pipe'
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

const link = chalkPipe('blue.underline')
const info = chalkPipe('bgYellow.#000000.bold')
const infoGreen = chalkPipe('bgGreen.#000000.bold')
const warning = chalkPipe('orange.bold')
const success = chalkPipe('green.bold')

console.log(infoGreen(` THIS TESTING WILL TAKE AROUND 5 MINUTES TO COMPLETE `))


const HOST = 'localhost:9001'

export async function _sleep(ms = 0): Promise<NodeJS.Timeout> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function injectTx(tx, account, sign: boolean = true) {
  if (sign) {
    crypto.signObj(tx as any, account.keys.secretKey, account.keys.publicKey)
  }
  try {
    const res = await axios.post(`http://${HOST}/inject`, tx)
    console.log(warning(`"${tx.type}" transaction submitted ...`))
    console.log(success(`response: ${JSON.stringify(res.data)}`))
    expect(res.data.result.success).toBe(true)
  } catch (err) {
    console.log(info(err))
  }
}

export function createAccount(keys = crypto.generateKeypair()) {
  return {
    address: keys.publicKey,
    keys,
    id: '',
  }
}

// QUERY'S THE CURRENT NETWORK PARAMETERS
export async function queryParameters() {
  const res = await axios.get(`http://${HOST}/network/parameters`)
  if (res.data.error) {
    return res.data.error
  } else {
    return res.data.parameters
  }
}

export async function waitForNetworkParameters() {
  let ready = false
  while (!ready) {
    try {
      ready = (await queryParameters()).issue === 1
    } catch {
      await _sleep(1000)
    }
  }
  return
}

// QUERY'S THE CURRENT PHASE OF THE DYNAMIC PARAMETER SYSTEM
export async function queryWindow() {
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

export async function getAccountData(id) {
  try {
    const res = await axios.get(`http://${HOST}/account/${id}`)
    return res.data.account
  } catch (err) {
    return err.message
  }
}

// Waits until there's only 60 seconds left within a chosen window
export async function waitForWindow(name: string) {
  console.log(info(`Waiting for ${name} window to become available`))
  switch (name) {
    case 'proposals':
      while (!((await queryWindow()).window?.proposals < 50)) await _sleep(1000)
      break
    case 'devProposals':
      while (!((await queryWindow()).devWindow?.devProposals < 60)) await _sleep(1000)
      break
    case 'voting':
      while (!((await queryWindow()).window?.voting < 60)) await _sleep(1000)
      break
    case 'devVoting':
      while (!((await queryWindow()).devWindow?.devVoting < 60)) await _sleep(1000)
      break
    case 'grace':
      while (!((await queryWindow()).window?.grace < 50)) await _sleep(1000)
      break
    case 'devGrace':
      while (!((await queryWindow()).devWindow?.devGrace < 50)) await _sleep(1000)
      break
    case 'apply':
      while (!((await queryWindow()).window?.apply < 50)) await _sleep(1000)
      break
    case 'devApply':
      while (!((await queryWindow()).devWindow?.devApply < 50)) await _sleep(1000)
      break
  }
  return
}
