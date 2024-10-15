jest.mock('net', () => {
  return {
    createServer: jest.fn(),
    connect: jest.fn(),
    isPortReachable: jest.fn(),
    // Add other mocked net functions if needed
  };
});
