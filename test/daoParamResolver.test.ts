import {
  resolveParamPath,
  resolveParamPathForProposalType,
  buildNestedChange,
  mergeNestedChange,
  patchDeepOwn,
  pathsOverlap,
} from '../src/utils/daoParamResolver'
import type { Shardus } from '@shardus/core'
import type { NetworkAccount } from '../src/@types'

describe('daoParamResolver', () => {
  describe('resolveParamPath', () => {
    test('first-level key wins over a nested duplicate', () => {
      const target = {
        activeVersion: '1.0.0',
        archiver: { activeVersion: '2.0.0', minVersion: '1.9.0' },
      }
      expect(resolveParamPath(target, 'activeVersion')).toEqual({ path: ['activeVersion'], existing: '1.0.0' })
    })

    test('nested hit when key is not present at the first level', () => {
      const target = { p2p: { minNodes: 50, maxNodes: 100 }, debug: { countEndpointStart: -1 } }
      expect(resolveParamPath(target, 'minNodes')).toEqual({ path: ['p2p', 'minNodes'], existing: 50 })
    })

    test('deterministic first-match order across multiple nested candidates', () => {
      const target = {
        a: { shared: 1 },
        b: { shared: 2 },
      }
      // "a" comes first in Object.keys order, so its "shared" wins.
      expect(resolveParamPath(target, 'shared')).toEqual({ path: ['a', 'shared'], existing: 1 })
    })

    test('arrays are not traversed', () => {
      const target = { list: [{ minNodes: 1 }], other: { minNodes: 2 } }
      expect(resolveParamPath(target, 'minNodes')).toEqual({ path: ['other', 'minNodes'], existing: 2 })
    })

    test('skipSubtrees excludes a named top-level subtree from nested search', () => {
      const target = {
        dao: { reviewDuration: 1000 },
        other: {},
      }
      expect(resolveParamPath(target, 'reviewDuration', { skipSubtrees: ['dao'] })).toBeUndefined()
    })

    test('skipSubtrees does not prevent a first-level hit on the skipped key itself', () => {
      const target = { dao: { reviewDuration: 1000 } }
      expect(resolveParamPath(target, 'dao', { skipSubtrees: ['dao'] })).toEqual({
        path: ['dao'],
        existing: target.dao,
      })
    })

    test('object-section backward compatibility: section name resolves to itself', () => {
      const target = { p2p: { minNodes: 50 }, debug: { countEndpointStart: -1 } }
      expect(resolveParamPath(target, 'p2p')).toEqual({ path: ['p2p'], existing: target.p2p })
      expect(resolveParamPath(target, 'debug')).toEqual({ path: ['debug'], existing: target.debug })
    })

    test('returns undefined when key does not exist anywhere', () => {
      const target = { p2p: { minNodes: 50 } }
      expect(resolveParamPath(target, 'doesNotExist')).toBeUndefined()
    })
  })

  describe('resolveParamPathForProposalType', () => {
    const network = {
      current: {
        activeVersion: '1.0.0',
        nodeRewardAmountUsdStr: '1.0',
        archiver: { activeVersion: '2.0.0', minVersion: '1.9.0' },
        dao: { reviewDuration: 1000, committeeAddresses: [] },
      },
    } as unknown as NetworkAccount

    // dapp.config *is* the Shardus server config directly; `server` here is a decoy nested
    // object representing the on-disk config.json shape (`{ server: {...} }`), which dapp.config
    // is NOT. Both `p2p` subtrees carry a `marker` so resolution against the wrong base is
    // distinguishable.
    const dapp = {
      config: {
        p2p: { minNodes: 50, maxNodes: 1100, marker: 'config-level' },
        debug: { countEndpointStart: -1 },
        server: { p2p: { minNodes: 999, marker: 'server-level' } },
      },
    } as unknown as Shardus

    test('governance resolves against network.current.dao', () => {
      expect(resolveParamPathForProposalType('governance', network, dapp, 'reviewDuration')).toEqual({
        path: ['reviewDuration'],
        existing: 1000,
      })
    })

    test('economic resolves against network.current, skipping the dao subtree', () => {
      expect(resolveParamPathForProposalType('economic', network, dapp, 'nodeRewardAmountUsdStr')).toEqual({
        path: ['nodeRewardAmountUsdStr'],
        existing: '1.0',
      })
      expect(resolveParamPathForProposalType('economic', network, dapp, 'reviewDuration')).toBeUndefined()
    })

    test('economic resolving "dao" itself returns the dao object at the top level (caller rejects it)', () => {
      expect(resolveParamPathForProposalType('economic', network, dapp, 'dao')).toEqual({
        path: ['dao'],
        existing: network.current.dao,
      })
    })

    test('economic leaf "activeVersion" resolves to the top-level network version, not archiver.activeVersion', () => {
      expect(resolveParamPathForProposalType('economic', network, dapp, 'activeVersion')).toEqual({
        path: ['activeVersion'],
        existing: '1.0.0',
      })
    })

    test('protocol resolves against dapp.config directly (not dapp.config.server)', () => {
      expect(resolveParamPathForProposalType('protocol', network, dapp, 'minNodes')).toEqual({
        path: ['p2p', 'minNodes'],
        existing: 50,
      })
      expect(resolveParamPathForProposalType('protocol', network, dapp, 'debug')).toEqual({
        path: ['debug'],
        existing: dapp.config.debug,
      })
      // "p2p" is a first-level key of dapp.config — first-level-wins must return
      // dapp.config.p2p ("config-level"), not dapp.config.server.p2p ("server-level").
      const resolved = resolveParamPathForProposalType('protocol', network, dapp, 'p2p')
      expect(resolved).toEqual({ path: ['p2p'], existing: dapp.config.p2p })
      expect((resolved.existing as { marker: string }).marker).toBe('config-level')
    })

    test('protocol returns undefined when dapp is not available (validate_fields)', () => {
      expect(resolveParamPathForProposalType('protocol', network, undefined, 'minNodes')).toBeUndefined()
    })
  })

  describe('buildNestedChange', () => {
    test('round-trips a path to the expected nested object', () => {
      expect(buildNestedChange(['p2p', 'minNodes'], 10)).toEqual({ p2p: { minNodes: 10 } })
      expect(buildNestedChange(['debug'], { countEndpointStart: -1 })).toEqual({ debug: { countEndpointStart: -1 } })
    })
  })

  describe('mergeNestedChange', () => {
    test('sibling leaves under the same parent deep-merge without clobbering', () => {
      const target: Record<string, unknown> = {}
      mergeNestedChange(target, buildNestedChange(['p2p', 'minNodes'], 10))
      mergeNestedChange(target, buildNestedChange(['p2p', 'maxNodes'], 100))
      expect(target).toEqual({ p2p: { minNodes: 10, maxNodes: 100 } })
    })
  })

  describe('pathsOverlap', () => {
    test('equal paths overlap', () => {
      expect(pathsOverlap(['debug', 'countEndpointStart'], ['debug', 'countEndpointStart'])).toBe(true)
    })

    test('a path that is a prefix of another overlaps', () => {
      expect(pathsOverlap(['debug'], ['debug', 'countEndpointStart'])).toBe(true)
    })

    test('sibling paths under a shared parent do not overlap', () => {
      expect(pathsOverlap(['p2p', 'minNodes'], ['p2p', 'maxNodes'])).toBe(false)
    })

    test('unrelated paths do not overlap', () => {
      expect(pathsOverlap(['p2p', 'minNodes'], ['debug', 'countEndpointStart'])).toBe(false)
    })
  })

  describe('patchDeepOwn', () => {
    test('deep-merges a 3-level change without clobbering sibling fields', () => {
      const target = {
        rateLimiting: {
          limitRate: true,
          loadLimit: { internal: 0.6, external: 0.6, txTimeInQueue: 0.6, queueLength: 0.6 },
        },
      }
      patchDeepOwn(target, { rateLimiting: { loadLimit: { internal: 0.7 } } })
      expect(target.rateLimiting.loadLimit.internal).toBe(0.7)
      expect(target.rateLimiting.loadLimit.external).toBe(0.6)
      expect(target.rateLimiting.loadLimit.txTimeInQueue).toBe(0.6)
      expect(target.rateLimiting.loadLimit.queueLength).toBe(0.6)
      expect(target.rateLimiting.limitRate).toBe(true)
    })

    test('applies falsy values (false, 0) correctly', () => {
      const target = { debug: { continueOnException: true, fakeNetworkDelay: 5, firstCycleJoin: 1 } }
      patchDeepOwn(target, { debug: { continueOnException: false, fakeNetworkDelay: 0 } })
      expect((target.debug as any).continueOnException).toBe(false)
      expect((target.debug as any).fakeNetworkDelay).toBe(0)
      expect((target.debug as any).firstCycleJoin).toBe(1)
    })

    test('does not add keys absent from the target', () => {
      const target = { p2p: { minNodes: 10 } }
      patchDeepOwn(target, { p2p: { minNodes: 12, unknownKey: 99 } })
      expect((target.p2p as any).minNodes).toBe(12)
      expect((target.p2p as any).unknownKey).toBeUndefined()
    })

    test('does not touch sections absent from the target', () => {
      const target = { p2p: { minNodes: 10 } }
      patchDeepOwn(target, { p2p: { minNodes: 20 }, nonExistentSection: { foo: 1 } } as any)
      expect((target.p2p as any).minNodes).toBe(20)
      expect((target as any).nonExistentSection).toBeUndefined()
    })
  })
})
