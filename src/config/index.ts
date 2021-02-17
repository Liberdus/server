import fs from 'fs'
import path from 'path'
import Prop from 'dot-prop'
import * as crypto from 'shardus-crypto-utils'

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

export const networkAccount = '0'.repeat(64)

// HELPFUL TIME CONSTANTS IN MILLISECONDS
export const ONE_SECOND = 1000
export const ONE_MINUTE = 60 * ONE_SECOND
export const ONE_HOUR = 60 * ONE_MINUTE
export const ONE_DAY = 24 * ONE_HOUR
// export const ONE_WEEK = 7 * ONE_DAY
// export const ONE_YEAR = 365 * ONE_DAY

// DEV SETTINGS

export const TIME_FOR_PROPOSALS = ONE_MINUTE + ONE_SECOND * 30
export const TIME_FOR_VOTING = ONE_MINUTE + ONE_SECOND * 30
export const TIME_FOR_GRACE = ONE_MINUTE + ONE_SECOND * 30
export const TIME_FOR_APPLY = ONE_MINUTE + ONE_SECOND * 30

export const TIME_FOR_DEV_PROPOSALS = ONE_MINUTE + ONE_SECOND * 30
export const TIME_FOR_DEV_VOTING = ONE_MINUTE + ONE_SECOND * 30
export const TIME_FOR_DEV_GRACE = ONE_MINUTE + ONE_SECOND * 30
export const TIME_FOR_DEV_APPLY = ONE_MINUTE + ONE_SECOND * 30


// PROD SETTINGS
// export const TIME_FOR_PROPOSALS = ONE_DAY
// export const TIME_FOR_VOTING = 3 * ONE_DAY
// export const TIME_FOR_GRACE = ONE_DAY
// export const TIME_FOR_APPLY = 2 * ONE_DAY

// export const TIME_FOR_DEV_PROPOSALS = ONE_DAY
// export const TIME_FOR_DEV_VOTING = 3 * ONE_DAY
// export const TIME_FOR_DEV_GRACE = ONE_DAY
// export const TIME_FOR_DEV_APPLY = 2 * ONE_DAY

// MIGHT BE USEFUL TO HAVE TIME CONSTANTS IN THE FORM OF CYCLES
export const cycleDuration = 30

// INITIAL NETWORK PARAMETERS FOR LIBERDUS
export const INITIAL_PARAMETERS: NetworkParameters = {
  title: 'Initial parameters',
  description: 'These are the initial network parameters liberdus started with',
  nodeRewardInterval: ONE_HOUR, //ONE_HOUR,
  nodeRewardAmount: 1,
  nodePenalty: 10,
  transactionFee: 0.001,
  stakeRequired: 5,
  maintenanceInterval: ONE_DAY,
  maintenanceFee: 0,
  proposalFee: 50,
  devProposalFee: 50,
  faucetAmount: 10,
  defaultToll: 1,
}

export const initConfig = () => {
  let config: any = {}

  if (process.env.BASE_DIR) {
    // set by shardus-network tool when creating multiple instances
    if (fs.existsSync(path.join(process.env.BASE_DIR, 'config.json'))) {
      config = JSON.parse(fs.readFileSync(path.join(process.env.BASE_DIR, 'config.json')).toString())
    }
    Prop.set(config, 'server.baseDir', process.env.BASE_DIR)
  }

  if (process.env.APP_IP) {
    // used by deploy-to-aws script to tell the node its IP addr
    Prop.set(config, 'server.ip', {
      externalIp: process.env.APP_IP,
      internalIp: process.env.APP_IP,
    })
  }

  // CONFIGURATION PARAMETERS PASSED INTO SHARDUS
  const existingArchiversCheck = config.server && config.server.p2p && config.server.p2p ? config.server.p2p.existingArchivers : false
  Prop.set(config, 'server.p2p', {
    cycleDuration: cycleDuration,
    existingArchivers: existingArchiversCheck ||
      JSON.parse(process.env.APP_SEEDLIST || 'false') || [
        // used by deploy-to-aws script to tell node Archiver IP
        {
          ip: '127.0.0.1',
          port: 4000,
          publicKey: '758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3',
        },
      ],
    minNodesToAllowTxs: 1,
    minNodes: 50,
    maxNodes: 50,
    maxJoinedPerCycle: 3,
    maxSyncingPerCycle: 5,
    maxRotatedPerCycle: 1,
  })
  Prop.set(config, 'server.loadDetection', {
    queueLimit: 1000,
    desiredTxTime: 15,
    highThreshold: 0.8,
    lowThreshold: 0.2,
  })
  const recipientCheck = config.server && config.server.reporting ? config.server.reporting.recipient : false
  Prop.set(config, 'server.reporting', {
    recipient: recipientCheck || `http://${process.env.APP_MONITOR || '0.0.0.0'}:3000/api`, // used by deploy-to-aws script to tell node Monitor IP
    interval: 1,
  })
  Prop.set(config, 'server.rateLimiting', {
    limitRate: false,
    loadLimit: 0.5,
  })
  Prop.set(config, 'server.sharding', {
    nodesPerConsensusGroup: 5,
  })
  Prop.set(config, 'logs', {
    dir: './logs',
    files: { main: '', fatal: '', net: '', app: '' },
    options: {
      appenders: {
        app: {
          type: 'file',
          maxLogSize: 100000000,
          backups: 10,
        },
        errorFile: {
          type: 'file',
          maxLogSize: 100000000,
          backups: 10,
        },
        errors: {
          type: 'logLevelFilter',
          level: 'ERROR',
          appender: 'errorFile',
        },
        main: {
          type: 'file',
          maxLogSize: 1000000000,
          backups: 10,
        },
        fatal: {
          type: 'file',
          maxLogSize: 100000000,
          backups: 10,
        },
        net: {
          type: 'file',
          maxLogSize: 100000000,
          backups: 10,
        },
        playback: {
          type: 'file',
          maxLogSize: 100000000,
          backups: 10,
        },
        shardDump: {
          type: 'file',
          maxLogSize: 100000000,
          backups: 10,
        },
        statsDump: {
          type: 'file',
          maxLogSize: 100000000,
          backups: 10,
        },
      },
      categories: {
        default: { appenders: ['out'], level: 'fatal' },
        app: { appenders: ['app', 'errors'], level: 'trace' },
        main: { appenders: ['main', 'errors'], level: 'trace' },
        fatal: { appenders: ['fatal'], level: 'fatal' },
        net: { appenders: ['net'], level: 'trace' },
        playback: { appenders: ['playback'], level: 'trace' },
        shardDump: { appenders: ['shardDump'], level: 'trace' },
        statsDump: { appenders: ['statsDump'], level: 'trace' },
      },
    },
  })

  return config
}
