import fs from 'fs'
import path from 'path'
import Prop from 'dot-prop'
import * as crypto from 'shardus-crypto-utils'
import merge from 'deepmerge'
import minimist from 'minimist'
import { join } from 'lodash'

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

export const initConfigFromFile = () => {
  let config: any = {}
  let baseDir = process.env.BASE_DIR || '.'
    // set by shardus-network tool when creating multiple instances
    if (fs.existsSync(path.join(baseDir, 'config.json'))) {
      config = JSON.parse(fs.readFileSync(path.join(baseDir, 'config.json')).toString())
    }
    if(process.env.BASE_DIR) Prop.set(config, 'server.baseDir', process.env.BASE_DIR)

  if (process.env.APP_IP) {
    // used by deploy-to-aws script to tell the node its IP addr
    Prop.set(config, 'server.ip', {
      externalIp: process.env.APP_IP,
      internalIp: process.env.APP_IP,
    })
  }

  // CONFIGURATION PARAMETERS PASSED INTO SHARDUS
  Prop.set(config, 'server.p2p', {
    cycleDuration: cycleDuration,
    existingArchivers: [
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
    limitRate: true,
    loadLimit: {
      internal: 0.5,
      external: 0.4
    }
  })
  Prop.set(config, 'server.sharding', {
    nodesPerConsensusGroup: 5,
  })

  Prop.set(config, 'server.debug', {
    startInFatalsLogMode: true, //true setting good for big aws test with nodes joining under stress.
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
  config.username = 'test'
  return config
}

function replaceAll(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
}

function createJointKey(keys) {
  let jointKey = ''
  for (let key of keys) {
    if (jointKey.length > 0) {
      jointKey += '_' + key
    } else {
      jointKey += key
    }
  }
  return jointKey
}

function getPropertyFromJointKey(obj, jointKey) {
  if (!obj || !jointKey) return
  if (jointKey.split('_').length === 1) return obj[jointKey]
  else {
    let nestedKey = replaceAll(jointKey, '_', '.')
    console.log('nestedKey', nestedKey)
    let value = Prop.get(obj, nestedKey)
    console.log('value', value)
    return value
  }
}

function setPropertyToJointKey(obj, jointKey, value) {
  if (!obj || !jointKey) return
  if (jointKey.split('_').length === 1) obj[jointKey] = value
  else {
    let nestedKey = replaceAll(jointKey, '_', '.')
    Prop.set(obj, nestedKey, value)
  }
}

function overwriteFromEnvOrArgs(jointKey, overwriteInfo) {
  let {config, env, args} = overwriteInfo
  // Override config from ENV variable
  overwriteConfig(jointKey, config, env)
  const parsedArgs = minimist(args.slice(2))
  // Override config from cli args
  overwriteConfig(jointKey, config, parsedArgs)
}

function overwriteConfig(jointKey, config, overWriteObj) {
  if (overWriteObj[jointKey]) {
    switch (typeof getPropertyFromJointKey(config, jointKey)) {
      case 'number': {
        setPropertyToJointKey(config, jointKey, Number(overWriteObj[jointKey]))
        break
      }
      case 'string': {
        setPropertyToJointKey(config, jointKey, String(overWriteObj[jointKey]))
        break
      }
      case 'object': {
        try {
          var parameterStr = overWriteObj[jointKey]
          if(parameterStr) {
            let parameterObj = JSON.parse(parameterStr)
            setPropertyToJointKey(config, jointKey, parameterObj)
          }
        } catch(e) {
          console.log(e)
          console.log('Unable to JSON parse', overWriteObj[jointKey])
        }
        break
      }
      case 'boolean': {
        setPropertyToJointKey(config, jointKey, String(overWriteObj[jointKey]).toLowerCase() === 'true')
        break
      }
      default: {
      }
    }
  }
}

export function overrideDefaultConfig(
  defaultConfig,
  env: NodeJS.ProcessEnv,
  args: string[]
) {
  let config = JSON.parse(JSON.stringify(defaultConfig))
  let overwriteInfo = {config, env, args}
  for (const key1 in config) {
    if (typeof config[key1] === 'object' && Object.keys(config[key1]).length > 0) {
      for (const key2 in config[key1]) {
        if (typeof config[key1][key2] === 'object' && Object.keys(config[key1][key2]).length > 0) {
          for (const key3 in config[key1][key2]) {
            overwriteFromEnvOrArgs(createJointKey([key1, key2, key3]),overwriteInfo)
          }
        } else {
          overwriteFromEnvOrArgs(createJointKey([key1, key2]), overwriteInfo)
        }
      }
    } else {
      overwriteFromEnvOrArgs(createJointKey([key1]), overwriteInfo)
    }
  }
  return config
}
