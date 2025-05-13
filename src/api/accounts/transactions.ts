import { LiberdusFlags } from '../../config'

export const transactions =
  (dapp) =>
  async (req, res): Promise<void> => {
    try {
      const txId = req.params['id']
      // const account = await dapp.getLocalOrRemoteAccount(txId)
      // res.json({ transactions: account && account.data.data.transactions })

      try {
        const cachedAppData = await dapp.getLocalOrRemoteCachedAppData('receipt', txId)
        if (LiberdusFlags.VerboseLogs) console.log(`cachedAppData for tx hash ${txId}`, cachedAppData)
        if (cachedAppData && cachedAppData.appData) {
          /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log(`cachedAppData: Found tx receipt for ${txId} ${Date.now()}`)
          const receipt = cachedAppData.appData
          return res.json({ transaction: receipt })
        } else {
          /* prettier-ignore */ if (LiberdusFlags) console.log(`cachedAppData: Unable to find tx receipt for ${txId} ${Date.now()}`)
        }
        return res.json({ transaction: null })
      } catch (error) {
        /* prettier-ignore */ if (LiberdusFlags) console.log('cachedAppData: Unable to get tx receipt: ', error.message)
        return res.json({ transaction: null })
      }
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }
