import stringify from 'fast-stable-stringify'

export const apply = (tx, wrappedStates) => {
  // Validate the tx
  const { result, reason } = this.validateTransaction(tx, wrappedStates)
  if (result !== 'pass') {
    throw new Error(
      `invalid transaction, reason: ${reason}. tx: ${stringify(tx)}`
    )
  }

  let alias = wrappedStates[tx.id] && wrappedStates[tx.id].data
  let from = wrappedStates[tx.from] && wrappedStates[tx.from].data
  let to = wrappedStates[tx.to] && wrappedStates[tx.to].data

}
