import { DaoProjectData, DaoProjectLogEntry } from '../@types'

/**
 * Appends to the project's audit trail. Every project transaction records who called, when, and
 * what it did — the policy keeps this "in case of any dispute between the contractor and DAO".
 *
 * Deliberately uncapped for now. The log grows with committee behaviour rather than with the
 * milestone count: re-proposing a start time, end time or address is unlimited, and each attempt
 * appends. Bounding the milestones does not bound this. Acceptable because every appender is a
 * committee member or the contractor, so growth needs insiders being persistent or adversarial.
 * TODO: cap with oldest-first eviction if project accounts get large.
 */
export function appendProjectLog(project: DaoProjectData, caller: string, timestamp: number, txType: string, params?: string): void {
  if (!Array.isArray(project.logs)) project.logs = []
  const entry: DaoProjectLogEntry = { caller, timestamp, txType }
  if (params !== undefined) entry.params = params
  project.logs.push(entry)
}
