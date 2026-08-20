import { Shardus } from '@shardus/core'
import { GroupAccount, GroupTreeAccount, UserAccount } from '../../@types'
import { isGroupAccount, isGroupTreeAccount, isUserAccount } from '../../@types/accountTypeGuards'
import * as utils from '../../utils'

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

/**
 * The cold half of a group: ratchet tree, commit transcript, welcomes and
 * checkpoint. A separate account so that group_message never carries it, so
 * every read endpoint that needs those has to fetch it explicitly.
 */
const loadTree = async (dapp: Shardus, groupId: string): Promise<GroupTreeAccount | null> => {
  const account = await dapp.getLocalOrRemoteAccount(utils.calculateGroupTreeId(groupId))
  if (!account || !account.data) return null
  const tree = account.data as unknown as GroupTreeAccount
  return isGroupTreeAccount(tree) ? tree : null
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
          messageCount: group.messages.length,
          treeId: group.treeId,
          joinFee: group.joinFee.toString(),
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
      const tree = await loadTree(dapp, groupId)
      if (!tree) {
        res.json({ handshakes: [], epoch: group.epoch, oldestAvailableEpoch: group.epoch, checkpoint: null })
        return
      }
      const available = tree.handshakes.map((h) => h.epoch)
      res.json({
        handshakes: tree.handshakes.filter((h) => h.epoch >= fromEpoch),
        epoch: group.epoch,
        oldestAvailableEpoch: available.length > 0 ? Math.min(...available) : group.epoch,
        checkpoint: tree.checkpoint,
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
      const tree = await loadTree(dapp, groupId)
      const envelope = tree && tree.pendingWelcomes[address]
      if (!envelope) {
        res.json({ error: 'No pending welcome for this address' })
        return
      }
      /*
       * Attach the tree snapshot for this welcome's epoch. It is stored once per
       * epoch rather than per joiner (a tree is ~354 kB at 100 members), and is
       * merged in here so the client sees one self-contained envelope.
       *
       * A missing snapshot means the group moved on before this member joined —
       * the joiner cannot use the live tree, because it no longer matches the
       * GroupContext in its Welcome, and must be added again.
       */
      const ratchetTree = tree.welcomeTrees[String(envelope.epoch)]
      if (!ratchetTree) {
        res.json({ error: 'The ratchet tree for this welcome is no longer available; ask to be added again' })
        return
      }
      res.json({
        welcome: { ...envelope, ratchetTree },
        cipherSuite: group.cipherSuite,
        mlsGroupId: group.mlsGroupId,
      })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }

/**
 * GET /group/:groupId/tree — the current ratchet tree.
 *
 * This is what replaces shipping a full tree inside every Welcome envelope. It
 * is public key material only, and a joiner MUST verify it against the
 * `tree_hash` in the GroupContext of its Welcome (RFC 9420) rather than trusting
 * what the network returns.
 *
 * `treeEpoch` is the epoch this tree corresponds to. A joiner whose Welcome
 * names an earlier epoch must use the snapshot in its own welcome envelope
 * instead, since the live tree has already moved on.
 */
export const tree =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const groupId = req.params['groupId']
      const group = await loadGroup(dapp, groupId)
      if (!group) {
        res.json({ error: 'No group with the given id' })
        return
      }
      const treeAccount = await loadTree(dapp, groupId)
      if (!treeAccount) {
        res.json({ error: 'No ratchet tree stored for this group yet' })
        return
      }
      res.json({
        ratchetTree: treeAccount.ratchetTree,
        treeEpoch: treeAccount.treeEpoch,
        epoch: group.epoch,
        cipherSuite: group.cipherSuite,
      })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }

/**
 * GET /group/:groupId/requests — outstanding requests to join.
 *
 * Read by admins to decide who to admit. Public: the roster and member count
 * already are, and a would-be member can reasonably check whether their own
 * request is still pending before reclaiming it.
 */
export const joinRequests =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const groupId = req.params['groupId']
      const group = await loadGroup(dapp, groupId)
      if (!group) {
        res.json({ error: 'No group with the given id' })
        return
      }
      const tree = await loadTree(dapp, groupId)
      const requests = tree
        ? Object.entries(tree.pendingJoinRequests).map(([address, r]) => ({
            address,
            message: r.message,
            escrow: r.escrow.toString(),
            timestamp: r.timestamp,
          }))
        : []
      /*
       * Vested fees are reported alongside, so an admin's client can show what
       * is claimable without a second round trip. `matured` is relative to the
       * caller's clock only for display; the claim transaction recomputes it
       * from the transaction timestamp so validators agree.
       */
      const now = Date.now()
      const fees = tree ? tree.vestedFees || [] : []
      res.json({
        requests,
        joinFee: group.joinFee.toString(),
        epoch: group.epoch,
        vestedFees: fees.map((v) => ({
          admin: v.admin,
          member: v.member,
          amount: v.amount.toString(),
          vestingUntil: v.vestingUntil,
          matured: v.vestingUntil <= now,
        })),
      })
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
      const tree = await loadTree(dapp, groupId)
      if (!tree || !tree.checkpoint) {
        res.json({ error: 'No checkpoint yet for this group' })
        return
      }
      res.json({ checkpoint: tree.checkpoint, epoch: group.epoch, cipherSuite: group.cipherSuite })
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
