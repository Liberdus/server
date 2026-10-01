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

describe('Golden Ticket fetch lifecycle', () => {
  const retryInterval = 10 * 60 * 1000
  let now: number
  let lifecycleDapp: Shardus
  let post: jest.Mock
  let adminCertificate: typeof import('../src/transactions/admin_certificate')
  let liberdusFlags: typeof import('../src/config').LiberdusFlags

  const ticketExpiringAt = (certExp: number): AdminCert => ({ ...ticket, certCreation: now, certExp })
  const retryableFailure = (): Error => new Error('connect ECONNREFUSED 127.0.0.1:3456')
  const terminalFailure = (): unknown => ({
    message: 'Request failed with status code 401',
    response: { status: 401, data: { success: false, error: 'Public key not registered or inactive' } },
  })
  const fetchIfNeeded = (): Promise<void> => adminCertificate.fetchGoldenTicketIfNeeded('public-key', network, lifecycleDapp)

  beforeEach(async () => {
    jest.resetModules()
    // Fresh module instances so the retry state starts clean for every test
    adminCertificate = await import('../src/transactions/admin_certificate')
    liberdusFlags = (await import('../src/config')).LiberdusFlags
    post = (await import('../src/utils/request')).shardusPost as jest.Mock
    post.mockReset()
    liberdusFlags.goldenTicketRetryInterval = retryInterval
    now = 1_000_000
    lifecycleDapp = {
      shardusGetTime: jest.fn(() => now),
      signAsNode: jest.fn((request) => ({ ...request, sign: { owner: request.publicKey, sig: 'signature' } })),
    } as unknown as Shardus
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('fetches on the first attempt and not again once a ticket is held', async () => {
    const fetchedTicket = ticketExpiringAt(now + retryInterval * 10)
    post.mockResolvedValue({ data: { success: true, ticket: fetchedTicket } })

    await fetchIfNeeded()
    now += retryInterval * 2
    await fetchIfNeeded()

    expect(post).toHaveBeenCalledTimes(1)
    expect(adminCertificate.adminCert).toEqual(fetchedTicket)
  })

  it('waits for the retry interval after a retryable failure and retries with the timestamp offset', async () => {
    post.mockRejectedValueOnce(retryableFailure())
    await fetchIfNeeded()

    now += retryInterval - 1
    await fetchIfNeeded()
    expect(post).toHaveBeenCalledTimes(1)

    post.mockResolvedValueOnce({ data: { success: true, ticket: ticketExpiringAt(now + retryInterval * 10) } })
    now += 1
    await fetchIfNeeded()
    expect(post).toHaveBeenCalledTimes(2)
    expect(lifecycleDapp.signAsNode).toHaveBeenLastCalledWith(expect.objectContaining({ timestamp: now + 1000 }))
    expect(adminCertificate.adminCert).not.toBeNull()
  })

  it('stops retrying after a terminal failure', async () => {
    post.mockRejectedValue(terminalFailure())

    await fetchIfNeeded()
    now += retryInterval * 3
    await fetchIfNeeded()

    expect(post).toHaveBeenCalledTimes(1)
    expect(adminCertificate.adminCert).toBeNull()
  })

  it('renews an expired Golden Ticket', async () => {
    post.mockResolvedValueOnce({ data: { success: true, ticket: ticketExpiringAt(now + 1000) } })
    await fetchIfNeeded()

    const renewedTicket = ticketExpiringAt(now + retryInterval * 10)
    post.mockResolvedValueOnce({ data: { success: true, ticket: renewedTicket } })
    now += 1000
    await fetchIfNeeded()

    expect(post).toHaveBeenCalledTimes(2)
    expect(adminCertificate.adminCert).toEqual(renewedTicket)
  })

  it('clears an expired Golden Ticket when renewal fails terminally', async () => {
    post.mockResolvedValueOnce({ data: { success: true, ticket: ticketExpiringAt(now + 1000) } })
    await fetchIfNeeded()

    post.mockRejectedValueOnce(terminalFailure())
    now += 1000
    await fetchIfNeeded()
    now += retryInterval * 3
    await fetchIfNeeded()

    expect(post).toHaveBeenCalledTimes(2)
    expect(adminCertificate.adminCert).toBeNull()
  })

  it('does not start a second fetch while one is in progress', async () => {
    let resolveFetch: (value: unknown) => void
    post.mockReturnValueOnce(new Promise((resolve) => (resolveFetch = resolve)))

    const firstFetch = fetchIfNeeded()
    await fetchIfNeeded()
    resolveFetch({ data: { success: true, ticket: ticketExpiringAt(now + retryInterval * 10) } })
    await firstFetch

    expect(post).toHaveBeenCalledTimes(1)
  })
})
