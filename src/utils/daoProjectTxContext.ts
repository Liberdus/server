import { WrappedStates, UserAccount, DaoProposalAccount, DaoProjectData, DaoMilestone } from '../@types'
import { isUserAccount, isDaoProposalAccount } from '../@types/accountTypeGuards'
import { resolveMilestone } from './daoProjectMilestoneState'

interface ProjectTxContextError {
  error: string
  from?: undefined
  proposal?: undefined
  project?: undefined
  milestone?: undefined
  milestoneIndex?: undefined
}

interface ProjectTxContextLoaded {
  error?: undefined
  from: UserAccount
  proposal: DaoProposalAccount
  project: DaoProjectData
  milestone?: DaoMilestone
  milestoneIndex?: number
}

/**
 * Either the loaded accounts or the reason they could not be loaded, never a mix of both.
 *
 * A union rather than a bag of optionals so a caller cannot reach `project` without having handled
 * `error` first — previously the early return carried all the safety by convention, with no help
 * from the type.
 */
export type ProjectTxContext = ProjectTxContextError | ProjectTxContextLoaded

/**
 * The preamble every project transaction repeats: load the accounts, confirm this really is a
 * project proposal, and resolve the milestone number when one was supplied.
 *
 * Deliberately says nothing about project status. The eight project transactions use five different
 * status rules between them, so a shared default served half of them and had to be overridden by the
 * rest — and that default caused the bug this helper was meant to prevent, silently applying
 * `executing` to the claim handler and blocking the post-end claim the balance is trimmed for. Each
 * handler now states its own rule inline, where a reviewer reads it alongside the other guards.
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

  if (milestoneNumber === undefined) {
    return { from, proposal, project: proposal.project }
  }
  const resolved = resolveMilestone(proposal.project, milestoneNumber)
  if (resolved.error) return { error: resolved.error }
  return { from, proposal, project: proposal.project, milestone: resolved.milestone, milestoneIndex: resolved.index }
}
