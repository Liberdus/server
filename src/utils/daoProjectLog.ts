import { DaoProjectData, DaoProjectLogEntry, DaoProjectTxType } from '../@types'

/**
 * Appends to the project's audit trail — who called, when, and what they did. The policy keeps this
 * "in case of any dispute between the contractor and DAO".
 *
 * `params` is structured rather than a formatted string so the trail can be queried without parsing
 * it. It carries what identifies the action, not what resulted from it — see DaoProjectLogEntry.
 *
 * Uncapped by decision. Growth follows committee behaviour, not the milestone count — every propose
 * or endorse appends — so bounding milestones does not bound this. Acceptable because only the
 * committee and contractor can append.
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
