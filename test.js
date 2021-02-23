/* eslint-disable prettier/prettier */
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
  crypto.hash(`issue-${2}`),
)