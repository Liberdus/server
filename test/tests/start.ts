import execa from 'execa'
import * as utils from '../testUtils'

export const startupTest = () =>
  describe('The network starts up properly with 10 nodes', () => {
    it('Creates the network parameter account successfully', async () => {
      execa.commandSync('shardus create-net 10', { stdio: [0, 1, 2] })
      await utils.waitForNetworkParameters()
      const networkParams = await utils.queryParameters()
      expect(networkParams.current).toEqual(
        expect.objectContaining({
          activeVersion: '2.5.2',
          maintenanceInterval: 86_400_000,
          maintenanceFee: { dataType: 'bi', value: '0' }, // bigint 0n as serialized by the API
          nodeRewardAmountUsdStr: '1.0',
          nodePenaltyUsdStr: '10.0',
          stakeRequiredUsdStr: '10.0',
          transactionFeeUsdStr: '0.01',
          stabilityFactorStr: '0.013',
          minTollUsdStr: '0.2',
          defaultTollUsdStr: '0.2',
        }),
      )
      for (const key of ['transactionFee', 'faucetAmount', 'nodeRewardAmountUsd', 'nodePenaltyUsd', 'stakeRequiredUsd', 'defaultToll', 'minToll']) {
        expect(networkParams.current).not.toHaveProperty(key)
      }
      expect(networkParams.listOfChanges).toEqual([])
    })
  })
