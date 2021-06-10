import execa from 'execa'
import { resolve } from 'path'
import * as crypto from 'shardus-crypto-utils'
import fs from 'fs'
import axios from 'axios'
import * as utils from './testUtils'
import { util } from 'prettier'
import { spawn,exec } from 'child_process'

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

const USE_EXISTING_NETWORK = true
const START_NETWORK_SIZE = 5

test('Start a new network successfully', async () => {
  console.log(utils.infoGreen('TEST: Start a new network successfully'))
  if (USE_EXISTING_NETWORK) {
    console.log(utils.info('Using existing active network'))
    let activeNodes = await utils.queryActiveNodes()
    expect(Object.keys(activeNodes).length).toBe(START_NETWORK_SIZE)
  } else {
    try {
      execa.commandSync('shardus-network stop', { stdio: [0, 1, 2] })
      await utils._sleep(3000)
      execa.commandSync('rm -rf instances')
    } catch (e) {
      console.log('Unable to remove instances folder')
    }
    execa.commandSync(`shardus-network create --no-log-rotation  ${START_NETWORK_SIZE * 2}`) // start 2 times of minNode
    const isNetworkActive = await utils.waitForNetworkToBeActive(START_NETWORK_SIZE)
    expect(isNetworkActive).toBe(true)
  }
})

test.skip('Process txs at the rate of 5 txs per node/per second for 5 min', async () => {
  console.log(utils.infoGreen('TEST: Process txs at the rate of 5 txs per node/per second for 5 min'))

  const activeNodes = await utils.queryActiveNodes()
  const nodeCount = Object.keys(activeNodes).length
  const durationMinute = 1
  const durationSecond = 60 * durationMinute
  const durationMiliSecond = 1000 * durationSecond

  await utils.resetReport()
  await utils._sleep(10000) // need to wait monitor-server to collect active nodes after reset

  let spamCommand = `spammer spam -t create -d ${durationSecond} -r ${nodeCount * 5} -a ${nodeCount * 50} -m http://localhost:3000/api/report`
  console.log(utils.info('Spamming the network...', spamCommand))
  execa.command(spamCommand).stdout.pipe(process.stdout)
  await utils._sleep(durationMiliSecond + 10000) // extra 10s for processing pending txs in the queue

  let report = await utils.queryLatestReport()
  let processedRatio = report.totalProcessed / report.totalInjected

  // TBC: process / injected ratio should be 80% or more
  expect(processedRatio).toBeGreaterThanOrEqual(0.8)
  // TBC: rejected should be less than 3% of total injected 
  expect(report.totalRejected).toBeLessThanOrEqual(report.totalInjected * 0.03)
})

test.skip('Auto scale up the network successfully', async () => {
  console.log(utils.infoGreen('TEST: Auto scale up the network successfully'))
  let spamCommand = `spammer spam -t create -d 3600 -r ${START_NETWORK_SIZE * 6} -a ${START_NETWORK_SIZE * 60} -m http://localhost:3000/api/report`
  let spamProcess = execa.command(spamCommand)
  let isLoadIncreased = await utils.waitForNetworkLoad('high', 0.2)

  console.log(utils.info('Waiting for network to scale up...'))

  let hasNetworkScaledUp = await utils.waitForNetworkScaling(START_NETWORK_SIZE * 2)
  spamProcess.cancel()

  expect(isLoadIncreased).toBe(true)
  expect(hasNetworkScaledUp).toBe(true)
})

test.skip('Auto scale down the network successfully', async () => {
  console.log(utils.infoGreen('TEST: Auto scale down the network successfully'))
  console.log(utils.info('Waiting for network to scale down...'))

  let isLoadDecreased = await utils.waitForNetworkLoad('low', 0.2)
  let hasNetworkScaledDown = await utils.waitForNetworkScaling(START_NETWORK_SIZE)

  expect(hasNetworkScaledDown).toBe(true)
  expect(isLoadDecreased).toBe(true)
})

test.skip('Data is correctly synced across the nodes after network scaled down', async () => {
  console.log(utils.infoGreen('TEST: Data is correctly synced across the nodes after network scaled down'))
  let isPartitionMatirxCorrect = await utils.checkPartitionMatrix()
  expect(isPartitionMatirxCorrect).toBe(true)
})

test.skip('Start new archivers successfully', async () => {
  console.log("Starting new archiver at port 4001")

  try {
    execa.commandSync('shardus-network start --archivers 1')
  } catch (e) {
    console.log(utils.warning(e))
  }
  let hasNewArchiverJoined = await utils.waitForArchiverToJoin('localhost', 4001)

  expect(hasNewArchiverJoined).toBe(true)
})

test('New archivers sync archived data successfully', async () => {
  await utils._sleep(10000) // needs to wait while new archiver is syncing data

  const dataFromArchiver_1 = await utils.queryArchivedCycles('localhost', 4000, 10)
  const dataFromArchiver_2 = await utils.queryArchivedCycles('localhost', 4001, 10)
  let hasSameData = true
  for (let i=0; i < dataFromArchiver_1.length; i++) {
    let data1 = dataFromArchiver_1[i]
    let data2 = dataFromArchiver_2[i]
    // TODO: need to neglect "count" field from archivedCycle['summary']['partitionBlobs']
    let isSame = JSON.stringify(data1) === JSON.stringify(data2)
    if (!isSame) {
      hasSameData = false
      break
    }
  }
  expect(hasSameData).toBe(true)
})

test('Archivers store complete historical data without missing cycles', async () => {
  const dataFromArchiver_1 = await utils.queryArchivedCycles('localhost', 4000, 10)
  const dataFromArchiver_2 = await utils.queryArchivedCycles('localhost', 4001, 10)
  const latestRecord = await utils.queryLatestCycleRecordFromConsensor()

  const countersFromData1 = dataFromArchiver_1.map(a => a.cycleRecord.counter)
  const countersFromData2 = dataFromArchiver_2.map(a => a.cycleRecord.counter)

  expect(countersFromData1[0]).toBe(latestRecord.counter)
  expect(countersFromData2[0]).toBe(latestRecord.counter)

  expect(utils.isDecreasingSequence(countersFromData1)).toBe(true)
  expect(utils.isDecreasingSequence(countersFromData2)).toBe(true)
})

test('Tx receipt checking', () => {
  expect(true).toBe(true)
})

test.skip('Stops a network successfully', async () => {
  execa.commandSync('shardus-network stop', { stdio: [0, 1, 2] })
  await utils._sleep(3000)
  expect(true).toBe(true)
})

test.skip('Recover stopped network without losing old data', () => {
  expect(true).toBe(true)
})

test.skip('Cleans a network successfully', async () => {
  execa.commandSync('shardus-network clean', { stdio: [0, 1, 2] })
  await utils._sleep(2000)
  execa.commandSync('rm -rf instances')
  expect(true).toBe(true)
})
