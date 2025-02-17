import { ethers } from 'ethers'
import * as ShardusCrypto from '@shardus/crypto-utils'
import { LiberdusFlags } from '../config'
import { ShardusTypes } from '@shardus/core'
import { toShardusAddress } from '../utils/address'

interface SignedObj {
  sign: ShardusTypes.Sign
}

export const hashObj = ShardusCrypto.hashObj
export const hash = ShardusCrypto.hash
export const init = ShardusCrypto.init
export const setCustomStringifier = ShardusCrypto.setCustomStringifier

export function verifyObj(obj: SignedObj, shardusSignature = false): boolean {
  if (LiberdusFlags.useEthereumAddress && !shardusSignature) {
    if (typeof obj !== 'object') {
      throw new TypeError('Input must be an object.')
    }
    if (!obj.sign || !obj.sign.owner || !obj.sign.sig) {
      throw new Error('Object must contain a sign field with the following data: { owner, sig }')
    }
    if (typeof obj.sign.owner !== 'string') {
      throw new TypeError('Owner must be a public key represented as a hex string.')
    }
    if (typeof obj.sign.sig !== 'string') {
      throw new TypeError('Signature must be a valid signature represented as a hex string.')
    }
    const { owner, sig } = obj.sign
    const dataWithoutSign = Object.assign({}, obj)
    delete dataWithoutSign.sign
    const message = ShardusCrypto.hashObj(dataWithoutSign)

    const recoveredAddress = ethers.verifyMessage(message, sig)
    const recoveredShardusAddress = toShardusAddress(recoveredAddress)
    const isValid = recoveredShardusAddress.toLowerCase() === owner.toLowerCase()

    if (LiberdusFlags.VerboseLogs) {
      console.log('Signed Obj', obj)
      console.log('Signature verification result:')
      console.log('Is Valid:', isValid)
      console.log('message', message)
      console.log('Owner Address:', obj.sign.owner)
      console.log('Recovered Address:', recoveredAddress)
      console.log('Recovered Shardus Address:', recoveredShardusAddress)
    }
    return isValid
  } else {
    return ShardusCrypto.verifyObj(obj)
  }
}

// Custom JSON stringify replacer for BigInt
function jsonStringifyReplacer(key, value) {
  // Check if the value is BigInt
  if (typeof value === 'bigint') {
    return {
      type: 'BigInt',
      value: value.toString(),
    }
  }
  return value
}

// Custom JSON parse reviver for BigInt
function jsonParseReviver(key, value) {
  // Check if the value is our BigInt object
  if (value && typeof value === 'object' && value.type === 'BigInt') {
    return BigInt(value.value)
  }
  return value
}
