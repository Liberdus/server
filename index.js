const fs = require('fs')
const path = require('path')
const shardus = require('shardus-global-server')
const crypto = require('shardus-crypto-utils')
crypto('64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347')

let config = { server: { baseDir: './' } }
if (process.env.BASE_DIR) {
  if (fs.existsSync(path.join(process.env.BASE_DIR, 'config.json'))) {
    config = JSON.parse(fs.readFileSync(path.join(process.env.BASE_DIR, 'config.json')))
  }
  config.server.baseDir = process.env.BASE_DIR
}

const dapp = shardus(config)

/**
 * interface account {
 *   id: string,        // 32 byte hex string
 *   hash: string,      // 32 byte hex string
 *   timestamp: number, // ms since epoch
 *   data: {
 *     balance: number
 *   }
 * }
 *
 * interface accounts {
 *   [id: string]: account
 * }
 */
let accounts = {}
function setAccountData (accountsToAdd = []) {
  for (const account of accountsToAdd) {
    accounts[account.id] = account
  }
}
function createAccount (obj = {}) {
  const account = Object.assign({
    timestamp: Date.now(),
    id: crypto.randomBytes(),
    data: {
      balance: 0
    }
  }, obj)
  account.hash = crypto.hashObj(account.data)
  return account
}

dapp.registerExternalPost('inject', async (req, res) => {
  console.log(req.body)
  try {
    const response = dapp.put(req.body)
    res.json(response)
  } catch (err) {
    console.log('Failed to inject tx: ', err)
  }
})

dapp.registerExternalGet('account/:id', async (req, res) => {
  const id = req.params['id']
  const account = accounts[id] || null
  res.json({ account })
})

dapp.registerExternalGet('accounts', async (req, res) => {
  res.json({ accounts })
})

/**
 * interface tx {
 *   type: string
 *   from: string,
 *   to: string,
 *   amount: number,
 *   timestamp: number
 * }
 */
