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
  crypto.hashObj({current:{"description":"These are the initial network parameters liberdus started with","devProposalFee":20,"maintenanceFee":0.01,"maintenanceInterval":600000,"nodePenalty":100,"nodeRewardAmount":10,"nodeRewardInterval":60000,"proposalFee":500,"stakeRequired":500,"title":"Initial parameters","transactionFee":0.001},"devIssue":1,"devWindows":{"devApplyWindow":[1586806302357,1586806392357],"devGraceWindow":[1586806212357,1586806302357],"devProposalWindow":[1586806032357,1586806122357],"devVotingWindow":[1586806122357,1586806212357]},"developerFund":[],"hash":"3f92ea083a6aed7c0c9260f12026e78bbe933710bc727c5ec28230f377c7fada","id":"0000000000000000000000000000000000000000000000000000000000000000","issue":1,"next":{},"nextDevWindows":{},"nextDeveloperFund":[],"nextWindows":{},"timestamp":1586806032357,"windows":{"applyWindow":[1586806302357,1586806392357],"graceWindow":[1586806212357,1586806302357],"proposalWindow":[1586806032357,1586806122357],"votingWindow":[1586806122357,1586806212357]}}),
)

{"current":{"description":"These are the initial network parameters liberdus started with","devProposalFee":20,"maintenanceFee":0.01,"maintenanceInterval":600000,"nodePenalty":100,"nodeRewardAmount":10,"nodeRewardInterval":60000,"proposalFee":500,"stakeRequired":500,"title":"Initial parameters","transactionFee":0.001},"devIssue":1,"devWindows":{"devApplyWindow":[1586806302357,1586806392357],"devGraceWindow":[1586806212357,1586806302357],"devProposalWindow":[1586806032357,1586806122357],"devVotingWindow":[1586806122357,1586806212357]},"developerFund":[],"hash":"3f92ea083a6aed7c0c9260f12026e78bbe933710bc727c5ec28230f377c7fada","id":"0000000000000000000000000000000000000000000000000000000000000000","issue":1,"next":{},"nextDevWindows":{},"nextDeveloperFund":[],"nextWindows":{},"timestamp":1586806032357,"windows":{"applyWindow":[1586806302357,1586806392357],"graceWindow":[1586806212357,1586806302357],"proposalWindow":[1586806032357,1586806122357],"votingWindow":[1586806122357,1586806212357]}}
