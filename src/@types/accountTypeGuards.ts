import {
  UserAccount,
  ChatAccount,
  AliasAccount,
  NetworkAccount,
  NodeAccount,
  IssueAccount,
  DevIssueAccount,
  ProposalAccount,
  DevProposalAccount,
  DevAccount,
} from '.'

/**
 * Type guard to check if an account is a UserAccount
 */
export function isUserAccount(account: unknown): account is UserAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'UserAccount'
}

/**
 * Type guard to check if an account is a ChatAccount
 */
export function isChatAccount(account: unknown): account is ChatAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'ChatAccount'
}

/**
 * Type guard to check if an account is an AliasAccount
 */
export function isAliasAccount(account: unknown): account is AliasAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'AliasAccount'
}

/**
 * Type guard to check if an account is a NetworkAccount
 */
export function isNetworkAccount(account: unknown): account is NetworkAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'NetworkAccount'
}

/**
 * Type guard to check if an account is a NodeAccount
 */
export function isNodeAccount(account: unknown): account is NodeAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'NodeAccount'
}

/**
 * Type guard to check if an account is an IssueAccount
 */
export function isIssueAccount(account: unknown): account is IssueAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'IssueAccount'
}

/**
 * Type guard to check if an account is a DevIssueAccount
 */
export function isDevIssueAccount(account: unknown): account is DevIssueAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'DevIssueAccount'
}

/**
 * Type guard to check if an account is a ProposalAccount
 */
export function isProposalAccount(account: unknown): account is ProposalAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'ProposalAccount'
}

/**
 * Type guard to check if an account is a DevProposalAccount
 */
export function isDevProposalAccount(account: unknown): account is DevProposalAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'DevProposalAccount'
}

/**
 * Type guard to check if an account is a DevAccount
 */
export function isDevAccount(account: unknown): account is DevAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'DevAccount'
}
