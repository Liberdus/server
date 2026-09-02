import { DaoProjectData, DaoProjectLogEntry, DaoProjectTxType } from '../@types'

/**
 * Appends to the project's audit trail. Every project transaction records who called, when, and
 * what it did — the policy keeps this "in case of any dispute between the contractor and DAO".
 *
 * `params` is a structured object rather than a formatted string so a reader can query the trail
 * without parsing it, and so the shape of an entry is checked at the call site. It carries what
 * identifies the action, not what resulted from it — see DaoProjectLogEntry.
 *
 * Deliberately uncapped for now. The log grows with committee behaviour rather than with the
 * milestone count: every attempt to propose or endorse appends. Bounding the milestones does not
 * bound this. Acceptable because every appender is a committee member or the contractor, so growth
 * needs insiders being persistent or adversarial.
 * TODO: cap with oldest-first eviction if project accounts get large.
 */
export function appendProjectLog(
  project: DaoProjectData,
  caller: string,
  timestamp: number,
  txType: DaoProjectTxType,
  params: Record<string, string | number | boolean> = {},
): void {
  if (!Array.isArray(project.logs)) project.logs = []
  const entry: DaoProjectLogEntry = { caller, timestamp, txType, params }
  project.logs.push(entry)
}
