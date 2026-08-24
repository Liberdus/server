import { inject } from './inject'
import network from './network'
import accounts from './accounts'
import messages from './messages'
import debug from './debug'
import staking from './staking'
import node from './node'
import { handlePutAdminCertificate } from './admin_certificate'
import { debug_liberdus_flags, set_liberdus_flag } from './liberdus_flags'
import dao from './dao'
import { Shardus } from '@shardus/core'
export default (dapp: Shardus): void => {
  dapp.registerExternalPost('inject', inject(dapp))

  dapp.registerExternalGet('network/parameters', network.current(dapp))

  // New DAO API routes — Shardus applies registerExternalGet routes in LIFO order
  // (last registered = first matched in Express), so register specific paths last.
  dapp.registerExternalGet('dao/proposals/:id', dao.proposals.get(dapp))
  dapp.registerExternalGet('dao/proposals/meta', dao.proposals.meta(dapp))
  dapp.registerExternalGet('dao/proposals/summary', dao.proposals.summary(dapp))
  dapp.registerExternalGet('dao/voters/:proposalId', dao.voters.list(dapp))

  dapp.registerExternalGet('account/:id', accounts.account(dapp))
  dapp.registerExternalGet('account/:id/alias', accounts.alias(dapp))
  dapp.registerExternalGet('account/:id/balance', accounts.balance(dapp))
  dapp.registerExternalGet('account/:id/toll', accounts.toll(dapp))
  dapp.registerExternalGet('address/:name', accounts.address(dapp))
  dapp.registerExternalGet('account/:id/:friendId/toll', accounts.tollOfFriend(dapp))
  dapp.registerExternalGet('account/:id/friends', accounts.friends(dapp))
  dapp.registerExternalGet('account/:id/recentMessages', accounts.recentMessages(dapp))
  dapp.registerExternalGet('account/:id/chats/:timestamp', accounts.chats(dapp))
  // dapp.registerExternalGet('accounts', accounts.all(dapp))

  dapp.registerExternalGet('transaction/:id', accounts.transactions(dapp))

  dapp.registerExternalGet('messages/:chatId/:timestamp', messages.messages(dapp))
  dapp.registerExternalGet('messages/:chatId/toll', messages.toll(dapp))

  dapp.registerExternalGet('timestamp', (req, res) => {
    res.json({ timestamp: dapp.shardusGetTime() })
  })

  dapp.registerExternalGet('debug/dump', debug.dump(dapp))
  dapp.registerExternalPost('debug/exit', debug.exit)

  dapp.registerExternalGet('stake', staking.stake())
  dapp.registerExternalGet('canStake/:nominee', staking.canStake(dapp))
  dapp.registerExternalGet('canUnstake/:nominee/:nominator', staking.canUnstake(dapp))

  dapp.registerExternalGet('node/rotation', node.rotationInfo(dapp))

  dapp.registerExternalPut('query-certificate', staking.queryCertificate(dapp))
  dapp.registerExternalPut('admin-certificate', handlePutAdminCertificate(dapp))

  // Liberdus Flags
  dapp.registerExternalGet('debug-liberdus-flags', debug_liberdus_flags(dapp))
  dapp.registerExternalGet('debug-set-liberdus-flag', set_liberdus_flag(dapp))
}
