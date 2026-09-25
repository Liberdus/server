import { Utils } from '@shardus/lib-types'
import { AccountVariant } from '../@types'
import { deserializeAccounts, serializeAccounts } from '.'

/** Shardus AppData serialization with JSON fallback for unsupported binary accounts and other identifiers. */
export function serializeAppData(identifier: string, obj: unknown): Buffer {
  try {
    if (identifier === 'AppData') return serializeAccounts(obj as AccountVariant).getBuffer()
  } catch (error) {
    console.warn('AppData binary serialization failed; using JSON fallback', error)
  }
  return Buffer.from(Utils.safeStringify(obj), 'utf8')
}

export function deserializeAppData(identifier: string, buffer: Buffer): unknown {
  try {
    if (identifier === 'AppData') return deserializeAccounts(buffer)
  } catch (error) {
    console.warn('AppData binary deserialization failed; using JSON fallback', error)
  }
  return Utils.safeJsonParse(buffer.toString('utf8'))
}
