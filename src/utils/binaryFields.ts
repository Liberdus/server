import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'

export const writeSafeNumber = (stream: VectorBufferStream, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Account time must be a non-negative safe integer')
  stream.writeBigUInt64(BigInt(value))
}

export const readSafeNumber = (stream: VectorBufferStream): number => {
  const value = stream.readBigUInt64()
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Account time exceeds JavaScript safe integer range')
  return Number(value)
}

export const writeBigIntDecimal = (stream: VectorBufferStream, value: bigint): void => {
  stream.writeString(value.toString())
}

export const readBigIntDecimal = (stream: VectorBufferStream): bigint => BigInt(stream.readString())

export const writeJson = (stream: VectorBufferStream, value: unknown): void => {
  stream.writeString(Utils.safeStringify(value))
}

export const readJson = <T>(stream: VectorBufferStream): T => Utils.safeJsonParse(stream.readString()) as T

export const writeNullableString = (stream: VectorBufferStream, value: string | null): void => {
  stream.writeUInt8(value === null ? 0 : 1)
  if (value !== null) stream.writeString(value)
}

export const readNullableString = (stream: VectorBufferStream): string | null => (stream.readUInt8() === 0 ? null : stream.readString())
