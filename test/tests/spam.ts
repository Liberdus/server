import * as utils from '../testUtils'
import { resolve } from 'path'
import execa from 'execa'

const walletFile = resolve('./wallet.json')
const wallets = require(walletFile)

export const spamTest = () =>
  describe('The network should be able to handle heavy load', () => {
    it('Should spam the network successfully', async () => {
      await utils._sleep(4000)
      execa.commandSync('spammer spam -t create -d 30 -r 40 -a 50 -m http://localhost:3000/api/report', { stdio: [0, 1, 2] })
      await utils._sleep(30000)
      let network = await utils.queryParameters()
      let account1 = await utils.getAccountData(wallets.testWallet1.address)
      let account2 = await utils.getAccountData(wallets.testWallet2.address)
      expect(network).toBeDefined()
      expect(account1).toBeDefined()
      expect(account2).toBeDefined()
    })
  })
