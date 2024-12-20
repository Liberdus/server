import { LiberdusFlags } from '../config'
import { UserAccount } from '../@types'
import * as crypto from '../crypto'
import { ethers } from 'ethers'

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
    return byte64Str.toLowerCase()
  }

  return byte64Str.toLowerCase() + '0'.repeat(64 - byte64Str.length)
}

export function isValidUncompressedPublicKey(publicKey: string): boolean {
  if (publicKey == null) {
    return false
  }
  // Check if it starts with '04' and is 130 characters long (64 bytes for x + 64 bytes for y + 1 byte for prefix)
  if (publicKey.length === 130 && publicKey.startsWith('04')) {
    return true
  }
  return false
}

export function getAddressFromPublicKey(publicKey: string): string {
  try {
    // add '0x' prefix to publicKey if it is not present
    if (!publicKey.startsWith('0x')) {
      publicKey = '0x' + publicKey
    }
    const address = ethers.computeAddress(publicKey)
    console.log(`getAddressFromPublicKey: ${address}`, toShardusAddress(address))
    return toShardusAddress(address)
  } catch (e) {
    console.log(`getAddressFromPublicKey error: ${e.message}`, e)
    return null
  }
}

export function toShardusAddressWithKey(addressStr: string, secondaryAddressStr: string): string {
  // Both addressStr and secondaryAddressStr are hex strings each character representing 4 bits(nibble).
  if (LiberdusFlags.siloAddress) {
    //we need to take a hash, to prevent collisions
    const hashedSuffixKey = crypto.hash(secondaryAddressStr + addressStr)

    // Special case for 3-bit prefix. We combine the first nibble of the address with the last nibble of the key.
    // Please refer to the default case for more details. For the special case we use shorthands for optimization.
    if (LiberdusFlags.siloAddressBitLength === 3) {
      const combinedNibble = (
        (parseInt(addressStr[2], 16) & 14) |
        // eslint-disable-next-line security/detect-object-injection
        (parseInt(hashedSuffixKey[0], 16) & 1)
      ).toString(16)

      return (combinedNibble + hashedSuffixKey.slice(1)).toLowerCase()
    }

    const fullHexChars = Math.floor(LiberdusFlags.siloAddressBitLength / 4)
    const remainingBits = LiberdusFlags.siloAddressBitLength % 4

    let prefix = addressStr.slice(2, 2 + fullHexChars)
    let suffix = hashedSuffixKey.slice(fullHexChars)

    // Handle the overlapping byte if there are remaining bits
    if (remainingBits > 0) {
      const prefixLastNibble = parseInt(addressStr[2 + fullHexChars], 16)
      // eslint-disable-next-line security/detect-object-injection
      const suffixFirstNibble = parseInt(hashedSuffixKey[fullHexChars], 16)

      // Shift the prefix byte to the left and mask the suffix nibble, then combine them
      const suffixMask = (1 << (4 - remainingBits)) - 1
      const shiftedSuffixNibble = suffixFirstNibble & suffixMask
      const prefixMask = (1 << 4) - 1 - suffixMask
      const shiftedPrefixNibble = prefixLastNibble & prefixMask
      const combinedNibble = shiftedPrefixNibble | shiftedSuffixNibble
      const combinedHex = combinedNibble.toString(16)

      prefix += combinedHex
      // Adjust the suffix to remove the processed nibble
      suffix = hashedSuffixKey.slice(fullHexChars + 1)
    }

    let shardusAddress = prefix + suffix
    shardusAddress = shardusAddress.toLowerCase()
    return shardusAddress
  }

  // receipt or contract bytes remain down past here
  if (addressStr.length === 64) {
    //unexpected case but lets allow it
    return addressStr.toLowerCase()
  }

  return addressStr.slice(2).toLowerCase()
}
