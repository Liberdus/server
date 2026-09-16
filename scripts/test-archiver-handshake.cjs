const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')

// Run the real handler without launching the node or its native networking stack.
const source = fs.readFileSync(path.resolve(__dirname, '../../shardus-core/src/p2p/Self.ts'), 'utf8')
const ast = ts.createSourceFile('Self.ts', source, ts.ScriptTarget.Latest, true)
const handler = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'contactArchiver')
const code = ts.transpileModule(handler.getText(ast).replace('export ', ''), {}).outputText
async function check({ legacy = false, restart = false, invalid = false } = {}) {
  const archiver = { ip: '127.0.0.1', port: 4000, publicKey: 'archiver' }
  const joinRequest = { nodeInfo: archiver }
  const response = { nodeList: [{ port: 9001 }], sign: {}, dataRequestCycle: legacy ? { start: 0 } : 0,
    dataRequestStateMetaData: { start: 0 },
    ...(restart ? { restartCycleRecord: { archiversAtShutdown: [archiver] } } : { joinRequest }) }
  let requests = 0, joins = 0, recipients = 0, prepended = 0
  const context = {
    info() {}, logFlags: {}, allowConnectionToFirstNode: false,
    utils: { sleep: async () => {}, formatErrorMessage: String }, Utils: { safeStringify: JSON.stringify },
    nestedCountersInstance: { countEvent() {} }, getNumArchivers: () => 0,
    getRandomAvailableArchiver: () => archiver,
    getActiveNodesFromArchiver: async () => { requests++; return { nodeList: response.nodeList, sign: {} } },
    Context: { crypto: { verify: () => !invalid }, config: { p2p: { experimentalSnapshot: !legacy, minNodes: 10, cycleDuration: 60 }, features: { archiverDataSubscriptionsUpdate: !legacy } } },
    Archivers: { archivers: new Map(), addArchiverJoinRequest: () => { joins++; return { success: true } },
      addDataRecipient: (node, data) => {
        recipients++
        assert.equal(node, archiver)
        if (legacy) {
          assert.equal(data[0], response.dataRequestCycle)
          assert.equal(data[1], response.dataRequestStateMetaData)
        } else assert.equal(data.dataRequestCycle, 0, 'cycle zero must survive the handoff')
      } },
    CycleChain: { prepend: () => prepended++ }, setRestartNetwork() {},
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  if (invalid) {
    await assert.rejects(context.contactArchiver('test', { archiver, response }))
    assert.equal(recipients, 0)
    assert.equal(joins, 0)
    return
  }
  await context.contactArchiver('test', { archiver, response })
  assert.equal(requests, 0, 'initial handshake must not be replaced by another request')
  assert.equal(joins, restart ? 0 : 1)
  assert.equal(recipients, 1)
  assert.equal(prepended, restart ? 1 : 0)
  await context.contactArchiver('next attempt')
  assert.equal(requests, 1, 'later calls must fetch fresh information')
  assert.equal(recipients, 1, 'handshake must not replay on later calls')
}
;(async () => {
  await check()
  await check({ legacy: true })
  await check({ restart: true })
  await check({ invalid: true })
  console.log('Archiver handshake checks passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
