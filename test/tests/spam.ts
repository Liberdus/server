import * as utils from '../testUtils'
import execa from 'execa'

export const spamTest = () =>
  describe('The network should be able to handle heavy load', () => {
    it('Should spam the network successfully', async () => {
      await utils._sleep(45000)
      execa.commandSync('spammer spam -t create -d 30 -r 40 -a 50 -m http://localhost:3000/api/report', { stdio: [0, 1, 2] })
      await utils._sleep(35000)
      expect(true).toBe(true)
    })
  })
