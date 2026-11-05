import { Utils } from '@shardus/lib-types'
import { AJVSchemaEnum } from '../@types'
import { verifyPayload } from '../@types/ajvHelper'

// Failures use the same { result: { success, reason, status } } shape as a dapp.put result,
// so clients read the reason from result.reason whatever the outcome.
const sendFailure = (res, status: number, reason: string): void => {
  res.status(status).json({ result: { success: false, reason, status } })
}

export const inject =
  (dapp) =>
  async (req, res): Promise<void> => {
    try {
      // Validate the request body before accessing req.body.tx.
      const errors = verifyPayload(AJVSchemaEnum.inject_tx_req, req.body)

      if (errors !== null) {
        sendFailure(res, 400, `Invalid inject request: ${errors.join('; ')}`)
        return
      }

      // Preserve BigInt support when parsing the transaction.
      let tx: unknown

      try {
        tx = Utils.safeJsonParse(req.body.tx)
      } catch {
        sendFailure(res, 400, 'The tx field must contain valid JSON')
        return
      }

      // Valid JSON can still represent null, an array, or a primitive.
      const isPlainObject =
        tx !== null && typeof tx === 'object' && !Array.isArray(tx) && (Object.getPrototypeOf(tx) === Object.prototype || Object.getPrototypeOf(tx) === null)

      if (!isPlainObject) {
        sendFailure(res, 400, 'The tx field must contain a JSON object')
        return
      }

      const result = await dapp.put(tx)
      res.json({ result })
    } catch (error) {
      dapp.log(error)
      sendFailure(res, 500, 'Unable to process transaction')
    }
  }
