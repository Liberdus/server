const fs = require('fs')
const { resolve } = require('path')
const path = require('path')
const vorpal = require('vorpal')()
const crypto = require('shardus-crypto-utils')
const stringify = require('fast-stable-stringify')
const axios = require('axios')
crypto('64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347')

// BEFORE TESTING LOCALLY, CHANGE THE ADMIN_ADDRESS IN LIBERDUS-SERVER TO ONE YOU HAVE LOCALLY

let USER
let HOST = process.argv[2] || 'localhost:9001'
console.log(`Using ${HOST} as coin-app node for queries and transactions.`)

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

console.log(`Loaded wallet entries from '${walletFile}'.`)

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
  return account
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
    const res = await axios.post(`http://${HOST}/inject`, tx)
    return res.data
  } catch (err) {
    return err.message
  }
}

async function getAccountData (id) {
  try {
    const res = await axios.get(`http://${HOST}/${id ? 'account/' + id : 'accounts'}`)
    return res.data
  } catch (err) {
    return err.message
  }
}

async function getToll (friendId, yourId) {
  try {
    let res = await axios.get(`http://${HOST}/account/${friendId}/${yourId}/toll`)
    let { toll } = res.data
    return toll
  } catch (err) {
    return err.message
  }
}

async function getAddress (handle) {
  if (handle.length === 64) return handle
  try {
    let res = await axios.get(`http://${HOST}/address/${crypto.hash(handle)}`)
    const { address, error } = res.data
    if (error) {
      console.log(error)
    } else {
      return address
    }
  } catch (e) {
    console.log(e)
  }
}

async function pollMessages (to, from, timestamp) {
  try {
    const res = await axios.get(`http://${HOST}/messages/${to}/${from}/${timestamp}`)
    const { messages } = res.data
    return messages
  } catch (err) {
    return err.message
  }
}

// QUERY'S ALL NETWORK ISSUES
async function queryIssues () {
  const res = await axios.get(`http://${HOST}/issues`)
  return res.data.issues
}

// QUERY'S ALL NETWORK DEV_ISSUES
async function queryDevIssues () {
  const res = await axios.get(`http://${HOST}/issues/dev`)
  return res.data.devIssues
}

// QUERY'S THE MOST RECENT NETWORK ISSUE
async function queryLatestIssue () {
  const res = await axios.get(`http://${HOST}/issues/latest`)
  return res.data.issue
}

// QUERY'S THE MOST RECENT NETWORK DEV_ISSUE
async function queryLatestDevIssue () {
  const res = await axios.get(`http://${HOST}/issues/dev/latest`)
  return res.data.devIssue
}

// QUERY'S THE CURRENT NETWORK ISSUE COUNT
async function getIssueCount () {
  const res = await axios.get(`http://${HOST}/issues/count`)
  return res.data.issueCount
}

// QUERY'S THE CURRENT NETWORK DEV_ISSUE COUNT
async function getDevIssueCount () {
  const res = await axios.get(`http://${HOST}/issues/dev/count`)
  return res.data.devIssueCount
}

// QUERY'S ALL NETWORK PROPOSALS
async function queryProposals () {
  const res = await axios.get(`http://${HOST}/proposals`)
  return res.data.proposals
}

// QUERY'S ALL NETWORK DEV_PROPOSALS
async function queryDevProposals () {
  const res = await axios.get(`http://${HOST}/proposals/dev`)
  return res.data.devProposals
}

// QUERY'S ALL PROPOSALS ON THE LATEST ISSUE
async function queryLatestProposals () {
  const res = await axios.get(`http://${HOST}/proposals/latest`)
  return res.data.proposals
}

// QUERY'S ALL PROPOSALS ON THE LATEST ISSUE
async function queryLatestDevProposals () {
  const res = await axios.get(`http://${HOST}/proposals/dev/latest`)
  return res.data.devProposals
}

