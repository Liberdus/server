import { dapp, networkAccount } from './'
import { _sleep } from './utils'
import * as crypto from 'shardus-crypto-utils'
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

// NODE_REWARD TRANSACTION FUNCTION
export function nodeReward(address: string, nodeId: string): void {
  const payAddress = address
  const tx = {
    type: 'node_reward',
    timestamp: Date.now(),
    nodeId: nodeId,
    from: address,
    to: payAddress,
  }
  dapp.put(tx)
}

// ISSUE TRANSACTION FUNCTION
export async function generateIssue(address: string, nodeId: string, ISSUE: number): Promise<void> {
  const tx = {
    type: 'issue',
    nodeId,
    from: address,
    issue: crypto.hash(`issue-${ISSUE}`),
    proposal: crypto.hash(`issue-${ISSUE}-proposal-1`),
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_ISSUE: ', nodeId)
}

// DEV_ISSUE TRANSACTION FUNCTION
export async function generateDevIssue(address: string, nodeId: string, DEV_ISSUE: number): Promise<void> {
  const tx = {
    type: 'dev_issue',
    nodeId,
    from: address,
    devIssue: crypto.hash(`dev-issue-${DEV_ISSUE}`),
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_DEV_ISSUE: ', nodeId)
}

// TALLY TRANSACTION FUNCTION
export async function tallyVotes(address: string, nodeId: string, ISSUE: number): Promise<void> {
  try {
    const account = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${ISSUE}`))
    const issue: IssueAccount = account.data
    const tx = {
      type: 'tally',
      nodeId,
      from: address,
      to: networkAccount,
      issue: issue.id,
      proposals: issue.proposals,
      timestamp: Date.now(),
    }
    dapp.put(tx)
    dapp.log('GENERATED_TALLY: ', nodeId)
  } catch (err) {
    dapp.log('ERR: ', err)
    await _sleep(1000)
    return tallyVotes(address, nodeId, ISSUE)
  }
}

// DEV_TALLY TRANSACTION FUNCTION
export async function tallyDevVotes(address: string, nodeId: string, DEV_ISSUE: number): Promise<void> {
  try {
    const account = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${DEV_ISSUE}`))
    const devIssue: DevIssueAccount = account.data
    const tx = {
      type: 'dev_tally',
      nodeId: nodeId,
      from: address,
      to: networkAccount,
      devIssue: devIssue.id,
      devProposals: devIssue.devProposals,
      timestamp: Date.now(),
    }
    dapp.put(tx)
    dapp.log('GENERATED_DEV_TALLY: ', nodeId)
  } catch (err) {
    dapp.log('ERR: ', err)
    await _sleep(1000)
    return tallyDevVotes(address, nodeId, DEV_ISSUE)
  }
}

// APPLY_PARAMETERS TRANSACTION FUNCTION
export async function applyParameters(address: string, nodeId: string, ISSUE: number): Promise<void> {
  const tx = {
    type: 'apply_parameters',
    nodeId,
    from: address,
    to: networkAccount,
    issue: crypto.hash(`issue-${ISSUE}`),
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_APPLY: ', nodeId)
}

// APPLY_DEV_PARAMETERS TRANSACTION FUNCTION
export async function applyDevParameters(address: string, nodeId: string, DEV_ISSUE: number): Promise<void> {
  const tx = {
    type: 'apply_dev_parameters',
    nodeId: nodeId,
    from: address,
    to: networkAccount,
    devIssue: crypto.hash(`dev-issue-${DEV_ISSUE}`),
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_DEV_APPLY: ', nodeId)
}

// RELEASE DEVELOPER FUNDS FOR A PAYMENT
export function releaseDeveloperFunds(payment: DeveloperPayment, address: string, nodeId: string): void {
  const tx = {
    type: 'developer_payment',
    nodeId: nodeId,
    from: address,
    to: networkAccount,
    developer: payment.address,
    payment: payment,
    timestamp: Date.now(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_DEV_FUND_RELEASE: ', nodeId)
}
