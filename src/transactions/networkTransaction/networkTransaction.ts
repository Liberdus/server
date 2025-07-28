import { Shardus, nestedCountersInstance } from '@shardeum-foundation/core'
import * as crypto from '../../crypto'
import { Utils, P2P } from '@shardeum-foundation/lib-types'
import { LiberdusFlags } from '../../config'
import { NodeAccount, NodeInitTxData, NodeRewardTxData, SignedNodeInitTxData, SignedNodeRewardTxData } from '../../@types'

export const configShardusNetworkTransactions = (dapp: Shardus): void => {
  dapp.serviceQueue.registerBeforeAddVerifier('nodeReward', async (txEntry: P2P.ServiceQueueTypes.AddNetworkTx<SignedNodeRewardTxData>) => {
    const tx = txEntry.txData
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('Validating nodeReward fields', Utils.safeStringify(tx))
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
    if (!tx.nodeId || tx.nodeId === '' || tx.nodeId.length !== 64) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward fail invalid nodeId field', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerBeforeAddVerify nodeReward fail invalid nodeId field`)
      return false
    }
    if (!tx.endTime || tx.endTime <= 0) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward fail endTime field missing', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerBeforeAddVerify nodeReward fail endTime field missing`)
      return false
    }

    const nodePubKey = dapp.getRemovedNodePubKeyFromCache(tx.nodeId)
    if (nodePubKey == null || tx.publicKey !== nodePubKey) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward fail invalid nodeId field', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerBeforeAddVerify nodeReward fail invalid nodeId field`)
      return false
    }
    const latestCycles = dapp.getLatestCycles(5)
    let nodeDeactivatedCycle: P2P.CycleCreatorTypes.CycleRecord

    // Node has been removed due to rotation or the low stake after getting penalty ("removed" | "appRemoved")
    const nodeRemovedCycle = latestCycles.find((cycle) => cycle.removed.includes(tx.nodeId) || cycle.appRemoved.includes(tx.nodeId))
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('nodeRemovedCycle', nodeRemovedCycle)

    if (!nodeRemovedCycle) {
      // Node left network early ("apoptosized")
      const nodeApoptosizedCycle = latestCycles.find((cycle) => cycle.apoptosized.includes(tx.nodeId))
      if (!nodeApoptosizedCycle) {
        /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward fail !nodeRemovedCycle && !nodeApoptosizedCycle', Utils.safeStringify(tx))
        /* prettier-ignore */ nestedCountersInstance.countEvent(
            'liberdus-staking',
            `registerBeforeAddVerify nodeReward fail !nodeRemovedCycle && !nodeApoptosizedCycle`
          )
        return false
      }
      // Check if the node was reported as lost in earlier cycle ("lost" -> "apoptosized")
      // Additionally, this prevents lost syncing nodes from being rewarded, they are also marked as apoptosized ("lostSyncing" -> "apoptosized")
      const nodeLostCycle = latestCycles.find((cycle) => cycle.lost.includes(tx.nodeId))
      if (!nodeLostCycle) {
        /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward fail !nodeLostCycle', Utils.safeStringify(tx))
        /* prettier-ignore */ nestedCountersInstance.countEvent(
            'liberdus-staking',
            `registerBeforeAddVerify nodeReward fail !nodeLostCycle`
          )
        return false
      }
      nodeDeactivatedCycle = nodeApoptosizedCycle
    } else {
      nodeDeactivatedCycle = nodeRemovedCycle
    }

    if (nodeDeactivatedCycle.start !== tx.endTime) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward fail nodeDeactivatedCycle.start and tx.endTime do not match', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent(
          'liberdus-staking',
          `registerBeforeAddVerify nodeReward fail nodeDeactivatedCycle.start and tx.endTime do not match`
        )
      return false
    }

    try {
      if (!crypto.verifyObj(tx, true)) {
        /* prettier-ignore */
        if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerifier - nodeReward: fail Invalid signature', Utils.safeStringify(tx))
        return false
      }
    } catch (e) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('Invalid signature for internal tx', Utils.safeStringify(tx))
      return false
    }

    const nodeAddress = tx.publicKey
    const account = await dapp.getLocalOrRemoteAccount(nodeAddress)
    if (!account) {
      console.log(`registerBeforeAddVerifier - nodeReward: Account for node address ${nodeAddress} not found, do not add tx`)
      return false
    }
    const nodeAccount = account.data as NodeAccount
    if (!nodeAccount || !nodeAccount.nominator || nodeAccount.nominator === '') {
      console.log(`registerBeforeAddVerifier - nodeReward: Account for node address ${nodeAddress} has null nominator, do not add tx`)
      return false
    }

    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeReward success', Utils.safeStringify(tx))
    return true
  })
  dapp.serviceQueue.registerApplyVerifier('nodeReward', async (txEntry: P2P.ServiceQueueTypes.AddNetworkTx<SignedNodeRewardTxData>) => {
    const tx = txEntry.txData
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('Validating nodeReward applied', Utils.safeStringify(tx))
    const shardusAddress = tx.publicKey
    const account = await dapp.getLocalOrRemoteAccount(shardusAddress)
    if (!account) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeReward fail account not found', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerApplyVerify nodeReward fail account not found`)
      return true
    }
    const nodeAccount = account.data as NodeAccount
    if (!nodeAccount || typeof nodeAccount.rewardEndTime !== 'number') {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeReward fail rewardEndTime not found', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerApplyVerify nodeReward fail rewardEndTime not found`)
      return true
    }
    const appliedEntry = nodeAccount.rewardEndTime >= tx.endTime
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeReward appliedEntry', appliedEntry)
    return appliedEntry
  })
  dapp.serviceQueue.registerBeforeAddVerifier('nodeInitReward', async (txEntry: P2P.ServiceQueueTypes.AddNetworkTx<SignedNodeInitTxData>) => {
    const tx = txEntry.txData
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('Validating nodeInitReward', Utils.safeStringify(tx))

    if (txEntry.subQueueKey == null || txEntry.subQueueKey != tx.publicKey) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerifier - nodeInitReward: fail Invalid subQueueKey', Utils.safeStringify(tx))
      return false
    }
    if (!tx.publicKey || tx.publicKey === '' || tx.publicKey.length !== 64) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeInitReward fail invalid publicKey field', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerBeforeAddVerify nodeInitReward fail invalid publicKey field`)
      return false
    }
    if (!tx.nodeId || tx.nodeId === '' || tx.nodeId.length !== 64) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeInitReward fail invalid nodeId field', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerBeforeAddVerify nodeInitReward fail invalid nodeId field`)
      return false
    }
    if (tx.startTime == undefined || tx.startTime <= 0) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerBeforeAddVerify nodeInitReward fail start field missing', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking',`registerBeforeAddVerify nodeInitReward fail start field missing`)
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

    const isValid = crypto.verifyObj(tx, true)
    if (!isValid) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('validate nodeInitReward fail Invalid signature', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `validate nodeInitReward fail Invalid signature`)
      return false
    }

    const nodeAddress = tx.publicKey
    const account = await dapp.getLocalOrRemoteAccount(nodeAddress)
    if (!account) {
      console.log(`registerBeforeAddVerifier - nodeInitReward: Account for node address ${nodeAddress} not found, do not add tx`)
      return false
    }
    const nodeAccount = account.data as NodeAccount
    if (!nodeAccount || !nodeAccount.nominator || nodeAccount.nominator === '') {
      console.log(`registerBeforeAddVerifier - nodeInitReward: Account for node address ${nodeAddress} has null nominator, do not add tx`)
      return false
    }

    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('validate nodeInitReward success', Utils.safeStringify(tx))
    return true
  })
  dapp.serviceQueue.registerApplyVerifier('nodeInitReward', async (txEntry: P2P.ServiceQueueTypes.AddNetworkTx<SignedNodeInitTxData>) => {
    const tx = txEntry.txData
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('Validating nodeInitReward applied', Utils.safeStringify(tx))
    if (!tx.publicKey || tx.publicKey === '' || tx.publicKey.length !== 64) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeInitReward fail invalid publicKey field', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerApplyVerify nodeInitReward fail invalid publicKey field`)
      return true
    }
    const shardusAddress = tx.publicKey
    const account = await dapp.getLocalOrRemoteAccount(shardusAddress)
    if (!account) {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeInitReward fail account not found', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerApplyVerify nodeInitReward fail account not found`)
      return true
    }

    const nodeAccount = account.data as NodeAccount
    if (!nodeAccount || typeof nodeAccount.rewardStartTime !== 'number') {
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeInitReward fail rewardStartTime not found', Utils.safeStringify(tx))
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `registerApplyVerify nodeInitReward fail rewardStartTime not found`)
      return true
    }

    // check if nodeAccount.rewardStartTime is already set to tx.nodeActivatedTime
    if (nodeAccount.rewardStartTime >= tx.startTime) {
      /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `validateInitRewardState success rewardStartTime already set`)
      /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeInitReward data.rewardStartTime >= tx.startTime')
      return true
    }

    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('registerApplyVerify nodeInitReward node.rewardStartTime not applied yet')
    return false
  })
  dapp.serviceQueue.registerShutdownHandler('nodeInitReward', (node: P2P.NodeListTypes.Node, record: P2P.CycleCreatorTypes.CycleRecord) => {
    if (record.activated.includes(node.id)) {
      if (record.txadd.some((entry) => entry.txData.nodeId === node.id && entry.type === 'nodeInitReward')) {
        /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log(`shutdown condition: active node with id ${node.id} is already in txadd (nodeInitReward); this should not happen`)
        return null
      }
      const txData: NodeInitTxData = {
        startTime: record.start,
        publicKey: node.publicKey,
        nodeId: node.id,
      }
      return {
        type: 'nodeInitReward',
        txData,
        priority: 1,
        subQueueKey: node.publicKey,
      }
    }
    return null
  })
  dapp.serviceQueue.registerShutdownHandler('nodeReward', (node: P2P.NodeListTypes.Node, record: P2P.CycleCreatorTypes.CycleRecord) => {
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
    const txData: NodeRewardTxData = {
      endTime: record.start,
      publicKey: node.publicKey,
      nodeId: node.id,
    }
    return {
      type: 'nodeReward',
      txData,
      priority: 0,
      subQueueKey: node.publicKey,
    }
  })
}
