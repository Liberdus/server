const execa = require('execa')
const { readFileSync } = require('fs')
const { join } = require('path')

// Set the resulting docker image's tag and Dockerfile based on passed arg
const tag = process.argv[2]

if (!tag) {
  console.error('Error: No tag given')
  console.error()
  process.exit(1)
}

let dockerfile

switch (tag) {
  case 'latest':
    dockerfile = './Dockerfile'
    break
  case 'dev':
    dockerfile = './dev.Dockerfile'
    break
  default:
    console.error('Error: Given an unknown tag')
    console.error()
    process.exit(1)
}

// Don't package the shardus-global-server src into the docker image
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json')))
if (packageJson.dependencies['shardus-global-server']) {
  console.error('Error: "shardus-global-server" source version is included in package.json')
  console.error()
  process.exit(1)
}

try {
  const distPath = require.resolve('shardus-global-server-dist')
} catch (err) {
  console.error('Error: "shardus-global-server-dist" is not in package.json')
  console.error()
  process.exit(1)
}
const distPackageJson = JSON.parse(readFileSync(join(distPath, 'package.json')))

if (distPackageJson.name !== 'shardus-global-server-dist') {
  console.error('Error: "shardus-global-server-dist" has been linked to something else')
  console.error()
  process.exit(1)
}

// Build the docker image and push it to the gitlab registry
execa.commandSync(`docker build -t registry.gitlab.com/liberdus/server:${tag} -f ${dockerfile} .`, { stdio: [0, 1, 2] })
execa.commandSync(`docker push registry.gitlab.com/liberdus/server:${tag}`, { stdio: [0, 1, 2] })
