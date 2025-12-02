import { LiberdusFlags } from '../config'
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

  if (byte64Str.length === 64) {
    return byte64Str.toLowerCase()
  }

  if (addressStr.length === 42 && addressStr.startsWith('0x')) {
    byte64Str = addressStr.slice(2)
  }

  // Ensure exactly 40 characters
  if (byte64Str.length !== 40) {
    throw new Error('Invalid ethereum address: ' + addressStr)
  }

  return byte64Str.toLowerCase() + '0'.repeat(24)
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

export function validatePQPublicKey(publicKey: string): boolean {
  try {
    if (publicKey == null) {
      return false
    }
    // convert base64 to bytes
    const publicKeyBytes = Buffer.from(publicKey, 'base64')
    // check it is less than 80k bytes
    return publicKeyBytes.length <= 80000
  } catch (e) {
    console.log(`validatePQPublicKey error: ${e.message}`, e)
    return false
  }
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
