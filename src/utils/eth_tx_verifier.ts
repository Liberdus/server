import axios from 'axios'
import * as AccountsStorage from '../storage/accountStorage'
import * as utils from '../utils'
import { shardusPost } from './request'

/**
 * JSON-RPC request payload
 */
interface JsonRpcPayload {
  jsonrpc: string
  method: string
  params: any[]
  id: number | string
}

/**
 * JSON-RPC response
 */
interface JsonRpcResponse {
  jsonrpc: string
  id: number | string
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

/**
 * Ethereum transaction receipt
 */
interface TransactionReceipt {
  transactionHash: string
  transactionIndex: string
  blockHash: string
  blockNumber: string
  from: string
  to: string | null
  cumulativeGasUsed: string
  gasUsed: string
  contractAddress: string | null
  logs: Log[]
  logsBloom: string
  status: string
  effectiveGasPrice?: string
}

/**
 * Log entry in transaction receipt
 */
interface Log {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
  transactionIndex: string
  blockHash: string
  logIndex: string
  removed: boolean
}

/**
 * Ethereum block data
 */
interface BlockData {
  number: string
  hash: string
  parentHash: string
  nonce: string
  sha3Uncles: string
  logsBloom: string
  transactionsRoot: string
  stateRoot: string
  receiptsRoot: string
  miner: string
  difficulty: string
  totalDifficulty: string
  extraData: string
  size: string
  gasLimit: string
  gasUsed: string
  timestamp: string
  transactions: Array<string | Transaction>
  uncles: string[]
}

/**
 * Ethereum transaction
 */
interface Transaction {
  hash: string
  nonce: string
  blockHash: string | null
  blockNumber: string | null
  transactionIndex: string | null
  from: string
  to: string | null
  value: string
  gasPrice: string
  gas: string
  input: string
}

/**
 * Event extracted from transaction logs
 */
interface Event {
  address: string
  eventSignature: string
  topics: string[]
  data: string
  logIndex: number
  blockNumber: number
}

/**
 * Result of transaction verification
 */
interface VerificationResult {
  verified: boolean
  reason?: string
  confirmations?: number
  blockNumber?: number
  blockHash?: string
  timestamp?: number
  events?: Event[]
  error?: Error
  blockTimestamp?: number
  currentTimestamp?: number
}

/**
 * Verifies a transaction by checking:
 * 1. Transaction is confirmed (included in a block)
 * 2. Block is at least 2 blocks old (for confirmation security)
 * 3. Transaction timestamp is not more than 1 minute ahead of current time
 * 4. Transaction exists in the block's transaction list
 *
 * @param txHash - The transaction hash to verify
 * @param provider - Web3 provider or JSON-RPC provider
 * @returns - Verification results with status and details
 */
async function verifyTransaction(txHash: string): Promise<VerificationResult> {
  try {
    // Step 1: Get the latest block number
    const latestBlock = await getLatestBlockNumber()
    console.log(`Latest block: ${latestBlock}`)

    // Step 2: Get transaction receipt
    const txReceipt = await getTransactionReceipt(txHash)
    if (!txReceipt) {
      return { verified: false, reason: 'Transaction not found or not mined yet' }
    }

    // Step 3: Verify transaction status
    if (!txReceipt.status || txReceipt.status === '0x0') {
      return { verified: false, reason: 'Transaction failed (status=0)' }
    }

    // Step 4: Verify block confirmations (at least 2 blocks behind)
    const txBlockNumber = parseInt(txReceipt.blockNumber, 16)
    const confirmations = latestBlock - txBlockNumber
    if (confirmations < 2) {
      return {
        verified: false,
        reason: `Insufficient confirmations: ${confirmations} (need at least 2)`,
        confirmations,
      }
    }

    // Step 5: Get the block details
    const blockData = await getBlockByNumber(txBlockNumber, true)
    if (!blockData) {
      return { verified: false, reason: 'Failed to retrieve block data' }
    }

    // Step 6: Verify block timestamp is not far in the future
    const blockTimestamp = parseInt(blockData.timestamp, 16)
    const currentTimestamp = Math.floor(Date.now() / 1000)
    if (blockTimestamp > currentTimestamp + 60) {
      return {
        verified: false,
        reason: `Block timestamp is too far in the future: ${blockTimestamp} vs ${currentTimestamp}`,
        blockTimestamp,
        currentTimestamp,
      }
    }

    // Step 7: Verify transaction exists in the block
    const transactions = blockData.transactions as Transaction[]
    const txExists = transactions.some((tx) => tx.hash && tx.hash.toLowerCase() === txHash.toLowerCase())
    if (!txExists) {
      return { verified: false, reason: 'Transaction hash not found in block transactions' }
    }

    // Step 8: Extract and validate event data (basic validation)
    const events = extractEvents(txReceipt)

    // All checks passed
    return {
      verified: true,
      confirmations,
      blockNumber: txBlockNumber,
      blockHash: txReceipt.blockHash,
      timestamp: blockTimestamp,
      events,
    }
  } catch (error) {
    return {
      verified: false,
      reason: `Verification failed: ${(error as Error).message}`,
      error: error as Error,
    }
  }
}

/**
 * Get the latest block number from the Ethereum network
 *
 * @param provider - Web3 provider or JSON-RPC provider
 * @returns - The latest block number (as a number, not hex)
 */
async function getLatestBlockNumber(): Promise<number> {
  const response = await jsonRpcRequest('eth_blockNumber', [])
  if (!response) {
    throw new Error('Failed to retrieve latest block number')
  }
  return parseInt(response as string, 16)
}

/**
 * Get transaction receipt for a transaction hash
 *
 * @param txHash - The transaction hash
 * @returns - The transaction receipt
 */
async function getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null> {
  return jsonRpcRequest('eth_getTransactionReceipt', [txHash])
}

/**
 * Get block data by block number
 *
 * @param blockNumber - The block number to fetch
 * @param includeTransactions - Whether to include full transaction objects
 * @param provider - Web3 provider or JSON-RPC provider
 * @returns - The block data
 */
async function getBlockByNumber(blockNumber: number, includeTransactions: boolean): Promise<BlockData | null> {
  const blockNumberHex = '0x' + blockNumber.toString(16)
  return jsonRpcRequest('eth_getBlockByNumber', [blockNumberHex, includeTransactions])
}

/**
 * Extract and format event data from transaction receipt
 *
 * @param txReceipt - The transaction receipt
 * @returns - Array of formatted event objects
 */
function extractEvents(txReceipt: TransactionReceipt): Event[] {
  if (!txReceipt.logs || !Array.isArray(txReceipt.logs)) {
    return []
  }

  return txReceipt.logs.map((log) => {
    const eventSignature = log.topics[0]
    return {
      address: log.address,
      eventSignature,
      topics: log.topics,
      data: log.data,
      logIndex: parseInt(log.logIndex, 16),
      blockNumber: parseInt(log.blockNumber, 16),
    }
  })
}

/**
 * Make a JSON-RPC request to the Ethereum node
 *
 * @param method - The JSON-RPC method to call
 * @param params - The parameters for the method
 * @returns - The result from the JSON-RPC call
 */
async function jsonRpcRequest<T>(method: string, params: any[]): Promise<T> {
  const networkAccount = AccountsStorage.getCachedNetworkAccount()
  // TODO: Add retry logic for network errors
  const randomRPCProvider = utils.getRandom(networkAccount.current.polygon_rpcs, 1)[0]
  const body = {
    jsonrpc: '2.0',
    id: new Date().getTime(),
    method,
    params,
  }
  const response = await axios.post(
    randomRPCProvider,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
    {
      timeout: 1000, // 1 second
    },
  )

  const data = (await response.data) as JsonRpcResponse
  if (data.error) {
    throw new Error(data.error.message || 'JSON-RPC error')
  }
  return data.result
}

// Export functions
export { verifyTransaction, getLatestBlockNumber, getTransactionReceipt, getBlockByNumber, extractEvents }

// Types export
export type { TransactionReceipt, BlockData, Transaction, Log, Event, VerificationResult }
