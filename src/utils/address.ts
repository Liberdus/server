import {LiberdusFlags} from '../config'
import {UserAccount} from '../@types'

export function toShardusAddress(addressStr: string): string {
  if (LiberdusFlags.VerboseLogs) {
    console.log(`Running toShardusAddress`, typeof addressStr, addressStr)
  }

  //change this:0x665eab3be2472e83e3100b4233952a16eed20c76
  //    to this:  665eab3be2472e83e3100b4233952a16eed20c76000000000000000000000000
  return addressStr.slice(2).toLowerCase() + '0'.repeat(24)
}
