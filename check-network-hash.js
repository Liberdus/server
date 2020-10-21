const lineReader = require('reverse-line-reader')
const shell = require('shelljs')
const path = require('path')

const instances = shell.ls('-d', 'instances/shardus-instance-*')
let ports = instances.map(i => parseInt(i.split('-')[2]))

async function readLogFile (port, cycleCount) {
  return new Promise(resolve => {
    let hashCollector = {}
    lineReader.eachLine(`instances/shardus-instance-${port}/logs/out.log`, function (line, last) {
      const textToFind = 'DBG SNAPSHOT Network State Hash for cycle'
      if (line.includes(textToFind)) {
        const cycle = parseInt(line.split(' ')[7])
        const hash = line.split(' ')[8]
        hashCollector[cycle] = hash
      }
      if (last || (cycleCount && Object.keys(hashCollector).length >= cycleCount)) {
        resolve(hashCollector)
        return false // stop reading
      }
    })
  })
}

let prevCycle = 0

async function watch () {
  let latestCycle = 0
  let collector = {}
  for (let port of ports) {
    let hashCollector = await readLogFile(port, 5)
    let cycle = Object.keys(hashCollector)[Object.keys(hashCollector).length - 1]
    if (cycle > latestCycle) latestCycle = cycle
    collector[port] = hashCollector
  }
  // if (latestCycle > prevCycle) {
  //   console.log(collector)
  console.log('lastest cycle', latestCycle)
  for (let i = 9001; i < 9021; i++) {
    console.log(`Node ${i} => cycle ${latestCycle} =>`, collector[i][latestCycle])
  }
  prevCycle = latestCycle
  // }
}

async function check (earliestCycleToCheck = 10) {
  let lastCycle = 0
  let collector = {}
  let emptyHashCollector = {}

  for (let port of ports) {
    let hashCollector = await readLogFile(port, null)
    lastCycle = Object.keys(hashCollector)[Object.keys(hashCollector).length - 1]
    collector[port] = hashCollector
  }

  if (lastCycle > 0 && lastCycle > 10) {
    for (let counter = earliestCycleToCheck; counter <= lastCycle; counter++) {
      for (let port of ports) {
        if (!collector[port][counter]) {
          //   console.log(`Node ${port} does not have network hash for ${counter}`)
          if (emptyHashCollector[port]) {
            emptyHashCollector[port].push(counter)
          } else {
            emptyHashCollector[port] = [counter]
          }
        } else {
          //   console.log(collector[port][counter])
        }
      }
    }
    console.log('emptyHashCollector', emptyHashCollector)
  }
}

async function startWatching () {
  watch()
  setInterval(watch, 10000)
}

if (process.argv[2] === '--watch') startWatching()
else if (process.argv[2] === '--check') check(50)
