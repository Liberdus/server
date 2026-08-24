import {
  UserAccount,
  ChatAccount,
  AliasAccount,
  NetworkAccount,
  NodeAccount,
  DevAccount,
  DaoProposalsMeta,
  DaoProposalAccount,
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
 * Type guard to check if an account is a DevAccount
 */
export function isDevAccount(account: unknown): account is DevAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'DevAccount'
}

/**
 * Type guard to check if an account is a DaoProposalsMeta account
 */
export function isDaoProposalsMeta(account: unknown): account is DaoProposalsMeta {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'DaoProposalsMeta'
}

/**
 * Type guard to check if an account is a DaoProposalAccount
 */
export function isDaoProposalAccount(account: unknown): account is DaoProposalAccount {
  return !!account && typeof account === 'object' && 'type' in account && account.type === 'DaoProposalAccount'
}
