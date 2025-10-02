const fs = require('fs')
const path = require('path')

// read the name of each folder in the ./instances directory
const instancesDir = path.join(__dirname, '../instances')
const instanceFolders = fs.readdirSync(instancesDir).filter((file) => {
  return fs.statSync(path.join(instancesDir, file)).isDirectory()
})

// loop through each folder and read the public key from secret.json
const nodePublicKeys = []
instanceFolders.forEach((folder) => {
  // check if the current folder name includes "shardus-instance"
  if (!folder.includes('shardus-instance')) {
    return
  }
  const secretPath = path.join(instancesDir, folder, 'secrets.json')
  if (fs.existsSync(secretPath)) {
    const secret = JSON.parse(fs.readFileSync(secretPath))
    if (secret.publicKey) {
      nodePublicKeys.push(secret.publicKey)
    }
  }
})

const outputData = {
  validators: [],
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
}

nodePublicKeys.forEach((pubKey) => {
  outputData.validators.push({
    publicKey: pubKey,
    owner: 'nodeOperator',
    maxTicketsPerHour: 10,
    active: true,
  })
})

// write the output data to a json file
const outputPath = path.join(__dirname, '../node-validators.json')
fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2))
console.log(`Wrote ${nodePublicKeys.length} public keys to ${outputPath}`)
