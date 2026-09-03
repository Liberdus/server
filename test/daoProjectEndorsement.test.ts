import {
  applyEndorsement,
  planAddressEndorsement,
  planMilestoneTimeEndorsement,
  PROJECT_ENDORSEMENT_THRESHOLD,
  requiredEndorsements,
  writeOnceError,
} from '../src/utils/daoProjectEndorsement'

const C1 = 'c1'
const C2 = 'c2'
const C3 = 'c3'
const C4 = 'c4'
const COMMITTEE = [C1, C2, C3, C4]
const CONTRACTOR = 'contractor'

describe('requiredEndorsements', () => {
  test('is the flat threshold on a normally-sized committee', () => {
    expect(requiredEndorsements(4, true)).toBe(PROJECT_ENDORSEMENT_THRESHOLD)
    expect(requiredEndorsements(4, false)).toBe(PROJECT_ENDORSEMENT_THRESHOLD)
    expect(requiredEndorsements(10, true)).toBe(PROJECT_ENDORSEMENT_THRESHOLD)
  })

  test('clamps to what is reachable, and the reachable max differs by path', () => {
    // Committee-only: at most committeeSize can ever endorse.
    expect(requiredEndorsements(2, false)).toBe(2)
    // Contractor path: the contractor occupies index 0, so committeeSize + 1 is reachable — which
    // is why clamping both paths to committeeSize would commit a milestone one endorsement early.
    expect(requiredEndorsements(2, true)).toBe(3)
  })

  test('never drops below one, even with an empty committee', () => {
    expect(requiredEndorsements(0, false)).toBe(1)
  })
})

describe('applyEndorsement', () => {
  test('a committee proposer counts as the first endorsement', () => {
    const endorsements: string[] = []
    const result = applyEndorsement(endorsements, C1, true, COMMITTEE, undefined, false)
    expect(result.error).toBeUndefined()
    expect(endorsements).toEqual([C1])
    expect(result.committed).toBe(false)
  })

  test('commits on the third distinct committee member', () => {
    const e: string[] = []
    applyEndorsement(e, C1, true, COMMITTEE, undefined, false)
    expect(applyEndorsement(e, C2, false, COMMITTEE, undefined, true).committed).toBe(false)
    expect(applyEndorsement(e, C3, false, COMMITTEE, undefined, true).committed).toBe(true)
    expect(e).toEqual([C1, C2, C3])
  })

  test('the contractor may propose, and then two committee members complete it', () => {
    // Three total, of which two are committee — exactly the policy's "endorsed by two committee
    // members" for a contractor-proposed time.
    const e: string[] = []
    applyEndorsement(e, CONTRACTOR, true, COMMITTEE, CONTRACTOR, false)
    expect(e).toEqual([CONTRACTOR])
    expect(applyEndorsement(e, C1, false, COMMITTEE, CONTRACTOR, true).committed).toBe(false)
    expect(applyEndorsement(e, C2, false, COMMITTEE, CONTRACTOR, true).committed).toBe(true)
  })

  test('the contractor cannot endorse, only propose', () => {
    // Otherwise they could hold two of the three slots.
    const e: string[] = []
    applyEndorsement(e, C1, true, COMMITTEE, CONTRACTOR, false)
    const result = applyEndorsement(e, CONTRACTOR, false, COMMITTEE, CONTRACTOR, true)
    expect(result.error).toMatch('may propose a value but not endorse')
    expect(e).toEqual([C1])
  })

  test('a stranger can neither propose nor endorse', () => {
    const e: string[] = []
    expect(applyEndorsement(e, 'nobody', true, COMMITTEE, CONTRACTOR, false).error).toMatch('committee member or the contractor')
    expect(applyEndorsement(e, 'nobody', false, COMMITTEE, CONTRACTOR, false).error).toMatch('committee member or the contractor')
    expect(e).toEqual([])
  })

  test('a second proposal replaces the pending value and re-seeds the endorsements', () => {
    // applyEndorsement itself allows this — whether a path may re-propose at all is writeOnceError's
    // decision, applied by the caller. This is the contractor address path's behaviour, per policy.
    const e: string[] = []
    applyEndorsement(e, C1, true, COMMITTEE, undefined, false)
    applyEndorsement(e, C2, false, COMMITTEE, undefined, true)
    expect(e).toEqual([C1, C2])

    applyEndorsement(e, C3, true, COMMITTEE, undefined, true)
    expect(e).toEqual([C3])
  })

  test('the same address cannot endorse twice', () => {
    const e: string[] = []
    applyEndorsement(e, C1, true, COMMITTEE, undefined, false)
    applyEndorsement(e, C2, false, COMMITTEE, undefined, true)
    const result = applyEndorsement(e, C2, false, COMMITTEE, undefined, true)
    expect(result.error).toMatch('already endorsed')
    expect(e).toEqual([C1, C2])
  })

  test('the proposer cannot pad the count by endorsing their own proposal', () => {
    const e: string[] = []
    applyEndorsement(e, C1, true, COMMITTEE, undefined, false)
    expect(applyEndorsement(e, C1, false, COMMITTEE, undefined, true).error).toMatch('already endorsed')
    expect(e).toEqual([C1])
  })

  test('endorsing nothing is rejected', () => {
    const e: string[] = []
    expect(applyEndorsement(e, C1, false, COMMITTEE, undefined, false).error).toMatch('no proposed value')
    expect(e).toEqual([])
  })

  test('commits early on a committee too small to reach the threshold', () => {
    // Degrade rather than deadlock: with two members and no contractor path, two is everything.
    const small = [C1, C2]
    const e: string[] = []
    applyEndorsement(e, C1, true, small, undefined, false)
    expect(applyEndorsement(e, C2, false, small, undefined, true).committed).toBe(true)
  })

  test('a committee member on the contractor path still needs three', () => {
    const small = [C1, C2]
    const e: string[] = []
    applyEndorsement(e, C1, true, small, CONTRACTOR, false)
    // committeeSize + 1 = 3 is reachable here, so it must not commit at two.
    expect(applyEndorsement(e, C2, false, small, CONTRACTOR, true).committed).toBe(false)
  })

  test('C4 exists so the committee is larger than the threshold', () => {
    expect(COMMITTEE).toContain(C4)
    expect(COMMITTEE.length).toBeGreaterThan(PROJECT_ENDORSEMENT_THRESHOLD)
  })
})

