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
        next: expect.any(Object),
        developerFund: expect.any(Array),
        listOfChanges: expect.any(Array),
        nextDeveloperFund: expect.any(Array),
        windows: {
          proposalWindow: [expect.any(Number), expect.any(Number)],
          votingWindow: [expect.any(Number), expect.any(Number)],
          graceWindow: [expect.any(Number), expect.any(Number)],
          applyWindow: [expect.any(Number), expect.any(Number)],
        },
        devWindows: {
          devProposalWindow: [expect.any(Number), expect.any(Number)],
          devVotingWindow: [expect.any(Number), expect.any(Number)],
          devGraceWindow: [expect.any(Number), expect.any(Number)],
          devApplyWindow: [expect.any(Number), expect.any(Number)],
        },
        nextWindows: expect.any(Object),
        nextDevWindows: expect.any(Object),
        issue: expect.any(Number),
        devIssue: expect.any(Number),
      })
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

    it('Should be able to query issue account data properly', async () => {
      var {
        data: { issues },
      } = await axios.get(`${HOST}/issues`)

      for (const issue of issues) {
        expect(issue.type).toBe('IssueAccount')
      }

      var {
        data: { issue },
      } = await axios.get(`${HOST}/issues/latest`)

      expect(issue.type).toBe('IssueAccount')

      var {
        data: { count },
      } = await axios.get(`${HOST}/issues/count`)
      expect(count).toBeGreaterThanOrEqual(2)

      var {
        data: { devIssues },
      } = await axios.get(`${HOST}/issues/dev`)

      for (const devIssue of devIssues) {
        expect(devIssue.type).toBe('DevIssueAccount')
      }

      var {
        data: { devIssue },
      } = await axios.get(`${HOST}/issues/dev/latest`)
      expect(devIssue.type).toBe('DevIssueAccount')

      var {
        data: { count },
      } = await axios.get(`${HOST}/issues/dev/count`)
      expect(count).toBeGreaterThanOrEqual(2)
    })

    it('Should be able to query proposal data properly', async () => {
      var {
        data: { proposals },
      } = await axios.get(`${HOST}/proposals`)

      for (const proposal of proposals) {
        expect(proposal.type).toBe('ProposalAccount')
      }

      var {
        data: { proposals },
      } = await axios.get(`${HOST}/proposals/latest`)

      for (const proposal of proposals) {
        expect(proposal.type).toBe('ProposalAccount')
      }

      var { data } = await axios.get(`${HOST}/proposals/count`)
      expect(data).toEqual({
        count: expect.any(Number),
      })

      var {
        data: { devProposals },
      } = await axios.get(`${HOST}/proposals/dev`)

      for (const devProposal of devProposals) {
        expect(devProposal.type).toBe('DevProposalAccount')
      }

      var {
        data: { devProposals },
      } = await axios.get(`${HOST}/proposals/dev/latest`)
      for (const devProposal of devProposals) {
        expect(devProposal.type).toBe('DevProposalAccount')
      }

      var { data } = await axios.get(`${HOST}/proposals/dev/count`)
      expect(data).toEqual({ count: expect.any(Number) })
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
          payments: expect.any(Array),
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
