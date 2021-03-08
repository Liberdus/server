import * as utils from '../testUtils'
import axios from 'axios'

const HOST = 'http://localhost:9001'

/*
  dapp.registerExternalGet('network/parameters', network.current(dapp))
  dapp.registerExternalGet('network/parameters/next', network.next(dapp))
  dapp.registerExternalGet('network/windows/all', network.windows_all(dapp))
  dapp.registerExternalGet('network/windows', network.windows(dapp))
  dapp.registerExternalGet('network/windows/dev', network.windows_dev(dapp))

  dapp.registerExternalGet('issues', issues.all(dapp))
  dapp.registerExternalGet('issues/latest', issues.latest(dapp))
  dapp.registerExternalGet('issues/count', issues.count(dapp))
  dapp.registerExternalGet('issues/dev', issues.dev_all(dapp))
  dapp.registerExternalGet('issues/dev/latest', issues.dev_latest(dapp))
  dapp.registerExternalGet('issues/dev/count', issues.dev_count(dapp))

  dapp.registerExternalGet('proposals', proposals.all(dapp))
  dapp.registerExternalGet('proposals/latest', proposals.latest(dapp))
  dapp.registerExternalGet('proposals/count', proposals.count(dapp))
  dapp.registerExternalGet('proposals/dev', proposals.dev_all(dapp))
  dapp.registerExternalGet('proposals/dev/latest', proposals.dev_latest(dapp))
  dapp.registerExternalGet('proposals/dev/count', proposals.dev_count(dapp))

  dapp.registerExternalGet('account/:id', accounts.account(dapp))
  dapp.registerExternalGet('account/:id/alias', accounts.alias(dapp))
  dapp.registerExternalGet('account/:id/transactions', accounts.transactions(dapp))
  dapp.registerExternalGet('account/:id/balance', accounts.balance(dapp))
  dapp.registerExternalGet('account/:id/toll', accounts.toll(dapp))
  dapp.registerExternalGet('address/:name', accounts.address(dapp))
  dapp.registerExternalGet('account/:id/:friendId/toll', accounts.tollOfFriend(dapp))
  dapp.registerExternalGet('account/:id/friends', accounts.friends(dapp))
  dapp.registerExternalGet('account/:id/recentMessages', accounts.recentMessages(dapp))
*/

export const apiTest = () =>
  describe('API functions as expected', () => {
    it('Should be able to query network parameter data', async () => {
      await utils.waitForNetworkParameters()
      let network = await utils.queryParameters()
      expect(network).toBeDefined()
    })

    it('Should be able to query proposal time windows', async () => {
      let {
        data: { parameters },
      } = await axios.get(`${HOST}/network/parameters/next`)

      expect(parameters).toBeDefined()
      var {
        data: { windows, devWindows },
      } = await axios.get(`${HOST}/network/windows/all`)

      expect(windows).toEqual({
        proposalWindow: [expect.any(Number), expect.any(Number)],
        votingWindow: [expect.any(Number), expect.any(Number)],
        graceWindow: [expect.any(Number), expect.any(Number)],
        applyWindow: [expect.any(Number), expect.any(Number)],
      })

      expect(devWindows).toEqual({
        devProposalWindow: [expect.any(Number), expect.any(Number)],
        devVotingWindow: [expect.any(Number), expect.any(Number)],
        devGraceWindow: [expect.any(Number), expect.any(Number)],
        devApplyWindow: [expect.any(Number), expect.any(Number)],
      })

      var {
        data: { windows },
      } = await axios.get(`${HOST}/network/windows`)

      expect(windows).toEqual({
        proposalWindow: [expect.any(Number), expect.any(Number)],
        votingWindow: [expect.any(Number), expect.any(Number)],
        graceWindow: [expect.any(Number), expect.any(Number)],
        applyWindow: [expect.any(Number), expect.any(Number)],
      })

      var {
        data: { devWindows },
      } = await axios.get(`${HOST}/network/windows/dev`)

      expect(devWindows).toEqual({
        devProposalWindow: [expect.any(Number), expect.any(Number)],
        devVotingWindow: [expect.any(Number), expect.any(Number)],
        devGraceWindow: [expect.any(Number), expect.any(Number)],
        devApplyWindow: [expect.any(Number), expect.any(Number)],
      })
    })
  })