describe('writeOnceError', () => {
  // The milestone paths apply this; the contractor address path deliberately does not.
  test('allows the first proposal', () => {
    expect(writeOnceError(false, true)).toBeUndefined()
  })

  test('rejects a second proposal', () => {
    expect(writeOnceError(true, true)).toMatch('already been proposed')
  })

  test('applies to the contractor too, which is what the policy requires', () => {
    // "The contractor can only call this once". applyEndorsement's contractor check only blocks
    // endorsing, so without this they could re-propose each time the committee neared three,
    // resetting the count and stalling their own milestone indefinitely. The rule is sender-blind,
    // so it covers them by construction rather than by a separate case.
    const e: string[] = []
    applyEndorsement(e, CONTRACTOR, true, COMMITTEE, CONTRACTOR, false)
    applyEndorsement(e, C1, false, COMMITTEE, CONTRACTOR, true)
    expect(e).toEqual([CONTRACTOR, C1])
    expect(writeOnceError(true, true)).toMatch('already been proposed')
  })

  test('never blocks an endorsement', () => {
    // Endorsing a pending value is the whole point of the rule, so it must pass either way.
    expect(writeOnceError(true, false)).toBeUndefined()
    expect(writeOnceError(false, false)).toBeUndefined()
  })
})

describe('planMilestoneTimeEndorsement', () => {
  // These target the function the handlers actually call. The applyEndorsement tests above cannot
  // stand in for them: they take hasPendingValue as a parameter, so they passed throughout the bug
  // where a caller computed it after mutating, and would pass again if it returned.
  const milestone = (over: { proposedTime?: number; endorsedTime?: string[] } = {}) => ({
    proposedTime: over.proposedTime,
    endorsedTime: over.endorsedTime ?? [],
  })

  test('a first proposed time seeds endorsement #1 and is not a write-once violation', () => {
    // The exact regression. Reading the pending value after writing proposedTime made every opening
    // proposal look like a re-proposal, so endorsedTime was never seeded and no milestone committed.
    const plan = planMilestoneTimeEndorsement({ from: CONTRACTOR, proposedTime: 500 }, COMMITTEE, CONTRACTOR, milestone())
    expect(plan.error).toBeUndefined()
    expect(plan.isProposing).toBe(true)
    expect(plan.nextProposedTime).toBe(500)
    expect(plan.nextEndorsements).toEqual([CONTRACTOR])
  })

  test('a second proposed time is rejected and changes nothing', () => {
    const plan = planMilestoneTimeEndorsement({ from: C1, proposedTime: 900 }, COMMITTEE, CONTRACTOR, milestone({ proposedTime: 500, endorsedTime: [CONTRACTOR] }))
    expect(plan.error).toMatch('already been proposed')
    expect(plan.nextEndorsements).toEqual([CONTRACTOR])
  })

  test('a submission without a time endorses the pending one and keeps it', () => {
    const plan = planMilestoneTimeEndorsement({ from: C1 }, COMMITTEE, CONTRACTOR, milestone({ proposedTime: 500, endorsedTime: [CONTRACTOR] }))
    expect(plan.error).toBeUndefined()
    expect(plan.isProposing).toBe(false)
    expect(plan.nextProposedTime).toBe(500)
    expect(plan.nextEndorsements).toEqual([CONTRACTOR, C1])
  })

  test('the third endorsement commits', () => {
    const plan = planMilestoneTimeEndorsement({ from: C2 }, COMMITTEE, CONTRACTOR, milestone({ proposedTime: 500, endorsedTime: [CONTRACTOR, C1] }))
    expect(plan.committed).toBe(true)
  })

  test('the contractor may open a proposal but not endorse one', () => {
    const plan = planMilestoneTimeEndorsement({ from: CONTRACTOR }, COMMITTEE, CONTRACTOR, milestone({ proposedTime: 500, endorsedTime: [C1] }))
    expect(plan.error).toMatch('may propose a value but not endorse')
  })

  test('the same address cannot endorse twice', () => {
    const plan = planMilestoneTimeEndorsement({ from: C1 }, COMMITTEE, CONTRACTOR, milestone({ proposedTime: 500, endorsedTime: [C1] }))
    expect(plan.error).toMatch('already endorsed')
  })

  test('nextEndorsements is a fresh array, so applying it cannot alias live state', () => {
    const m = milestone({ proposedTime: 500, endorsedTime: [CONTRACTOR] })
    const plan = planMilestoneTimeEndorsement({ from: C1 }, COMMITTEE, CONTRACTOR, m)
    expect(plan.nextEndorsements).not.toBe(m.endorsedTime)
    expect(m.endorsedTime).toEqual([CONTRACTOR])
  })

  test('deciding never mutates what it was given', () => {
    // The property the whole shape exists for: validate() can call this freely.
    const m = milestone({ proposedTime: 500, endorsedTime: [CONTRACTOR] })
    planMilestoneTimeEndorsement({ from: C1, proposedTime: 900 }, COMMITTEE, CONTRACTOR, m)
    expect(m).toEqual({ proposedTime: 500, endorsedTime: [CONTRACTOR] })
  })
})

