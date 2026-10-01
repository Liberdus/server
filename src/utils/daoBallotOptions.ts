export const AFFIRMATIVE_OPTION_STRINGS = ['yes', 'accept', 'approve']
export const NEGATIVE_OPTION_STRINGS = ['no', 'reject', 'deny']

export function normalizeOption(option: string): string {
  return option.trim().toLowerCase()
}

export function isAffirmativeOption(option: string): boolean {
  return AFFIRMATIVE_OPTION_STRINGS.includes(normalizeOption(option))
}

export function isNegativeOption(option: string): boolean {
  return NEGATIVE_OPTION_STRINGS.includes(normalizeOption(option))
}

/**
 * `proposalType` is optional because only projects constrain the count: a project has one flat
 * milestone array with no per-option variant, so a third option would have nothing to select.
 */
export function validateDaoOptions(options: string[], proposalType?: string): string | undefined {
  if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
    return 'tx "options" must be an array with 2 to 10 entries'
  }
  for (const opt of options) {
    if (typeof opt !== 'string' || opt.trim().length === 0) {
      return 'each entry in tx "options" must be a non-empty string'
    }
  }
  if (!isNegativeOption(options[0])) {
    return `tx "options[0]" must be a recognized rejection choice (one of: ${NEGATIVE_OPTION_STRINGS.join(', ')})`
  }
  if (proposalType === 'project' && options.length !== 2) {
    return `tx "options" for a project proposal must have exactly 2 entries (got ${options.length})`
  }
  return undefined
}

export function isWinningOptionAccepted(options: string[], winnerIndex: number): boolean {
  if (!Array.isArray(options) || winnerIndex < 0 || winnerIndex >= options.length) {
    return false
  }
  if (isNegativeOption(options[0])) {
    return winnerIndex > 0
  }
  if (isAffirmativeOption(options[0])) {
    return winnerIndex === 0
  }
  return false
}
