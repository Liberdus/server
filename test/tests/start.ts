import execa from 'execa'
import * as utils from '../testUtils'

export const startupTest = () =>
  describe('The network starts up properly with 10 nodes', () => {
    it('Creates the network parameter account successfully', async () => {
      execa.commandSync('shardus create-net 10', { stdio: [0, 1, 2] })
      await utils.waitForNetworkParameters()
      const networkParams = await utils.queryParameters()
      expect(networkParams.current).toEqual({
        title: 'Initial parameters',
        description: 'These are the initial network parameters liberdus started with',
        nodeRewardInterval: 3600000,
        nodeRewardAmount: 1,
        nodePenalty: 10,
        transactionFee: 0.001,
        stakeRequired: 5,
        maintenanceInterval: 86400000,
        maintenanceFee: 0,
        proposalFee: 50,
        devProposalFee: 50,
        faucetAmount: 10,
        defaultToll: 1,
      })
      expect(networkParams.next).toEqual({})
      expect(networkParams.developerFund).toEqual([])
      expect(networkParams.nextDeveloperFund).toEqual([])
      expect(networkParams.windows).toEqual({
        proposalWindow: [expect.any(Number), expect.any(Number)],
        votingWindow: [expect.any(Number), expect.any(Number)],
        graceWindow: [expect.any(Number), expect.any(Number)],
        applyWindow: [expect.any(Number), expect.any(Number)],
      })
      expect(networkParams.devWindows).toEqual({
        devProposalWindow: [expect.any(Number), expect.any(Number)],
        devVotingWindow: [expect.any(Number), expect.any(Number)],
        devGraceWindow: [expect.any(Number), expect.any(Number)],
        devApplyWindow: [expect.any(Number), expect.any(Number)],
      })
      expect(networkParams.nextWindows).toEqual({})
      expect(networkParams.nextDevWindows).toEqual({})
      expect(networkParams.issue).toBe(1)
      expect(networkParams.devIssue).toBe(1)
    })
  })