// QUERY'S THE CURRENT ISSUE'S PROPOSAL COUNT
async function getProposalCount () {
  const res = await axios.get(`http://${HOST}/proposals/count`)
  return res.data.proposalCount
}

// QUERY'S THE CURRENT ISSUE'S PROPOSAL COUNT
async function getDevProposalCount () {
  const res = await axios.get(`http://${HOST}/proposals/dev/count`)
  return res.data.devProposalCount
}

// COMMAND TO VOTE FOR A PROPOSAL
vorpal.command('vote <num> <amount>', 'vote for proposal <num> with <amount> coins')
  .action(async (args, callback) => {
    const latest = await getIssueCount()
    let proposals = await queryLatestProposals()
    if (proposals.length < 1) {
      this.log('There are currently no active proposals to vote on')
      callback()
    }
    this.log('Here are the current proposals')
    for (const prop of proposals) {
      this.log(prop)
    }

    proposals = proposals.map(prop => ({
      name: prop.number,
      value: prop.number,
      short: prop.number
    }))

    const answers = await this.prompt([{
      type: 'list',
      name: 'proposal',
      message: 'Pick the proposal number',
      choices: [...proposals],
      filter: value => parseInt(value)
    },
    {
      type: 'number',
      name: 'amount',
      message: 'How many tokens will you vote with?',
      default: 50,
      filter: value => parseInt(value)
    }])

    const tx = {
      type: 'vote',
      from: USER.address,
      issue: crypto.hash(`issue-${latest}`),
      proposal: crypto.hash(`issue-${latest}-proposal-${answers.proposal}`),
      amount: answers.amount,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO VOTE FOR A DEV_PROPOSAL
vorpal.command('vote dev', 'vote for a development proposal')
  .action(async function (args, callback) {
    const latest = await getDevIssueCount()
    let devProposals = await queryLatestDevProposals()
    if (devProposals.length < 1) {
      this.log('There are currently no active development proposals to vote on')
      callback()
    }
    this.log('Here are the current developer proposals')
    for (const prop of devProposals) {
      this.log(prop)
    }
    devProposals = devProposals.map(prop => ({
      name: prop.number,
      value: prop.number,
      short: prop.description
    }))

    const answers = await this.prompt([{
      type: 'list',
      name: 'proposal',
      message: 'Pick the dev proposal number',
      choices: [...devProposals],
      filter: value => parseInt(value)
    },
    {
      type: 'list',
      name: 'approve',
      message: 'Choose your vote',
      choices: [{ name: 'approve', value: true, short: true }, { name: 'reject', value: false, short: false }]
    },
    {
      type: 'number',
      name: 'amount',
      message: 'How many tokens will you vote with?',
      default: 50,
      filter: value => parseInt(value)
    }])

    const tx = {
      type: 'dev_vote',
      from: USER.address,
      devIssue: crypto.hash(`dev-issue-${latest}`),
      devProposal: crypto.hash(`dev-issue-${latest}-dev-proposal-${answers.proposal}`),
      amount: answers.amount,
      approve: answers.approve,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO SUBMIT A PROPOSAL
vorpal.command('proposal', 'submits a proposal to change network parameters')
  .action(async function (args, callback) {
    const answers = await this.prompt([{
      type: 'number',
      name: 'nodeRewardInterval',
      message: 'Specify node reward interval (in minutes)',
      default: 1,
      filter: value => parseInt(value)
    },
    {
      type: 'number',
      name: 'nodeRewardAmount',
      message: 'Specify node reward amount',
      default: 10,
      filter: value => parseInt(value)
    },
    {
      type: 'number',
      name: 'nodePenalty',
      message: 'Specify node penalty amount',
      default: 100,
      filter: value => parseInt(value)
    },
    {
      type: 'number',
      name: 'transactionFee',
      message: 'Specify transaction fee',
      default: 0,
      filter: value => parseInt(value)
    },
    {
      type: 'number',
      name: 'stakeRequired',
      message: 'Specify stake requirement',
      default: 100,
      filter: value => parseInt(value)
    },
    {
      type: 'number',
      name: 'maintenanceInterval',
      message: 'Specify maintenance interval (in minutes)',
      default: 2,
      filter: value => parseInt(value)
    },
    {
      type: 'number',
      name: 'maintenanceFee',
      message: 'Specify maintenance fee',
      default: 0.0001,
      filter: value => parseFloat(value)
    },
    {
      type: 'number',
      name: 'proposalFee',
      message: 'Specify proposal fee',
      default: 300,
      filter: value => parseInt(value)
    },
    {
      type: 'number',
      name: 'devProposalFee',
      message: 'Specify dev proposal fee',
      default: 100,
      filter: value => parseInt(value)
    }])
    const issue = await getIssueCount()
    const proposalCount = await getProposalCount()
    const tx = {
      type: 'proposal',
      from: USER.address,
      to: '0'.repeat(64),
      proposal: crypto.hash(`issue-${issue}-proposal-${proposalCount + 1}`),
      issue: crypto.hash(`issue-${issue}`),
      parameters: answers,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO SUBMIT A DEV_PROPOSAL
vorpal.command('dev proposal', 'submits a development proposal')
  .action(async function (_, callback) {
    const answers = await this.prompt([{
      type: 'number',
      name: 'totalAmount',
      message: 'Enter the requested funds',
      default: 10000,
      filter: value => parseInt(value)
    },
    {
      type: 'input',
      name: 'description',
      message: 'Enter a description for your developer proposal',
      default: `${USER.address.slice(0, 5)}... proposal`
    },
    {
      type: 'input',
      name: 'payAddress',
      message: 'Enter the address for payment if the proposal is approved',
      default: USER.address
    },
    {
      type: 'list',
      name: 'plan',
      message: 'Select the payment plan',
      choices: ['single', 'multiple']
    }])

    let paymentCount, delay

    if (answers.plan === 'multiple') {
      await this.prompt([{
        type: 'number',
        name: 'count',
        message: 'Enter the number of payments',
        default: 5,
        filter: value => parseInt(value)
      },
      {
        type: 'number',
        name: 'delay',
        message: 'Enter the delay between payments (in minutes)',
        default: 1,
        filter: value => parseInt(value)
      }], result => {
        paymentCount = result.count
        delay = result.delay * ONE_MINUTE
      })
    } else {
      paymentCount = 1
      delay = 0
    }

    const payments = new Array(paymentCount).fill(1).map((_, i) => ({
      amount: (1 / paymentCount),
      delay: delay * i
    }))

    const latestIssue = await getDevIssueCount()
    const count = await getDevProposalCount()
    const tx = {
      type: 'dev_proposal',
      from: USER.address,
      devIssue: crypto.hash(`dev-issue-${latestIssue}`),
      devProposal: crypto.hash(`dev-issue-${latestIssue}-dev-proposal-${count + 1}`),
      totalAmount: answers.totalAmount,
      payments: payments,
      description: answers.description,
      payAddress: answers.payAddress,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO STAKE TOKENS IN ORDER TO RUN A NODE
// TODO
vorpal.command('stake <amount>', 'stakes <amount> tokens in order to operate a node')
  .action(function (args, callback) {
    const tx = {
      type: 'stake',
      from: USER.address,
      stake: args.amount,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
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
vorpal.command('snapshot', 'submits the snapshot the ULT contract')
  .action(function (_, callback) {
    const snapshot = require(resolve('snapshot.json'))
    this.log(snapshot)
    const tx = {
      type: 'snapshot',
      from: USER.address,
      to: '0'.repeat(64),
      snapshot,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO INITIALIZE STARTING NETWORK PARAMETERS (ADMIN ONLY)
vorpal.command('parameters', 'submits transaction to initialize the network parameters (ADMIN)')
  .action(function (_, callback) {
    const tx = {
      type: 'initial_parameters',
      from: USER.address,
      to: '0'.repeat(64),
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO MANUALLY UPDATE THE NETWORK PARAMETERS (TESTING ONLY)
vorpal.command('update parameters', 'updates the network parameters (TESTING)')
  .action((_, callback) => {
    const tx = {
      type: 'update_parameters',
      from: USER.address,
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
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO CLAIM THE TOKENS FROM THE ULT SNAPSHOT
// TODO VALIDATE ETHEREUM ADDRESS SOMEHOW
vorpal.command('claim', 'submits a claim transaction for the snapshot')
  .action((_, callback) => {
    const tx = {
      type: 'snapshot_claim',
      from: USER.address,
      to: '0'.repeat(64),
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO SET THE HOST IP:PORT
vorpal.command('use <host>', 'uses <host> as the node for queries and transactions')
  .action(function (args, callback) {
    HOST = args.host
    this.log(`Set ${args.host} as coin-app node for transactions.`)
    callback()
  })

// COMMAND TO CREATE A LOCAL WALLET KEYPAIR
vorpal.command('wallet create <name>', 'creates a wallet <name> and [id]. Makes [id] = hash(<name>) if [id] is not given')
  .action(function (args, callback) {
    if (typeof walletEntries[args.name] !== 'undefined' && walletEntries[args.name] !== null) {
      return walletEntries[args.name]
    } else {
      const user = createEntry(args.name, args.id)
      return user
    }
  })

// COMMAND TO LIST ALL THE WALLET ENTRIES YOU HAVE LOCALLY
vorpal.command('wallet list [name]', 'lists wallet for [name]. Otherwise, lists all wallets')
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
vorpal.command('create <amount> <target>', 'creates <amount> tokens for the <target> account')
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
vorpal.command('transfer <amount> <to>', 'transfers <amount> tokens to <to> account')
  .action(async function (args, callback) {
    const to = await getAddress(args.to)
    const tx = {
      type: 'transfer',
      from: USER.address,
      to: to,
      amount: args.amount,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO SEND SOME AMOUNT OF TOKENS TO MULTIPLE ACCOUNTS
vorpal.command('distribute <amount> [recipients...]', 'distributes <amount> tokens to all [recipients].')
  .action((args, callback) => {
    const recipients = args.recipients.map(name => walletEntries[name].address)
    const tx = {
      type: 'distribute',
      from: USER.address,
      recipients: recipients,
      amount: args.amount,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      console.log(res)
      callback()
    })
  })

// COMMAND TO REGISTER AN ALIAS FOR A USER ACCOUNT
vorpal.command('register <alias>', 'registers a unique <alias> for your account')
  .action(function (args, callback) {
    const tx = {
      type: 'register',
      aliasHash: crypto.hash(args.alias),
      from: USER.address,
      alias: args.alias,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO ADD A FRIEND TO YOUR USER ACCOUNT'S FRIEND LIST
vorpal.command('add friend <to>', 'adds the friend <to> to your account')
  .action(async function (args, callback) {
    const to = await getAddress(args.to)
    if (to === undefined || to === null) {
      this.log("Target account doesn't exist for: ", args.target)
      callback()
    }
    const tx = {
      type: 'friend',
      handle: args.target,
      srcAcc: USER.address,
      tgtAcc: to,
      amount: 1,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO REMOVE A FRIEND FROM YOUR USER ACCOUNT'S FRIEND LIST
vorpal.command('remove friend <to>', 'removes the friend <to> from your account')
  .action(async function (args, callback) {
    const to = await getAddress(args.target)
    if (to === undefined || to === null) {
      this.log("Target account doesn't exist for: ", args.target)
      callback()
    }
    const tx = {
      type: 'remove_friend',
      from: USER.address,
      to: to,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO SET A TOLL FOR PEOPLE NOT ON YOUR FRIENDS LIST THAT SEND YOU MESSAGES
vorpal.command('toll <toll>', 'sets <toll> people must pay in tokens to send you messages')
  .action(function (args, callback) {
    const tx = {
      type: 'toll',
      from: USER.address,
      toll: args.toll,
      amount: 1,
      timestamp: Date.now()
    }
    crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
    injectTx(tx).then(res => {
      this.log(res)
      callback()
    })
  })

// COMMAND TO SEND A MESSAGE TO ANOTHER USER ON THE NETWORK
vorpal.command('message send <message> <to>', 'sends a message to <to>')
  .action(async function (args, callback) {
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
    //   crypto.convertSkToCurve(USER.keys.secretKey),
    //   crypto.convertPkToCurve(to)
    // );
    getToll(to, USER.address).then(toll => {
      const tx = {
        type: 'message',
        from: USER.address,
        to: to,
        message: message,
        amount: parseInt(toll),
        timestamp: Date.now()
      }
      crypto.signObj(tx, USER.keys.secretKey, USER.keys.publicKey)
      injectTx(tx).then(res => {
        this.log(res)
        callback()
      })
    })
  })

// COMMAND TO POLL FOR MESSAGES BETWEEN 2 USERS AFTER A SPECIFIED TIMESTAMP
vorpal.command('message poll <to> <timestamp>', 'gets messages between you and <to> after <timestamp>')
  .action(async function (args, callback) {
    const to = await getAddress(args.to)
    pollMessages(USER.address, to, args.timestamp).then(
      messages => {
        messages = messages.map(message => {
          message = crypto.decrypt(
            message,
            crypto.convertSkToCurve(USER.keys.secretKey),
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
vorpal.command('query [account]', 'gets data for the account associated with the given [wallet]. Otherwise, gets all network data.')
  .action(async function (args, callback) {
    let address
    if (args.account !== undefined) address = walletEntries[args.account].address
    this.log(`Querying network for ${address ? args.account : 'all data'} `)
    getAccountData(address).then(res => {
      try {
        this.log(res)
      } catch (err) {
        this.log(err)
      } finally {
        callback()
      }
    })
  })

// COMMAND TO LOG OUT QUERYS FOR NETWORK DATA (ISSUES - PROPOSALS - DEV_PROPOSALS)
// TODO ADD MORE QUERYS HERE
vorpal.command('get <type>', 'query the network for <type> account')
  .action(async function (args, callback) {
    switch (args.type) {
      case 'account': {
        const answer = await this.prompt({
          type: 'input',
          name: 'alias',
          message: 'Enter alias: '
        })
        this.log(await getAddress(answer.alias))
        const address = await getAddress(answer.alias)
        this.log(await getAccountData(address))
        break
      }
      case 'latestIssue' : {
        this.log(await queryLatestIssue())
        break
      }
      case 'latestDevIssue' : {
        this.log(await queryLatestDevIssue())
        break
      }
      case 'issues' : {
        this.log(await queryIssues())
        break
      }
      case 'devIssues' : {
        this.log(await queryDevIssues())
        break
      }
      case 'latestProposals' : {
        this.log(await queryLatestProposals())
        break
      }
      case 'latestDevProposals' : {
        this.log(await queryLatestDevProposals())
        break
      }
      case 'proposals' : {
        this.log(await queryProposals())
        break
      }
      case 'devProposals' : {
        this.log(await queryDevProposals())
        break
      }
      default : {
        this.log('Query type unknown')
      }
    }
    callback()
  })

vorpal.command('init', 'sets the user wallet if it exists, else creates it')
  .action((_, callback) => {
    vorpal.activeCommand.prompt({
      type: 'input',
      name: 'user',
      message: 'Enter wallet name: '
    }, result => {
      callback(null, vorpal.execSync('wallet create ' + result.user))
    })
  })

vorpal.delimiter('>').show()
vorpal.exec('init').then(res => (USER = res))
