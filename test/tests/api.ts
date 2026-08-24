import { resolve } from 'path'
import * as utils from '../testUtils'
import axios from 'axios'
import * as crypto from 'shardus-crypto-utils'
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

const walletFile = resolve('./wallet.json')
const wallets = require(walletFile)
const HOST = 'http://localhost:9001'

export const apiTest = () =>
  describe('API functions as expected', () => {
    it('Should be able to query network parameter data', async () => {
      await utils.waitForNetworkParameters()
      let network = await utils.queryParameters()
      expect(network).toEqual({
        current: expect.any(Object),
        listOfChanges: expect.any(Array),
      })
    })

    it('Should be able to query account data properly', async () => {
      var {
        data: { account },
      } = await axios.get(`${HOST}/account/${wallets.testWallet1.address}`)
      expect(account).toEqual({
        alias: 'testWallet1',
        claimedSnapshot: false,
        data: {
          balance: expect.any(Number),
          chats: expect.any(Object),
          friends: expect.any(Object),
          remove_stake_request: null,
          stake: 5,
          toll: 25,
          transactions: expect.any(Array),
        },
        emailHash: null,
        hash: expect.any(String),
        id: expect.any(String),
        lastMaintenance: expect.any(Number),
        timestamp: expect.any(Number),
        type: 'UserAccount',
        verified: false,
      })
    })

    it('Should be able to query message data properly', async () => {
      let {
        data: { messages },
      } = await axios.get(`${HOST}/messages/${crypto.hash([wallets.testWallet2.address, wallets.testWallet1.address].sort((a, b) => a - b).join(''))}`)
      for (let message of messages) {
        message = JSON.parse(
          crypto.decrypt(message, crypto.convertSkToCurve(wallets.testWallet1.keys.secretKey), crypto.convertPkToCurve(wallets.testWallet2.keys.publicKey))
            .message,
        )

        expect(message).toEqual({
          body: expect.any(String),
          handle: expect.any(String),
          timestamp: expect.any(Number),
        })
      }
    })
  })
