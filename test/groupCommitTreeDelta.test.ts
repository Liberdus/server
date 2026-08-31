import { validate_fields } from '../src/transactions/group_commit'
import * as config from '../src/config'
import { ShardusTypes } from '@shardus/core'

/**
 * The treeDelta node index must be bounded, not merely non-negative.
 *
 * applyTreeDelta grows the node array to reach entry.i, while the payload size
 * cap measures only String(entry.n) + 16 -- so an enormous index is a tiny
 * transaction that costs the account an enormous array. These assert the bound
 * that stops it.
 *
 * validate_fields is the right place for it: handleSharedTX calls app.validate
 * and nothing else, so this is the only check a transaction arriving by gossip
 * has to clear.
 */

const MAX_INDEX = 2 * config.LiberdusFlags.groupMaxMembers

// A field-valid commit, up to the point validate_fields inspects treeDelta.
const baseTx = (treeDelta: { i: number; n: string | null }[]): any => ({
  type: 'group_commit',
  from: '1'.repeat(64),
  groupId: '2'.repeat(64),
  epoch: 0,
  commit: 'AAAA',
  proposals: [],
  pskId: '',
  pskNonce: '',
  groupInfo: '',
  ratchetTree: '',
  treeDelta,
})

const run = (tx: any): ShardusTypes.IncomingTransactionResult => {
  const response = {
    success: false,
    reason: 'Invalid transaction',
    status: 400,
  } as unknown as ShardusTypes.IncomingTransactionResult
  return validate_fields(tx as any, response)
}

describe('group_commit treeDelta node index bound', () => {
  test('the amplification payload is rejected', () => {
    // ~18 bytes on the size cap, fifty million array slots once applied.
    const res = run(baseTx([{ i: 50_000_000, n: 'AA' }]))
    expect(res.reason).toContain('exceeds the maximum')
  })

  test('an index just past the ceiling is rejected', () => {
    const res = run(baseTx([{ i: MAX_INDEX + 1, n: 'AA' }]))
    expect(res.reason).toContain('exceeds the maximum')
  })

  test('a blanking entry cannot smuggle a large index either', () => {
    const res = run(baseTx([{ i: 50_000_000, n: null }]))
    expect(res.reason).toContain('exceeds the maximum')
  })

  test('the largest legitimate index is accepted', () => {
    // A full tree of groupMaxMembers leaves reaches node index 2N-2, so the
    // ceiling itself must still pass or a legitimate commit would be refused.
    const res = run(baseTx([{ i: MAX_INDEX, n: 'AA' }]))
    expect(res.reason).not.toContain('exceeds the maximum')
  })

  test('ordinary small indices are unaffected', () => {
    const res = run(baseTx([{ i: 0, n: 'AA' }, { i: 3, n: null }]))
    expect(res.reason).not.toContain('node index')
  })

  test('a negative index is still rejected by the existing check', () => {
    const res = run(baseTx([{ i: -1, n: 'AA' }]))
    expect(res.reason).toContain('invalid node index')
  })
})
