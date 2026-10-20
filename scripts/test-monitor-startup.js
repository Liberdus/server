const assert = require('assert/strict')
const vm = require('vm')
const {original, replacement, patch} = require('./patch-monitor-startup')

async function check(failures, startFails = false) {
  let attempts = 0
  let starts = 0
  const delays = []
  const exits = []
  const context = {
    lib_archiver_discovery_1: {
      setupArchiverDiscovery: async (options) => {
        assert.equal(options.customArchiverListEnv, 'ARCHIVER_INFO')
        if (++attempts <= failures) throw new Error('archiver unavailable')
      },
    },
    archiverConfigFilePath: 'archiverConfig.json',
    start: () => {
      starts++
      if (startFails) throw new Error('listen failed')
    },
    console: {log() {}, error() {}},
    setTimeout: (resolve, delay) => {
      delays.push(delay)
      resolve()
    },
    process: {exit: (code) => exits.push(code)},
  }
  await vm.runInNewContext(replacement, context)
  assert.equal(attempts, failures + 1)
  assert.equal(starts, 1)
  assert.deepEqual(delays, Array(failures).fill(5000))
  assert.deepEqual(exits, startFails ? [1] : [])
}

async function main() {
  assert.equal(patch(original), replacement)
  assert.equal(patch(original.replace(/\n/g, '\r\n')), replacement)
  assert.equal(patch(replacement), replacement)
  assert.throws(() => patch('changed upstream code'), /Monitor startup code changed/)
  await check(0)
  await check(3)
  await check(0, true)
  console.log('Monitor startup checks passed: immediate readiness, delayed readiness, startup failure, and repeat patching.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
