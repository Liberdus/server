import type { Shardus } from '@shardus/core'
import type { NetworkAccount, DaoProposalType } from '../@types'
import * as utils from '../utils'
import { LiberdusFlags } from '../config'
import { resolveParamPathForProposalType, pathsOverlap } from './daoParamResolver'

// Resolves each change key against the appropriate parameter source, validates the value
// type via coerce, checks committeeAddresses constraints, and rejects overlapping paths.
// Used by both dao_proposal_create (fail-fast at creation) and dao_apply_parameters
// (authoritative check before writing). Returns an error reason or undefined on success.
export function validateChangesPayload(
  proposalType: DaoProposalType,
  changes: Array<{ key: string; value: string }>,
  network: NetworkAccount,
  dapp: Shardus | undefined,
): string | undefined {
  const resolvedPaths: string[][] = []

  for (const change of changes) {
    const resolved = resolveParamPathForProposalType(proposalType, network, dapp, change.key)
    if (!resolved) return `key "${change.key}" does not exist in ${proposalType} parameters`

    // Economic proposals cannot touch the dao subtree — only governance proposals can.
    if (proposalType === 'economic' && resolved.path.length === 1 && resolved.path[0] === 'dao') {
      return `key "${change.key}" is the "dao" parameters object; economic proposals cannot modify it`
    }

    try {
      const coerced = coerce(resolved.existing, change.value)
      if (resolved.path[resolved.path.length - 1] === 'committeeAddresses') {
        validateCommitteeAddresses(coerced)
      }
    } catch (err: any) {
      return `value "${change.value}" is not valid for key "${change.key}" (resolved to "${resolved.path.join('.')}"): ${err.message}`
    }

    resolvedPaths.push(resolved.path)
  }

  // Reject if two changes resolve to the same path or one is a prefix of the other.
  for (let i = 0; i < resolvedPaths.length; i++) {
    for (let j = i + 1; j < resolvedPaths.length; j++) {
      if (pathsOverlap(resolvedPaths[i], resolvedPaths[j])) {
        return `changes contain overlapping targets: "${resolvedPaths[i].join('.')}" and "${resolvedPaths[j].join('.')}"`
      }
    }
  }

  return undefined
}

// Converts a proposal change string value to the correct runtime type by matching
// against the existing parameter's type. Throws if the value is invalid for that type.
export function coerce(existing: unknown, value: string): unknown {
  if (typeof existing === 'number') {
    const n = Number(value)
    if (!Number.isFinite(n)) throw new Error(`"${value}" is not a valid finite number for this field`)
    return n
  }
  if (typeof existing === 'boolean') {
    if (value !== 'true' && value !== 'false') throw new Error(`"${value}" is not a valid boolean — must be exactly "true" or "false"`)
    return value === 'true'
  }
  if (typeof existing === 'bigint') {
    if (!/^-?\d+$/.test(value)) throw new Error(`"${value}" is not a valid integer string for this field`)
    return BigInt(value)
  }
  if (Array.isArray(existing)) {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) throw new Error(`"${value}" does not parse to an array`)
    return parsed
  }
  if (typeof existing === 'object' && existing !== null) {
    const parsed = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`"${value}" does not parse to an object`)
    }
    // Every key in the proposed patch must exist in the target object with a matching type.
    if (!utils.comparePropertiesTypes(parsed, existing)) {
      throw new Error(`"${value}" contains keys or types not present in the existing object`)
    }
    return parsed
  }
  return value
}

// Extra validation for committeeAddresses beyond type-checking — size bounds, valid hex
// addresses, and no duplicates — since quorum math depends on this field being well-formed.
export function validateCommitteeAddresses(coerced: unknown): void {
  if (!Array.isArray(coerced)) {
    throw new Error('committeeAddresses must be an array')
  }
  const min = LiberdusFlags.minCommitteeMembers
  const max = LiberdusFlags.maxCommitteeMembers
  if (coerced.length < min || coerced.length > max) {
    throw new Error(`committeeAddresses must contain between ${min} and ${max} members (got ${coerced.length})`)
  }
  for (const addr of coerced) {
    if (typeof addr !== 'string' || !utils.isValidAddress(addr)) {
      throw new Error(`committeeAddresses contains an invalid address: "${addr}"`)
    }
  }
  if (new Set(coerced).size !== coerced.length) {
    throw new Error('committeeAddresses contains duplicate addresses')
  }
}
