/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-var-requires */
const { spawn } = require('child_process')
const { promisify } = require('util')
const sleep = promisify(setTimeout)

async function main() {
  const client = spawn('node', ['/home/aamir/Dev/liberdus/server/client-setTxFee.js'], { stdio: ['pipe', 'inherit', 'inherit'] })

  await sleep(1000)

  client.stdin.write('aamir\n')
  await sleep(500)

  client.stdin.write('register\n')
  await sleep(500)
  client.stdin.write('aamir\n')
  await sleep(5000)

  client.stdin.write('use omar\n')
  await sleep(500)
  client.stdin.write('register\n')
  await sleep(500)
  client.stdin.write('omar\n')
  await sleep(5000)

  client.stdin.write('query aamir\n')
  await sleep(2000)
  client.stdin.write('query omar\n')
  await sleep(2000)

  client.stdin.write('setTxFee\n')
  await sleep(500)
  client.stdin.write('\n')
  await sleep(500)

  // Make interactive
  process.stdin.pipe(client.stdin)

  // client.stdin.write('exit\n')
  // await sleep(500)

  // client.kill('SIGKILL')
}

main()
