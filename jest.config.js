module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 5000000, // the more node involve in testing, the higher the timeout requires
  verbose: true,
  roots: ['<rootDir>/test/'],
  testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
  moduleDirectories: ['node_modules', 'src'], 
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],  // Include setup file
  moduleNameMapper: {
    // jest 26 can't resolve the node: protocol prefix for built-in modules
    '^node:net$': '<rootDir>/__mocks__/node-net.js',
    // jest 26 predates package.json "exports" support (added in jest 28). These two ship an
    // exports map and no "main", so its resolver finds no entry point and reports the package as
    // missing — which takes down every suite that reaches sodium-native through lib-crypto-utils.
    // Pointing at the files the exports map resolves to under the node condition.
    '^require-addon$': '<rootDir>/node_modules/require-addon/lib/node.js',
    '^bare-assert$': '<rootDir>/node_modules/bare-assert/index.js',
  },
}
