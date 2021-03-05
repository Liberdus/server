import * as utils from './testUtils'

describe('API functions as expected', () => {
  it('Should be able to query network data', async () => {
    await utils.waitForNetworkParameters()
    let network = await utils.queryParameters()
    expect(network).toBeDefined()
  })
})
