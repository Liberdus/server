jest.mock('../src/utils/request', () => ({
  shardusPost: jest.fn(),
}))

import { Shardus } from '@shardus/core'
import { shardusPost } from '../src/utils/request'
import { AdminCert, isTerminalGoldenTicketError, tryAndFetchGoldenTicket } from '../src/transactions/admin_certificate'
import { NetworkAccount } from '../src/@types'

const mockShardusPost = shardusPost as jest.Mock

const network = {
  current: {
    goldenTicketServerUrl: 'http://localhost:3456/golden/ticket',
  },
} as NetworkAccount

const dapp = {
  shardusGetTime: jest.fn(() => 123456),
  signAsNode: jest.fn((request) => ({ ...request, sign: { owner: request.publicKey, sig: 'signature' } })),
} as unknown as Shardus

const ticket: AdminCert = {
  nominee: 'public-key',
  certCreation: 123456,
  certExp: 223456,
  goldenTicket: true,
  sign: {
    owner: 'server',
    sig: 'signature',
  },
}

describe('Golden Ticket fetch', () => {
  beforeEach(() => {
    mockShardusPost.mockReset()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns a ticket on a successful Golden Ticket response', async () => {
    mockShardusPost.mockResolvedValue({ data: { success: true, ticket } })

    const result = await tryAndFetchGoldenTicket('public-key', network, dapp)

    expect(result).toEqual({ ticket, retryable: false, terminal: false })
  })

  it('classifies timestamp errors from HTTP responses as retryable', async () => {
    mockShardusPost.mockRejectedValue({
      message: 'Request failed with status code 409',
      response: {
        status: 409,
        data: {
          success: false,
          error: 'Timestamp out of acceptable range. Difference: 10000ms, Tolerance: 5000ms',
        },
      },
    })

    const result = await tryAndFetchGoldenTicket('public-key', network, dapp)

    expect(result.retryable).toBe(true)
    expect(result.terminal).toBe(false)
    expect(result.error).toContain('Timestamp out of acceptable range')
  })

  it('classifies unregistered public keys as terminal', async () => {
    mockShardusPost.mockRejectedValue({
      message: 'Request failed with status code 401',
      response: {
        status: 401,
        data: {
          success: false,
          error: 'Public key not registered or inactive',
        },
      },
    })

    const result = await tryAndFetchGoldenTicket('public-key', network, dapp)

    expect(result.retryable).toBe(false)
    expect(result.terminal).toBe(true)
    expect(result.error).toBe('Public key not registered or inactive')
  })

  it('classifies network failures as retryable', async () => {
    mockShardusPost.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3456'))

    const result = await tryAndFetchGoldenTicket('public-key', network, dapp)

    expect(result.retryable).toBe(true)
    expect(result.terminal).toBe(false)
    expect(result.error).toContain('ECONNREFUSED')
  })

  it('adds one second to the timestamp when retrying', async () => {
    mockShardusPost.mockResolvedValue({ data: { success: true, ticket } })

    await tryAndFetchGoldenTicket('public-key', network, dapp, true)

    expect(dapp.signAsNode).toHaveBeenCalledWith(expect.objectContaining({ timestamp: 124456 }))
  })

  it('identifies terminal Golden Ticket validation errors', () => {
    expect(isTerminalGoldenTicketError('Public key not registered or inactive')).toBe(true)
    expect(isTerminalGoldenTicketError('Schema validation failed: publicKey must be a string')).toBe(true)
    expect(isTerminalGoldenTicketError('Nonce must be a non-negative integer')).toBe(true)
    expect(isTerminalGoldenTicketError('Port must be between 1 and 65535')).toBe(true)
    expect(isTerminalGoldenTicketError('Timestamp out of acceptable range')).toBe(false)
    expect(isTerminalGoldenTicketError('Rate limit exceeded for this validator')).toBe(false)
  })
})
