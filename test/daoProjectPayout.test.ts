import { ethers } from 'ethers'
import { DaoMilestone, DaoProjectData } from '../src/@types'
import { classifyDelivery, milestonePayoutWei, usdToWeiAtRate } from '../src/utils/daoProjectPayout'

const DAY = 86_400_000

function milestone(over: Partial<DaoMilestone> = {}): DaoMilestone {
  return { duration: 10 * DAY, costUsdStr: '1000', bonusUsdStr: '100', penaltyUsdStr: '200', startTime: 0, endTime: 10 * DAY, ...over } as DaoMilestone
}

// The payout reads its rate and both percentages from the project, so rate variation is expressed
// by varying rateUsdStr — the same way the handlers do it.
function project(over: Partial<DaoProjectData> = {}): DaoProjectData {
  return { rateUsdStr: '1', durationBonusPercentage: 20, durationPenaltyPercentage: 20, ...over } as DaoProjectData
}

describe('classifyDelivery', () => {
  test('classifies against the ±percentage bands', () => {
    expect(classifyDelivery(7 * DAY, 10 * DAY, 20, 20)).toBe('early')
    expect(classifyDelivery(10 * DAY, 10 * DAY, 20, 20)).toBe('ontime')
    expect(classifyDelivery(13 * DAY, 10 * DAY, 20, 20)).toBe('late')
  })

  test('the boundaries themselves are on time', () => {
    // Strict comparisons, so landing exactly on a threshold earns neither bonus nor penalty.
    expect(classifyDelivery(8 * DAY, 10 * DAY, 20, 20)).toBe('ontime')
    expect(classifyDelivery(12 * DAY, 10 * DAY, 20, 20)).toBe('ontime')
    // One millisecond past each is not.
    expect(classifyDelivery(8 * DAY - 1, 10 * DAY, 20, 20)).toBe('early')
    expect(classifyDelivery(12 * DAY + 1, 10 * DAY, 20, 20)).toBe('late')
  })

  test('an instant delivery is early and an enormous overrun is late', () => {
    expect(classifyDelivery(0, 10 * DAY, 20, 20)).toBe('early')
    expect(classifyDelivery(1000 * DAY, 10 * DAY, 20, 20)).toBe('late')
  })
})

describe('milestonePayoutWei', () => {
  test('early pays cost plus bonus', () => {
    const result = milestonePayoutWei(milestone({ endTime: 5 * DAY }), project())
    expect(result.speed).toBe('early')
    expect(result.amountWei).toBe(ethers.parseEther('1100'))
  })

  test('on time pays the plain cost', () => {
    const result = milestonePayoutWei(milestone(), project())
    expect(result.speed).toBe('ontime')
    expect(result.amountWei).toBe(ethers.parseEther('1000'))
  })

  test('late pays cost minus penalty, with no bonus', () => {
    const result = milestonePayoutWei(milestone({ endTime: 20 * DAY }), project())
    expect(result.speed).toBe('late')
    expect(result.amountWei).toBe(ethers.parseEther('800'))
  })

  test('a penalty larger than the cost floors at zero rather than inverting', () => {
    // Without the floor the subtraction would go negative and read as a credit to the contractor.
    const result = milestonePayoutWei(milestone({ endTime: 20 * DAY, penaltyUsdStr: '5000' }), project())
    expect(result.amountWei).toBe(0n)
  })

  test('a penalty exactly equal to the cost also pays zero', () => {
    const result = milestonePayoutWei(milestone({ endTime: 20 * DAY, penaltyUsdStr: '1000' }), project())
    expect(result.amountWei).toBe(0n)
  })

  test('percentages are per-project, so the same timing can pay differently', () => {
    // 12 days against a 10-day plan: on time at ±20%, late at ±10%.
    const m = milestone({ endTime: 12 * DAY })
    expect(milestonePayoutWei(m, project()).speed).toBe('ontime')
    expect(milestonePayoutWei(m, project({ durationBonusPercentage: 10, durationPenaltyPercentage: 10 })).speed).toBe('late')
  })
})

describe('usdToWeiAtRate', () => {
  test('converts at the supplied rate, not a live one', () => {
    expect(usdToWeiAtRate('100', '1')).toBe(ethers.parseEther('100'))
    // A LIB worth $0.50 means twice as much LIB for the same USD.
    expect(usdToWeiAtRate('100', '0.5')).toBe(ethers.parseEther('200'))
  })

  test('rejects a zero rate instead of dividing by it', () => {
    expect(() => usdToWeiAtRate('100', '0')).toThrow('rate is zero')
  })
})

describe('the payout always uses the project rate', () => {
  test('the same milestone pays differently under a different stored rate', () => {
    // The regression this guards: computing a payout at the live rate instead of the one snapshotted
    // at mint. That shipped once. Taking the project rather than a converter makes it unexpressible,
    // and this pins the rate as the thing that moves the number.
    const m = milestone()
    expect(milestonePayoutWei(m, project({ rateUsdStr: '1' })).amountWei).toBe(ethers.parseEther('1000'))
    expect(milestonePayoutWei(m, project({ rateUsdStr: '0.5' })).amountWei).toBe(ethers.parseEther('2000'))
  })
})

describe('a milestone that cannot state its duration pays nothing', () => {
  // Fail closed. Defaulting a missing timestamp to zero made the duration hugely negative, which
  // classifies as `early` — so the least trustworthy data earned the most generous payout.
  test('a missing start or end time throws rather than defaulting', () => {
    expect(() => milestonePayoutWei(milestone({ startTime: undefined }), project())).toThrow('missing a start or end time')
    expect(() => milestonePayoutWei(milestone({ endTime: undefined }), project())).toThrow('missing a start or end time')
  })

  test('an end time before the start time throws', () => {
    // Not implied by both being present: the two are proposed and endorsed separately, and nothing
    // else compares them.
    expect(() => milestonePayoutWei(milestone({ startTime: 5 * DAY, endTime: DAY }), project())).toThrow('is before its start time')
  })

  test('equal times are a legitimate zero-length milestone, not an error', () => {
    const result = milestonePayoutWei(milestone({ startTime: DAY, endTime: DAY }), project())
    expect(result.speed).toBe('early')
    expect(result.amountWei).toBe(ethers.parseEther('1100'))
  })

  test('what the old default would have paid', () => {
    // A missing start time used to read as duration = endTime - 0, and a missing end time as
    // -startTime. Both landed in the early band. This pins that the throw replaces a payout.
    expect(() => milestonePayoutWei(milestone({ endTime: undefined }), project())).toThrow()
  })
})
