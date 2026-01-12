import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'

export const friends = dapp => async (req, res): Promise<void> => {
  try {
    // Deprecation check - reject when network version >= 2.5.0
    // This check is disabled until network version is flipped to 2.5.0 or higher
    if (
      AccountsStorage?.cachedNetworkAccount &&
      utils.isEqualOrNewerVersion('2.5.0', AccountsStorage.cachedNetworkAccount.current.activeVersion)
    ) {
      res.status(410).json({
        error: 'This endpoint is deprecated and no longer available',
        deprecated: true,
        deprecatedVersion: '2.5.0',
      })
      return
    }

    const id = req.params['id']
    const account = await dapp.getLocalOrRemoteAccount(id)
    if (account) {
      res.json({ friends: account.data.data.friends })
    } else {
      res.json({ error: 'No account for given id' })
    }
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
