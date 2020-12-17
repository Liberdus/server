import '../@types'

export const maintenanceAmount = (timestamp: number, account: UserAccount, network: NetworkAccount): number => {
  let amount: number
  if (timestamp - account.lastMaintenance < network.current.maintenanceInterval) {
    amount = 0
  } else {
    amount =
      account.data.balance * (1 - Math.pow(1 - network.current.maintenanceFee, (timestamp - account.lastMaintenance) / network.current.maintenanceInterval))
    account.lastMaintenance = timestamp
  }
  if (typeof amount === 'number') return amount
  else return 0
}

// HELPER METHOD TO WAIT
export async function _sleep(ms = 0): Promise<NodeJS.Timeout> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
