export class SafeBigIntMath {
  // Maximum safe value (2^256 - 1 for compatibility with uint256)
  static MAX_SAFE_VALUE = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
  static MIN_SAFE_VALUE = BigInt(0)

  /**
   * Safely subtract with underflow protection
   * @param {bigint} value - Current value
   * @param {bigint} amount - Amount to subtract
   * @returns {bigint} New value
   * @throws {Error} If operation would cause underflow
   */
  static subtract(value: bigint, amount: bigint): bigint {
    if (typeof value !== 'bigint' || typeof amount !== 'bigint') {
      throw new Error('Value and amount must be bigint')
    }

    if (amount < 0n) {
      throw new Error('Amount cannot be negative')
    }

    if (value < amount) {
      throw new Error(`Underflow: ${value.toString()} < ${amount.toString()}`)
    }

    return value - amount
  }

  /**
   * Safely add with overflow protection
   * @param {bigint} value - Current value
   * @param {bigint} amount - Amount to add
   * @returns {bigint} New value
   * @throws {Error} If operation would cause overflow
   */
  static add(value: bigint, amount: bigint): bigint {
    if (typeof value !== 'bigint' || typeof amount !== 'bigint') {
      throw new Error('Value and amount must be bigint')
    }

    if (amount < 0n) {
      throw new Error('Amount cannot be negative')
    }

    if (value > SafeBigIntMath.MAX_SAFE_VALUE - amount) {
      throw new Error(`Overflow: ${value.toString()} + ${amount.toString()} > ${SafeBigIntMath.MAX_SAFE_VALUE.toString()}`)
    }

    return value + amount
  }

  /**
   * Safely multiply with overflow protection
   * @param {bigint} value - Value to multiply
   * @param {bigint} multiplier - Multiplier
   * @returns {bigint} Product
   * @throws {Error} If operation would cause overflow
   */
  static multiply(value: bigint, multiplier: bigint): bigint {
    if (typeof value !== 'bigint' || typeof multiplier !== 'bigint') {
      throw new Error('Value and multiplier must be bigint')
    }

    if (value < 0n || multiplier < 0n) {
      throw new Error('Value and multiplier must be non-negative')
    }

    if (value === 0n || multiplier === 0n) {
      return 0n
    }

    if (value > SafeBigIntMath.MAX_SAFE_VALUE / multiplier) {
      throw new Error(`Multiplication overflow: ${value.toString()} * ${multiplier.toString()}`)
    }

    return value * multiplier
  }

  /**
   * Safely divide with proper rounding
   * @param {bigint} dividend - Value to divide
   * @param {bigint} divisor - Divisor
   * @param {string} rounding - Rounding mode: 'down', 'up', 'nearest'
   * @returns {bigint} Quotient
   * @throws {Error} If divisor is zero
   */
  static divide(dividend: bigint, divisor: bigint, rounding = 'down'): bigint {
    if (typeof dividend !== 'bigint' || typeof divisor !== 'bigint') {
      throw new Error('Dividend and divisor must be bigint')
    }

    if (divisor === 0n) {
      throw new Error('Division by zero')
    }

    if (dividend < 0n || divisor < 0n) {
      throw new Error('Dividend and divisor must be non-negative')
    }

    const quotient = dividend / divisor
    const remainder = dividend % divisor

    switch (rounding) {
      case 'up':
        return remainder > 0n ? quotient + 1n : quotient
      case 'nearest':
        return remainder >= divisor / 2n ? quotient + 1n : quotient
      case 'down':
      default:
        return quotient
    }
  }
}
