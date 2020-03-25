import './@types'

// HELPFUL TIME CONSTANTS IN MILLISECONDS
export const ONE_SECOND = 1000
export const ONE_MINUTE = 60 * ONE_SECOND
export const ONE_HOUR = 60 * ONE_MINUTE
export const ONE_DAY = 24 * ONE_HOUR
export const ONE_WEEK = 7 * ONE_DAY
export const ONE_YEAR = 365 * ONE_DAY

const PROPOSALS = ONE_MINUTE + ONE_SECOND * 30
const VOTING = ONE_MINUTE + ONE_SECOND * 30
const GRACE = ONE_MINUTE + ONE_SECOND * 30
const APPLY = ONE_MINUTE + ONE_SECOND * 30

const DEV_PROPOSALS = ONE_MINUTE + ONE_SECOND * 30
const DEV_VOTING = ONE_MINUTE + ONE_SECOND * 30
const DEV_GRACE = ONE_MINUTE + ONE_SECOND * 30
const DEV_APPLY = ONE_MINUTE + ONE_SECOND * 30

export const TIME = {
  PROPOSALS,
  VOTING,
  GRACE,
  APPLY,
  DEV_PROPOSALS,
  DEV_VOTING,
  DEV_GRACE,
  DEV_APPLY,
  ONE_SECOND,
  ONE_MINUTE,
  ONE_HOUR,
  ONE_DAY,
  ONE_WEEK,
  ONE_YEAR,
}

// INITIAL NETWORK PARAMETERS FOR LIBERDUS
export const INITIAL_PARAMETERS: NetworkParameters = {
  title: 'Initial parameters',
  description: 'These are the initial network parameters liberdus started with',
  nodeRewardInterval: ONE_MINUTE * 2,
  nodeRewardAmount: 10,
  nodePenalty: 100,
  transactionFee: 0.001,
  stakeRequired: 500,
  maintenanceInterval: ONE_MINUTE * 10,
  maintenanceFee: 0.01,
  proposalFee: 500,
  devProposalFee: 20,
}

// DYNAMIC LOCAL DATA HELD BY THE NODES
let CURRENT: NetworkParameters
let NEXT: NetworkParameters | {}
let WINDOWS: Windows
let NEXT_WINDOWS: Windows | {}
let DEV_WINDOWS: DevWindows
let NEXT_DEV_WINDOWS: DevWindows | {}
let ISSUE: number
let DEV_ISSUE: number
let IN_SYNC: boolean

// VARIABLE FOR HELPING NODES DETERMINE WHEN TO RELEASE DEVELOPER FUNDS
let DEVELOPER_FUND: DeveloperPayment[]
let NEXT_DEVELOPER_FUND: DeveloperPayment[]

export const NODE_PARAMS = {
  CURRENT,
  NEXT,
  WINDOWS,
  NEXT_WINDOWS,
  DEV_WINDOWS,
  NEXT_DEV_WINDOWS,
  ISSUE,
  DEV_ISSUE,
  DEVELOPER_FUND,
  NEXT_DEVELOPER_FUND,
  IN_SYNC,
}
