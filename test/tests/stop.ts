import execa from 'execa'
import * as utils from '../testUtils'

export const stopTest = () =>
  describe('The network shuts down successfully', () => {
    it('Stops a network successfully', async () => {
      execa.commandSync('shardus stop-net', { stdio: [0, 1, 2] })
      await utils._sleep(3000)
      expect(true).toBe(true)
    })

    it('Cleans a network successfully', async () => {
      execa.commandSync('shardus clean-net', { stdio: [0, 1, 2] })
      await utils._sleep(2000)
      execa.commandSync('rm -rf instances')
      expect(true).toBe(true)
    })
  })
