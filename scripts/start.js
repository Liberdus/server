const execa = require('execa')

async function main () {
  try {
    await execa('yarpm', 'run pm2 start ./node_modules/seed-node-server/bin/seed-node-server'.split(' '), { stdio: [0, 1, 2] })
    await execa('yarpm', 'run pm2 start ./node_modules/monitor-server/bin/monitor-server'.split(' '), { stdio: [0, 1, 2] })
    console.log()
    console.log('\x1b[33m%s\x1b[0m', 'View network monitor at:') // Yellow
    console.log('  http://localhost:\x1b[32m%s\x1b[0m', '3000') // Green
    console.log()
  } catch (e) {
    console.log(e)
  }
}
main()
