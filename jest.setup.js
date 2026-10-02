jest.mock('net', () => {
  return {
    createServer: jest.fn(),
    connect: jest.fn(),
    isPortReachable: jest.fn(),
    // Add other mocked net functions if needed
  };
});

// Account factories hash themselves on construction, so every suite that builds one needs the
// crypto module initialised: hashObj throws without a hash key, and its default stringifier cannot
// handle the BigInt balances these accounts carry. Mirrors src/index.ts at startup.
const { Utils } = require('@shardus/lib-types')
const shardusCrypto = require('@shardus/lib-crypto-utils')
shardusCrypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
shardusCrypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
