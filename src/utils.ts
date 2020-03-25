import { TIME } from './parameters'
import stringify = require('fast-stable-stringify')
import { dapp, networkAccount } from './'

// HELPER METHOD TO WAIT
export async function _sleep(ms = 0): Promise<NodeJS.Timeout> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function maintenanceAmount(timestamp: number, account: UserAccount, CURRENT: NetworkParameters): number {
  let amount: number
  if (timestamp - account.lastMaintenance < CURRENT.maintenanceInterval) {
    amount = 0
  } else {
    amount = account.data.balance * (CURRENT.maintenanceFee * Math.floor((timestamp - account.lastMaintenance) / CURRENT.maintenanceInterval))
    account.lastMaintenance = timestamp
  }
  if (typeof amount === 'number') return amount
  else return 0
}

// INITIAL PARAMETERS THE NODES SET WHEN THEY BECOME ACTIVE
export async function syncParameters(timestamp: number): Promise<EconParameters> {
  let CURRENT: NetworkParameters, NEXT: NetworkParameters, WINDOWS: Windows, NEXT_WINDOWS: Windows | {}, ISSUE: number, IN_SYNC: boolean

  const account: WrappedAccount = await dapp.getLocalOrRemoteAccount(networkAccount)
  // IF THE NETWORK ACCOUNT HAS BEEN INITIALIZED
  if (account && account.data) {
    const network: NetworkAccount = account.data as NetworkAccount
    console.log(`NETWORK ACCOUNT: ${stringify(account.data)}`)
    dapp.log(`NETWORK ACCOUNT: ${stringify(account.data)}`)
    CURRENT = network.current
    NEXT = network.next as NetworkParameters
    WINDOWS = network.windows
    ISSUE = network.issue
    IN_SYNC = true
    CURRENT = network.current
    return { CURRENT, NEXT, WINDOWS, NEXT_WINDOWS, ISSUE, IN_SYNC }
  } else {
    const proposalWindow = [timestamp, timestamp + TIME.DEV_PROPOSALS]
    const votingWindow = [proposalWindow[1], proposalWindow[1] + TIME.DEV_VOTING]
    const graceWindow = [votingWindow[1], votingWindow[1] + TIME.DEV_GRACE]
    const applyWindow = [graceWindow[1], graceWindow[1] + TIME.DEV_APPLY]

    WINDOWS = {
      proposalWindow,
      votingWindow,
      graceWindow,
      applyWindow,
    }

    IN_SYNC = false

    return { CURRENT, NEXT, WINDOWS, NEXT_WINDOWS, ISSUE, IN_SYNC }
  }
}

export async function syncDevParameters(timestamp: number): Promise<DevParameters> {
  let DEV_WINDOWS: DevWindows,
    NEXT_DEV_WINDOWS: DevWindows | {},
    DEV_ISSUE: number,
    DEVELOPER_FUND: DeveloperPayment[],
    NEXT_DEVELOPER_FUND: DeveloperPayment[],
    IN_SYNC: boolean

  const account: WrappedAccount = await dapp.getLocalOrRemoteAccount(networkAccount)
  // IF THE NETWORK ACCOUNT HAS BEEN INITIALIZED
  if (account && account.data) {
    const network: NetworkAccount = account.data as NetworkAccount
    console.log(`NETWORK ACCOUNT: ${stringify(account.data)}`)
    dapp.log(`NETWORK ACCOUNT: ${stringify(account.data)}`)
    DEV_WINDOWS = network.devWindows
    NEXT_DEV_WINDOWS = network.nextDevWindows
    DEVELOPER_FUND = network.developerFund
    NEXT_DEVELOPER_FUND = network.nextDeveloperFund
    DEV_ISSUE = network.devIssue
    IN_SYNC = true
    return { DEV_WINDOWS, NEXT_DEV_WINDOWS, DEVELOPER_FUND, NEXT_DEVELOPER_FUND, DEV_ISSUE, IN_SYNC }
  } else {
    const devProposalWindow = [timestamp, timestamp + TIME.DEV_PROPOSALS]
    const devVotingWindow = [devProposalWindow[1], devProposalWindow[1] + TIME.DEV_VOTING]
    const devGraceWindow = [devVotingWindow[1], devVotingWindow[1] + TIME.DEV_GRACE]
    const devApplyWindow = [devGraceWindow[1], devGraceWindow[1] + TIME.DEV_APPLY]

    DEV_WINDOWS = {
      devProposalWindow,
      devVotingWindow,
      devGraceWindow,
      devApplyWindow,
    }

    NEXT_DEV_WINDOWS = {}
    DEVELOPER_FUND = []
    NEXT_DEVELOPER_FUND = []
    DEV_ISSUE = 1
    IN_SYNC = false

    return { DEV_WINDOWS, NEXT_DEV_WINDOWS, DEVELOPER_FUND, NEXT_DEVELOPER_FUND, DEV_ISSUE, IN_SYNC }
  }
}
