import * as configs from '../../config/'

export const rotationInfo =
  (dapp) =>
  async (req, res): Promise<void> => {
    try {
      const ourNodeId = await dapp.getNodeId()
      const rotationIndex = await dapp.getNodeRotationIndex(ourNodeId)
      const isRotationBound = await dapp.isNodeInRotationBounds(ourNodeId)
      res.json({
        rotationIndex,
        isRotationBound,
      })
    } catch (error) {
      res.json({ error })
    }
  }
