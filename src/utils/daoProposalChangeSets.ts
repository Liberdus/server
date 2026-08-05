import type { Shardus } from '@shardus/core'
import type { DaoParamChange, DaoParamChanges, DaoProposalAccount, DaoProposalType, NetworkAccount } from '../@types'
import { validateChangesPayload } from './daoParamValidation'

export function isNestedChangeSets(changes: DaoParamChanges): changes is DaoParamChange[][] {
  return Array.isArray(changes[0])
}

export function validateProposalChangeSets(
  proposalType: DaoProposalType,
  options: string[],
  changes: DaoParamChanges,
  network: NetworkAccount | undefined,
  dapp: Shardus | undefined,
  emergency: boolean,
): string | undefined {
  if (!Array.isArray(changes) || changes.length === 0) {
    return `tx "${proposalType}" payload must include a non-empty "changes" array`
  }

  if (isNestedChangeSets(changes)) {
    if (changes.length !== options.length - 1) {
      return `nested changes must have exactly one change set for each non-rejection option (expected ${options.length - 1}, got ${changes.length})`
    }
    if (emergency && (options.length !== 2 || changes.length !== 1)) {
      return 'emergency DAO proposals must have exactly one action option and one change set'
    }
    for (const [i, changeSet] of changes.entries()) {
      const structuralError = validateChangeSet(changeSet, `changes[${i}]`)
      if (structuralError) return structuralError
      const changesError = validateChangesPayload(proposalType, changeSet, network, dapp)
      if (changesError) return changesError
    }
    return undefined
  }

  // Create-time only: apply still accepts flat changes for proposals created before change sets existed.
  return 'new DAO proposals must use nested changes: wrap each option change set in its own array, e.g. [[{...}]]'
}

export function getSelectedChanges(proposal: DaoProposalAccount): DaoParamChange[] {
  const changes = getProposalChanges(proposal)
  if (!changes || changes.length === 0) return []
  // Legacy proposals created before multi-option change sets stored a flat changes array.
  if (!isNestedChangeSets(changes)) return changes
  if (proposal.emergency) {
    if (!changes[0] || changes[0].length === 0) throw new Error('Emergency proposal has no action change set')
    return changes[0]
  }

  const winnerIndex = proposal.winningOptionIndex
  const selectedChanges = winnerIndex === undefined || !Number.isInteger(winnerIndex) || winnerIndex <= 0 ? undefined : changes[winnerIndex - 1]
  if (!selectedChanges || selectedChanges.length === 0) {
    throw new Error('Proposal has no valid winning option change set')
  }
  return selectedChanges
}

function getProposalChanges(proposal: DaoProposalAccount): DaoParamChanges | undefined {
  if (proposal.proposalType === 'governance') return proposal.governance?.changes
  if (proposal.proposalType === 'economic') return proposal.economic?.changes
  if (proposal.proposalType === 'protocol') return proposal.protocol?.changes
  return undefined
}

function validateChangeSet(changes: unknown, path: string): string | undefined {
  if (!Array.isArray(changes) || changes.length === 0) {
    return `${path} must be a non-empty array of change objects`
  }

  const seenKeys = new Set<string>()
  for (const [i, change] of changes.entries()) {
    const itemPath = `${path}[${i}]`
    if (change === null || typeof change !== 'object' || Array.isArray(change)) {
      const actualType = change === null ? 'null' : Array.isArray(change) ? 'array' : typeof change
      return `each change must be an object { key: string; value: string; current: string } - got ${actualType} at ${itemPath}`
    }
    const paramChange = change as Partial<DaoParamChange>
    if (typeof paramChange.key !== 'string' || paramChange.key.length === 0) {
      return `each change must have a non-empty string "key" - got ${paramChange.key === '' ? 'an empty string' : typeof paramChange.key} at ${itemPath}.key`
    }
    if (typeof paramChange.value !== 'string') {
      return `each change must have a string "value" - got ${typeof paramChange.value} at the "value" for key '${paramChange.key}'`
    }
    if (typeof paramChange.current !== 'string') {
      return `each change must have a string "current" - got ${typeof paramChange.current} at the "current" for key '${paramChange.key}'`
    }
    if (seenKeys.has(paramChange.key)) {
      return `each change set must have unique "key" entries - got duplicate "${paramChange.key}"`
    }
    seenKeys.add(paramChange.key)
  }

  return undefined
}
