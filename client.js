const fs = require('fs')
const { resolve } = require('path')
const path = require('path')
const vorpal = require('vorpal')()
const got = require('got')
const crypto = require('shardus-crypto-utils')
const stringify = require('fast-stable-stringify')
const axios = require('axios')
crypto('64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347')

// BEFORE TESTING LOCALLY, CHANGE THE ADMIN_ADDRESS IN LIBERDUS-SERVER TO ONE YOU HAVE LOCALLY

// USEFUL COMMANDS FOR TESTING THE PROPOSAL SYSTEM
// -----------------------------------------------
// init parameters kyle
// submit snapshot kyle
// snapshot claim kyle
// submit proposal kyle 1000 100 1000
// submit proposal kyle 100 10 1000
// vote proposal kyle 3 100
// vote proposal kyle 2 70

let HOST = 'localhost'

// USEFUL CONSTANTS FOR TIME IN MILLISECONDS
const ONE_SECOND = 1000
const ONE_MINUTE = 60 * ONE_SECOND
const ONE_HOUR = 60 * ONE_MINUTE
const ONE_DAY = 24 * ONE_HOUR
const ONE_WEEK = 7 * ONE_DAY
const ONE_YEAR = 365 * ONE_DAY

const walletFile = resolve('./wallet.json')
let walletEntries = {}

const baseDir = '.'

try {
  walletEntries = require(walletFile)
} catch (e) {
  saveEntries(walletEntries, walletFile)
  console.log(`Created wallet file '${walletFile}'.`)
}

async function getSeedNodes () {
  const res = await axios.get(`http://${HOST}:4000/api/seednodes`)
  const { seedNodes } = res.data
  return seedNodes
}

function saveEntries (entries, file) {
  const stringifiedEntries = JSON.stringify(entries, null, 2)
  fs.writeFileSync(file, stringifiedEntries)
}

function createAccount (keys = crypto.generateKeypair()) {
  return {
    address: keys.publicKey,
    keys
  }
}

function createAccounts (num) {
  const accounts = new Array(num).fill().map(account => createAccount())
  return accounts
}

// Creates an account with a keypair and adds it to the clients walletFile
function createEntry (name, id) {
  const account = createAccount()
  if (typeof id === 'undefined' || id === null) {
    id = crypto.hash(name)
  }
  account.id = id
  walletEntries[name] = account
  saveEntries(walletEntries, walletFile)
  return account.keys.publicKey
}

console.log(`Loaded wallet entries from '${walletFile}'.`)

let host = process.argv[2] || 'localhost:9001'

function getInjectUrl () {
  return `http://${host}/inject`
}
function getAccountsUrl () {
  return `http://${host}/accounts`
}
function getAccountUrl (id) {
  return `http://${host}/account/${id}`
}

console.log(`Using ${host} as coin-app node for queries and transactions.`)

async function postJSON (url, obj) {
  const response = await got(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(obj)
  })
  return response.body
}

function makeTxGenerator (accounts, total = 0, type) {
  function * buildGenerator (txBuilder, accounts, total, type) {
    let account1, offset, account2
    // let username
    // let users = {}
    while (total > 0) {
      // Keep looping through all available accounts as the srcAcct
      account1 = accounts[total % accounts.length]
      // Pick some other random account as the tgtAcct
      offset = Math.floor(Math.random() * (accounts.length - 1)) + 1
      account2 = accounts[(total + offset) % accounts.length]

      // if (!users[account1.address]) {
      //   username = `user${account1.address.slice(0, 4)}`
      //   yield txBuilder({
      //     type: 'register',
      //     from: account1,
      //     handle: username,
      //     id: crypto.hash(username)
      //   })
      //   total--
      //   users[account1.address] = true
      // }

      // Return a create tx to add funds to the srcAcct
      yield txBuilder({ type: 'create', to: account1, amount: 1 })
      total--
      if (!(total > 0)) break

      // Return a transfer tx to transfer funds from srcAcct to tgtAcct
      switch (type) {
        case 'create': {
          yield txBuilder({ type: 'create', to: account1, amount: 1 })
          break
        }
        case 'transfer': {
          yield txBuilder({
            type: 'transfer',
            from: account1,
            to: account2,
            amount: 1
          })
          break
        }
        case 'friend': {
          yield txBuilder({
            type: 'friend',
            from: account1,
            to: account2,
            amount: 1
          })
          break
        }
        case 'message': {
          const message = stringify({
            body: 'spam1234',
            timestamp: Date.now(),
            handle: account1.address.slice(0, 5)
          })
          yield txBuilder({
            type: 'message',
            from: account1,
            to: account2,
            message: message,
            amount: 1
          })
          break
        }
        case 'toll': {
          yield txBuilder({
            type: 'toll',
            from: account1,
            toll: Math.ceil(Math.random() * 1000),
            amount: 1
          })
          break
        }
        default: {
          console.log('Type must be `transfer`, `message`, or `toll`')
        }
      }
      total--
      if (!(total > 0)) break
    }
  }
  const generator = buildGenerator(buildTx, accounts, total, type)
  generator.length = total
  return generator
}

