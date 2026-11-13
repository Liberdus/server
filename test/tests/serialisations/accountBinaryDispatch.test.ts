import { Shardus, VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import { AccountVariant, AliasAccount, ChatAccount, NetworkAccount, NodeAccount, Tx, UserAccount } from '../../../src/@types'
import { aliasAccount, serializeAliasAccount } from '../../../src/accounts/aliasAccount'
import { serializeAppData, deserializeAppData } from '../../../src/accounts/appDataSerialization'
import { chatAccount, serializeChatAccount } from '../../../src/accounts/chatAccount'
import { daoProposalAccount } from '../../../src/accounts/daoProposalAccount'
import { daoProposalsMetaAccount } from '../../../src/accounts/daoProposalsMetaAccount'
import { devAccount, serializeDevAccount } from '../../../src/accounts/devAccount'
import { deserializeAccounts, SerdeTypeIdent, serializeAccounts } from '../../../src/accounts'
import { networkAccount, serializeNetworkAccount } from '../../../src/accounts/networkAccount'
import { nodeAccount, serializeNodeAccount } from '../../../src/accounts/nodeAccount'
import { userAccount, serializeUserAccount } from '../../../src/accounts/userAccount'
import { LiberdusFlags } from '../../../src/config'
import * as crypto from '../../../src/crypto'

const now = 1_791_304_868_693
const dappStub = { getLatestCycles: () => [{ networkId: 'network-id' }] } as unknown as Shardus
const txStub = { from: 'aaaa', to: 'bbbb' } as unknown as Tx.Message

const serializeTaggedAccount = (account: AccountVariant): Buffer => {
  const stream = new VectorBufferStream(0)
  switch (account.type) {
    case 'AliasAccount':
      serializeAliasAccount(stream, account as AliasAccount, true)
      break
    case 'ChatAccount':
      serializeChatAccount(stream, account as ChatAccount, true)
      break
    case 'NetworkAccount':
      serializeNetworkAccount(stream, account as NetworkAccount, true)
      break
    case 'NodeAccount':
      serializeNodeAccount(stream, account as NodeAccount, true)
      break
    case 'UserAccount':
      serializeUserAccount(stream, account as UserAccount, true)
      break
    case 'DevAccount':
      serializeDevAccount(stream, account, true)
      break
    default:
      throw new Error(`No tagged fixture for ${account.type}`)
  }
  return stream.getBuffer()
}

const factoryAccounts = (): Array<[AccountVariant, SerdeTypeIdent]> => {
  const alias = aliasAccount('alias')
  alias.timestamp = now
  const chat = chatAccount('chat', txStub)
  chat.timestamp = now
  chat.read = [now, 0]
  chat.replied = [0, now]
  chat.toll.payOnRead = [2n ** 80n, 0n]
  chat.toll.payOnReply = [0n, 2n ** 90n]
  const node = nodeAccount('node')
  node.timestamp = now
  node.stakeLock = 2n ** 90n
  node.penalty = 2n ** 85n
  node.reward = 2n ** 100n
  node.rewardRate = 2n ** 75n
  node.nodeAccountStats.totalReward = 2n ** 100n
  node.nodeAccountStats.totalPenalty = 2n ** 85n
  node.nodeAccountStats.lastPenaltyTime = now
  const user = userAccount('user', now)
  user.data.balance = 50n * 10n ** 18n
  user.data.toll = 2n ** 80n
  user.data.chatTimestamp = now
  user.data.chats.recipient = { receivedTimestamp: now, chatId: 'chat' }
  user.pqPublicKey = 'post-quantum-key'
  const network = networkAccount('network', now, dappStub)
  const dev = devAccount('dev')
  dev.timestamp = now
  return [
    [alias, SerdeTypeIdent.AliasAccount],
    [chat, SerdeTypeIdent.ChatAccount],
    [network, SerdeTypeIdent.NetworkAccount],
    [node, SerdeTypeIdent.NodeAccount],
    [user, SerdeTypeIdent.UserAccount],
    [dev, SerdeTypeIdent.DevAccount],
  ]
}

describe('account serialization dispatch and tagged codecs', () => {
  const originalFlag = LiberdusFlags.versionFlags.useFallbackAccountSerialization

  beforeAll(() => {
    crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
    crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  })

  afterEach(() => {
    LiberdusFlags.versionFlags.useFallbackAccountSerialization = originalFlag
  })

  test('factory accounts use JSON transport while their tagged codecs remain lossless', () => {
    for (const [account, tag] of factoryAccounts()) {
      for (const active of [false, true]) {
        LiberdusFlags.versionFlags.useFallbackAccountSerialization = active
        const jsonFrame = serializeAppData('AppData', account)
        expect(VectorBufferStream.fromBuffer(jsonFrame).readUInt16()).toBe(SerdeTypeIdent.Fallback)
        expect(deserializeAppData('AppData', jsonFrame)).toEqual(account)
      }

      const binaryFrame = serializeTaggedAccount(account)
      expect(VectorBufferStream.fromBuffer(binaryFrame).readUInt16()).toBe(tag)
      const decoded = deserializeAppData('AppData', binaryFrame)
      expect(decoded).toEqual(account)
      expect(crypto.hashObj(decoded)).toBe(crypto.hashObj(account))
    }
  })

  test('DAO accounts switch from their tagged codec to JSON fallback at activation', () => {
    const accounts = [
      [daoProposalAccount('proposal'), SerdeTypeIdent.DaoProposalAccount],
      [daoProposalsMetaAccount('meta'), SerdeTypeIdent.DaoProposalsMeta],
    ] as Array<[AccountVariant, SerdeTypeIdent]>

    for (const active of [false, true]) {
      LiberdusFlags.versionFlags.useFallbackAccountSerialization = active
      for (const [account, tag] of accounts) {
        const encoded = serializeAccounts(account).getBuffer()
        expect(VectorBufferStream.fromBuffer(encoded).readUInt16()).toBe(active ? SerdeTypeIdent.Fallback : tag)
        expect(deserializeAccounts(encoded)).toEqual(account)
      }
    }
  })

  test('stored retired fields with default values remain valid in tagged encoding', () => {
    const user = userAccount('user', now)
    Object.assign(user.data, { friends: {}, stake: 0n, remove_stake_request: null, payments: [] })
    Object.assign(user, { emailHash: null, verified: false, claimedSnapshot: false })
    const node = nodeAccount('node')
    Object.assign(node, { balance: 0n, nodeRewardTime: 0 })

    for (const [account, tag] of [
      [user, SerdeTypeIdent.UserAccount],
      [node, SerdeTypeIdent.NodeAccount],
    ] as Array<[AccountVariant, SerdeTypeIdent]>) {
      const encoded = serializeTaggedAccount(account)
      expect(VectorBufferStream.fromBuffer(encoded).readUInt16()).toBe(tag)
      expect(deserializeAccounts(encoded)).toEqual(account)
    }
  })

  test('populated retired fields round-trip losslessly through the binary codecs', () => {
    const user = userAccount('user', now)
    const node = nodeAccount('node')
    const oldUser = user as UserAccount & { verified: string; emailHash: string; claimedSnapshot: boolean }
    oldUser.verified = 'verification-hash'
    oldUser.emailHash = 'email-hash'
    oldUser.claimedSnapshot = true
    ;(user.data as Record<string, unknown>).friends = { recipient: 'alias' }
    ;(user.data as Record<string, unknown>).stake = 4n
    ;(user.data as Record<string, unknown>).remove_stake_request = now
    user.operatorAccountInfo = {
      stake: 2n ** 90n,
      nominee: 'node',
      certExp: now,
      lastStakeTimestamp: now,
      operatorStats: {
        totalNodeReward: 2n ** 80n,
        totalNodePenalty: 0n,
        totalNodeTime: now,
        totalUnstakeReward: 0n,
        unstakeCount: 0,
        lastStakedNodeKey: 'node',
      },
    }
    ;(node as unknown as Record<string, unknown>).balance = 0n
    ;(node as unknown as Record<string, unknown>).nodeRewardTime = now
    for (const [account, tag] of [
      [user, SerdeTypeIdent.UserAccount],
      [node, SerdeTypeIdent.NodeAccount],
    ] as Array<[AccountVariant, SerdeTypeIdent]>) {
      const encoded = serializeTaggedAccount(account)
      expect(VectorBufferStream.fromBuffer(encoded).readUInt16()).toBe(tag)
      const decoded = deserializeAppData('AppData', encoded)
      expect(decoded).toEqual(account)
      expect(crypto.hashObj(decoded)).toBe(crypto.hashObj(account))
    }
  })

  test.each([
    [
      'friends',
      (user: UserAccount): void => {
        Object.assign(user.data, { friends: { recipient: 'alias' } })
      },
    ],
    [
      'stake',
      (user: UserAccount): void => {
        Object.assign(user.data, { stake: 1n })
      },
    ],
    [
      'remove_stake_request',
      (user: UserAccount): void => {
        Object.assign(user.data, { remove_stake_request: now })
      },
    ],
    [
      'payments',
      (user: UserAccount): void => {
        Object.assign(user.data, { payments: [1] })
      },
    ],
    [
      'emailHash',
      (user: UserAccount): void => {
        Object.assign(user, { emailHash: 'hash' })
      },
    ],
    [
      'verified',
      (user: UserAccount): void => {
        Object.assign(user, { verified: 'hash' })
      },
    ],
    [
      'claimedSnapshot',
      (user: UserAccount): void => {
        Object.assign(user, { claimedSnapshot: true })
      },
    ],
  ])('populated UserAccount %s round-trips through the binary codec', (_field, populate) => {
    const user = userAccount('user', now)
    populate(user)
    const encoded = serializeTaggedAccount(user)
    expect(VectorBufferStream.fromBuffer(encoded).readUInt16()).toBe(SerdeTypeIdent.UserAccount)
    expect(deserializeAccounts(encoded)).toEqual(user)
  })

  test.each([
    ['balance', { balance: 1n }],
    ['nodeRewardTime', { nodeRewardTime: now }],
  ])('populated NodeAccount %s round-trips through the binary codec', (_field, change) => {
    const node = Object.assign(nodeAccount('node'), change)
    const encoded = serializeTaggedAccount(node)
    expect(VectorBufferStream.fromBuffer(encoded).readUInt16()).toBe(SerdeTypeIdent.NodeAccount)
    expect(deserializeAccounts(encoded)).toEqual(node)
  })

  test('additional toll data is preserved', () => {
    const chat = chatAccount('chat', txStub)
    ;(chat.toll as typeof chat.toll & { futureTax?: bigint }).futureTax = 3n
    expect(deserializeAccounts(serializeTaggedAccount(chat))).toEqual(chat)
  })

  test.each([
    [
      'NodeAccount missing rewarded',
      (): AccountVariant => {
        const account = nodeAccount('node')
        delete (account as unknown as Record<string, unknown>).rewarded
        return account
      },
    ],
    [
      'ChatAccount missing hasChats',
      (): AccountVariant => {
        const account = chatAccount('chat', txStub)
        delete (account as unknown as Record<string, unknown>).hasChats
        return account
      },
    ],
    [
      'ChatAccount with a fractional required byte',
      (): AccountVariant => {
        const account = chatAccount('chat', txStub)
        account.toll.required[0] = 1.5
        return account
      },
    ],
    [
      'ChatAccount with an undefined required byte',
      (): AccountVariant => {
        const account = chatAccount('chat', txStub)
        account.toll.required[0] = undefined as unknown as number
        return account
      },
    ],
    [
      'ChatAccount with three required entries',
      (): AccountVariant => {
        const account = chatAccount('chat', txStub)
        ;(account.toll.required as number[]).push(2)
        return account
      },
    ],
    [
      'ChatAccount with three read timestamps',
      (): AccountVariant => {
        const account = chatAccount('chat', txStub)
        ;(account.read as number[]).push(now)
        return account
      },
    ],
    [
      'UserAccount with a number balance',
      (): AccountVariant => {
        const account = userAccount('user', now)
        ;(account.data as Record<string, unknown>).balance = 50
        return account
      },
    ],
    [
      'ChatAccount with a number toll amount',
      (): AccountVariant => {
        const account = chatAccount('chat', txStub)
        ;(account.toll.payOnRead as unknown[])[0] = 50
        return account
      },
    ],
  ] as Array<[string, () => AccountVariant]>)('%s rejects tagged encoding and uses the JSON fallback', (_name, makeAccount) => {
    const account = makeAccount()
    expect(() => serializeTaggedAccount(account)).toThrow()
    LiberdusFlags.versionFlags.useFallbackAccountSerialization = true
    const encoded = serializeAppData('AppData', account)
    expect(VectorBufferStream.fromBuffer(encoded).readUInt16()).toBe(SerdeTypeIdent.Fallback)
    expect(Utils.safeStringify(deserializeAppData('AppData', encoded))).toBe(Utils.safeStringify(account))
  })

  test('an unsafe timestamp rejects tagged encoding and uses the JSON fallback', () => {
    const account = devAccount('dev')
    account.timestamp = Number.MAX_SAFE_INTEGER + 1
    expect(() => serializeTaggedAccount(account)).toThrow()
    LiberdusFlags.versionFlags.useFallbackAccountSerialization = true
    const encoded = serializeAppData('AppData', account)
    expect(VectorBufferStream.fromBuffer(encoded).readUInt16()).toBe(SerdeTypeIdent.Fallback)
    expect(deserializeAppData('AppData', encoded)).toEqual(account)
  })
})
