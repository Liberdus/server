const fs = require('fs')

function parseLine(line) {
  const [dateLevelType, timestamp, from, self, to, reqType, reqName, key, payload] = line.split('\t')
  const [date, logLevel, logType] = dateLevelType.split(' ')
  return { date, logLevel, logType, timestamp, from, self, to, reqType, reqName, key, payload }
}

function parseFile(filename) {
  fs.readFileSync(filename, 'utf-8')
    .split('\n')
    .forEach(line => {
      console.log(parseLine(line))
    })
}

parseFile('instances/shardus-instance-9001/logs/playback.log')
