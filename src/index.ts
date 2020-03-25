import './@types'
import { TIME, INITIAL_PARAMETERS, NODE_PARAMS } from './parameters'
import axios from 'axios'
import * as _ from 'lodash'
import shardus from 'shardus-global-server'
import Shardus = require('shardus-global-server/src/shardus/shardus-types')
import Decimal from 'decimal.js'
import stringify = require('fast-stable-stringify')
import * as crypto from 'shardus-crypto-utils'
import config, { cycleDuration } from './config'
import { _sleep, maintenanceAmount, syncParameters, syncDevParameters } from './utils'
import {
  nodeReward,
  generateIssue,
  generateDevIssue,
  tallyVotes,
  tallyDevVotes,
  applyParameters,
  applyDevParameters,
  releaseDeveloperFunds,
} from './transactions'
import {
  createAccount,
  createNode,
  createChat,
  createAlias,
  createNetworkAccount,
  createIssue,
  createDevIssue,
  createProposal,
  createDevProposal,
} from './accounts'

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

// THE ENTIRE APP STATE FOR THIS NODE
export let accounts: { [id: string]: Account } = {}
export const networkAccount = '0'.repeat(64)
export const dapp = shardus(config)

// SDK SETUP FUNCTIONS
dapp.setup({
  async sync(): Promise<void> {
    if (dapp.p2p.isFirstSeed) {
      await _sleep(TIME.ONE_SECOND * 20)
      const timestamp = Date.now()
      const nodeId = dapp.getNodeId()
      const address = dapp.getNode(nodeId).address
      const proposalWindow = [timestamp, timestamp + TIME.PROPOSALS]
      const votingWindow = [proposalWindow[1], proposalWindow[1] + TIME.VOTING]
      const graceWindow = [votingWindow[1], votingWindow[1] + TIME.GRACE]
      const applyWindow = [graceWindow[1], graceWindow[1] + TIME.APPLY]

      const devProposalWindow = [timestamp, timestamp + TIME.DEV_PROPOSALS]
      const devVotingWindow = [devProposalWindow[1], devProposalWindow[1] + TIME.DEV_VOTING]
      const devGraceWindow = [devVotingWindow[1], devVotingWindow[1] + TIME.DEV_GRACE]
      const devApplyWindow = [devGraceWindow[1], devGraceWindow[1] + TIME.DEV_APPLY]
      NODE_PARAMS.CURRENT = INITIAL_PARAMETERS
      NODE_PARAMS.NEXT = {}
      NODE_PARAMS.WINDOWS = {
        proposalWindow,
        votingWindow,
        graceWindow,
        applyWindow,
      }
      NODE_PARAMS.NEXT_WINDOWS = {}
      NODE_PARAMS.DEV_WINDOWS = {
        devProposalWindow,
        devVotingWindow,
        devGraceWindow,
        devApplyWindow,
      }
      NODE_PARAMS.NEXT_DEV_WINDOWS = {}
      NODE_PARAMS.DEVELOPER_FUND = []
      NODE_PARAMS.NEXT_DEVELOPER_FUND = []
      NODE_PARAMS.ISSUE = 1
      NODE_PARAMS.DEV_ISSUE = 1
      NODE_PARAMS.IN_SYNC = true

      const tx = {
        type: 'init_network',
        nodeId,
        from: address,
        network: networkAccount,
        timestamp: Date.now(),
      }
      dapp.put(tx)
      dapp.log('GENERATED_NETWORK: ', nodeId)

      dapp.set({
        type: 'issue',
        nodeId,
        from: address,
        to: networkAccount,
        issue: crypto.hash(`issue-${NODE_PARAMS.ISSUE}`),
        proposal: crypto.hash(`issue-${NODE_PARAMS.ISSUE}-proposal-1`),
        timestamp: Date.now(),
      })
      dapp.set({
        type: 'dev_issue',
        nodeId,
        from: address,
        to: networkAccount,
        devIssue: crypto.hash(`dev-issue-${NODE_PARAMS.DEV_ISSUE}`),
        timestamp: Date.now(),
      })
      await _sleep(TIME.ONE_SECOND * 10)
    } else {
      let account = await dapp.getRemoteAccount(networkAccount)
      while (!account) {
        await _sleep(1000)
        account = await dapp.getRemoteAccount(networkAccount)
      }
      if (account && account.data) {
        NODE_PARAMS.CURRENT = account.data.current
        NODE_PARAMS.NEXT = account.data.next
        NODE_PARAMS.WINDOWS = account.data.windows
        NODE_PARAMS.DEV_WINDOWS = account.data.devWindows
        NODE_PARAMS.NEXT_WINDOWS = account.data.nextWindows
        NODE_PARAMS.NEXT_DEV_WINDOWS = account.data.nextDevWindows
        NODE_PARAMS.DEVELOPER_FUND = account.data.developerFund
        NODE_PARAMS.NEXT_DEVELOPER_FUND = account.data.nextDeveloperFund
        NODE_PARAMS.ISSUE = account.data.issue
        NODE_PARAMS.DEV_ISSUE = account.data.devIssue
        NODE_PARAMS.IN_SYNC = true
      } else {
        dapp.log('ERROR: Unable to sync network data')
      }
    }
  },
  validateTransaction(tx: any, wrappedStates: { [id: string]: WrappedAccount }): Shardus.IncomingTransactionResult {
    const response: Shardus.IncomingTransactionResult = {
      success: false,
      reason: 'Transaction is not valid.',
    }

    const from = wrappedStates[tx.from] && wrappedStates[tx.from].data
    const to = wrappedStates[tx.to] && wrappedStates[tx.to].data

    switch (tx.type) {
      case 'init_network': {
        response.success = true
        response.reason = 'This transaction is valid'
        return response
      }
      case 'snapshot': {
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'email': {
        const source: UserAccount = wrappedStates[tx.signedTx.from] && wrappedStates[tx.signedTx.from].data
        if (!source) {
          response.reason = 'no account associated with address in signed tx'
          return response
        }
        if (tx.signedTx.sign.owner !== tx.signedTx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx.signedTx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (tx.signedTx.emailHash !== crypto.hash(tx.email)) {
          response.reason = 'Hash of the email does not match the signed email hash'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'gossip_email_hash': {
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'verify': {
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (typeof from.verified !== 'string') {
          response.reason = 'From account has not been sent a verification email'
          return response
        }
        if (typeof from.verified === 'boolean') {
          response.reason = 'From account has already been verified'
          return response
        }
        if (crypto.hash(tx.code) !== from.verified) {
          response.reason = 'Hash of code in tx does not match the hash of the verification code sent'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'register': {
        const alias: AliasAccount = wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!alias) {
          response.reason = 'Alias account was not found for some reason'
          return response
        }
        if (alias.inbox === tx.alias) {
          response.reason = 'This alias is already taken'
          return response
        }
        // if (from.data.balance < CURRENT.transactionFee) {
        //   response.reason = "From account doesn't have enough tokens to cover the transaction fee"
        //   return response
        // }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'create': {
        if (to === undefined || to === null) {
          response.reason = "target account doesn't exist"
          return response
        }
        if (tx.amount < 1) {
          response.reason = 'create amount needs to be positive (1 or greater)'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'transfer': {
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from === undefined || from === null) {
          response.reason = "from account doesn't exist"
          return response
        }
        if (to === undefined || to === null) {
          response.reason = "To account doesn't exist"
          return response
        }
        if (from.data.balance < tx.amount + NODE_PARAMS.CURRENT.transactionFee) {
          response.reason = "from account doesn't have sufficient balance to cover the transaction"
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'distribute': {
        const recipients: UserAccount[] = tx.recipients.map((id: string) => wrappedStates[id].data)
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from === undefined || from === null) {
          response.reason = "from account doesn't exist"
          return response
        }
        for (const user of recipients) {
          if (!user) {
            response.reason = 'no account for one of the recipients'
            return response
          }
        }
        if (from.data.balance < recipients.length * tx.amount + NODE_PARAMS.CURRENT.transactionFee) {
          response.reason = "from account doesn't have sufficient balance to cover the transaction"
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'message': {
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (typeof from === 'undefined' || from === null) {
          response.reason = '"from" account does not exist.'
          return response
        }
        if (typeof to === 'undefined' || to === null) {
          response.reason = '"target" account does not exist.'
          return response
        }
        if (to.data.friends[tx.from]) {
          if (from.data.balance < 1) {
            response.reason = 'from account does not have sufficient funds.'
            return response
          }
        } else {
          if (from.data.balance < to.data.toll + NODE_PARAMS.CURRENT.transactionFee) {
            response.reason = 'from account does not have sufficient funds.'
            return response
          }
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'toll': {
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!from) {
          response.reason = 'from account does not exist'
          return response
        }
        if (from.data.balance < NODE_PARAMS.CURRENT.transactionFee) {
          response.reason = 'from account does not have sufficient funds to complete toll transaction'
          return response
        }
        if (!tx.toll) {
          response.reason = 'Toll was not defined in the transaction'
          return response
        }
        if (tx.toll < 1) {
          response.reason = 'Toll must be greater than or equal to 1'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'friend': {
        if (typeof from === 'undefined' || from === null) {
          response.reason = 'from account does not exist'
          return response
        }
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from.data.balance < NODE_PARAMS.CURRENT.transactionFee) {
          response.reason = "From account doesn't have enough tokens to cover the transaction fee"
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'remove_friend': {
        if (typeof from === 'undefined' || from === null) {
          response.reason = 'from account does not exist'
          return response
        }
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from.data.balance < NODE_PARAMS.CURRENT.transactionFee) {
          response.reason = "From account doesn't have enough tokens to cover the transaction fee"
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'stake': {
        if (typeof from === 'undefined' || from === null) {
          response.reason = 'from account does not exist'
          return response
        }
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from.data.balance < NODE_PARAMS.CURRENT.stakeRequired) {
          response.reason = `From account has insufficient balance, the cost required to operate a node is ${NODE_PARAMS.CURRENT.stakeRequired}`
          return response
        }
        if (tx.stake < NODE_PARAMS.CURRENT.stakeRequired) {
          response.reason = `Stake amount sent: ${tx.stake} is less than the cost required to operate a node: ${NODE_PARAMS.CURRENT.stakeRequired}`
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'node_reward': {
        // const network = wrappedStates[tx.network] && wrappedStates[tx.network].data
        // dapp.log(network.current.nodeRewardInterval)
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        // if (
        //   tx.timestamp - nodeInfo.activeTimestamp <
        //   CURRENT.nodeRewardInterval
        // ) {
        //   response.reason = 'Too early for this node to get paid'
        //   return response
        // }
        if (tx.amount !== NODE_PARAMS.CURRENT.nodeRewardAmount) {
          console.log('CURRENT: ' + stringify(NODE_PARAMS.CURRENT))
          response.reason = `${config.server.ip.externalPort}:  Amount sent in the transaction ${tx.amount} doesn't match the current network nodeRewardAmount parameter ${NODE_PARAMS.CURRENT.nodeRewardAmount}`
          return response
        }
        if (!from) {
          response.success = true
          response.reason = 'This transaction in valid'
          return response
        }
        if (from) {
          if (!from.nodeRewardTime) {
            response.success = true
            response.reason = 'This transaction in valid'
            return response
          }
          if (tx.timestamp - from.nodeRewardTime < NODE_PARAMS.CURRENT.nodeRewardInterval) {
            response.reason = 'Too early for this node to get paid'
            return response
          }
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'snapshot_claim': {
        if (from === undefined || from === null) {
          response.reason = "from account doesn't exist"
          return response
        }
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (from.claimedSnapshot) {
          response.reason = 'Already claimed tokens from the snapshot'
          return response
        }
        if (!to) {
          response.reason = 'Snapshot account does not exist yet, OR wrong snapshot address provided in the "to" field'
          return response
        }
        if (!to.snapshot) {
          response.reason = 'Snapshot hasnt been taken yet'
          return response
        }
        if (!to.snapshot[tx.from]) {
          response.reason = 'Your address did not hold any ULT on the Ethereum blockchain during the snapshot'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'issue': {
        const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (issue.active !== null) {
          response.reason = 'Issue is already active'
          return response
        }
        const networkIssueHash = crypto.hash(`issue-${NODE_PARAMS.ISSUE}`)
        if (tx.issue !== networkIssueHash) {
          response.reason = `issue hash (${tx.issue}) does not match current network issue hash (${networkIssueHash})`
          return response
        }
        const networkProposalHash = crypto.hash(`issue-${NODE_PARAMS.ISSUE}-proposal-1`)
        if (tx.proposal !== networkProposalHash) {
          response.reason = `proposalHash (${tx.proposal}) does not match the current default network proposal (${networkProposalHash})`
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_issue': {
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (devIssue.active !== null) {
          response.reason = 'devIssue is already active'
          return response
        }
        const networkDevIssueHash = crypto.hash(`dev-issue-${NODE_PARAMS.DEV_ISSUE}`)
        if (tx.devIssue !== networkDevIssueHash) {
          response.reason = `devIssue hash (${tx.devIssue}) does not match current network devIssue (${networkDevIssueHash})`
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'proposal': {
        const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        const parameters: NetworkParameters = tx.parameters
        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!issue) {
          response.reason = "Issue doesn't exist"
          return response
        }
        if (issue.active === false) {
          response.reason = 'This issue is no longer active'
          return response
        }
        if (tx.proposal !== crypto.hash(`issue-${NODE_PARAMS.ISSUE}-proposal-${issue.proposalCount + 1}`)) {
          response.reason = 'Must give the next issue proposalCount hash'
          return response
        }
        if (from.data.balance < NODE_PARAMS.CURRENT.proposalFee + NODE_PARAMS.CURRENT.transactionFee) {
          response.reason = 'From account has insufficient balance to submit a proposal'
          return response
        }
        if (parameters.transactionFee < 0) {
          response.reason = 'Min transaction fee permitted is 0'
          return response
        }
        if (parameters.transactionFee > 10) {
          response.reason = 'Max transaction fee permitted is 10'
          return response
        }
        if (parameters.maintenanceFee > 0.1) {
          response.reason = 'Max maintenanceFee fee permitted is 10%'
          return response
        }
        if (parameters.maintenanceFee < 0) {
          response.reason = 'Min maintenanceFee fee permitted is 0%'
          return response
        }
        if (parameters.maintenanceInterval > 1000000000000) {
          response.reason = 'Max maintenanceInterval permitted is 1000000000000'
          return response
        }
        if (parameters.maintenanceInterval < 600000) {
          response.reason = 'Min maintenanceInterval permitted is 600000 (10 minutes)'
          return response
        }
        if (parameters.nodeRewardInterval < 60000) {
          response.reason = 'Min nodeRewardInterval permitted is 60000 (1 minute)'
          return response
        }
        if (parameters.nodeRewardInterval > 900000000000) {
          response.reason = 'Max nodeRewardInterval fee permitted is 900000000000'
          return response
        }
        if (parameters.nodeRewardAmount < 0) {
          response.reason = 'Min nodeRewardAmount permitted is 0 tokens'
          return response
        }
        if (parameters.nodeRewardAmount > 1000000000) {
          response.reason = 'Max nodeRewardAmount permitted is 1000000000'
          return response
        }
        if (parameters.proposalFee < 0) {
          response.reason = 'Min proposalFee permitted is 0 tokens'
          return response
        }
        if (parameters.proposalFee > 1000000000) {
          response.reason = 'Max proposalFee permitted is 1000000000 tokens'
          return response
        }
        if (parameters.devProposalFee < 0) {
          response.reason = 'Min devProposalFee permitted is 0 tokens'
          return response
        }
        if (parameters.devProposalFee > 1000000000) {
          response.reason = 'Max devProposalFee permitted is 1000000000 tokens'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_proposal': {
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data

        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!devIssue) {
          response.reason = "devIssue doesn't exist"
          return response
        }
        if (devIssue.active === false) {
          response.reason = 'This devIssue is no longer active'
          return response
        }
        if (tx.devProposal !== crypto.hash(`dev-issue-${NODE_PARAMS.DEV_ISSUE}-dev-proposal-${devIssue.devProposalCount + 1}`)) {
          response.reason = 'Must give the next devIssue devProposalCount hash'
          return response
        }
        if (from.data.balance < NODE_PARAMS.CURRENT.devProposalFee + NODE_PARAMS.CURRENT.transactionFee) {
          response.reason = 'From account has insufficient balance to submit a devProposal'
          return response
        }
        if (tx.payments.reduce((acc: number, payment: DeveloperPayment) => new Decimal(payment.amount).plus(acc), 0) > 1) {
          response.reason = 'tx payment amounts added up to more than 100%'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'vote': {
        const proposal: ProposalAccount = wrappedStates[tx.proposal] && wrappedStates[tx.proposal].data
        const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data

        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!issue) {
          response.reason = "issue doesn't exist"
          return response
        }
        if (issue.active === false) {
          response.reason = 'issue no longer active'
          return response
        }
        if (!proposal) {
          response.reason = "Proposal doesn't exist"
          return response
        }
        if (tx.amount <= 0) {
          response.reason = 'Must send tokens to vote'
          return response
        }
        if (from.data.balance < tx.amount + NODE_PARAMS.CURRENT.transactionFee) {
          response.reason = 'From account has insufficient balance to cover the amount sent in the transaction'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_vote': {
        const devProposal: DevProposalAccount = wrappedStates[tx.devProposal] && wrappedStates[tx.devProposal].data
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data

        if (tx.sign.owner !== tx.from) {
          response.reason = 'not signed by from account'
          return response
        }
        if (crypto.verifyObj(tx) === false) {
          response.reason = 'incorrect signing'
          return response
        }
        if (!devProposal) {
          response.reason = "devProposal doesn't exist"
          return response
        }
        if (!devIssue) {
          response.reason = "devIssue doesn't exist"
          return response
        }
        if (devIssue.active === false) {
          response.reason = 'devIssue no longer active'
          return response
        }
        if (tx.amount <= 0) {
          response.reason = 'Must send tokens in order to vote'
          return response
        }
        if (from.data.balance < tx.amount + NODE_PARAMS.CURRENT.transactionFee) {
          response.reason = 'From account has insufficient balance to cover the amount sent in the transaction'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'tally': {
        const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
        const proposals: ProposalAccount[] = tx.proposals.map((id: string) => wrappedStates[id].data)

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (!issue) {
          response.reason = "Issue doesn't exist"
          return response
        }
        if (issue.active === false) {
          response.reason = 'This issue is no longer active'
          return response
        }
        if (issue.winner !== null) {
          response.reason = 'The winner for this issue has already been determined'
          return response
        }
        if (to.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (proposals.length !== issue.proposalCount) {
          response.reason = 'The number of proposals sent in with the transaction dont match the issues proposalCount'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'dev_tally': {
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
        const devProposals: DevProposalAccount[] = tx.devProposals.map((id: string) => wrappedStates[id].data)

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (!devIssue) {
          response.reason = "devIssue doesn't exist"
          return response
        }
        if (devIssue.active === false) {
          response.reason = 'This devIssue is no longer active'
          return response
        }
        if (Array.isArray(devIssue.winners) && devIssue.winners.length > 0) {
          response.reason = 'The winners for this devIssue has already been determined'
          return response
        }
        if (to.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (devProposals.length !== devIssue.devProposalCount) {
          response.reason = 'The number of devProposals sent in with the transaction dont match the devIssue proposalCount'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_parameters': {
        const issue: IssueAccount = wrappedStates[tx.issue].data

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (!issue) {
          response.reason = "Issue doesn't exist"
          return response
        }
        if (issue.active === false) {
          response.reason = 'This issue is no longer active'
          return response
        }
        if (to.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'apply_dev_parameters': {
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data

        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (!devIssue) {
          response.reason = "devIssue doesn't exist"
          return response
        }
        if (devIssue.active === false) {
          response.reason = 'This devIssue is no longer active'
          return response
        }
        if (to.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      case 'developer_payment': {
        const developer: UserAccount = wrappedStates[tx.developer] && wrappedStates[tx.developer].data
        // let nodeInfo
        // try {
        //   nodeInfo = dapp.getNode(tx.nodeId)
        // } catch (err) {
        //   dapp.log(err)
        // }
        // if (!nodeInfo) {
        //   response.reason = 'no nodeInfo'
        //   return response
        // }
        if (to.id !== networkAccount) {
          response.reason = 'To account must be the network account'
          return response
        }
        if (!to.developerFund.some((payment: DeveloperPayment) => payment.id === tx.payment.id)) {
          response.reason = 'This payment doesnt exist'
          return response
        }
        if (tx.developer !== tx.payment.address) {
          response.reason = 'tx developer does not match address in payment'
          return response
        }
        if (tx.timestamp < tx.payment.timestamp) {
          response.reason = 'This payment is not ready to be released'
          return response
        }
        if (!developer || !developer.data) {
          response.reason = 'No account exists for the passed in tx.developer'
          return response
        }
        if (typeof developer.data.balance === 'string') {
          response.reason = 'developer.data.balance is a string for some reason'
          return response
        }
        if (typeof tx.payment.amount === 'string') {
          response.reason = 'payment.amount is a string for some reason'
          return response
        }
        response.success = true
        response.reason = 'This transaction is valid!'
        return response
      }
      default: {
        response.success = false
        response.reason = 'Unknown transaction type'
        return response
      }
    }
  },
  // THIS NEEDS TO BE FAST, BUT PROVIDES BETTER RESPONSE IF SOMETHING GOES WRONG
  validateTxnFields(tx: any): Shardus.IncomingTransactionResult {
    // Validate tx fields here
    let success = true
    let reason = 'This transaction is valid!'
    const txnTimestamp = tx.timestamp

    if (typeof tx.type !== 'string') {
      success = false
      reason = '"type" must be a string.'
      throw new Error(reason)
    }

    if (typeof txnTimestamp !== 'number') {
      success = false
      reason = '"timestamp" must be a number.'
      throw new Error(reason)
    }

    switch (tx.type) {
      case 'init_network': {
        break
      }
      case 'snapshot': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (tx.to !== networkAccount) {
          success = false
          reason = '"To" must be ' + networkAccount
          throw new Error(reason)
        }
        if (typeof tx.snapshot !== 'object') {
          success = false
          reason = '"Snapshot" must be an object.'
          throw new Error(reason)
        }
        break
      }
      case 'email': {
        if (typeof tx.signedTx !== 'object') {
          success = false
          reason = '"signedTx" must be an object.'
          throw new Error(reason)
        }
        const signedTx = tx.signedTx
        if (signedTx) {
          if (typeof signedTx !== 'object') {
            success = false
            reason = '"signedTx" must be a object.'
            throw new Error(reason)
          }
          if (typeof signedTx.sign !== 'object') {
            success = false
            reason = '"sign" property on signedTx must be an object.'
            throw new Error(reason)
          }
          if (typeof signedTx.from !== 'string') {
            success = false
            reason = '"From" must be a string.'
            throw new Error(reason)
          }
          if (typeof signedTx.emailHash !== 'string') {
            success = false
            reason = '"emailHash" must be a string.'
            throw new Error(reason)
          }
        }
        if (typeof tx.email !== 'string') {
          success = false
          reason = '"email" must be a string.'
          throw new Error(reason)
        }
        if (tx.email.length > 30) {
          success = false
          reason = '"Email" length must be less than 31 characters (30 max)'
          throw new Error(reason)
        }
        break
      }
      case 'verify': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.code !== 'string') {
          success = false
          reason = '"Code" must be a string.'
          throw new Error(reason)
        }
        if (tx.code.length !== 6) {
          success = false
          reason = '"Code" length must be 6 digits.'
          throw new Error(reason)
        }
        if (typeof parseInt(tx.code) !== 'number') {
          success = false
          reason = '"Code" must be parseable to an integer.'
          throw new Error(reason)
        }
        break
      }
      case 'register': {
        if (typeof tx.aliasHash !== 'string') {
          success = false
          reason = '"aliasHash" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.alias !== 'string') {
          success = false
          reason = '"alias" must be a string.'
          throw new Error(reason)
        }
        if (tx.alias.length >= 20) {
          success = false
          reason = '"alias" must be less than 21 characters (20 max)'
          throw new Error(reason)
        }
        break
      }
      case 'create': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"Amount" must be a number.'
          throw new Error(reason)
        }
        break
      }
      case 'transfer': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"Amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount <= 0) {
          success = false
          reason = '"Amount" must be a positive number.'
          throw new Error(reason)
        }
        break
      }
      case 'distribute': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (Array.isArray(tx.recipients) !== true) {
          success = false
          reason = '"Recipients" must be an array.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"Amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount <= 0) {
          success = false
          reason = '"Amount" must be a positive number.'
          throw new Error(reason)
        }
        break
      }
      case 'node_reward': {
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"amount" must be a number'
          throw new Error(reason)
        }
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string'
          throw new Error(reason)
        }
        if (typeof tx.nodeId !== 'string') {
          success = false
          reason = '"nodeId" must be a string'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string'
          throw new Error(reason)
        }
        break
      }
      case 'message': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.message !== 'string') {
          success = false
          reason = '"Message" must be a string.'
          throw new Error(reason)
        }
        if (tx.message.length > 5000) {
          success = false
          reason = '"Message" length must be less than 5000 characters.'
          throw new Error(reason)
        }
        break
      }
      case 'toll': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.toll !== 'number') {
          success = false
          reason = '"Toll" must be a number.'
          throw new Error(reason)
        }
        if (tx.toll < 1) {
          success = false
          reason = 'Minimum "toll" allowed is 1 token'
          throw new Error(reason)
        }
        if (tx.toll > 1000000) {
          success = false
          reason = 'Maximum toll allowed is 1,000,000 tokens.'
          throw new Error(reason)
        }
        break
      }
      case 'friend': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.alias !== 'string') {
          success = false
          reason = '"Message" must be a string.'
          throw new Error(reason)
        }
        break
      }
      case 'remove_friend': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        break
      }
      case 'stake': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.stake !== 'number') {
          success = false
          reason = '"Stake" must be a number.'
          throw new Error(reason)
        }
        break
      }
      case 'snapshot_claim': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.to !== 'string') {
          success = false
          reason = '"To" must be a string.'
          throw new Error(reason)
        }
        break
      }
      case 'proposal': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.proposal !== 'string') {
          success = false
          reason = '"Proposal" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.issue !== 'string') {
          success = false
          reason = '"Issue" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.parameters !== 'object') {
          success = false
          reason = '"Parameters" must be an object.'
          throw new Error(reason)
        }
        if (tx.timestamp < NODE_PARAMS.WINDOWS.proposalWindow[0] || tx.timestamp > NODE_PARAMS.WINDOWS.proposalWindow[1]) {
          success = false
          reason = '"Network is not currently accepting issues or proposals"'
          throw new Error(reason)
        }
        break
      }
      case 'dev_proposal': {
        if (typeof tx.devIssue !== 'string') {
          success = false
          reason = '"devIssue" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.devProposal !== 'string') {
          success = false
          reason = '"devProposal" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.totalAmount !== 'number') {
          success = false
          reason = '"totalAmount" must be a number.'
          throw new Error(reason)
        }
        if (tx.totalAmount < 1) {
          success = false
          reason = 'Minimum "totalAmount" allowed is 1 token'
          throw new Error(reason)
        }
        if (tx.totalAmount > 100000) {
          success = false
          reason = 'Maximum "totalAmount" allowed is 100,000 tokens'
          throw new Error(reason)
        }
        if (Array.isArray(tx.payments) !== true) {
          success = false
          reason = '"payments" must be an array.'
          throw new Error(reason)
        }
        if (typeof tx.description !== 'string') {
          success = false
          reason = '"description" must be a string.'
          throw new Error(reason)
        }
        if (tx.description.length < 1) {
          success = false
          reason = 'Minimum "description" character count is 1'
          throw new Error(reason)
        }
        if (tx.description.length > 1000) {
          success = false
          reason = 'Maximum "description" character count is 1000'
          throw new Error(reason)
        }
        if (typeof tx.payAddress !== 'string') {
          success = false
          reason = '"payAddress" must be a string.'
          throw new Error(reason)
        }
        if (tx.payAddress.length !== 64) {
          success = false
          reason = '"payAddress" length must be 64 characters (A valid public address)'
          throw new Error(reason)
        }
        if (tx.timestamp < NODE_PARAMS.DEV_WINDOWS.devProposalWindow[0] || tx.timestamp > NODE_PARAMS.DEV_WINDOWS.devProposalWindow[1]) {
          success = false
          reason = 'Network is not accepting dev proposals'
          throw new Error(reason)
        }
        break
      }
      case 'vote': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount < 1) {
          success = false
          reason = 'Minimum voting "amount" allowed is 1 token'
          throw new Error(reason)
        }
        if (typeof tx.issue !== 'string') {
          success = false
          reason = '"issue" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.proposal !== 'string') {
          success = false
          reason = '"Proposal" must be a string.'
          throw new Error(reason)
        }
        if (tx.timestamp < NODE_PARAMS.WINDOWS.votingWindow[0] || tx.timestamp > NODE_PARAMS.WINDOWS.votingWindow[1]) {
          success = false
          reason = 'Network is not currently accepting votes'
          throw new Error(reason)
        }
        break
      }
      case 'dev_vote': {
        if (typeof tx.from !== 'string') {
          success = false
          reason = '"From" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.amount !== 'number') {
          success = false
          reason = '"amount" must be a number.'
          throw new Error(reason)
        }
        if (tx.amount < 1) {
          success = false
          reason = 'Minimum voting "amount" allowed is 1 token'
          throw new Error(reason)
        }
        if (typeof tx.approve !== 'boolean') {
          success = false
          reason = '"approve" must be a boolean.'
          throw new Error(reason)
        }
        if (typeof tx.devProposal !== 'string') {
          success = false
          reason = '"devProposal" must be a string.'
          throw new Error(reason)
        }
        if (typeof tx.devIssue !== 'string') {
          success = false
          reason = '"devIssue" must be a string.'
          throw new Error(reason)
        }
        if (tx.timestamp < NODE_PARAMS.DEV_WINDOWS.devVotingWindow[0] || tx.timestamp > NODE_PARAMS.DEV_WINDOWS.devVotingWindow[1]) {
          success = false
          reason = 'Network is not currently accepting dev votes'
          throw new Error(reason)
        }
        break
      }
      case 'developer_payment': {
        if (typeof tx.payment !== 'object') {
          success = false
          reason = '"Payment" must be an object.'
          throw new Error(reason)
        }
        if (typeof tx.payment.amount !== 'number') {
          success = false
          reason = '"payment.amount" must be a number.'
          throw new Error(reason)
        }
      }
    }

    return {
      success,
      reason,
      txnTimestamp,
    }
  },
  apply(tx: any, wrappedStates: { [id: string]: WrappedAccount }): ApplyResponse {
    const from = wrappedStates[tx.from] && wrappedStates[tx.from].data
    const to = wrappedStates[tx.to] && wrappedStates[tx.to].data
    // Validate the tx
    const { success, reason } = this.validateTransaction(tx, wrappedStates)

    if (success !== true) {
      throw new Error(`invalid transaction, reason: ${reason}. tx: ${stringify(tx)}`)
    }

    // Create an applyResponse which will be used to tell Shardus that the tx has been applied
    let txId: string
    if (!tx.sign) {
      txId = crypto.hashObj(tx)
    } else {
      txId = crypto.hashObj(tx, true) // compute from tx
    }
    const applyResponse: ApplyResponse = dapp.createApplyResponse(txId, tx.timestamp)

    // Apply the tx
    switch (tx.type) {
      case 'init_network': {
        const network: NetworkAccount = wrappedStates[tx.network] && wrappedStates[tx.network].data
        network.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        dapp.log('Applied init_network transaction', network)
        break
      }
      case 'snapshot': {
        to.snapshot = tx.snapshot
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        dapp.log('Applied snapshot tx', to)
        break
      }
      case 'email': {
        const source: UserAccount = wrappedStates[tx.signedTx.from] && wrappedStates[tx.signedTx.from].data
        const nodeId = dapp.getNodeId()
        const { address } = dapp.getNode(nodeId)
        const [closest] = dapp.getClosestNodes(tx.signedTx.from, 5)
        if (nodeId === closest) {
          const baseNumber = 99999
          const randomNumber = Math.floor(Math.random() * 899999) + 1
          const verificationNumber = baseNumber + randomNumber

          axios.post('http://arimaa.com/mailAPI/index.cgi', {
            from: 'liberdus.verify',
            to: `${tx.email}`,
            subject: 'Verify your email for liberdus',
            message: `Please verify your email address by sending a "verify" transaction with the number: ${verificationNumber}`,
            secret: 'Liberdus',
          })

          dapp.put({
            type: 'gossip_email_hash',
            nodeId,
            account: source.id,
            from: address,
            emailHash: tx.signedTx.emailHash,
            verified: crypto.hash(`${verificationNumber}`),
            timestamp: Date.now(),
          })
        }
        dapp.log('Applied email tx', source)
        break
      }
      case 'gossip_email_hash': {
        // const targets = tx.targets.map(target => wrappedStates[target].data)
        const account: UserAccount = wrappedStates[tx.account].data
        account.emailHash = tx.emailHash
        account.verified = tx.verified
        account.timestamp = tx.timestamp
        dapp.log('Applied gossip_email_hash tx', account)
        break
      }
      case 'verify': {
        from.verified = true
        from.timestamp = tx.timestamp
        dapp.log('Applied verify tx', from)
        break
      }
      case 'register': {
        const alias: AliasAccount = wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data
        // from.data.balance -= CURRENT.transactionFee
        // from.data.balance -= maintenanceAmount(tx.timestamp, from)
        alias.inbox = tx.alias
        from.alias = tx.alias
        alias.address = tx.from
        // from.data.transactions.push({ ...tx, txId })
        alias.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        dapp.log('Applied register tx', from)
        break
      }
      case 'create': {
        to.data.balance += tx.amount
        to.timestamp = tx.timestamp

        // to.data.transactions.push({ ...tx, txId })
        dapp.log('Applied create tx', to)
        break
      }
      case 'transfer': {
        from.data.balance -= tx.amount + NODE_PARAMS.CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, NODE_PARAMS.CURRENT)
        to.data.balance += tx.amount
        from.data.transactions.push({ ...tx, txId })
        to.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        dapp.log('Applied transfer tx', from, to)
        break
      }
      case 'distribute': {
        const recipients: UserAccount[] = tx.recipients.map((id: string) => wrappedStates[id].data)
        from.data.balance -= NODE_PARAMS.CURRENT.transactionFee
        // from.data.transactions.push({ ...tx, txId })
        for (const user of recipients) {
          from.data.balance -= tx.amount
          user.data.balance += tx.amount
          // recipient.data.transactions.push({ ...tx, txId })
        }
        from.data.balance -= maintenanceAmount(tx.timestamp, from, NODE_PARAMS.CURRENT)
        dapp.log('Applied distribute transaction', from, recipients)
        break
      }
      case 'message': {
        const chat: ChatAccount = wrappedStates[tx.chatId].data
        from.data.balance -= NODE_PARAMS.CURRENT.transactionFee
        if (!to.data.friends[from.id]) {
          from.data.balance -= to.data.toll
          to.data.balance += to.data.toll
        }
        from.data.balance -= maintenanceAmount(tx.timestamp, from, NODE_PARAMS.CURRENT)

        if (!from.data.chats[tx.to]) from.data.chats[tx.to] = tx.chatId
        if (!to.data.chats[tx.from]) to.data.chats[tx.from] = tx.chatId

        chat.messages.push(tx.message)
        // from.data.transactions.push({ ...tx, txId })
        // to.data.transactions.push({ ...tx, txId })

        chat.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp

        dapp.log('Applied message tx', chat, from, to)
        break
      }
      case 'toll': {
        from.data.balance -= NODE_PARAMS.CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, NODE_PARAMS.CURRENT)
        from.data.toll = tx.toll
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        dapp.log('Applied toll tx', from)
        break
      }
      case 'friend': {
        from.data.balance -= NODE_PARAMS.CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, NODE_PARAMS.CURRENT)
        from.data.friends[tx.to] = tx.alias
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        dapp.log('Applied friend tx', from)
        break
      }
      case 'remove_friend': {
        from.data.friends[tx.to] = null
        from.timestamp = tx.timestamp
        // from.data.transactions.push({ ...tx, txId })
        dapp.log('Applied remove_friend tx', from)
        break
      }
      case 'stake': {
        from.data.balance -= tx.stake
        from.data.balance -= maintenanceAmount(tx.timestamp, from, NODE_PARAMS.CURRENT)
        from.data.stake = tx.stake
        from.timestamp = tx.timestamp
        // from.data.transactions.push({ ...tx, txId })
        dapp.log('Applied stake tx', from)
        break
      }
      case 'node_reward': {
        to.balance += tx.amount
        from.nodeRewardTime = tx.timestamp
        // from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        dapp.log('Applied node_reward tx', from, to)
        break
      }
      case 'snapshot_claim': {
        from.data.balance += to.snapshot[tx.from]
        to.snapshot[tx.from] = 0
        // from.data.transactions.push({ ...tx, txId })
        from.claimedSnapshot = true
        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        dapp.log('Applied snapshot_claim tx', from, to)
        break
      }
      case 'issue': {
        const issue: IssueAccount = wrappedStates[tx.issue].data
        const proposal: ProposalAccount = wrappedStates[tx.proposal].data

        proposal.parameters = Object.assign({}, NODE_PARAMS.CURRENT)
        proposal.parameters.title = 'Default parameters'
        proposal.parameters.description = 'Keep the current network parameters as they are'
        proposal.number = 1

        issue.number = NODE_PARAMS.ISSUE
        issue.active = true
        issue.proposals.push(proposal.id)
        issue.proposalCount++

        issue.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        dapp.log('Applied issue tx', from, issue, proposal)
        break
      }
      case 'dev_issue': {
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data

        devIssue.number = NODE_PARAMS.DEV_ISSUE
        devIssue.active = true

        devIssue.timestamp = tx.timestamp
        from.timestamp = tx.timestamp
        dapp.log('Applied dev_issue tx', from, devIssue)
        break
      }
      case 'proposal': {
        const proposal: ProposalAccount = wrappedStates[tx.proposal].data
        const issue: IssueAccount = wrappedStates[tx.issue].data

        from.data.balance -= NODE_PARAMS.CURRENT.proposalFee
        from.data.balance -= NODE_PARAMS.CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, NODE_PARAMS.CURRENT)

        proposal.parameters = tx.parameters
        issue.proposalCount++
        proposal.number = issue.proposalCount
        issue.proposals.push(proposal.id)

        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        dapp.log('Applied proposal tx', from, issue, proposal)
        break
      }
      case 'dev_proposal': {
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data
        const devProposal: DevProposalAccount = wrappedStates[tx.devProposal].data

        from.data.balance -= NODE_PARAMS.CURRENT.devProposalFee
        from.data.balance -= NODE_PARAMS.CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, NODE_PARAMS.CURRENT)

        devProposal.totalAmount = tx.totalAmount
        devProposal.payAddress = tx.payAddress
        devProposal.title = tx.title
        devProposal.description = tx.description
        devProposal.payments = tx.payments
        devIssue.devProposalCount++
        devProposal.number = devIssue.devProposalCount
        devIssue.devProposals.push(devProposal.id)

        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        devProposal.timestamp = tx.timestamp
        dapp.log('Applied dev_proposal tx', from, devIssue, devProposal)
        break
      }
      case 'vote': {
        const proposal: ProposalAccount = wrappedStates[tx.proposal].data
        from.data.balance -= tx.amount
        from.data.balance -= NODE_PARAMS.CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, NODE_PARAMS.CURRENT)
        proposal.power += tx.amount
        proposal.totalVotes++

        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        proposal.timestamp = tx.timestamp
        dapp.log('Applied vote tx', from, proposal)
        break
      }
      case 'dev_vote': {
        const devProposal: DevProposalAccount = wrappedStates[tx.devProposal].data

        from.data.balance -= tx.amount
        from.data.balance -= NODE_PARAMS.CURRENT.transactionFee
        from.data.balance -= maintenanceAmount(tx.timestamp, from, NODE_PARAMS.CURRENT)

        if (tx.approve) {
          devProposal.approve += tx.amount
        } else {
          devProposal.reject += tx.amount
        }

        devProposal.totalVotes++
        // from.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        devProposal.timestamp = tx.timestamp
        dapp.log('Applied dev_vote tx', from, devProposal)
        break
      }
      case 'tally': {
        const issue: IssueAccount = wrappedStates[tx.issue].data
        const margin = 100 / (2 * (issue.proposalCount + 1)) / 100

        const defaultProposal: ProposalAccount = wrappedStates[crypto.hash(`issue-${issue.number}-proposal-1`)].data
        const sortedProposals: ProposalAccount[] = tx.proposals
          .map((id: string) => wrappedStates[id].data)
          .sort((a: ProposalAccount, b: ProposalAccount) => a.power < b.power)
        let winner = defaultProposal

        for (const proposal of sortedProposals) {
          proposal.winner = false
        }

        if (sortedProposals.length >= 2) {
          const firstPlace = sortedProposals[0]
          const secondPlace = sortedProposals[1]
          const marginToWin = secondPlace.power + margin * secondPlace.power
          if (firstPlace.power >= marginToWin) {
            winner = firstPlace
          }
        }

        winner.winner = true // CHICKEN DINNER
        to.next = winner.parameters
        to.nextWindows = {
          proposalWindow: [to.windows.applyWindow[1], to.windows.applyWindow[1] + TIME.PROPOSALS],
          votingWindow: [to.windows.applyWindow[1] + TIME.PROPOSALS, to.windows.applyWindow[1] + TIME.PROPOSALS + TIME.VOTING],
          graceWindow: [to.windows.applyWindow[1] + TIME.PROPOSALS + TIME.VOTING, to.windows.applyWindow[1] + TIME.PROPOSALS + TIME.VOTING + TIME.GRACE],
          applyWindow: [
            to.windows.applyWindow[1] + TIME.PROPOSALS + TIME.VOTING + TIME.GRACE,
            to.windows.applyWindow[1] + TIME.PROPOSALS + TIME.VOTING + TIME.GRACE + TIME.APPLY,
          ],
        }
        issue.winner = winner.id

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        winner.timestamp = tx.timestamp
        dapp.log('Applied tally tx', from, to, issue, winner)
        break
      }
      case 'dev_tally': {
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data
        const devProposals: DevProposalAccount[] = tx.devProposals.map((id: string) => wrappedStates[id].data)
        devIssue.winners = []
        for (const devProposal of devProposals) {
          if (devProposal.approve >= devProposal.reject + devProposal.reject * 0.15) {
            devProposal.approved = true
            const payments = []
            for (const payment of devProposal.payments) {
              payments.push({
                timestamp: tx.timestamp + TIME.DEV_GRACE + payment.delay,
                amount: payment.amount * devProposal.totalAmount,
                address: devProposal.payAddress,
                id: crypto.hashObj(payment),
              })
            }
            to.nextDeveloperFund = [...to.nextDeveloperFund, ...payments]
            devProposal.timestamp = tx.timestamp
            devIssue.winners.push(devProposal.id)
          } else {
            devProposal.approved = false
            devProposal.timestamp = tx.timestamp
          }
        }

        to.nextDevWindows = {
          devProposalWindow: [to.devWindows.devApplyWindow[1], to.devWindows.devApplyWindow[1] + TIME.DEV_PROPOSALS],
          devVotingWindow: [to.devWindows.devApplyWindow[1] + TIME.DEV_PROPOSALS, to.devWindows.devApplyWindow[1] + TIME.DEV_PROPOSALS + TIME.DEV_VOTING],
          devGraceWindow: [
            to.devWindows.devApplyWindow[1] + TIME.DEV_PROPOSALS + TIME.DEV_VOTING,
            to.devWindows.devApplyWindow[1] + TIME.DEV_PROPOSALS + TIME.DEV_VOTING + TIME.DEV_GRACE,
          ],
          devApplyWindow: [
            to.devWindows.devApplyWindow[1] + TIME.DEV_PROPOSALS + TIME.DEV_VOTING + TIME.DEV_GRACE,
            to.devWindows.devApplyWindow[1] + TIME.DEV_PROPOSALS + TIME.DEV_VOTING + TIME.DEV_GRACE + TIME.DEV_APPLY,
          ],
        }

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        dapp.log('Applied dev_tally tx', from, to, devIssue, devProposals)
        break
      }
      case 'apply_parameters': {
        const issue: IssueAccount = wrappedStates[tx.issue].data

        to.current = to.next as NetworkParameters
        to.windows = to.nextWindows as Windows
        to.next = {}
        to.nextWindows = {}
        to.issue++

        issue.active = false

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        issue.timestamp = tx.timestamp
        dapp.log('Applied apply_parameters tx', from, issue, to)
        break
      }
      case 'apply_dev_parameters': {
        const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data

        to.devWindows = to.nextDevWindows as DevWindows
        to.nextDevWindows = {}
        to.developerFund = [...to.developerFund, ...to.nextDeveloperFund].sort((a, b) => a.timestamp - b.timestamp)
        to.nextDeveloperFund = []
        to.devIssue++

        devIssue.active = false

        from.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        devIssue.timestamp = tx.timestamp
        dapp.log('Applied apply_dev_parameters tx', from, devIssue, to)
        break
      }
      case 'developer_payment': {
        const developer: UserAccount = wrappedStates[tx.developer].data
        developer.data.balance += tx.payment.amount
        to.developerFund = to.developerFund.filter((payment: DeveloperPayment) => payment.id !== tx.payment.id)
        // developer.data.transactions.push({ ...tx, txId })
        from.timestamp = tx.timestamp
        developer.timestamp = tx.timestamp
        to.timestamp = tx.timestamp
        dapp.log('Applied developer_payment tx', from, to, developer)
        break
      }
    }
    return applyResponse
  },
  getKeyFromTransaction(tx: any): Shardus.TransactionKeys {
    const result: TransactionKeys = {
      sourceKeys: [],
      targetKeys: [],
      allKeys: [],
      timestamp: tx.timestamp,
    }
    switch (tx.type) {
      case 'init_network':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.network]
        break
      case 'snapshot':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'email':
        result.sourceKeys = [tx.signedTx.from]
        break
      case 'gossip_email_hash':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.account]
        break
      case 'verify':
        result.sourceKeys = [tx.from]
        break
      case 'register':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.aliasHash]
        break
      case 'create':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'transfer':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'distribute':
        result.targetKeys = tx.recipients
        result.sourceKeys = [tx.from]
        break
      case 'message':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.chatId]
        break
      case 'toll':
        result.sourceKeys = [tx.from]
        break
      case 'friend':
        result.sourceKeys = [tx.from]
        break
      case 'remove_friend':
        result.sourceKeys = [tx.from]
        break
      case 'node_reward':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'bond':
        result.sourceKeys = [tx.from]
        break
      case 'claim_reward':
        result.sourceKeys = [tx.from]
        break
      case 'snapshot_claim':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to]
        break
      case 'issue':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.issue, tx.proposal]
        break
      case 'dev_issue':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devIssue]
        break
      case 'proposal':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.issue, tx.proposal]
        break
      case 'dev_proposal':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devIssue, tx.devProposal]
        break
      case 'vote':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.issue, tx.proposal]
        break
      case 'dev_vote':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.devIssue, tx.devProposal]
        break
      case 'tally':
        result.sourceKeys = [tx.from]
        result.targetKeys = [...tx.proposals, tx.issue, tx.to]
        break
      case 'dev_tally':
        result.sourceKeys = [tx.from]
        result.targetKeys = [...tx.devProposals, tx.devIssue, tx.to]
        break
      case 'apply_parameters':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.issue]
        break
      case 'apply_dev_parameters':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.to, tx.devIssue]
        break
      case 'developer_payment':
        result.sourceKeys = [tx.from]
        result.targetKeys = [tx.developer, tx.to]
        break
    }
    result.allKeys = result.allKeys.concat(result.sourceKeys, result.targetKeys)
    return result
  },
  getStateId(accountAddress: string, mustExist = true): string {
    const account = accounts[accountAddress]
    if ((typeof account === 'undefined' || account === null) && mustExist === true) {
      throw new Error('Could not get stateId for account ' + accountAddress)
    }
    const stateId = account.hash
    return stateId
  },
  deleteLocalAccountData(): void {
    accounts = {}
  },
  setAccountData(accountRecords: Account[]): void {
    for (const account of accountRecords) {
      // possibly need to clone this so others lose their ref
      accounts[account.id] = account
    }
  },
  getRelevantData(accountId: string, tx: any): Shardus.WrappedResponse {
    let account = accounts[accountId]
    let accountCreated = false
    // Create the account if it doesn't exist
    if (typeof account === 'undefined' || account === null) {
      if (accountId === networkAccount) {
        const account = createNetworkAccount(accountId)
        accounts[accountId] = account as Account
        accountCreated = true
      } else if (tx.type === 'issue') {
        if (accountId === tx.issue) {
          account = createIssue(accountId) as Account
          accounts[accountId] = account
          accountCreated = true
        } else if (accountId === tx.proposal) {
          account = createProposal(accountId, tx.parameters) as Account
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'dev_issue') {
        if (accountId === tx.devIssue) {
          account = createDevIssue(accountId) as Account
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'dev_proposal') {
        if (accountId === tx.devProposal) {
          account = createDevProposal(accountId) as Account
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'proposal') {
        if (accountId === tx.proposal) {
          account = createProposal(accountId, tx.parameters) as Account
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'register') {
        if (accountId === tx.aliasHash) {
          account = createAlias(accountId) as Account
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'message') {
        if (accountId === tx.chatId) {
          account = createChat(accountId) as Account
          accounts[accountId] = account
          accountCreated = true
        }
      } else if (tx.type === 'node_reward') {
        if (accountId === tx.from && accountId === tx.to) {
          account = createNode(accountId) as Account
          accounts[accountId] = account
          accountCreated = true
        }
      }
    }
    if (typeof account === 'undefined' || account === null) {
      if (tx.nodeId) {
        account = createNode(accountId) as Account
        accounts[accountId] = account
        accountCreated = true
      } else {
        account = createAccount(accountId, tx.timestamp) as Account
        accounts[accountId] = account
        accountCreated = true
      }
    }
    // Wrap it for Shardus
    const wrapped = dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
    return wrapped
  },
  updateAccountFull(
    wrappedData: { accountId: string; accountCreated: boolean; data: Account },
    _localCache: any,
    applyResponse: { txId: string; txTimestamp: number },
  ): void {
    const accountId = wrappedData.accountId
    const accountCreated = wrappedData.accountCreated
    const updatedAccount = wrappedData.data
    // Update hash
    const hashBefore = updatedAccount.hash
    updatedAccount.hash = '' // DON'T THINK THIS IS NECESSARY
    const hashAfter = crypto.hashObj(updatedAccount)
    updatedAccount.hash = hashAfter
    // Save updatedAccount to db / persistent storage
    accounts[accountId] = updatedAccount
    // Add data to our required response object
    dapp.applyResponseAddState(
      applyResponse,
      updatedAccount,
      updatedAccount,
      accountId,
      applyResponse.txId,
      applyResponse.txTimestamp,
      hashBefore,
      hashAfter,
      accountCreated,
    )
  },
  // TODO: This might be useful in making some optimizations
  updateAccountPartial(wrappedData: Shardus.WrappedData, localCache: any, applyResponse: Shardus.ApplyResponse) {
    this.updateAccountFull(wrappedData, localCache, applyResponse)
  },
  getAccountDataByRange(accountStart: string, accountEnd: string, tsStart: number, tsEnd: number, maxRecords: number): WrappedAccount[] {
    const results: WrappedAccount[] = []
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
      const wrapped = {
        accountId: account.id,
        stateId: account.hash,
        data: account,
        timestamp: account.timestamp,
      }
      results.push(wrapped)
      // Return results early if maxRecords reached
      if (results.length >= maxRecords) {
        results.sort((a, b) => a.timestamp - b.timestamp)
        return results
      }
    }
    results.sort((a, b) => a.timestamp - b.timestamp)
    return results
  },
  getAccountData(accountStart: string, accountEnd: string, maxRecords: number): WrappedAccount[] {
    const results: WrappedAccount[] = []
    const start = parseInt(accountStart, 16)
    const end = parseInt(accountEnd, 16)
    // Loop all accounts
    for (const account of Object.values(accounts)) {
      // Skip if not in account id range
      const id = parseInt(account.id, 16)
      if (id < start || id > end) continue

      // Add to results
      const wrapped = {
        accountId: account.id,
        stateId: account.hash,
        data: account,
        timestamp: account.timestamp,
      }
      results.push(wrapped)
      // Return results early if maxRecords reached
      if (results.length >= maxRecords) {
        results.sort((a, b) => a.timestamp - b.timestamp)
        return results
      }
    }
    results.sort((a, b) => a.timestamp - b.timestamp)
    return results
  },
  getAccountDataByList(addressList: string[]): WrappedAccount[] {
    const results: WrappedAccount[] = []
    for (const address of addressList) {
      const account = accounts[address]
      if (account) {
        const wrapped = {
          accountId: account.id,
          stateId: account.hash,
          data: account,
          timestamp: account.timestamp,
        }
        results.push(wrapped)
      }
    }
    results.sort((a, b) => parseInt(a.accountId, 16) - parseInt(b.accountId, 16))
    return results
  },
  calculateAccountHash(account: { hash: string }): string {
    account.hash = '' // Not sure this is really necessary
    account.hash = crypto.hashObj(account)
    return account.hash
  },
  resetAccountData(accountBackupCopies: Account[]): void {
    console.log('RESET_ACCOUNT_DATA', stringify(accountBackupCopies))
    for (const recordData of accountBackupCopies) {
      accounts[recordData.id] = recordData
    }
  },
  deleteAccountData(addressList: string[]): void {
    stringify('DELETE_ACCOUNT_DATA', stringify(addressList))
    for (const address of addressList) {
      delete accounts[address]
    }
  },
  getAccountDebugValue(wrappedAccount: WrappedAccount): string {
    return `${stringify(wrappedAccount)}`
  },
  canDebugDropTx(tx: unknown) {
    dapp.log(`${tx}`)
    return false
  },
  close(): void {
    dapp.log('Shutting down server...')
  },
})

dapp.registerExceptionHandler()

// CODE THAT GETS EXECUTED WHEN NODES START
;(async (): Promise<void> => {
  const cycleInterval = cycleDuration * TIME.ONE_SECOND

  let issueGenerated = false
  let tallyGenerated = false
  let applyGenerated = false

  let devIssueGenerated = false
  let devTallyGenerated = false
  let devApplyGenerated = false

  let syncedNextParams = 0
  let syncedNextDevParams = 0

  let nodeId: string
  let nodeAddress: string
  let cycleStartTimestamp: number
  let lastReward: number
  let expectedInterval: number
  let cycleData: Shardus.Cycle
  let luckyNode: string

  await dapp.start()

  // THIS CODE IS CALLED ON EVERY NODE ON EVERY CYCLE
  async function networkMaintenance(): Promise<NodeJS.Timeout> {
    expectedInterval += cycleInterval

    try {
      ;[cycleData] = dapp.getLatestCycles()
      cycleStartTimestamp = cycleData.start * 1000 + TIME.ONE_SECOND * 30
      ;[luckyNode] = dapp.getClosestNodes(cycleData.marker, 2)
      nodeId = dapp.getNodeId()
      nodeAddress = dapp.getNode(nodeId).address
    } catch (err) {
      dapp.log('ERR: ', err)
      return setTimeout(networkMaintenance, 1000)
    }

    dapp.log(
      `
      CYCLE_DATA: `,
      cycleData,
      `
      luckyNode: `,
      luckyNode,
      `
      IN_SYNC: `,
      NODE_PARAMS.IN_SYNC,
      `
      CURRENT: `,
      NODE_PARAMS.CURRENT,
      `
      NEXT: `,
      NODE_PARAMS.NEXT,
      `
      DEVELOPER_FUND: `,
      NODE_PARAMS.DEVELOPER_FUND,
      `
      NEXT_DEVELOPER_FUND: `,
      NODE_PARAMS.NEXT_DEVELOPER_FUND,
      `
      ISSUE: `,
      NODE_PARAMS.ISSUE,
      `
      DEV_ISSUE: `,
      NODE_PARAMS.DEV_ISSUE,
      `
      nodeId: `,
      nodeId,
      `
    `,
    )

    if (_.isEmpty(NODE_PARAMS.CURRENT) || _.isEmpty(NODE_PARAMS.WINDOWS) || _.isEmpty(NODE_PARAMS.DEV_WINDOWS)) {
      NODE_PARAMS.IN_SYNC = false
    }

    if (!NODE_PARAMS.IN_SYNC) {
      await syncParameters(cycleStartTimestamp + cycleInterval)
      await syncDevParameters(cycleStartTimestamp + cycleInterval)
      return setTimeout(networkMaintenance, 1000)
    }

    // THIS IS FOR NODE_REWARD
    if (cycleStartTimestamp - lastReward > NODE_PARAMS.CURRENT.nodeRewardInterval) {
      nodeReward(nodeAddress, nodeId)
      lastReward = cycleStartTimestamp
    }

    // AUTOMATIC (ISSUE | TALLY | APPLY_PARAMETERS) TRANSACTION GENERATION
    // IS THE NETWORK READY TO GENERATE A NEW ISSUE?
    dapp.log(
      'ISSUE_DEBUG ---------- ',
      'ISSUE_GENERATED: ',
      issueGenerated,
      'LUCKY_NODE: ',
      luckyNode,
      'NODE_ID: ',
      nodeId,
      'CYCLE_START_TIME: ',
      cycleStartTimestamp,
      'ISSUE_WINDOW_START_TIME: ',
      NODE_PARAMS.WINDOWS.proposalWindow[0],
      'ISSUE_WINDOW_END_TIME: ',
      NODE_PARAMS.WINDOWS.proposalWindow[1],
      'WITHIN_ISSUE_WINDOW: ',
      cycleStartTimestamp >= NODE_PARAMS.WINDOWS.proposalWindow[0] && cycleStartTimestamp <= NODE_PARAMS.WINDOWS.proposalWindow[1],
    )

    if (cycleStartTimestamp >= NODE_PARAMS.WINDOWS.proposalWindow[0] && cycleStartTimestamp <= NODE_PARAMS.WINDOWS.proposalWindow[1]) {
      if (!issueGenerated && NODE_PARAMS.ISSUE > 1) {
        if (nodeId === luckyNode && Date.now() < NODE_PARAMS.WINDOWS.proposalWindow[0] + TIME.ONE_SECOND * 20) {
          await generateIssue(nodeAddress, nodeId, NODE_PARAMS.ISSUE)
        }
        issueGenerated = true
        applyGenerated = false
      }
    }

    dapp.log(
      'TALLY_DEBUG ---------- ',
      'TALLY_GENERATED: ',
      tallyGenerated,
      'LUCKY_NODE: ',
      luckyNode,
      'NODE_ID: ',
      nodeId,
      'CYCLE_START_TIME: ',
      cycleStartTimestamp,
      'TALLY_WINDOW_START_TIME: ',
      NODE_PARAMS.WINDOWS.graceWindow[0],
      'TALLY_WINDOW_END_TIME: ',
      NODE_PARAMS.WINDOWS.graceWindow[1],
      'WITHIN_TALLY_WINDOW: ',
      cycleStartTimestamp >= NODE_PARAMS.WINDOWS.graceWindow[0] && cycleStartTimestamp <= NODE_PARAMS.WINDOWS.graceWindow[1],
    )

    // IF THE WINNER FOR THE PROPOSAL HASN'T BEEN DETERMINED YET AND ITS PAST THE VOTING_WINDOW
    if (cycleStartTimestamp >= NODE_PARAMS.WINDOWS.graceWindow[0] && cycleStartTimestamp <= NODE_PARAMS.WINDOWS.graceWindow[1]) {
      if (syncedNextParams > 2) {
        console.log('SYNCING_PARAMS')
        await syncParameters(cycleStartTimestamp)
        syncedNextParams = 0
      }
      if (!tallyGenerated) {
        if (nodeId === luckyNode && Date.now() < NODE_PARAMS.WINDOWS.graceWindow[0] + TIME.ONE_SECOND * 20) {
          await tallyVotes(nodeAddress, nodeId, NODE_PARAMS.ISSUE)
        }
        tallyGenerated = true
      }
      syncedNextParams++
    }

    dapp.log(
      'APPLY_DEBUG ---------- ',
      'APPLY_GENERATED: ',
      applyGenerated,
      'LUCKY_NODE: ',
      luckyNode,
      'NODE_ID: ',
      nodeId,
      'CYCLE_START_TIME: ',
      cycleStartTimestamp,
      'APPLY_WINDOW_START_TIME: ',
      NODE_PARAMS.WINDOWS.applyWindow[0],
      'APPLY_WINDOW_END_TIME: ',
      NODE_PARAMS.WINDOWS.applyWindow[1],
      'WITHIN_APPLY_WINDOW: ',
      cycleStartTimestamp >= NODE_PARAMS.WINDOWS.applyWindow[0] && cycleStartTimestamp <= NODE_PARAMS.WINDOWS.applyWindow[1],
    )

    // IF THE WINNING PARAMETERS HAVENT BEEN APPLIED YET AND IT'S PAST THE GRACE_WINDOW
    if (cycleStartTimestamp >= NODE_PARAMS.WINDOWS.applyWindow[0] && cycleStartTimestamp <= NODE_PARAMS.WINDOWS.applyWindow[1]) {
      if (!applyGenerated) {
        if (nodeId === luckyNode && Date.now() < NODE_PARAMS.WINDOWS.applyWindow[0] + TIME.ONE_SECOND * 20) {
          await applyParameters(nodeAddress, nodeId, NODE_PARAMS.ISSUE)
        }
        console.log('APPLYING_PARAMS')
        NODE_PARAMS.WINDOWS = NODE_PARAMS.NEXT_WINDOWS as Windows
        NODE_PARAMS.CURRENT = NODE_PARAMS.NEXT as NetworkParameters
        NODE_PARAMS.NEXT_WINDOWS = {}
        NODE_PARAMS.NEXT = {}
        NODE_PARAMS.ISSUE++
        applyGenerated = true
        issueGenerated = false
        tallyGenerated = false
      }
    }

    dapp.log(
      'DEV_ISSUE_DEBUG ---------- ',
      'DEV_ISSUE_GENERATED: ',
      tallyGenerated,
      'LUCKY_NODE: ',
      luckyNode,
      'NODE_ID: ',
      nodeId,
      'CYCLE_START_TIME: ',
      cycleStartTimestamp,
      'DEV_ISSUE_WINDOW_START_TIME: ',
      NODE_PARAMS.DEV_WINDOWS.devProposalWindow[0],
      'DEV_ISSUE_WINDOW_END_TIME: ',
      NODE_PARAMS.DEV_WINDOWS.devProposalWindow[1],
      'WITHIN_DEV_ISSUE_WINDOW: ',
      cycleStartTimestamp >= NODE_PARAMS.DEV_WINDOWS.devProposalWindow[0] && cycleStartTimestamp <= NODE_PARAMS.DEV_WINDOWS.devProposalWindow[1],
    )

    // AUTOMATIC (DEV_ISSUE | DEV_TALLY | APPLY_DEV_PARAMETERS) TRANSACTION GENERATION
    // IS THE NETWORK READY TO GENERATE A NEW DEV_ISSUE?
    if (cycleStartTimestamp >= NODE_PARAMS.DEV_WINDOWS.devProposalWindow[0] && cycleStartTimestamp <= NODE_PARAMS.DEV_WINDOWS.devProposalWindow[1]) {
      if (!devIssueGenerated && NODE_PARAMS.DEV_ISSUE > 1) {
        if (nodeId === luckyNode && Date.now() < NODE_PARAMS.DEV_WINDOWS.devProposalWindow[0] + TIME.ONE_SECOND * 20) {
          await generateDevIssue(nodeAddress, nodeId, NODE_PARAMS.DEV_ISSUE)
        }
        devIssueGenerated = true
        devApplyGenerated = false
      }
    }

    dapp.log(
      'DEV_TALLY_DEBUG ---------- ',
      'DEV_TALLY_GENERATED: ',
      devTallyGenerated,
      'LUCKY_NODE: ',
      luckyNode,
      'NODE_ID: ',
      nodeId,
      'CYCLE_START_TIME: ',
      cycleStartTimestamp,
      'DEV_TALLY_WINDOW_START_TIME: ',
      NODE_PARAMS.DEV_WINDOWS.devGraceWindow[0],
      'DEV_TALLY_WINDOW_END_TIME: ',
      NODE_PARAMS.DEV_WINDOWS.devGraceWindow[1],
      'WITHIN_DEV_TALLY_WINDOW: ',
      cycleStartTimestamp >= NODE_PARAMS.DEV_WINDOWS.devGraceWindow[0] && cycleStartTimestamp <= NODE_PARAMS.DEV_WINDOWS.devGraceWindow[1],
    )

    // IF THE WINNERS FOR THE DEV PROPOSALS HAVEN'T BEEN DETERMINED YET AND ITS PAST THE DEV_VOTING_WINDOW
    if (cycleStartTimestamp >= NODE_PARAMS.DEV_WINDOWS.devGraceWindow[0] && cycleStartTimestamp <= NODE_PARAMS.DEV_WINDOWS.devGraceWindow[1]) {
      if (syncedNextDevParams > 2) {
        console.log('SYNCING_DEV_PARAMS')
        await syncDevParameters(cycleStartTimestamp)
        syncedNextDevParams = 0
      }
      if (!devTallyGenerated) {
        if (nodeId === luckyNode && Date.now() < NODE_PARAMS.DEV_WINDOWS.devGraceWindow[0] + TIME.ONE_SECOND * 20) {
          await tallyDevVotes(nodeAddress, nodeId, NODE_PARAMS.DEV_ISSUE)
        }
        devTallyGenerated = true
      }
      syncedNextDevParams++
    }

    dapp.log(
      'DEV_APPLY_DEBUG ---------- ',
      'DEV_APPLY_GENERATED: ',
      devApplyGenerated,
      'LUCKY_NODE: ',
      luckyNode,
      'NODE_ID: ',
      nodeId,
      'CYCLE_START_TIME: ',
      cycleStartTimestamp,
      'DEV_APPLY_WINDOW_START_TIME: ',
      NODE_PARAMS.DEV_WINDOWS.devApplyWindow[0],
      'DEV_APPLY_WINDOW_END_TIME: ',
      NODE_PARAMS.DEV_WINDOWS.devApplyWindow[1],
      'WITHIN_DEV_APPLY_WINDOW: ',
      cycleStartTimestamp >= NODE_PARAMS.DEV_WINDOWS.devApplyWindow[0] && cycleStartTimestamp <= NODE_PARAMS.DEV_WINDOWS.devApplyWindow[1],
    )

    // IF THE WINNING DEV PARAMETERS HAVENT BEEN APPLIED YET AND IT'S PAST THE DEV_GRACE_WINDOW
    if (cycleStartTimestamp >= NODE_PARAMS.DEV_WINDOWS.devApplyWindow[0] && cycleStartTimestamp <= NODE_PARAMS.DEV_WINDOWS.devApplyWindow[1]) {
      if (!devApplyGenerated) {
        if (nodeId === luckyNode && Date.now() < NODE_PARAMS.DEV_WINDOWS.devApplyWindow[0] + TIME.ONE_SECOND * 20) {
          await applyDevParameters(nodeAddress, nodeId, NODE_PARAMS.DEV_ISSUE)
        }
        console.log('APPLYING_DEV_PARAMS')
        NODE_PARAMS.DEV_WINDOWS = NODE_PARAMS.NEXT_DEV_WINDOWS as DevWindows
        NODE_PARAMS.DEVELOPER_FUND = [...NODE_PARAMS.DEVELOPER_FUND, ...NODE_PARAMS.NEXT_DEVELOPER_FUND]
        NODE_PARAMS.NEXT_DEV_WINDOWS = {}
        NODE_PARAMS.NEXT_DEVELOPER_FUND = []
        NODE_PARAMS.DEV_ISSUE++
        devApplyGenerated = true
        devIssueGenerated = false
        devTallyGenerated = false
      }
    }

    // LOOP THROUGH IN-MEMORY DEVELOPER_FUND
    for (const payment of NODE_PARAMS.DEVELOPER_FUND) {
      // PAY DEVELOPER IF THE CURRENT TIME IS GREATER THAN THE PAYMENT TIME
      if (cycleStartTimestamp >= payment.timestamp) {
        if (nodeId === luckyNode) {
          releaseDeveloperFunds(payment, nodeAddress, nodeId)
        }
        NODE_PARAMS.DEVELOPER_FUND = NODE_PARAMS.DEVELOPER_FUND.filter(p => p.id !== payment.id)
      } else {
        break
      }
    }

    // return setTimeout(networkMaintenance, expectedInterval - cycleStartTimestamp) NO GOOD
    return setTimeout(networkMaintenance, expectedInterval - Date.now())
  }

  dapp.p2p.on(
    'active',
    async (): Promise<NodeJS.Timeout> => {
      if (dapp.p2p.isFirstSeed) {
        await _sleep(TIME.ONE_SECOND * 20)
      }
      const [cycleData] = dapp.getLatestCycles()
      nodeId = dapp.getNodeId()
      nodeAddress = dapp.getNode(nodeId).address
      cycleStartTimestamp = cycleData.start * 1000
      lastReward = cycleStartTimestamp
      expectedInterval = cycleStartTimestamp + cycleInterval
      return setTimeout(networkMaintenance, expectedInterval - Date.now())
    },
  )
})()
