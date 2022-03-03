import * as crypto from '@shardus/crypto-utils'
import * as config from '../config'

export const networkAccount = (accountId: string, timestamp: number) => {
  const proposalWindow = [timestamp, timestamp + config.TIME_FOR_PROPOSALS]
  const votingWindow = [proposalWindow[1], proposalWindow[1] + config.TIME_FOR_VOTING]
  const graceWindow = [votingWindow[1], votingWindow[1] + config.TIME_FOR_GRACE]
  const applyWindow = [graceWindow[1], graceWindow[1] + config.TIME_FOR_APPLY]

  const devProposalWindow = [timestamp, timestamp + config.TIME_FOR_DEV_PROPOSALS]
  const devVotingWindow = [devProposalWindow[1], devProposalWindow[1] + config.TIME_FOR_DEV_VOTING]
  const devGraceWindow = [devVotingWindow[1], devVotingWindow[1] + config.TIME_FOR_DEV_GRACE]
  const devApplyWindow = [devGraceWindow[1], devGraceWindow[1] + config.TIME_FOR_DEV_APPLY]

  const account: NetworkAccount = {
    id: accountId,
    type: 'NetworkAccount',
    listOfChanges: [
      {
        cycle: 1,
        change: {
          server: {
            transactionExpireTime: 5,
            p2p: {
              syncLimit: 180,
              cycleDuration: 30,
              maxRejoinTime: 20,
              difficulty: 2,
              queryDelay: 1,
              gossipRecipients: 8,
              gossipFactor: 4,
              gossipStartSeed: 15,
              gossipSeedFallof: 15,
              gossipTimeout: 180,
              maxSeedNodes: 10,
              minNodesToAllowTxs: 3,
              minNodes: 15,
              maxNodes: 30,
              seedNodeOffset: 4,
              nodeExpiryAge: 30,
              maxJoinedPerCycle: 1,
              maxSyncingPerCycle: 5,
              maxRotatedPerCycle: 1,
              maxPercentOfDelta: 40,
              minScaleReqsNeeded: 5,
              maxScaleReqs: 200,
              scaleConsensusRequired: 0.25,
              amountToGrow: 1,
              amountToShrink: 1,
              startInWitnessMode: false,
            },
            reporting: {
              report: true,
              recipient: 'http://127.0.0.1:3000/api',
              interval: 2,
              console: false,
            },
            loadDetection: {
              queueLimit: 1000,
              desiredTxTime: 15,
              highThreshold: 0.5,
              lowThreshold: 0.2,
            },
            rateLimiting: {
              limitRate: true,
              loadLimit: {
                internal: 0.5,
                external: 0.4,
                txTimeInQueue: 0.2,
                queueLength: 0.2,
              },
            },
          },
        },
      },
    ],
    current: config.INITIAL_PARAMETERS,
    next: {},
    windows: {
      proposalWindow,
      votingWindow,
      graceWindow,
      applyWindow,
    },
    nextWindows: {},
    devWindows: {
      devProposalWindow,
      devVotingWindow,
      devGraceWindow,
      devApplyWindow,
    },
    nextDevWindows: {},
    developerFund: [],
    nextDeveloperFund: [],
    issue: 1,
    devIssue: 1,
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  console.log('INITIAL_HASH: ', account.hash)
  return account
}