function buildTx ({ type, from = {}, to, handle, id, amount, message, toll }) {
  let actualTx
  switch (type) {
    case 'register': {
      actualTx = {
        type,
        from: from.address,
        handle,
        id,
        timestamp: Date.now()
      }
      break
    }
    case 'create': {
      actualTx = {
        type,
        from: '0'.repeat(64),
        to: to.address,
        amount: Number(amount),
        timestamp: Date.now()
      }
      break
    }
    case 'transfer': {
      actualTx = {
        type,
        from: from.address,
        timestamp: Date.now(),
        to: to.address,
        amount: Number(amount)
      }
      break
    }
    case 'friend': {
      actualTx = {
        type,
        from: from.address,
        to: to.address,
        handle: `${to.address.slice(0, 5)}`,
        amount: Number(amount),
        timestamp: Date.now()
      }
      break
    }
    case 'message': {
      actualTx = {
        type,
        from: from.address,
        to: to.address,
        message: message,
        amount: Number(amount),
        timestamp: Date.now()
      }
      break
    }
    case 'toll': {
      actualTx = {
        type,
        from: from.address,
        toll,
        amount: Number(amount),
        timestamp: Date.now()
      }
      break
    }
    default: {
      console.log('Type must be `transfer`, `message`, or `toll`')
    }
  }
  if (from.keys) {
    crypto.signObj(actualTx, from.keys.secretKey, from.keys.publicKey)
  } else {
    crypto.signObj(actualTx, to.keys.secretKey, to.keys.publicKey)
  }
  return actualTx
}

let logError = false

async function sendTx (tx, port = null, verbose = true) {
  if (!tx.sign) {
    tx = buildTx(tx)
  }
  if (verbose) {
    console.log(`Sending tx to ${port}...`)
    console.log(tx)
  }
  try {
    const { data } = await axios.post(`http://${HOST}:${port}/inject`, tx)
    if (verbose) console.log('Got response:', data)
    return data
  } catch (err) {
    if (logError) console.log('Stopped spamming due to error')
  }
}

async function spamTxs ({
  txs,
  rate,
  ports = [],
  saveFile = null,
  verbose = true
}) {
  if (!Array.isArray(ports)) ports = [ports]

  console.log(
    `Spamming ${ports.length > 1 ? 'ports' : 'port'} ${ports.join()} with ${
      txs.length ? txs.length + ' ' : ''
    }txs at ${rate} TPS...`
  )

  const writeStream = saveFile
    ? fs.createWriteStream(path.join(baseDir, saveFile))
    : null

  const promises = []
  let port

  for (const tx of txs) {
    if (writeStream) writeStream.write(JSON.stringify(tx, null, 2) + '\n')
    port = ports[Math.floor(Math.random() * ports.length)]
    promises.push(sendTx(tx, port, verbose))
    await _sleep((1 / rate) * 1000)
  }
  if (writeStream) writeStream.end()
  console.log()

  await Promise.all(promises)
  console.log('Done spamming')

  if (writeStream) {
    await new Promise(resolve => writeStream.on('finish', resolve))
    console.log(`Wrote spammed txs to '${saveFile}'`)
  }
}

