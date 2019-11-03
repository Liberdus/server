const validateTxnFields = (tx) => {
  let result = 'pass'
  let reason = ''
  let timestamp = tx.timestamp

  if (typeof type !== 'string') {
    result = 'fail'
    reason = '"type" must be a string.'
    throw new Error(reason)
  }

  if (!tx.from || typeof tx.from !== 'string') {
    result = 'fail'
    reason = '"From" must be a string.'
    throw new Error(reason)
  }

  if (tx.amount && typeof tx.amount !== 'number') {
    result = 'fail'
    reason = '"amount" must be a number.'
    throw new Error(reason)
  }

  if (typeof timestamp !== 'number') {
    result = 'fail'
    reason = '"timestamp" must be a number.'
    throw new Error(reason)
  }

  return { result, reason, timestamp }
}

export default validateTxnFields
