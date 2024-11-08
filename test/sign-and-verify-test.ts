// test-signatures.ts
import { ethers } from 'ethers';
import { signObj, verifyObj } from '../src/crypto';
import { LiberdusFlags } from '../src/config';

// Mock LiberdusFlags if not available in test environment
if (typeof LiberdusFlags === 'undefined') {
  (global as any).LiberdusFlags = {
    useEthereumAddress: true,
    VerboseLogs: true
  };
}

async function runTests() {
  console.log('Starting signature tests...\n');

  // Create a test wallet
  const wallet = ethers.Wallet.createRandom();
  console.log('Test wallet created:');
  console.log('Address:', wallet.address);
  console.log('Private Key:', wallet.privateKey, '\n');

  // Test cases
  const testCases = [
    {
      name: 'Simple object',
      obj: {
        name: 'Test Object',
        value: 42
      }
    },
    {
      name: 'Object with BigInt',
      obj: {
        name: 'BigInt Test',
        amount: BigInt('1000000000000000000'),
        timestamp: BigInt(Date.now())
      }
    },
    {
      name: 'Complex nested object',
      obj: {
        user: {
          id: 1,
          balance: BigInt('2000000000000000000'),
          metadata: {
            lastUpdate: Date.now(),
            version: '1.0'
          }
        },
        transactions: [
          {
            id: 'tx1',
            amount: BigInt('500000000000000000')
          }
        ]
      }
    }
  ];

  // Run tests for each case
  for (const testCase of testCases) {
    console.log(`\nTesting: ${testCase.name}`);
    console.log('Original object:', JSON.stringify(testCase.obj, jsonStringifyReplacer, 2));

    try {
      // Test signing
      console.log('\nSigning object...');
      const signedObj = await signObj(testCase.obj, wallet.privateKey);
      console.log('Signed object:', JSON.stringify(signedObj, jsonStringifyReplacer, 2));

      // Test verification
      console.log('\nVerifying signature...');
      const isValid = verifyObj(signedObj);
      console.log('Signature valid:', isValid);

      // Test tampering
      console.log('\nTesting tamper detection...');
      const tamperedObj = JSON.parse(JSON.stringify(signedObj, jsonStringifyReplacer), jsonParseReviver);
      if (tamperedObj.name) {
        tamperedObj.name = 'Tampered Name';
      } else if (tamperedObj.user) {
        tamperedObj.user.id = 999;
      }
      const tamperedValid = verifyObj(tamperedObj);
      console.log('Tampered signature valid (should be false):', tamperedValid);

      // Test result
      if (isValid && !tamperedValid) {
        console.log(`\n✅ ${testCase.name}: All tests passed`);
      } else {
        console.log(`\n❌ ${testCase.name}: Tests failed`);
      }
    } catch (error) {
      console.error(`\n❌ ${testCase.name}: Error:`, error.message);
    }
  }

  // Test error cases
  console.log('\nTesting error cases...');

  try {
    await signObj('not an object' as any, wallet.privateKey);
    console.log('❌ Should have thrown TypeError for non-object input');
  } catch (error) {
    if (error instanceof TypeError) {
      console.log('✅ Correctly threw TypeError for non-object input');
    }
  }

  try {
    verifyObj({ sign: { owner: 123, sig: '0x123' } } as any);
    console.log('❌ Should have thrown TypeError for invalid sign field');
  } catch (error) {
    if (error instanceof TypeError) {
      console.log('✅ Correctly threw TypeError for invalid sign field');
    }
  }
}

// Run all tests
runTests()
  .then(() => console.log('\nAll tests completed!'))
  .catch(console.error);

// Custom JSON stringify replacer for BigInt
function jsonStringifyReplacer(key, value) {
  // Check if the value is BigInt
  if (typeof value === 'bigint') {
    return {
      type: 'BigInt',
      value: value.toString()
    };
  }
  return value;
};

// Custom JSON parse reviver for BigInt
function jsonParseReviver(key, value) {
  // Check if the value is our BigInt object
  if (value && typeof value === 'object' && value.type === 'BigInt') {
    return BigInt(value.value);
  }
  return value;
};
