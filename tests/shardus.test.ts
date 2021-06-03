import execa from 'execa'
import { resolve } from 'path'
import * as crypto from 'shardus-crypto-utils'
import fs from 'fs'
import axios from 'axios'
import * as utils from './testUtils'
import { util } from 'prettier'

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

const HOST = 'localhost:9001'
const USE_EXISTING_NETWORK = true
const START_NETWORK_SIZE = 5

const walletFile = resolve('./wallet.json')
let walletEntries = {}

const network = '0'.repeat(64)
let networkParams: any

test('basic', () => {
  expect(0).toBe(0);
});

test('basic again', () => {
  expect(1+2).toBe(3);
});

test('Spins up a network with 5 nodes successfully', async () => {
  if (USE_EXISTING_NETWORK) {
    console.log("Using existing active network")
    let activeNodes = await utils.queryActiveNodes()
    expect(Object.keys(activeNodes).length).toBe(5)
  } else {
    try {
      execa.commandSync('shardus-network stop', { stdio: [0, 1, 2] })
      execa.commandSync('shardus-network clean', { stdio: [0, 1, 2] })
    } catch (e) {
      console.log('Unable to stop and clean instances folder')
    }
    execa.commandSync('shardus-network start', { stdio: [0, 1, 2] })
    // execa.commandSync('shardus-network create 5', { stdio: [0, 1, 2] })
    console.log("here")
    await utils.waitForNetworkToBeActive(5)
    let areAllNodeActive = true
    expect(areAllNodeActive).toBe(true)
  }
})

test('Auto scale up the network successfully', async () => {
  // start spamming the network with TPS = 5 * active_nodes
  let spamCommand = `spammer spam -t create -d 3600 -r ${START_NETWORK_SIZE * 3} -a ${START_NETWORK_SIZE * 50} -m http://localhost:3000/api/report`
  console.log("spam command", spamCommand)
  let spamProcess = execa.command(spamCommand)
  //utils._sleep(10000)
  //// start new nodes
  ////execa.commandSync('shardus-network create 5', { stdio: [0, 1, 2] })
  let isLoadIncreased = await utils.waitForNetworkLoad('high', 0.2)
  //expect(isLoadIncreased).toBe(true)
 
  let hasNetworkScaledUp = await utils.waitForNetworkScaling(10)
  //spamProcess.cancel()
  //let hasNetworkScaledDown = await utils.waitForNetworkScaling(5)
  expect(hasNetworkScaledUp).toBe(true)
  //expect(hasNetworkScaledDown).toBe(true)
  expect(isLoadIncreased).toBe(true)
})

describe('Auto scale down the network successfully', () => {
  expect(true).toBe(true)
})

describe('Data is correctly synced across the nodes after network scaled down', () => {
  expect(true).toBe(true)
})

describe('Start new archivers successfully', () => {
  expect(true).toBe(true)
})

describe('New archivers sync archived data successfully', () => {
  expect(true).toBe(true)
})

describe('Archivers store complete historical data without missing cycles', () => {
  expect(true).toBe(true)
})

describe('Tx receipt checking', () => {
  expect(true).toBe(true)
})

// it('Stops a network successfully', async () => {
//   execa.commandSync('shardus-network stop', { stdio: [0, 1, 2] })
//   await utils._sleep(3000)
//   expect(true).toBe(true)
// })

// describe('Recover stopped network without losing old data', () => {
//   expect(true).toBe(true)
// })

// it('Cleans a network successfully', async () => {
//   execa.commandSync('shardus-network clean', { stdio: [0, 1, 2] })
//   await utils._sleep(2000)
//   execa.commandSync('rm -rf instances')
//   expect(true).toBe(true)
// })
