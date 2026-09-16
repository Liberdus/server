// Run the actual join callbacks without starting the server.
const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')

const source = ts.createSourceFile('index.ts', fs.readFileSync(path.join(__dirname, '../src/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const methods = {}
function visit(node) {
  if (ts.isMethodDeclaration(node) && ['validateJoinRequest', 'validateArchiverJoinRequest'].includes(node.name.getText(source))) {
    methods[node.name.getText(source)] = node.getText(source)
  }
  ts.forEachChild(node, visit)
}
visit(source)
assert.equal(Object.keys(methods).length, 2)
const logs = []
const context = {
  AccountsStorage: { cachedNetworkAccount: undefined },
  LiberdusFlags: { VerboseLogs: false, StakingEnabled: false },
  logFlags: { verbose: false },
  console: { log: (...args) => logs.push(args) },
  nestedCountersInstance: { countEvent() {} },
  utils: {
    isEqualOrNewerVersion: (minimum, version) => version >= minimum,
    isEqualOrOlderVersion: (maximum, version) => version <= maximum,
  },
}
const app = vm.runInNewContext(ts.transpile(`const app = {${Object.values(methods).join(',')}}; app`, { target: ts.ScriptTarget.ES2020 }), context)
for (const [name, field] of [['validateJoinRequest', 'appJoinData'], ['validateArchiverJoinRequest', 'appData']]) {
  const request = { [field]: { version: '2.5.1' } }
  const invoke = () => app[name](request, 'forming', { active: 1, syncing: 0 }, 2)
  context.AccountsStorage.cachedNetworkAccount = undefined
  assert.equal(app[name]({}, 'forming', {}, 2).fatal, true, 'malformed joins remain fatal')
  let response = invoke()
  assert.equal(response.success, false)
  assert.equal(response.fatal, false)
  assert.match(response.reason, /not ready/)
  context.logFlags.verbose = true
  invoke()
  assert.match(logs.pop()[0], /\[config-enforced\].*waiting-network-account/)
  context.logFlags.verbose = false
  context.AccountsStorage.cachedNetworkAccount = { current: { minVersion: '2.5.0', latestVersion: '2.5.1', archiver: { minVersion: '2.5.0', latestVersion: '2.5.1' } } }
  assert.equal(invoke().success, true, 'the next join succeeds once the account arrives')
  request[field].version = '2.4.0'
  response = invoke()
  assert.equal(response.success, false)
  assert.equal(response.fatal, true, 'version enforcement remains fatal')
}
assert.equal(logs.length, 0, 'readiness logs require verbose')
console.log('Network account join readiness checks passed')