describe('planAddressEndorsement', () => {
  const project = (over: { proposedAddress?: string; endorsedAddress?: string[] } = {}) => ({
    proposedAddress: over.proposedAddress,
    endorsedAddress: over.endorsedAddress ?? [],
  })
  const ADDRESS_A = 'address-a'
  const ADDRESS_B = 'address-b'

  test('a second proposal is accepted and reseeds, unlike the milestone path', () => {
    // Policy line 353. This is the difference the two helpers exist to make visible.
    const plan = planAddressEndorsement({ from: C2, proposedAddress: ADDRESS_B }, COMMITTEE, project({ proposedAddress: ADDRESS_A, endorsedAddress: [C1] }))
    expect(plan.error).toBeUndefined()
    expect(plan.nextProposedAddress).toBe(ADDRESS_B)
    expect(plan.nextEndorsements).toEqual([C2])
  })

  test('a blank submission endorses the pending address', () => {
    const plan = planAddressEndorsement({ from: C2 }, COMMITTEE, project({ proposedAddress: ADDRESS_A, endorsedAddress: [C1] }))
    expect(plan.nextProposedAddress).toBe(ADDRESS_A)
    expect(plan.nextEndorsements).toEqual([C1, C2])
  })

  test('three distinct committee members commit the change', () => {
    const plan = planAddressEndorsement({ from: C3 }, COMMITTEE, project({ proposedAddress: ADDRESS_A, endorsedAddress: [C1, C2] }))
    expect(plan.committed).toBe(true)
  })

  test('the contractor has no say — only the committee may submit', () => {
    const plan = planAddressEndorsement({ from: CONTRACTOR, proposedAddress: ADDRESS_A }, COMMITTEE, project())
    expect(plan.error).toMatch('committee member or the contractor')
  })

  test('deciding never mutates what it was given', () => {
    const p = project({ proposedAddress: ADDRESS_A, endorsedAddress: [C1] })
    planAddressEndorsement({ from: C2, proposedAddress: ADDRESS_B }, COMMITTEE, p)
    expect(p).toEqual({ proposedAddress: ADDRESS_A, endorsedAddress: [C1] })
  })
})
