import { applyEndorsement, PROJECT_ENDORSEMENT_THRESHOLD, requiredEndorsements } from '../src/utils/daoProjectEndorsement'

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

  test('re-proposing clears the list and re-seeds it with the new proposer', () => {
    // A new value is a different question — endorsements of the old one must not carry over.
    const e: string[] = []
    applyEndorsement(e, C1, true, COMMITTEE, undefined, false)
    applyEndorsement(e, C2, false, COMMITTEE, undefined, true)
    expect(e).toEqual([C1, C2])

    const result = applyEndorsement(e, C3, true, COMMITTEE, undefined, true)
    expect(e).toEqual([C3])
    expect(result.committed).toBe(false)
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
