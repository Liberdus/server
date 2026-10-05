/**
 * LIB/wei conversions that depend on nothing.
 *
 * Kept out of the utils barrel so `config` can import it without pulling the barrel in. The barrel
 * imports `config`, and `config` calls `libToWei` while evaluating INITIAL_PARAMETERS — so when the
 * barrel loaded first, `config` saw a half-initialised module and `libToWei` was undefined. Any
 * entry point that reached `utils` before `config` failed on that, which took out three test suites.
 *
 * Add only dependency-free helpers here. Anything reading LiberdusFlags belongs in the barrel —
 * `weiToLib` does, which is why it is not here.
 */
export function libToWei(lib: number): bigint {
  return BigInt(lib * 10 ** 18)
}