async function _sleep (ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function injectTx (tx) {
  try {
    const res = await postJSON(getInjectUrl(), tx)
    return res
  } catch (err) {
    return err.message
  }
}

async function getAccountData (id) {
  try {
    const res = await got(
      typeof id !== 'undefined' && id !== null
        ? getAccountUrl(id)
        : getAccountsUrl()
    )
    return res.body
  } catch (err) {
    return err.message
  }
}

async function getToll (friendId, yourId) {
  try {
    let res = await got(`http://${host}/account/${friendId}/${yourId}/toll`)
    let { toll } = JSON.parse(res.body)
    return toll
  } catch (err) {
    return err.message
  }
}

async function getAddress (handle) {
  if (handle.length === 64) return handle
  try {
    let res = await got(`http://${host}/address/${crypto.hash(handle)}`)
    const { address, error } = JSON.parse(res.body)
    if (error) {
      console.log(error)
    } else {
      return address
    }
  } catch (e) {
    console.log(e.message)
  }
}

async function pollMessages (to, from, timestamp) {
  try {
    const res = await got(`http://${host}/messages/${to}/${from}/${timestamp}`)
    const { messages } = JSON.parse(res.body)
    return messages
  } catch (err) {
    return err.message
  }
}

// QUERY'S ALL NETWORK ISSUES
async function queryIssues () {
  const res = await axios.get(`http://${host}/issues`)
  console.log(res.data.issues)
}

// QUERY'S THE MOST RECENT NETWORK ISSUE
async function queryLatestIssue () {
  const res = await axios.get(`http://${host}/issues/latest`)
  console.log(res.data.issue)
}

// QUERY'S THE CURRENT NETWORK ISSUE COUNT
async function getIssueCount () {
  const res = await axios.get(`http://${host}/issues/count`)
  console.log(res.data)
  return res.data.issueCount
}

// QUERY'S ALL NETWORK PROPOSALS
async function queryProposals () {
  const res = await axios.get(`http://${host}/proposals`)
  console.log(res.data.proposals)
}

// QUERY'S ALL PROPOSALS ON THE LATEST ISSUE
async function queryLatestProposals () {
  const res = await axios.get(`http://${host}/proposals/latest`)
  console.log(res.data.proposals)
}

// QUERY'S THE CURRENT ISSUE'S PROPOSAL COUNT
async function getProposalCount () {
  const res = await axios.get(`http://${host}/proposals/count`)
  console.log(res.data)
  return res.data.proposalCount
}

// QUERY'S ALL THE DEV_PROPOSALS ON THE NETWORK
async function queryDevProposals () {
  const res = await axios.get(`http://${host}/proposals/dev`)
  console.log(res.data.devProposals)
}

// QUERY'S THE MOST RECENT DEV_PROPOSAL ON THE NETWORK
async function queryLatestDevProposal () {
  const res = await axios.get(`http://${host}/proposals/dev/latest`)
  console.log(res.data.devProposal)
}

// QUERY'S THE CURRENT DEV_PROPOSAL COUNT ON THE NETWORK
async function getDevProposalCount () {
  const res = await axios.get(`http://${host}/proposals/dev/count`)
  console.log(res.data)
  return res.data.devProposalCount
}

// COMMAND TO VOTE FOR A PROPOSAL
vorpal.command('vote proposal <from> <num> <amount>', 'vote for proposal <num> on the latest issue with <amount> coins')
  .action(async (args, callback) => {
    const from = walletEntries[args.from]
    const latest = await getIssueCount()
    const tx = {
      type: 'vote',
      from: from.address,
      issue: crypto.hash(`issue-${latest}`),
      proposal: crypto.hash(`issue-${latest}-proposal-${args.num}`),
      amount: args.amount,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO VOTE FOR A DEV_PROPOSAL
// TODO
vorpal.command('vote dev proposal <from> <num> <type> <amount>', 'vote <type>(yes | no) for dev proposal <num> with <amount> coins')
  .action(async (args, callback) => {
    const from = walletEntries[args.from]
    let approve

    if (args.type === 'yes') approve = true
    else approve = false

    const tx = {
      type: 'dev_vote',
      from: from.address,
      devProposal: crypto.hash(`dev-proposal-${args.num}`),
      amount: args.amount,
      approve,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO SUBMIT A PROPOSAL
vorpal.command('submit proposal <from> <reward> <interval> <amount>', 'submits a proposal to change network parameters')
  .action(async (args, callback) => {
    const from = walletEntries[args.from]
    const issue = await getIssueCount()
    const proposal = await getProposalCount()
    const parameters = {
      nodeRewardInterval: args.interval * ONE_SECOND,
      nodeRewardAmount: args.reward,
      nodePenalty: 1000,
      transactionFee: 1,
      stakeRequired: 10000,
      maintenanceInterval: ONE_MINUTE,
      maintenanceFee: 0.0001,
      devFundInterval: 300,
      devFundAmount: 10000,
      proposalFee: 500,
      devProposalFee: 200
    }
    const tx = {
      type: 'proposal',
      from: from.address,
      to: '0'.repeat(64),
      proposal: crypto.hash(`issue-${issue}-proposal-${proposal + 1}`),
      issue: crypto.hash(`issue-${issue}`),
      parameters: parameters,
      amount: args.amount,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO SUBMIT A DEV_PROPOSAL
// TODO
vorpal.command('submit dev proposal <from> <funds> <interval> <amount>', 'submits a development proposal to the network')
  .action(async (args, callback) => {
    const from = walletEntries[args.from]
    const count = await getDevProposalCount()
    const tx = {
      type: 'dev_proposal',
      from: from.address,
      to: '0'.repeat(64),
      devProposal: crypto.hash(`dev-proposal-${count}`),
      funds: args.funds,
      interval: args.interval,
      amount: args.amount,
      payAddress: from.address,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO STAKE TOKENS IN ORDER TO RUN A NODE
// TODO
vorpal.command('stake tokens <amount> <from>', 'submits a transaction to stake coins in a bond account in order to operate a node')
  .action((args, callback) => {
    const from = walletEntries[args.from]
    const tx = {
      type: 'stake',
      from: from.address,
      stake: args.amount,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO SPAM THE NETWORK WITH A SPECIFIC TRANSACTION TYPE
// TODO ADD LIBERDUS SPECIFIC TRANSACTIONS TO THIS
vorpal
  .command(
    'spam transactions <type> <accounts> <count> <tps> <ports>',
    'spams the network with <type> transactions <count> times, with <account> number of accounts, at <tps> transactions per second'
  )
  .action(async function (args, callback) {
    const accounts = createAccounts(args.accounts)
    const txs = makeTxGenerator(accounts, args.count, args.type)
    const seedNodes = await getSeedNodes()
    console.log('SEED_NODES:', seedNodes)
    const ports = seedNodes.map(url => url.port)
    await spamTxs({ txs, rate: args.tps, ports, saveFile: 'spam-test.json' })
    this.log('Done spamming...')
    callback()
  })

// COMMAND TO SUBMIT A SNAPSHOT OF THE ULT CONTRACT (ADMIN ONLY)
vorpal.command('submit snapshot <from>', 'Submits the snapshot data of the ULT contract to the liberdus network')
  .action((args, callback) => {
    const from = walletEntries[args.from]
    const snapshot = require(resolve('snapshot.json'))
    console.log(snapshot)
    const tx = {
      type: 'snapshot',
      from: from.address,
      to: '0'.repeat(64),
      snapshot,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO INITIALIZE STARTING NETWORK PARAMETERS (ADMIN ONLY)
vorpal.command('init parameters <from>', 'Submits the signed transaction from the ADMIN account to initialize the network parameters')
  .action((args, callback) => {
    const from = walletEntries[args.from]
    const tx = {
      type: 'initial_parameters',
      from: from.address,
      to: '0'.repeat(64),
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO MANUALLY UPDATE THE NETWORK PARAMETERS (TESTING ONLY)
vorpal.command('update parameters <from>', 'updates the list of network parameters for testing purposes')
  .action((args, callback) => {
    const from = walletEntries[args.from]
    const tx = {
      type: 'update_parameters',
      from: from.address,
      to: '0'.repeat(64),
      nodeRewardInterval: 10,
      nodeRewardAmount: 500,
      nodePenalty: 70000,
      transactionFee: 50,
      stakeRequired: 420,
      maintenanceFee: 10,
      devFundAmount: 3000,
      proposalFee: 1000,
      expenditureFee: 500,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO CLAIM THE TOKENS FROM THE ULT SNAPSHOT
// TODO VALIDATE ETHEREUM ADDRESS SOMEHOW
vorpal.command('snapshot claim <from>', 'Submits the claim for the snapshot belonging to <from>')
  .action((args, callback) => {
    const from = walletEntries[args.from]
    const tx = {
      type: 'snapshot_claim',
      from: from.address,
      to: '0'.repeat(64),
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO SET THE HOST IP:PORT
vorpal.command('use <host>', 'Uses the given <host> as the coin-app node for queries and transactions.')
  .action(function (args, callback) {
    host = args.host
    this.log(`Set ${args.host} as coin-app node for transactions.`)
    callback()
  })

// COMMAND TO CREATE A LOCAL WALLET KEYPAIR
vorpal.command('wallet create <name> [id]', 'Creates a wallet with the given <name> and [id]. Makes [id] = hash(<name>) if [id] is not given.')
  .action(function (args, callback) {
    if (typeof walletEntries[args.name] !== 'undefined' && walletEntries[args.name] !== null) {
      this.log(`Wallet named '${args.name}' already exists.`)
      callback()
    } else {
      const publicKey = createEntry(args.name, args.id)
      this.log(`Created wallet '${args.name}': '${publicKey}'.`)
      callback()
    }
  })

// COMMAND TO LIST ALL THE WALLET ENTRIES YOU HAVE LOCALLY
vorpal.command('wallet list [name]', 'Lists wallet for the given [name]. Otherwise, lists all wallets.')
  .action(function (args, callback) {
    let wallet = walletEntries[args.name]
    if (typeof wallet !== 'undefined' && wallet !== null) {
      this.log(`${JSON.stringify(wallet, null, 2)}`)
    } else {
      this.log(`${JSON.stringify(walletEntries, null, 2)}`)
    }
    callback()
  })

// COMMAND TO CREATE TOKENS FOR A USER ACCOUNT ON THE NETWORK (TEST ONLY)
vorpal.command('tokens create <amount> <target>', 'creates <amount> tokens for the <target> account')
  .action(function (args, callback) {
    const target = walletEntries[args.target]
    const tx = {
      type: 'create',
      from: '0'.repeat(64),
      to: target.address,
      timestamp: Date.now(),
      amount: args.amount
    }
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO TRANSFER TOKENS FROM ONE ACCOUNT TO ANOTHER
vorpal.command('tokens transfer <amount> <from> <to>', 'transfers <amount> tokens from <from> account to <to> account')
  .action(async function (args, callback) {
    const from = walletEntries[args.from]
    const to = await getAddress(args.to)
    const tx = {
      type: 'transfer',
      from: from.address,
      to: to,
      amount: args.amount,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO SEND SOME AMOUNT OF TOKENS TO MULTIPLE ACCOUNTS
vorpal.command('tokens distribute <amount> <from> [recipients...]', 'Transfers <amount> tokens from the <source> wallet to each of the [recipients] wallets.')
  .action((args, callback) => {
    const from = walletEntries[args.from]
    const recipients = args.recipients.map(name => walletEntries[name].address)
    const tx = {
      type: 'distribute',
      from: from.address,
      recipients: recipients,
      amount: args.amount,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO REGISTER AN ALIAS FOR A USER ACCOUNT
vorpal.command('register alias <alias> <from>', 'Registers a unique <alias> for the <from> account on the server')
  .action((args, callback) => {
    const from = walletEntries[args.from]
    const tx = {
      type: 'register',
      id: crypto.hash(args.alias),
      from: from.address,
      alias: args.alias,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO ADD A FRIEND TO YOUR USER ACCOUNT'S FRIEND LIST
vorpal.command('add friend <to> <from>', 'adds a friend <to> to account <from>')
  .action(async function (args, callback) {
    const from = walletEntries[args.from]
    const to = await getAddress(args.to)
    if (to === undefined || to === null) {
      this.log("Target account doesn't exist for: ", args.target)
      callback()
    }
    const tx = {
      type: 'friend',
      handle: args.target,
      srcAcc: from.address,
      tgtAcc: to,
      amount: 1,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO REMOVE A FRIEND FROM YOUR USER ACCOUNT'S FRIEND LIST
vorpal.command('remove friend <to> <from>', 'removes a friend <to> from account <from>')
  .action(async function (args, callback) {
    const from = walletEntries[args.from]
    const to = await getAddress(args.target)
    if (to === undefined || to === null) {
      this.log("Target account doesn't exist for: ", args.target)
      callback()
    }
    const tx = {
      type: 'remove_friend',
      from: from.address,
      to: to,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO SET A TOLL FOR PEOPLE NOT ON YOUR FRIENDS LIST THAT SEND YOU MESSAGES
vorpal.command('toll set <toll> <from>', 'sets the <toll> people must pay in tokens to send messages to the <from> account')
  .action(function (args, callback) {
    const from = walletEntries[args.from]
    const tx = {
      type: 'toll',
      from: from.address,
      toll: args.toll,
      amount: 1,
      timestamp: Date.now()
    }
    crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO SEND A MESSAGE TO ANOTHER USER ON THE NETWORK
vorpal.command('message send <message> <from> <to>', 'sends a private message from <from> to <to> that only <to> can decrypt')
  .action(async function (args, callback) {
    const from = walletEntries[args.from]
    const to = await getAddress(args.to)
    if (to === undefined || to === null) {
      this.log("Target account doesn't exist for: ", args.to)
      callback()
    }
    const message = stringify({
      body: args.message,
      timestamp: Date.now(),
      handle: args.from
    })
    // const encryptedMsg = crypto.encrypt(
    //   message,
    //   crypto.convertSkToCurve(from.keys.secretKey),
    //   crypto.convertPkToCurve(to)
    // );
    getToll(to, from.address).then(toll => {
      const tx = {
        type: 'message',
        from: from.address,
        to: to,
        message: message,
        amount: parseInt(toll),
        timestamp: Date.now()
      }
      crypto.signObj(tx, from.keys.secretKey, from.keys.publicKey)
      injectTx(tx).then(res => {
        this.log(res)
        callback()
      })
    })
  })

// COMMAND TO POLL FOR MESSAGES BETWEEN 2 USERS AFTER A SPECIFIED TIMESTAMP
vorpal.command('message poll <from> <to> <timestamp>', 'polls data for messages between <from> and <to> after specified timestamp')
  .action(async function (args, callback) {
    const from = walletEntries[args.from]
    const to = await getAddress(args.to)
    pollMessages(from.address, to, args.timestamp).then(
      messages => {
        messages = messages.map(message => {
          message = crypto.decrypt(
            message,
            crypto.convertSkToCurve(from.keys.secretKey),
            crypto.convertPkToCurve(to)
          ).message
          return JSON.parse(message)
        })
        this.log(messages)
      }
    )
    callback()
  })

// QUERY'S A LOCAL WALLET ACCOUNT OR ALL ACCOUNTS ON THE HOST IF LEFT BLANK
vorpal.command('query [account]', 'Queries network data for the account associated with the given [wallet]. Otherwise, gets all network data.')
  .action(async (args, callback) => {
    let address
    if (args.account !== undefined) address = walletEntries[args.account].address
    console.log(
      `Querying network for ${
        address ? `'${args.account}' wallet data` : 'all data'
      }:`
    )
    getAccountData(address).then(res => {
      try {
        const parsed = JSON.parse(res)
        res = JSON.stringify(parsed, null, 2)
      } catch (err) {
        console.log('Response is not a JSON object')
      } finally {
        console.log(res)
        callback()
      }
    })
  })

// COMMAND TO LOG OUT QUERYS FOR NETWORK DATA (ISSUES - PROPOSALS - DEV_PROPOSALS)
// TODO ADD MORE QUERYS HERE
vorpal.command('get <type> [amount]', 'query the network for <type> account with [amount] results, leaving out the amount will return all results')
  .action(async (args, callback) => {
    switch (args.type) {
      case 'latestIssue' : {
        queryLatestIssue()
        break
      }
      case 'issues' : {
        queryIssues()
        break
      }
      case 'latestProposal' : {
        queryLatestProposals()
        break
      }
      case 'proposals' : {
        queryProposals()
        break
      }
      case 'latestDevProposal' : {
        queryLatestDevProposal()
        break
      }
      case 'devProposals': {
        queryDevProposals()
        break
      }
      default : {
        console.log('Query type unknown')
      }
    }
    callback()
  })

vorpal.delimiter('client$').show()
