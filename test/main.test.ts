import { startupTest, transactionsTest, apiTest, spamTest, stopTest } from './tests'

describe('Sequentially run test suites', () => {
  startupTest()
  transactionsTest()
  apiTest()
  spamTest()
  stopTest()
})