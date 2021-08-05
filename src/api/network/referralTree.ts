import * as configs from '../../config'

var Tree = function(value) {
  this.value = value
  this.children = []
}

Tree.prototype.addChild = function(value) {
  var child = new Tree(value)
  this.children.push(child)
  return child
}

export const referrals = dapp => async (req, res): Promise<void> => {
  try {
    const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const network: NetworkAccount = account.data
    let root = new Tree(network.id)
    await addNodes(root, network.rootUsers, dapp)
    res.json({
        tree: root
    })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}

const addNodes = async (parent, children, dapp) => {
    if (children.length === 0) {
        return
    }
    for (const id of children) {
        let child = parent.addChild(id)
        let account = await dapp.getLocalOrRemoteAccount(id)
        console.log('ACCOUNT_INFO: ' + JSON.stringify(account))
        let user: UserAccount = account.data
        await addNodes(child, user.referrals, dapp)
    }
}