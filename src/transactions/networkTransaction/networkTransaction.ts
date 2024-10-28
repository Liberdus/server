import { Shardus, nestedCountersInstance } from '@shardus/core'
import * as crypto from '@shardus/crypto-utils'
import { Utils, P2P } from '@shardus/types'
import { LiberdusFlags } from '../../config'
import { NodeAccount, SignedNodeInitTxData, SignedNodeRewardTxData } from '../../@types'

export const configShardusNetworkTransactions = (dapp: Shardus): void => {
  dapp.registerBeforeAddVerifier('nodeReward', async (txEntry: P2P.ServiceQueueTypes.AddNetworkTx<SignedNodeRewardTxData>) => {
    const tx = txEntry.txData
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('Validating nodeReward fields', Utils.safeStringify(tx))
    try {
      if (!crypto.verifyObj(tx)) {
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerifier - nodeReward: fail Invalid signature', Utils.safeStringify(tx))
        return false
      }
    } catch (e) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('Invalid signature for internal tx', Utils.safeStringify(tx))
      return false
    }
    if (txEntry.priority !== 0) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerifier - nodeReward: fail Invalid priority', Utils.safeStringify(tx))
      return false
    }
    if (txEntry.subQueueKey == null || txEntry.subQueueKey != tx.publicKey) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerifier - nodeReward: fail Invalid subQueueKey', Utils.safeStringify(tx))
      return false
    }
    if (!tx.publicKey || tx.publicKey === '' || tx.publicKey.length !== 64) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward fail invalid publicKey field', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerBeforeAddVerify nodeReward fail invalid publicKey field`)
      return false
    }
    if (tx.start === undefined) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward fail start field missing', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent(
          'liberdus-staking',
          `registerBeforeAddVerify nodeReward fail start field missing`
        )
      return false
    }
    const latestCycles = dapp.getLatestCycles(5)
    if (tx.start < 0 || !latestCycles.some((cycle) => tx.start <= cycle.counter)) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward fail start value is not correct ', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent(
          'liberdus-staking',
          `registerBeforeAddVerify nodeReward fail start value is not correct `
        )
      return false
    }

    const nodeRemovedCycle = latestCycles.find((cycle) => cycle.removed.includes(tx.nodeId) || cycle.lost.includes(tx.nodeId))
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('nodeRemovedCycle', nodeRemovedCycle)
    if (!nodeRemovedCycle) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward fail !nodeRemovedCycle', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent(
          'liberdus-staking',
          `registerBeforeAddVerify nodeReward fail !nodeRemovedCycle`
        )
      return false
    }

    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward success', Utils.safeStringify(tx))
    return true
  })
  dapp.registerApplyVerifier('nodeReward', async (txEntry: P2P.ServiceQueueTypes.AddNetworkTx<SignedNodeRewardTxData>) => {
    const tx = txEntry.txData
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('Validating nodeReward applied', Utils.safeStringify(tx))
    const shardusAddress = tx.publicKey?.toLowerCase()
    const account = await dapp.getLocalOrRemoteAccount(shardusAddress)
    if (!account) {
      throw new Error(`Account for shardus address ${shardusAddress} not found`)
    }
    const data = account.data as NodeAccount
    const appliedEntry = data.rewardEndTime === tx.endTime
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeReward appliedEntry', appliedEntry)
    return appliedEntry
  })
  dapp.registerBeforeAddVerifier('nodeInitReward', async (txEntry: P2P.ServiceQueueTypes.AddNetworkTx<SignedNodeInitTxData>) => {
    const tx = txEntry.txData
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('Validating nodeInitReward', Utils.safeStringify(tx))

    const isValid = crypto.verifyObj(tx)
    if (!isValid) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('validate nodeInitReward fail Invalid signature', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `validate nodeInitReward fail Invalid signature`)
      return false
    }
    if (txEntry.subQueueKey == null || txEntry.subQueueKey != tx.publicKey) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerifier - nodeInitReward: fail Invalid subQueueKey', Utils.safeStringify(tx))
      return false
    }
    const latestCycles = dapp.getLatestCycles(5)
    const nodeActivedCycle = latestCycles.find((cycle) => cycle.activatedPublicKeys.includes(tx.publicKey))
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('nodeActivedCycle', nodeActivedCycle)
    if (!nodeActivedCycle) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('validate nodeInitReward fail !nodeActivedCycle', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `validate nodeInitReward fail !nodeActivedCycle`)
      return false
    }
    if (nodeActivedCycle.start !== tx.startTime) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('validate nodeInitReward fail nodeActivedCycle.start !== tx.nodeActivatedTime', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `validate nodeInitReward fail nodeActivedCycle.start !== tx.nodeActivatedTime`)
      return false
    }

    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('validate nodeInitReward success', Utils.safeStringify(tx))
    return true
  })
  dapp.registerApplyVerifier('nodeInitReward', async (txEntry: P2P.ServiceQueueTypes.AddNetworkTx<SignedNodeInitTxData>) => {
    const tx = txEntry.txData
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('Validating nodeInitReward applied', Utils.safeStringify(tx))
    const shardusAddress = tx.publicKey?.toLowerCase()
    const account = await dapp.getLocalOrRemoteAccount(shardusAddress)
    if (!account) {
      throw new Error(`Account for shardus address ${shardusAddress} not found`)
    }
    const data = account.data as NodeAccount

    // check if nodeAccount.rewardStartTime is already set to tx.nodeActivatedTime
    if (data.rewardStartTime >= tx.startTime) {
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `validateInitRewardState success rewardStartTime already set`)
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeInitReward data.rewardStartTime >= tx.startTime')
      return true
    }

    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeInitReward node.rewardStartTime not applied yet')
    return false
  })
  dapp.registerShutdownHandler('nodeInitReward', (node: P2P.NodeListTypes.Node, record: P2P.CycleCreatorTypes.CycleRecord) => {
    if (record.activated.includes(node.id)) {
      if (record.txadd.some((entry) => entry.txData.nodeId === node.id && entry.type === 'nodeInitReward')) {
        /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log(`shutdown condition: active node with id ${node.id} is already in txadd (nodeInitReward); this should not happen`)
        return null
      }
      return {
        type: 'nodeInitReward',
        txData: {
          startTime: record.start,
          publicKey: node.publicKey,
          nodeId: node.id,
        },
        priority: 1,
        subQueueKey: node.publicKey,
      }
    }
    return null
  })
  dapp.registerShutdownHandler('nodeReward', (node: P2P.NodeListTypes.Node, record: P2P.CycleCreatorTypes.CycleRecord) => {
    if (record.txadd.some((entry) => entry.txData.nodeId === node.id && entry.type === 'nodeReward')) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log(`shutdown condition: active node with id ${node.id} is already in txadd; this should not happen`)
      return null
    }

    // get latest entry for node in txList. and if it is init then we inject otherwise continue
    // first iterate over txlist backwards and get first entry that has public key of node
    const txListEntry = dapp.getLatestNetworkTxEntryForSubqueueKey(node.publicKey)
    if (txListEntry && txListEntry.tx.type === 'nodeReward') {
      /** prettier-ignore */ if (LiberdusFlags.VerboseLogs)
        console.log(`Skipping creation of shutdown reward tx (last entry already is of type ${txListEntry.tx.type})`, Utils.safeStringify(txListEntry))
      return null
    }
    /** prettier-ignore */ if (LiberdusFlags.VerboseLogs)
      console.log(`Creating a shutdown reward tx`, Utils.safeStringify(txListEntry), Utils.safeStringify(node))
    return {
      type: 'nodeReward',
      txData: {
        start: node.activeCycle,
        end: record.counter,
        endTime: record.start,
        publicKey: node.publicKey,
        nodeId: node.id,
      },
      priority: 0,
      subQueueKey: node.publicKey,
    }
  })
}
