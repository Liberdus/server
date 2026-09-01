import { ethers } from 'ethers'
import { DaoMilestone } from '../src/@types'
import { classifyDelivery, milestonePayoutWei, usdToWeiAtRate } from '../src/utils/daoProjectPayout'

const DAY = 86_400_000
const at1to1 = (usdStr: string): bigint => usdToWeiAtRate(usdStr, '1')

function milestone(over: Partial<DaoMilestone> = {}): DaoMilestone {
  return { duration: 10 * DAY, costUsdStr: '1000', bonusUsdStr: '100', penaltyUsdStr: '200', startTime: 0, endTime: 10 * DAY, ...over } as DaoMilestone
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
    const result = milestonePayoutWei(milestone({ endTime: 5 * DAY }), 20, 20, at1to1)
    expect(result.speed).toBe('early')
    expect(result.amountWei).toBe(ethers.parseEther('1100'))
  })

  test('on time pays the plain cost', () => {
    const result = milestonePayoutWei(milestone(), 20, 20, at1to1)
    expect(result.speed).toBe('ontime')
    expect(result.amountWei).toBe(ethers.parseEther('1000'))
  })

  test('late pays cost minus penalty, with no bonus', () => {
    const result = milestonePayoutWei(milestone({ endTime: 20 * DAY }), 20, 20, at1to1)
    expect(result.speed).toBe('late')
    expect(result.amountWei).toBe(ethers.parseEther('800'))
  })

  test('a penalty larger than the cost floors at zero rather than inverting', () => {
    // Without the floor the subtraction would go negative and read as a credit to the contractor.
    const result = milestonePayoutWei(milestone({ endTime: 20 * DAY, penaltyUsdStr: '5000' }), 20, 20, at1to1)
    expect(result.amountWei).toBe(0n)
  })

  test('a penalty exactly equal to the cost also pays zero', () => {
    const result = milestonePayoutWei(milestone({ endTime: 20 * DAY, penaltyUsdStr: '1000' }), 20, 20, at1to1)
    expect(result.amountWei).toBe(0n)
  })

  test('percentages are per-project, so the same timing can pay differently', () => {
    // 12 days against a 10-day plan: on time at ±20%, late at ±10%.
    const m = milestone({ endTime: 12 * DAY })
    expect(milestonePayoutWei(m, 20, 20, at1to1).speed).toBe('ontime')
    expect(milestonePayoutWei(m, 10, 10, at1to1).speed).toBe('late')
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
