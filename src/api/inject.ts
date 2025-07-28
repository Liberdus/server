import { Utils } from '@shardeum-foundation/lib-types'

export const inject =
  (dapp) =>
  async (req, res): Promise<void> => {
    try {
      console.log('inject body', req.body)
      const tx = Utils.safeJsonParse(req.body.tx)
      console.log('tx  object', tx)
      const result = await dapp.put(tx)
      res.json({ result })
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }
