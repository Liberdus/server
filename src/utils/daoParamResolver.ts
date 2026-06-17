import type { Shardus } from '@shardus/core'
import type { NetworkAccount, DaoProposalType } from '../@types'

export interface ResolvedParam {
  key: string
  path: string[]
  existing: unknown
}

export interface ResolvedChange extends ResolvedParam {
  value: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Depth-first walk returning the first descendant object that directly owns `key`.
// Top-level subtrees named in `skip` are excluded from the search.
// "First match wins" is deterministic because network.current and dapp.config
// are built identically on every node.
function searchNested(node: Record<string, unknown>, key: string, ancestors: string[], skip: Set<string>): { path: string[]; existing: unknown } | undefined {
  for (const childKey of Object.keys(node)) {
    if (ancestors.length === 0 && skip.has(childKey)) continue
    const childVal = node[childKey]
    if (!isPlainObject(childVal)) continue
    if (Object.prototype.hasOwnProperty.call(childVal, key)) {
      return { path: [...ancestors, childKey, key], existing: childVal[key] }
    }
    const nested = searchNested(childVal, key, [...ancestors, childKey], skip)
    if (nested) return nested
  }
  return undefined
}

// Finds where `key` lives in `target`:
// - first-level hit wins (keeps dual-located keys like `activeVersion` at the top level)
// - otherwise depth-first search, skipping subtrees listed in opts.skipSubtrees
// - returns undefined if the key is not found
export function resolveParamPath(target: Record<string, unknown>, key: string, opts?: { skipSubtrees?: string[] }): ResolvedParam | undefined {
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    return { key, path: [key], existing: target[key] }
  }
  const skip = new Set(opts?.skipSubtrees ?? [])
  const found = searchNested(target, key, [], skip)
  return found ? { key, ...found } : undefined
}

// Returns the resolved path/value for a change key based on proposal type:
// governance → network.current.dao
// economic   → network.current (dao subtree excluded)
// protocol   → dapp.config (dapp is not available in validate_fields, so returns undefined)
export function resolveParamPathForProposalType(
  proposalType: DaoProposalType,
  network: NetworkAccount,
  dapp: Shardus | undefined,
  key: string,
): ResolvedParam | undefined {
  if (proposalType === 'governance') {
    return resolveParamPath(network.current.dao as unknown as Record<string, unknown>, key)
  }
  if (proposalType === 'economic') {
    return resolveParamPath(network.current as unknown as Record<string, unknown>, key, { skipSubtrees: ['dao'] })
  }
  // protocol: dapp.config is the live Shardus server config; patchConfig wraps the resolved
  // path under .server when applying.
  if (!dapp) return undefined
  return resolveParamPath(dapp.config as unknown as Record<string, unknown>, key)
}

// Resolves every change to its target path and existing value.
// A failure here means validate() and apply() diverged — should never happen.
export function resolveChanges(
  proposalType: DaoProposalType,
  network: NetworkAccount,
  dapp: Shardus,
  changes: Array<{ key: string; value: string }>,
): ResolvedChange[] {
  return changes.map(change => {
    const resolved = resolveParamPathForProposalType(proposalType, network, dapp, change.key)
    if (!resolved) {
      throw new Error(`key "${change.key}" does not exist in ${proposalType} parameters`)
    }
    return { ...resolved, value: change.value }
  })
}

// Turns (['p2p', 'minNodes'], 10) into { p2p: { minNodes: 10 } }.
export function buildNestedChange(path: string[], value: unknown): Record<string, unknown> {
  if (path.length === 0) throw new Error('buildNestedChange: path must be non-empty')
  const [head, ...rest] = path
  return rest.length === 0 ? { [head]: value } : { [head]: buildNestedChange(rest, value) }
}

// Deep-merges `nested` into `target` in place so sibling changes (e.g. p2p.minNodes and
// p2p.maxNodes) accumulate into one payload without clobbering each other.
export function mergeNestedChange(target: Record<string, unknown>, nested: Record<string, unknown>): void {
  for (const key of Object.keys(nested)) {
    const value = nested[key]
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeNestedChange(target[key] as Record<string, unknown>, value)
    } else {
      target[key] = value
    }
  }
}

// Deep-merges `change` into `target` in place, skipping keys not already present in `target`.
// Uses own-property existence (not truthiness) so falsy values (false, 0) are applied correctly.
// Recurses into nested objects so a leaf-level change doesn't clobber sibling fields.
export function patchDeepOwn(target: Record<string, unknown>, change: Record<string, unknown>): void {
  for (const key of Object.keys(change)) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) continue
    const src = change[key]
    const dst = target[key]
    if (isPlainObject(src) && isPlainObject(dst)) {
      patchDeepOwn(dst, src)
    } else {
      target[key] = src
    }
  }
}

// Returns true if paths a and b are equal or one is a prefix of the other.
// Equal/prefix paths can't be applied together without ambiguity; siblings are fine.
export function pathsOverlap(a: string[], b: string[]): boolean {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
