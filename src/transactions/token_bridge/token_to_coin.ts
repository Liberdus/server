import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from '../../utils'
import * as config from '../../config'
import { Accounts, UserAccount, ChatAccount, NetworkAccount, WrappedStates, Tx, TransactionKeys, AppReceiptData } from '../../@types'
import { verifyTransaction } from '../../utils/eth_tx_verifier'

export const validate_fields = (tx: Tx.TokenToCoinTX, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (typeof tx.from !== 'string' && utils.isValidAddress(tx.from) === false) {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.txHash !== 'string' && utils.isValidEthereumTxHash(tx.txHash) === false) {
    response.success = false
    response.reason = 'tx "txHash" field must be a valid ethereum transaction hash.'
    throw new Error(response.reason)
  }

  if (typeof tx.receiver !== 'string' && utils.isValidAddress(tx.receiver) === false) {
    response.success = false
    response.reason = 'tx "receiverAddress" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.amount !== 'bigint' || tx.amount <= BigInt(0)) {
    response.success = false
    response.reason = 'tx "amount" field must be a bigint and greater than 0.'
    throw new Error(response.reason)
  }
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  return response
}

export const validate = (
  tx: Tx.TokenToCoinTX,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const receiverAddress: Accounts = wrappedStates[tx.receiver] && wrappedStates[tx.receiver].data
  if (from === undefined || from === null) {
    response.reason = "From account doesn't exist"
    return response
  }
  if (receiverAddress === undefined || receiverAddress === null) {
    response.reason = "Receiver account doesn't exist"
    return response
  }
  if (from.data.claimedTxHashes.includes(tx.txHash)) {
    response.reason = 'Transaction has already been claimed'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const checkTransactionStatus = async (
  tx: Tx.TokenToCoinTX,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): Promise<ShardusTypes.IncomingTransactionResult> => {
  const result = await verifyTransaction(tx.txHash)

  if (result.verified) {
    console.log('✅ Transaction verified successfully!')
    console.log(`Block number: ${result.blockNumber}`)
    console.log(`Confirmations: ${result.confirmations}`)
    console.log(`Block timestamp: ${new Date((result.timestamp || 0) * 1000).toISOString()}`)
    console.log(`Events: ${result.events?.length || 0}`)
  } else {
    console.log(`❌ Transaction verification failed: ${result.reason}`)
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.TokenToCoinTX,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const receiver: UserAccount = wrappedStates[tx.receiver].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data

  // deduct transaction fee and maintenance fee from the from account
  const transactionFee = network.current.transactionFee
  const maintenanceFee = utils.maintenanceAmount(txTimestamp, from, network)
  from.data.balance -= transactionFee + maintenanceFee
  // add the tx hash to the claimed tx hashes of the from account
  from.data.claimedTxHashes.push(tx.txHash)

  // mint the amount to the receiver
  receiver.data.balance += tx.amount

  // update account timestamps
  from.timestamp = txTimestamp
  receiver.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.receiver,
    type: tx.type,
    transactionFee,
    additionalInfo: {
      maintenanceFee,
    },
  }
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, txId)
  dapp.log('Applied token to coin tx', from, receiver)
}

export const transactionReceiptPass = (tx: Tx.TokenToCoinTX, txId: string, wrappedStates: WrappedStates, dapp, applyResponse) => {
  if (applyResponse == null) return
  const appReceiptData = applyResponse.appReceiptData

  if (config.LiberdusFlags.VerboseLogs) {
    console.log('_transactionReceiptPass appReceiptData for token to coin tx', txId, appReceiptData)
    console.log('_transactionReceiptPass appReceiptDataHash for token to coin tx', txId, crypto.hashObj(appReceiptData))
  }

  if (appReceiptData) {
    const dataId = appReceiptData.txId
    dapp
      .sendCorrespondingCachedAppData('receipt', dataId, appReceiptData, dapp.stateManager.currentCycleShardData.cycleNumber, tx.from, appReceiptData.txId)
      .then(() => {
        dapp.log('PostApplied token to coin tx', tx, appReceiptData)
      })
      .catch((err) => {
        throw new Error(`Error in sending receipt for token to coin tx: ${err.message}`)
      })
  }
}

export const keys = (tx: Tx.TokenToCoinTX, result: TransactionKeys): TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.receiver, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.TokenToCoinTX, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  const memoryPattern: ShardusTypes.ShardusMemoryPatternsInput = {
    rw: [tx.from, tx.receiver],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
  return memoryPattern
}
export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | ChatAccount,
  accountId: string,
  tx: Tx.TokenToCoinTX,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw Error('Account must exist in order to send a message transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
