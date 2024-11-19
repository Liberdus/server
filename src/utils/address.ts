import {LiberdusFlags} from '../config'
import {UserAccount} from '../@types'

/**
  * Converts an Ethereum address to a Shardus address by padding to fill 64 bytes.
  * Will strip the '0x' prefix if present.
  * @param addressStr - The Ethereum address to convert.
  * @returns The Shardus address.
**/
export function toShardusAddress(addressStr: string): string {
  if (LiberdusFlags.VerboseLogs) {
    console.log(`Running toShardusAddress`, typeof addressStr, addressStr)
  }

  //change this:0x665eab3be2472e83e3100b4233952a16eed20c76
  //    to this:  665eab3be2472e83e3100b4233952a16eed20c76000000000000000000000000

  let byte64Str = addressStr

  if (addressStr.startsWith('0x')) {
    byte64Str = addressStr.slice(2)
  }

  if (byte64Str.length === 64) {
    return byte64Str
  }
  
  return byte64Str + '0'.repeat(64 - byte64Str.length)
}
