import type { Shardus } from '@shardus/core'

export type Migration = (dapp: Shardus) => Promise<void>
