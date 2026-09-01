import { WrappedStates, UserAccount, DaoProposalAccount, DaoProjectData, DaoMilestone } from '../@types'
import { isUserAccount, isDaoProposalAccount } from '../@types/accountTypeGuards'
import { resolveMilestone } from './daoProjectMilestoneState'

export interface ProjectTxContext {
  from?: UserAccount
  proposal?: DaoProposalAccount
  project?: DaoProjectData
  milestone?: DaoMilestone
  milestoneIndex?: number
  error?: string
}

/**
 * The preamble every milestone transaction repeats: load the accounts, confirm this really is a
 * running project, and resolve the milestone number.
 *
 * Shared so the six milestone transactions cannot drift apart on what "a valid project transaction"
 * means — a mismatch between, say, start and claim on which statuses are acceptable is exactly the
 * kind of gap that lets a payment through on a project that should be finished.
 */
export function loadProjectTxContext(wrappedStates: WrappedStates, fromAddress: string, proposalId: string, milestoneNumber?: unknown): ProjectTxContext {
  const from = wrappedStates[fromAddress]?.data as UserAccount
  const proposal = wrappedStates[proposalId]?.data as DaoProposalAccount

  if (!from || !isUserAccount(from)) {
    return { error: 'from account not found or is not a UserAccount' }
  }
  if (!proposal || !isDaoProposalAccount(proposal)) {
    return { error: 'Proposal account not found or is not a DaoProposalAccount' }
  }
  if (proposal.proposalType !== 'project') {
    return { error: `Proposal type "${proposal.proposalType}" is not a project` }
  }
  if (!proposal.project) {
    return { error: 'Project proposal is missing its project data' }
  }
  if (proposal.status !== 'executing') {
    return { error: `Project is not executing (current: ${proposal.status})` }
  }

  const context: ProjectTxContext = { from, proposal, project: proposal.project }
  if (milestoneNumber !== undefined) {
    const resolved = resolveMilestone(proposal.project, milestoneNumber)
    if (resolved.error) return { error: resolved.error }
    context.milestone = resolved.milestone
    context.milestoneIndex = resolved.index
  }
  return context
}
