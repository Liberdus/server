const execa = require('execa')
const { readFileSync } = require('fs')
const { join, parse } = require('path')

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

if (!packageJson.dependencies['shardus-global-server-dist']) {
  console.error('Error: "shardus-global-server-dist" is not in in package.json')
  console.error()
  process.exit(1)
}

let distDir
try {
  distDir = parse(require.resolve('shardus-global-server-dist/package.json')).dir
} catch (err) {
  console.error(err)
  console.error()
  console.error('Error: "shardus-global-server-dist" is not in node_modules')
  console.error('Try running npm install')
  console.error()
  process.exit(1)
}

let distPackageJson
try {
  distPackageJson = JSON.parse(readFileSync(join(distDir, 'package.json')))
} catch (err) {
  console.error(err)
  console.error()
  console.error('Error: Could not open "shardus-global-server-dist" package.json')
  console.error()
  process.exit(1)
}

if (distPackageJson.name !== 'shardus-global-server-dist') {
  console.error('Error: "shardus-global-server-dist" has been linked to something else')
  console.error()
  process.exit(1)
}

// Build the docker image and push it to the gitlab registry
/*
execa.commandSync(`docker build -t registry.gitlab.com/liberdus/server:${tag} -f ${dockerfile} .`, { stdio: [0, 1, 2] })
execa.commandSync(`docker push registry.gitlab.com/liberdus/server:${tag}`, { stdio: [0, 1, 2] })
*/