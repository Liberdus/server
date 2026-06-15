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
  },
}
