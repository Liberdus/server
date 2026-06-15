// Stub for node:net — jest 26 can't resolve the node: protocol prefix.
// Only net.Socket is used (in isPortReachable.ts) and never called in tests.
module.exports = {
  Socket: class {},
  Server: class {},
  createServer: () => ({}),
  connect: () => ({}),
}
