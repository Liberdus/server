const { spawn } = require('child_process')
const { promisify } = require('util')
const sleep = promisify(setTimeout)

async function main () {
  const client = spawn('node', ['client.js'], { stdio: ['pipe', 'inherit', 'inherit'] })

  await sleep(1000)

  client.stdin.write('asdf\n')
  await sleep(500)


  client.stdin.write('globalCreate\n')
  await sleep(500)
  client.stdin.write('a1\n')
  await sleep(1500)

  // client.stdin.write('globalCreate\n')
  // await sleep(500)
  // client.stdin.write('a2\n')
  // await sleep(1500)

  client.stdin.write('globalUpdate\n')
  await sleep(500)
  client.stdin.write('a1\n')
  await sleep(500)
  client.stdin.write('0\n')
  await sleep(500)  
  client.stdin.write('asdfasdf\n')
  await sleep(1500) 


  await sleep(20000) 

  client.stdin.write('spam transactions globalReadOnlyCoinAdd 10 30 10 4\n')


  client.stdin.write('exit\n')
  await sleep(5500)

  // client.kill('SIGKILL')
}

main()