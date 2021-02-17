export const inject = dapp => async (req, res): Promise<void> => {
  try {
    const result = dapp.put(req.body)
    res.json({ result })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
