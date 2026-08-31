import * as fs from 'fs'
import * as path from 'path'
import { Utils } from '@shardus/lib-types'
import * as crypto from '../src/crypto'
import { groupAccount } from '../src/accounts/groupAccount'
import { validate, validate_fields, apply, keys } from '../src/transactions/group_maintenance_fund'
import * as AccountsStorage from '../src/storage/accountStorage'
import { GroupAccount, UserAccount } from '../src/@types'
import { ShardusTypes } from '@shardus/core'

/**
 * group_maintenance_fund tops up the balance that pays for tree repair.
 *
 * The property worth defending here is what the transaction does NOT do: it
 * moves value in and provides no way back out. There is no withdrawal
 * transaction anywhere, which is what makes it safe to let anyone contribute.
 */

const FEE = 10n ** 16n
const ADMIN = '1'.repeat(64)
const STRANGER = '5'.repeat(64)
const GROUP = '9'.repeat(64)

beforeAll(() => {
  crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
  crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  ;(AccountsStorage as any).cachedNetworkAccount = {
    current: { activeVersion: '1.0.0', transactionFee: FEE },
  }
})

const dapp: any = { log: () => undefined, applyResponseAddReceiptData: () => undefined }

const makeGroup = (balance = BigInt(0)): GroupAccount => {
  const g = groupAccount(
    GROUP,
    {
      from: ADMIN,
      groupId: GROUP,
      groupNonce: 'ab'.repeat(16),
      mlsGroupId: 'ff'.repeat(8),
      cipherSuite: 84,
      meta: 'meta',
      maxMembers: 20,
      joinFee: BigInt(0),
      fee: FEE,
    } as any,
    1_700_000_000_000,
  )
  g.maintenanceBalance = balance
  return g
}

const user = (id: string, balance: bigint): UserAccount =>
  ({ id, type: 'UserAccount', hash: '', timestamp: 0, data: { balance, chats: {} } } as any)

const fundTx = (over: Record<string, unknown> = {}): any => ({
  type: 'group_maintenance_fund',
  from: ADMIN,
  groupId: GROUP,
  amount: FEE * 3n,
  fee: FEE,
  timestamp: 1_700_000_100_000,
  sign: { owner: ADMIN, sig: '00' },
  ...over,
})

const blank = (): ShardusTypes.IncomingTransactionResult =>
  ({ success: false, reason: 'Invalid transaction', status: 400 } as unknown as ShardusTypes.IncomingTransactionResult)

const runValidate = (tx: any, states: any) => validate(tx, states, blank(), undefined as never)

const wrap = (accounts: Record<string, any>): any => {
  const out: Record<string, any> = {}
  for (const [id, data] of Object.entries(accounts)) {
    out[id] = { accountId: id, stateId: '', data, timestamp: 0, accountCreated: false, isPartial: false }
  }
  return out
}

describe('field validation', () => {
  test('a zero contribution is refused', () => {
    expect(validate_fields(fundTx({ amount: BigInt(0) }), blank()).reason).toContain('greater than zero')
  })

  test('a negative contribution is refused', () => {
    expect(validate_fields(fundTx({ amount: -1n }), blank()).reason).toContain('greater than zero')
  })

  test('a non-bigint amount is refused', () => {
    expect(validate_fields(fundTx({ amount: 5 }), blank()).reason).toContain('must be a bigint')
  })
})

describe('funding the balance', () => {
  test('a contribution moves from the sender into the group', () => {
    const group = makeGroup(FEE * 2n)
    const sender = user(ADMIN, FEE * 100n)
    const tx = fundTx({ amount: FEE * 3n })
    apply(tx, 1_700_000_200_000, 'tx-id', wrap({ [ADMIN]: sender, [GROUP]: group }), dapp, {} as any)

    expect(group.maintenanceBalance).toBe(FEE * 5n)
    // the contribution AND the fee both leave the sender
    expect(sender.data.balance).toBe(FEE * 100n - FEE * 3n - FEE)
  })

  test('anyone may contribute, member or not', () => {
    // The balance can only ever burn a repair fee, so a stranger's contribution
    // cannot be redirected and there is nothing to gain by restricting this.
    const group = makeGroup()
    const states = wrap({ [STRANGER]: user(STRANGER, FEE * 100n), [GROUP]: group })
    expect(runValidate(fundTx({ from: STRANGER }), states).success).toBe(true)
  })

  test('a sender who cannot cover fee plus contribution is refused', () => {
    const group = makeGroup()
    const needed = FEE + FEE * 3n
    const states = wrap({ [ADMIN]: user(ADMIN, needed - 1n), [GROUP]: group })
    const res = runValidate(fundTx({ amount: FEE * 3n }), states)
    expect(res.success).toBe(false)
    expect(res.reason).toContain('sufficient funds')
  })

  test('a missing group is refused', () => {
    const states = wrap({ [ADMIN]: user(ADMIN, FEE * 100n) })
    expect(runValidate(fundTx(), states).reason).toContain('does not exist')
  })

  test('it funds a group serialized before the field existed', () => {
    const group = makeGroup()
    delete (group as any).maintenanceBalance
    const sender = user(ADMIN, FEE * 100n)
    apply(fundTx({ amount: FEE }), 1_700_000_200_000, 'tx-id', wrap({ [ADMIN]: sender, [GROUP]: group }), dapp, {} as any)
    expect(group.maintenanceBalance).toBe(FEE)
  })
})

describe('the balance has no way out', () => {
  test('nothing subtracts from the balance except the repair fee', () => {
    // The "nothing to steal" argument for letting anyone fund this rests
    // entirely on there being no exit other than a burned repair fee. Rather
    // than trust a comment, walk the source: every subtraction from
    // maintenanceBalance must live in group_commit, which is where the fee for
    // a repair commit is taken.
    const txDir = path.join(__dirname, '..', 'src', 'transactions')
    const offenders: string[] = []
    for (const file of fs.readdirSync(txDir).filter((f) => f.endsWith('.ts'))) {
      const src = fs.readFileSync(path.join(txDir, file), 'utf8')
      const subtracts = /SafeBigIntMath\.subtract\(\s*(?:group|account)\.maintenanceBalance/.test(src)
      if (subtracts && file !== 'group_commit.ts') offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('funding touches the group account and the sender, and nothing else', () => {
    const result: any = { sourceKeys: [], targetKeys: [], allKeys: [] }
    const k = keys(fundTx(), result)
    expect(k.sourceKeys).toEqual([ADMIN])
    // Notably not the GroupTreeAccount: nothing here reads the ratchet tree.
    expect(k.targetKeys).toEqual([GROUP])
  })
})
