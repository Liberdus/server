import type { Shardus } from '@shardus/core'
import { onActiveVersionChange } from '../src/versioning'
import { migrate } from '../src/versioning/migrations/2.3.5'

jest.mock('../src/versioning/migrations/2.3.5', () => ({ migrate: jest.fn() }))

test('a failed migration is retried with the Core instance', async () => {
  const dapp = {} as Shardus
  const run = migrate as jest.Mock
  run.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(undefined)

  await expect(onActiveVersionChange('2.3.5', dapp)).rejects.toThrow('temporary failure')
  await expect(onActiveVersionChange('2.3.5', dapp)).resolves.toBeUndefined()
  expect(run).toHaveBeenCalledTimes(2)
  expect(run).toHaveBeenCalledWith(dapp)
})
