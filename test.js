/* eslint-disable @typescript-eslint/no-var-requires */
// const fs = require('fs')

// function parseLine(line) {
//   const [dateLevelType, timestamp, from, self, to, reqType, reqName, key, payload] = line.split('\t')
//   const [date, logLevel, logType] = dateLevelType.split(' ')
//   return { date, logLevel, logType, timestamp, from, self, to, reqType, reqName, key, payload }
// }

// function parseFile(filename) {
//   fs.readFileSync(filename, 'utf-8')
//     .split('\n')
//     .forEach(line => {
//       console.log(parseLine(line))
//     })
// }

// parseFile('instances/shardus-instance-9001/logs/playback.log')

const crypto = require('shardus-crypto-utils')
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
console.log(
  crypto.hashObj({
    current: {
      description: 'Keep the current network parameters as they are',
      devProposalFee: 20,
      maintenanceFee: 0.01,
      maintenanceInterval: 600000,
      nodePenalty: 100,
      nodeRewardAmount: 10,
      nodeRewardInterval: 60000,
      proposalFee: 500,
      stakeRequired: 500,
      title: 'Default parameters',
      transactionFee: 0.001,
    },
    devIssue: 1,
    devWindows: {
      devApplyWindow: [1586802938496, 1586803028496],
      devGraceWindow: [1586802848496, 1586802938496],
      devProposalWindow: [1586802668496, 1586802758496],
      devVotingWindow: [1586802758496, 1586802848496],
    },
    developerFund: [],
    hash: 'e83be273cba6abf7e0bd712928d8e7fdbf40b02e0982a51c94c8495e533b16c4',
    id: '0000000000000000000000000000000000000000000000000000000000000000',
    issue: 1,
    next: {},
    nextDevWindows: {},
    nextDeveloperFund: [],
    nextWindows: {},
    timestamp: 1586802668496,
    windows: {
      applyWindow: [1586802938496, 1586803028496],
      graceWindow: [1586802848496, 1586802938496],
      proposalWindow: [1586802668496, 1586802758496],
      votingWindow: [1586802758496, 1586802848496],
    },
  }),
)
