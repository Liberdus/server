export const exit = (req: { body: { code: number } }) => {
  try {
    process.exit(req.body.code)
  } catch (err) {
    console.log(err)
  }
}
