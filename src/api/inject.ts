import { Utils } from '@shardus/lib-types'
import { AJVSchemaEnum } from '../@types'
import { verifyPayload } from '../@types/ajvHelper'

export const inject =
  (dapp) =>
  async (req, res): Promise<void> => {
    try {
      // Validate the request body before accessing req.body.tx.
      const errors = verifyPayload(AJVSchemaEnum.inject_tx_req, req.body)

      if (errors !== null) {
        res.status(400).json({
          error: `Invalid inject request: ${errors.join('; ')}`,
        })
        return
      }

      // Preserve BigInt support when parsing the transaction.
      let tx: unknown

      try {
        tx = Utils.safeJsonParse(req.body.tx)
      } catch {
        res.status(400).json({
          error: 'The tx field must contain valid JSON',
        })
        return
      }

      // Valid JSON can still represent null, an array, or a primitive.
      const isPlainObject =
        tx !== null &&
        typeof tx === 'object' &&
        !Array.isArray(tx) &&
        (Object.getPrototypeOf(tx) === Object.prototype ||
          Object.getPrototypeOf(tx) === null)

      if (!isPlainObject) {
        res.status(400).json({
          error: 'The tx field must contain a JSON object',
        })
        return
      }

      const result = await dapp.put(tx)
      res.json({ result })
    } catch (error) {
      dapp.log(error)
      res.status(500).json({
        error: 'Unable to process transaction',
      })
    }
  }