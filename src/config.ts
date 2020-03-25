import * as Prop from 'dot-prop'
import * as fs from 'fs'
import * as path from 'path'
import Shardus = require('shardus-global-server/src/shardus/shardus-types')

// MIGHT BE USEFUL TO HAVE TIME CONSTANTS IN THE FORM OF CYCLES
export const cycleDuration = 15

let config: { server: Shardus.ShardusConfiguration } = { server: {} }

if (process.env.BASE_DIR) {
  if (fs.existsSync(path.join(process.env.BASE_DIR, 'config.json'))) {
    config = JSON.parse(fs.readFileSync(path.join(process.env.BASE_DIR, 'config.json')).toString())
  }
  config.server.baseDir = process.env.BASE_DIR
}

if (process.env.APP_IP) {
  Prop.set(config, 'server.ip', {
    externalIp: process.env.APP_IP,
    internalIp: process.env.APP_IP,
  })
}

// CONFIGURATION PARAMETERS PASSED INTO SHARDUS
Prop.set(config, 'server.p2p', {
  cycleDuration: cycleDuration,
  existingArchivers: JSON.parse(
    process.env.APP_SEEDLIST || '[{ "ip": "127.0.0.1", "port": 4000, "publicKey": "758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3" }]',
  ),
  maxNodesPerCycle: 10,
  minNodes: 10,
  maxNodes: 10,
  minNodesToAllowTxs: 1,
  maxNodesToRotate: 1,
  maxPercentOfDelta: 40,
})

Prop.set(config, 'server.loadDetection', {
  queueLimit: 1000,
  desiredTxTime: 15,
  highThreshold: 0.8,
  lowThreshold: 0.2,
})

Prop.set(config, 'server.reporting', {
  recipient: `http://${process.env.APP_MONITOR || '0.0.0.0'}:3000/api`,
  interval: 1,
})

Prop.set(config, 'server.rateLimiting', {
  limitRate: true,
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
        maxLogSize: 1000000000,
        backups: 10,
      },
      shardDump: {
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
    },
  },
})

export default config
