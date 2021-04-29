// node setLoad.js <load> <network_percent> <monitorServerUrl>
// node setLoad.js 0.8 1.0 http://localhost:3000

const axios = require('axios')

if (process.argv.length < 5) {
  console.log("Incorrect input format")
  console.log("For example pls use `node setLoad.js 0.8 1.0 http://localhost:3000`")
  process.exit()
}
const load = process.argv[2]
const networkPercentage = process.argv[3]
const monitorServerUrl = process.argv[4]
const reportUrl = `${monitorServerUrl}/api/report`

async function start() {
  let res = await axios.get(reportUrl)
  let activeNodes = Object.values(res.data.nodes.active)
  if (activeNodes.length === 0) return
  shuffle(activeNodes)
  let nodeCountToSet = Math.floor(activeNodes.length * networkPercentage)
  console.log("nodeCountToSet", nodeCountToSet)
  for (let i = 0; i < nodeCountToSet; i++) {
    try {
      const node = activeNodes[i]
      let res = await axios.get(`http://${node.nodeIpInfo.externalIp}:${node.nodeIpInfo.externalPort}/loadset?load=${load}`)
      console.log(`Load set response for ${node.nodeIpInfo.externalIp}:${node.nodeIpInfo.externalPort}`, res.data)
    } catch(e) {
      console.log(e)
    }
  }
}

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

start()
