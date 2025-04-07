import { NetworkAccount } from '../@types'
import Storage from '../storage/storage'
import { networkAccount, LiberdusFlags } from '../config'
import { Utils } from '@shardus/types'
import { Accounts } from '../@types'

//Accounts
export interface AccountsMap {
  [id: string]: Accounts
}

export let accounts: AccountsMap = {}

export let storage: Storage = null

let isInitialized = false

export async function init(baseDir: string, dbPath: string): Promise<void> {
  storage = new Storage(baseDir, dbPath)

  //we have to lazy init storage, because this init happens very early
}

export async function lazyInit(): Promise<void> {
  if (isInitialized === false) {
    await storage.init()
    isInitialized = true
  }
}

export async function getAccount(address: string): Promise<Accounts | null> {
  if (LiberdusFlags.UseDBForAccounts === true) {
    const account = await storage.getAccountsEntry(address)
    if (!account) return null

    if (typeof account.data === 'string') {
      account.data = Utils.safeJsonParse(account.data) as Accounts
    }

    return account.data
  } else {
    // eslint-disable-next-line security/detect-object-injection
    return accounts[address]
  }
  //return null
}

export async function getAccountTimestamp(address: string): Promise<number> {
  if (LiberdusFlags.UseDBForAccounts === true) {
    //todo replace with specific sql query
    const account = await storage.getAccountsEntry(address)
    return account.timestamp
  } else {
    // eslint-disable-next-line security/detect-object-injection
    return accounts[address]?.timestamp
  }
}

export async function accountExists(address: string): Promise<boolean> {
  if (LiberdusFlags.UseDBForAccounts === true) {
    //todo replace with specific sql query, or even a shardus cache check
    const account = await storage.getAccountsEntry(address)
    return account != null
  } else {
    // eslint-disable-next-line security/detect-object-injection
    return accounts[address] != null
  }
}

let cachedNetworkAccount: NetworkAccount // an actual obj

export function getCachedNetworkAccount(): NetworkAccount {
  return cachedNetworkAccount
}

export async function setAccount(address: string, account: Accounts): Promise<void> {
  try {
    if (LiberdusFlags.UseDBForAccounts === true) {
      const accountEntry = {
        accountId: address,
        timestamp: account.timestamp,
        data: account,
      }

      if (account.timestamp === 0) {
        throw new Error('setAccount timestamp should not be 0')
      }
      await storage.createOrReplaceAccountEntry(accountEntry)

      if (address === networkAccount) {
        cachedNetworkAccount = account as unknown as NetworkAccount
      }
    } else {
      // eslint-disable-next-line security/detect-object-injection
      accounts[address] = account
    }
  } catch (e) {
    /* prettier-ignore */ console.log(`Error: while trying to set account`, e.message)
  }
}

export const setCachedNetworkAccount = (account: NetworkAccount): void => {
  cachedNetworkAccount = account
}

export async function debugGetAllAccounts(): Promise<Accounts[]> {
  if (LiberdusFlags.UseDBForAccounts === true) {
    return (await storage.debugSelectAllAccountsEntry()) as unknown as Accounts[]
  } else {
    return Object.values(accounts)
  }
  //return null
}

export async function clearAccounts(): Promise<void> {
  if (LiberdusFlags.UseDBForAccounts === true) {
    //This lazy init is not ideal.. we only know this is called because of special knowledge
    //Would be much better to make a specific api that is called at the right time before data sync
    await lazyInit()
    await storage.deleteAccountsEntry()
  } else {
    accounts = {}
  }
}

export async function queryAccountsEntryByRanges(accountStart, accountEnd, maxRecords): Promise<Accounts[]> {
  if (LiberdusFlags.UseDBForAccounts === true) {
    const processedResults: Accounts[] = []
    const results = await storage.queryAccountsEntryByRanges(accountStart, accountEnd, maxRecords)
    for (const result of results) {
      if (typeof result.data === 'string') {
        result.data = Utils.safeJsonParse(result.data) as Accounts
      }
      processedResults.push(result.data)
    }
    return processedResults
  } else {
    throw Error('not supported here')
  }
}

export async function queryAccountsEntryByRanges2(accountStart, accountEnd, tsStart, tsEnd, maxRecords, offset, accountOffset): Promise<Accounts[]> {
  if (LiberdusFlags.UseDBForAccounts === true) {
    const processedResults: Accounts[] = []
    let results

    if (accountOffset != null && accountOffset.length > 0) {
      results = await storage.queryAccountsEntryByRanges3(accountStart, accountEnd, tsStart, tsEnd, maxRecords, accountOffset)
    } else {
      results = await storage.queryAccountsEntryByRanges2(accountStart, accountEnd, tsStart, tsEnd, maxRecords, offset)
    }

    for (const result of results) {
      if (typeof result.data === 'string') {
        result.data = Utils.safeJsonParse(result.data) as Accounts
      }
      processedResults.push(result.data)
    }
    return processedResults
  } else {
    throw Error('not supported here')
    //return accounts
  }
}
