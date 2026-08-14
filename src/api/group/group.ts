import { Shardus } from '@shardus/core'
import { GroupAccount, UserAccount } from '../../@types'
import { isGroupAccount, isUserAccount } from '../../@types/accountTypeGuards'

/**
 * Read endpoints for MLS group chat.
 *
 * Clients poll a group account directly rather than being fanned out to, which
 * is what keeps group_message a two-account transaction. The transcript is
 * split so a client can catch up cheaply: handshakes by epoch, application
 * messages by timestamp.
 */

const loadGroup = async (dapp: Shardus, groupId: string): Promise<GroupAccount | null> => {
  const account = await dapp.getLocalOrRemoteAccount(groupId)
  if (!account || !account.data) return null
  const group = account.data as unknown as GroupAccount
  return isGroupAccount(group) ? group : null
}

/** GET /group/:groupId — metadata only; no transcript. */
export const info =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const groupId = req.params['groupId']
      const group = await loadGroup(dapp, groupId)
      if (!group) {
        res.json({ error: 'No group with the given id' })
        return
      }
      res.json({
        group: {
          id: group.id,
          mlsGroupId: group.mlsGroupId,
          cipherSuite: group.cipherSuite,
          epoch: group.epoch,
          members: group.members,
          admins: group.admins,
          memberSince: group.memberSince,
          meta: group.meta,
          maxMembers: group.maxMembers,
          createdBy: group.createdBy,
          hasChats: group.hasChats,
          timestamp: group.timestamp,
          checkpointEpoch: group.checkpoint ? group.checkpoint.epoch : null,
          messageCount: group.messages.length,
          handshakeCount: group.handshakes.length,
        },
      })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }

/** GET /group/:groupId/messages/:timestamp — application messages at or after `timestamp`. */
export const messages =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const groupId = req.params['groupId']
      const timestamp = Number(req.params['timestamp']) || 0
      const group = await loadGroup(dapp, groupId)
      if (!group) {
        res.json({ error: 'No group with the given id' })
        return
      }
      res.json({
        messages: group.messages.filter((msg) => msg.timestamp >= timestamp),
        epoch: group.epoch,
        timestamp: group.timestamp,
      })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }

/**
 * GET /group/:groupId/handshakes/:epoch — commits from `epoch` onward.
 *
 * A client applies these in order to walk from its own epoch to the group's.
 * If `oldestAvailableEpoch` is greater than the client's epoch the intervening
 * commits have been pruned, and the client must recover via an external join
 * using the checkpoint rather than replaying.
 */
export const handshakes =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const groupId = req.params['groupId']
      const fromEpoch = Number(req.params['epoch']) || 0
      const group = await loadGroup(dapp, groupId)
      if (!group) {
        res.json({ error: 'No group with the given id' })
        return
      }
      const available = group.handshakes.map((h) => h.epoch)
      res.json({
        handshakes: group.handshakes.filter((h) => h.epoch >= fromEpoch),
        epoch: group.epoch,
        oldestAvailableEpoch: available.length > 0 ? Math.min(...available) : group.epoch,
        checkpoint: group.checkpoint,
      })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }

/** GET /group/:groupId/welcome/:address — the pending Welcome for a new member. */
export const welcome =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const groupId = req.params['groupId']
      const address = String(req.params['address'] || '').toLowerCase()
      const group = await loadGroup(dapp, groupId)
      if (!group) {
        res.json({ error: 'No group with the given id' })
        return
      }
      const envelope = group.pendingWelcomes[address]
      if (!envelope) {
        res.json({ error: 'No pending welcome for this address' })
        return
      }
      res.json({ welcome: envelope, cipherSuite: group.cipherSuite, mlsGroupId: group.mlsGroupId })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }

/** GET /group/:groupId/checkpoint — GroupInfo for recovering a desynced member. */
export const checkpoint =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const groupId = req.params['groupId']
      const group = await loadGroup(dapp, groupId)
      if (!group) {
        res.json({ error: 'No group with the given id' })
        return
      }
      if (!group.checkpoint) {
        res.json({ error: 'No checkpoint yet for this group' })
        return
      }
      res.json({ checkpoint: group.checkpoint, epoch: group.epoch, cipherSuite: group.cipherSuite })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }

/**
 * GET /account/:id/keypackages — published KeyPackages for adding this account.
 *
 * The caller picks one and names it in group_commit.consumedKeyPackages, which
 * pops it from the pool so it is never reused.
 */
export const keyPackages =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const id = req.params['id']
      const account = await dapp.getLocalOrRemoteAccount(id)
      if (!account || !account.data) {
        res.json({ error: 'No account with the given id' })
        return
      }
      const user = account.data as unknown as UserAccount
      if (!isUserAccount(user)) {
        res.json({ error: 'Account is not a UserAccount' })
        return
      }
      res.json({
        keyPackages: user.data.mlsKeyPackages || [],
        lastResortKeyPackage: user.data.mlsLastResortKeyPackage || null,
        cipherSuite: user.data.mlsCipherSuite || null,
        pqPublicKey: user.pqPublicKey || null,
      })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }

/**
 * GET /account/:id/groups — group ids this account belongs to.
 *
 * Derived from the chats map, which group_create and group_commit maintain, so
 * a client can enumerate its groups without a separate index.
 */
export const accountGroups =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const id = req.params['id']
      const account = await dapp.getLocalOrRemoteAccount(id)
      if (!account || !account.data) {
        res.json({ error: 'No account with the given id' })
        return
      }
      const user = account.data as unknown as UserAccount
      if (!isUserAccount(user)) {
        res.json({ error: 'Account is not a UserAccount' })
        return
      }

      const candidates = Object.keys(user.data.chats || {})
      const groups: { id: string; epoch: number; timestamp: number; members: number }[] = []
      for (const candidate of candidates) {
        const group = await loadGroup(dapp, candidate)
        if (group) {
          groups.push({
            id: group.id,
            epoch: group.epoch,
            timestamp: group.timestamp,
            members: group.members.length,
          })
        }
      }
      res.json({ groups })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }
