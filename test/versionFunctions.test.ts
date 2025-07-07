import { isEqualOrNewerVersion, isEqualOrOlderVersion } from '../src/utils'

describe('version comparison helpers', () => {
  test('isEqualOrNewerVersion correctly compares versions with different lengths', () => {
    expect(isEqualOrNewerVersion('1.2.3', '1.2.3')).toBe(true)
    expect(isEqualOrNewerVersion('1.2.3', '1.2.4')).toBe(true)
    expect(isEqualOrNewerVersion('1.2.3', '1.3')).toBe(true)
    expect(isEqualOrNewerVersion('1.2.3', '1.2')).toBe(false)
  })

  test('isEqualOrOlderVersion correctly compares versions', () => {
    expect(isEqualOrOlderVersion('1.2.3', '1.2.3')).toBe(true)
    expect(isEqualOrOlderVersion('1.2.3', '1.2.2')).toBe(true)
    expect(isEqualOrOlderVersion('1.2.3', '1.1')).toBe(true)
    expect(isEqualOrOlderVersion('1.2.3', '1.2.4')).toBe(false)
  })
})
