import { readFileSync } from 'fs'
import path from 'path'
import vm from 'vm'
import ts from 'typescript'

// Run the real fetchNetworkAccountFromArchiver without starting the server.
const source = ts.createSourceFile('index.ts', readFileSync(path.join(__dirname, '../src/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const declaration = source.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'fetchNetworkAccountFromArchiver',
)
const code = ts.transpile(declaration.getText(source), { target: ts.ScriptTarget.ES2020 })

const archiver = { ip: '127.0.0.1', port: 4000, publicKey: 'a'.repeat(64) }
const sign = { owner: archiver.publicKey, sig: 'b'.repeat(64) }

interface Fetch {
  run: () => Promise<unknown>
  errors: jest.Mock
  counters: string[]
  requests: string[]
}

function load(responses: Record<string, unknown>): Fetch {
  const errors = jest.fn()
  const counters: string[] = []
  const requests: string[] = []
  const context = {
    getFinalArchiverList: () => [archiver],
    utils: {
      getRandom: <T>(items: T[]): T[] => items,
      findMajorityResult: <T>(values: T[], key: (value: T) => unknown): T | undefined =>
        values.find((value) => values.filter((other) => key(other) === key(value)).length > values.length / 2),
    },
    axios: {
      get: async (url: string): Promise<{ data: unknown }> => {
        requests.push(url)
        return { data: responses[url.split('?')[1]] }
      },
    },
    crypto: { verifyObj: (): boolean => true, hashObj: (): string => 'c'.repeat(64) },
    LiberdusFlags: { VerboseLogs: false, enableArchiverNetworkAccountValidation: false },
    nestedCountersInstance: { countEvent: (_category: string, name: string): number => counters.push(name) },
    Utils: { safeStringify: JSON.stringify },
    console: { log: jest.fn(), error: errors },
  }
  vm.createContext(context)
  vm.runInContext(code, context)
  return { run: () => (context as any).fetchNetworkAccountFromArchiver(), errors, counters, requests }
}

test('an archiver without the network account yet fails quietly, as expected on a new network', async () => {
  // The archiver's signed response carries no networkAccountHash until the genesis node creates the account.
  const { run, errors, counters, requests } = load({ 'hash=true': { sign } })
  const error = (await run().catch((e: Error) => e)) as Error
  expect(error.message).toBe('Network account has not been created yet')
  expect(errors).not.toHaveBeenCalled()
  expect(counters).toContain('network account not created yet')
  expect(requests).toEqual(['http://127.0.0.1:4000/get-network-account?hash=true'])
})

test('the network account is returned once the archiver has it', async () => {
  const networkAccount = { id: '0'.repeat(64), current: { activeVersion: '2.5.3' } }
  const { run, errors } = load({
    'hash=true': { networkAccountHash: 'c'.repeat(64), sign },
    'hash=false': { networkAccount: { data: networkAccount }, sign },
  })
  await expect(run()).resolves.toEqual(networkAccount)
  expect(errors).not.toHaveBeenCalled()
})

test('a hash without the account body is still reported as an archiver error', async () => {
  const { run, errors } = load({ 'hash=true': { networkAccountHash: 'c'.repeat(64), sign }, 'hash=false': { sign } })
  await expect(run()).rejects.toThrow('Not able to fetch get-network-account result from archiver')
  expect(errors).toHaveBeenCalledTimes(1)
  expect(String(errors.mock.calls[0][1])).toContain('returned no network account')
})