dapp.setup({
  validateTransaction (tx) {
    const response = {
      result: 'fail',
      reason: 'Transaction is not valid.'
    }

    // Validate tx here
    if (tx.amount < 0) {
      response.reason = '"amount" must be non-negative.'
      return response
    }
    switch (tx.type) {
      case 'create':
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      case 'transfer':
        const from = accounts[tx.from]
        if (typeof from === 'undefined' || from === null) {
          response.reason = '"from" account does not exist.'
          return response
        }
        if (from.data.balance < tx.amount) {
          response.reason = '"from" account does not have sufficient funds.'
          return response
        }
        response.result = 'pass'
        response.reason = 'This transaction is valid!'
        return response
      default:
        response.reason = '"type" must be "create" or "transfer".'
        return response
    }
  },
  validateTxnFields (tx) {
    // Validate tx fields here
    let result = 'pass'
    let reason = ''
    const txnTimestamp = tx.timestamp

    if (typeof tx.type !== 'string') {
      result = 'fail'
      reason = '"type" must be a string.'
      throw new Error(reason)
    }
    if (typeof tx.from !== 'string') {
      result = 'fail'
      reason = '"from" must be a string.'
      throw new Error(reason)
    }
    if (typeof tx.to !== 'string') {
      result = 'fail'
      reason = '"to" must be a string.'
      throw new Error(reason)
    }
    if (typeof tx.amount !== 'number') {
      result = 'fail'
      reason = '"amount" must be a number.'
      throw new Error(reason)
    }
    if (typeof tx.timestamp !== 'number') {
      result = 'fail'
      reason = '"timestamp" must be a number.'
      throw new Error(reason)
    }

    return {
      result,
      reason,
      txnTimestamp
    }
  },
  apply (tx, wrappedStates) {
    // Validate the tx
    const { result, reason } = this.validateTransaction(tx)
    if (result !== 'pass') {
      throw new Error(`invalid transaction, reason: ${reason}. tx: ${JSON.stringify(tx)}`)
    }
    // Create an applyResponse which will be used to tell Shardus that the tx has been applied
    const txId = crypto.hashObj(tx) // compute from tx
    const txTimestamp = tx.timestamp // get from tx
    console.log('DBG', 'attempting to apply tx', txId, '...')
    const applyResponse = dapp.createApplyResponse(txId, txTimestamp)

    // Apply the tx
    switch (tx.type) {
      case 'create': {
        // Get the to account
        const to = wrappedStates[tx.to].data
        if (typeof to === 'undefined' || to === null) {
          throw new Error(`account '${tx.to}' missing. tx: ${JSON.stringify(tx)}`)
        }
        // Increment the to accounts balance
        to.data.balance += tx.amount
        // Update the to accounts timestamp
        to.timestamp = txTimestamp
        console.log('DBG', 'applied create tx', txId, accounts[tx.to])
        break
      }
      case 'transfer': {
        // Get the from and to accounts
        const from = wrappedStates[tx.from].data
        if (typeof from === 'undefined' || from === null) {
          throw new Error(`from account '${tx.to}' missing. tx: ${JSON.stringify(tx)}`)
        }
        const to = wrappedStates[tx.to].data
        if (typeof to === 'undefined' || to === null) {
          throw new Error(`to account '${tx.to}' missing. tx: ${JSON.stringify(tx)}`)
        }
        // Decrement the from accounts balance
        from.data.balance -= tx.amount
        // Increment the to accounts balance
        to.data.balance += tx.amount
        // Update the from accounts timestamp
        from.timestamp = txTimestamp
        // Update the to accounts timestamp
        to.timestamp = txTimestamp
        console.log('DBG', 'applied transfer tx', txId, accounts[tx.from], accounts[tx.to])
        break
      }
    }
    return applyResponse
  },
  getKeyFromTransaction (tx) {
    const result = {
      sourceKeys: [],
      targetKeys: [],
      allKeys: [],
      timestamp: tx.timestamp
    }
    switch (tx.type) {
      case 'create':
        result.targetKeys = [tx.to]
        break
      case 'transfer':
        result.targetKeys = [tx.to]
        result.sourceKeys = [tx.from]
        break
    }
    result.allKeys = result.allKeys.concat(result.sourceKeys, result.targetKeys)
    return result
  },
  getStateId (accountAddress, mustExist = true) {
    const account = accounts[accountAddress]
    if ((typeof account === 'undefined' || account === null) && mustExist === true) {
      throw new Error('Could not get stateId for account ' + accountAddress)
    }
    const stateId = account.hash
    return stateId
  },
  deleteLocalAccountData () {
    accounts = {}
  },
  setAccountData (accountRecords) {
    let accountsToAdd = []
    let failedHashes = []
    for (let { accountId, stateId, data: recordData } of accountRecords) {
      let hash = crypto.hashObj(recordData)
      if (stateId === hash) {
        if (recordData.data) recordData.data = JSON.parse(recordData.data)
        accountsToAdd.push(recordData)
        console.log('setAccountData: ' + hash + ' txs: ' + recordData.txs)
      } else {
        console.log('setAccountData hash test failed: setAccountData for ' + accountId)
        console.log('setAccountData hash test failed: details: ' + JSON.stringify({ accountId, hash, stateId, recordData }))
        failedHashes.push(accountId)
      }
    }
    console.log('setAccountData: ' + accountsToAdd.length)
    setAccountData(accountsToAdd)
    return failedHashes
  },
  getRelevantData (accountId, tx) {
    let account = accounts[accountId]
    let accountCreated = false
    // Create the account if it doesn't exist
    if (typeof account === 'undefined' || account === null) {
      account = createAccount({ id: accountId, timestamp: 0 })
      accounts[accountId] = account
      accountCreated = true
    }
    // Wrap it for Shardus
    const wrapped = dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
    return wrapped
  },
  updateAccountFull (wrappedData, localCache, applyResponse) {
    const accountId = wrappedData.accountId
    const accountCreated = wrappedData.accountCreated
    const updatedAccount = wrappedData.data
    // Update hash
    const hashBefore = updatedAccount.hash
    const hashAfter = crypto.hashObj(updatedAccount.data)
    updatedAccount.hash = hashAfter
    // Save updatedAccount to db / persistent storage
    accounts[accountId] = updatedAccount
    // Add data to our required response object
    dapp.applyResponseAddState(applyResponse, updatedAccount, updatedAccount, accountId, applyResponse.txId, applyResponse.txTimestamp, hashBefore, hashAfter, accountCreated)
  },
  updateAccountPartial (wrappedData, localCache, applyResponse) {
    this.updateAccountFull(wrappedData, localCache, applyResponse)
  },
  getAccountDataByRange (accountStart, accountEnd, tsStart, tsEnd, maxRecords) {
    const results = []
    const start = parseInt(accountStart, 16)
    const end = parseInt(accountEnd, 16)
    // Loop all accounts
    for (const account of Object.values(accounts)) {
      // Skip if not in account id range
      const id = parseInt(account.id, 16)
      if (id < start || id > end) continue
      // Skip if not in timestamp range
      const timestamp = account.timestamp
      if (timestamp < tsStart || timestamp > tsEnd) continue
      // Add to results
      const wrapped = { accountId: account.id, stateId: account.hash, data: account, timestamp: account.timestamp }
      results.push(wrapped)
      // Return results early if maxRecords reached
      if (results.length >= maxRecords) return results
    }
    return results
  }
})

dapp.registerExceptionHandler()

dapp.start()
