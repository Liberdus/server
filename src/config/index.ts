import * as crypto from 'shardus-crypto-utils'
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

export const networkAccount = '0'.repeat(64)

// HELPFUL TIME CONSTANTS IN MILLISECONDS
export const ONE_SECOND = 1000
export const ONE_MINUTE = 60 * ONE_SECOND
export const ONE_HOUR = 60 * ONE_MINUTE
export const ONE_DAY = 24 * ONE_HOUR
// export const ONE_WEEK = 7 * ONE_DAY
// export const ONE_YEAR = 365 * ONE_DAY

/*
export const TIME_FOR_PROPOSALS = ONE_MINUTE + ONE_SECOND * 30 // ONE_DAY
export const TIME_FOR_VOTING = ONE_MINUTE + ONE_SECOND * 30 // ONE_DAY * 3
export const TIME_FOR_GRACE = ONE_MINUTE + ONE_SECOND * 30 // ONE_DAY
export const TIME_FOR_APPLY = ONE_MINUTE + ONE_SECOND * 30 // ONE_DAY * 2

export const TIME_FOR_DEV_PROPOSALS = ONE_MINUTE + ONE_SECOND * 30 // ONE_DAY
export const TIME_FOR_DEV_VOTING = ONE_MINUTE + ONE_SECOND * 30 // ONE_DAY * 3
export const TIME_FOR_DEV_GRACE = ONE_MINUTE + ONE_SECOND * 30 // ONE_DAY
export const TIME_FOR_DEV_APPLY = ONE_MINUTE + ONE_SECOND * 30 // ONE_DAY * 2
*/

export const TIME_FOR_PROPOSALS = ONE_DAY + ONE_SECOND * 30 // ONE_DAY
export const TIME_FOR_VOTING = 3 * ONE_DAY + ONE_SECOND * 30 // ONE_DAY * 3
export const TIME_FOR_GRACE = ONE_DAY + ONE_SECOND * 30 // ONE_DAY
export const TIME_FOR_APPLY = 2 * ONE_DAY + ONE_SECOND * 30 // ONE_DAY * 2

export const TIME_FOR_DEV_PROPOSALS = ONE_DAY + ONE_SECOND * 30 // ONE_DAY
export const TIME_FOR_DEV_VOTING = 3 * ONE_DAY + ONE_SECOND * 30 // ONE_DAY * 3
export const TIME_FOR_DEV_GRACE = ONE_DAY + ONE_SECOND * 30 // ONE_DAY
export const TIME_FOR_DEV_APPLY = 2 * ONE_DAY + ONE_SECOND * 30 // ONE_DAY * 2

// MIGHT BE USEFUL TO HAVE TIME CONSTANTS IN THE FORM OF CYCLES
export const cycleDuration = 30

// INITIAL NETWORK PARAMETERS FOR LIBERDUS
export const INITIAL_PARAMETERS: NetworkParameters = {
  title: 'Initial parameters',
  description: 'These are the initial network parameters liberdus started with',
  nodeRewardInterval: ONE_HOUR, //ONE_HOUR,
  nodeRewardAmount: 1,
  nodePenalty: 10,
  transactionFee: 0.001,
  stakeRequired: 5,
  maintenanceInterval: ONE_DAY,
  maintenanceFee: 0,
  proposalFee: 50,
  devProposalFee: 50,
  faucetAmount: 10,
  defaultToll: 1,
}