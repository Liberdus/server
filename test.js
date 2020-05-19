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

{
  "account": {
    "alias": "kyle",
    "claimedSnapshot": false,
    "data": {
      "balance": 23585.89604,
      "chats": {
        "11f4a5790ac3bea00b3f642a03db13aff434455abbd00f69e101cbcdf67c5465": "fbd08b489d5e9234e62bd8c0f50dad4bd510d99452a25fecf2b40cc017a5f00b",
        "ce885354c4835f8d8484a347d96dbf4d25aa7116a6baf4c34c7225d60768294e": "613966d138a3387726731076247e5c4cafd580e925778582c3340081abdd2dc1"
      },
      "friends": {
        "11f4a5790ac3bea00b3f642a03db13aff434455abbd00f69e101cbcdf67c5465": "test"
      },
      "toll": 75,
      "transactions": [{
        "amount": 50,
        "from": "ce885354c4835f8d8484a347d96dbf4d25aa7116a6baf4c34c7225d60768294e",
        "network": "0000000000000000000000000000000000000000000000000000000000000000",
        "sign": {
          "owner": "ce885354c4835f8d8484a347d96dbf4d25aa7116a6baf4c34c7225d60768294e",
          "sig": "fe4c95001a787cb38bd2cb4ca9f257174509dd11b9a452e43648283b7d50a36625c8ad5ee08113057f6cb80a237a168311df4d1755532eceab8d7b45ec8cdd05dede39308fd02de2ef94e6030cd095de658c6fde12233d02abc53b88a24d086e"
        },
        "timestamp": 1589827231149,
        "to": "a4facbf74ed70bfcf8e1ae0267dcb852a25ceba4c07099ceb4777dd26a44e7f6",
        "txId": "dede39308fd02de2ef94e6030cd095de658c6fde12233d02abc53b88a24d086e",
        "type": "transfer"
      }]
    },
    "emailHash": "24eae24c884aec00ffa716fa363f1a371199517b6e457eb7d2356c773c62ed26",
    "hash": "7ae2e29d8971b3069cde6766513d3a3638c844f94c11489cfdd0c6fadae2da79",
    "id": "a4facbf74ed70bfcf8e1ae0267dcb852a25ceba4c07099ceb4777dd26a44e7f6",
    "lastMaintenance": 1589827255277,
    "timestamp": 1589827532647,
    "verified": true
  }
}