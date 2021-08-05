var Tree = function(value) {
  this.value = value
  this.children = []
}

Tree.prototype.addChild = function(value) {
  var child = new Tree(value)
  this.children.push(child)
  return child
}

// instantiate the tree
var root1 = new Tree('0'.repeat(64))
var branch2 = root1.addChild('1'.repeat(64))
var branch3 = root1.addChild('2'.repeat(64))
var leaf4 = branch2.addChild('3'.repeat(64))
var leaf5 = branch2.addChild('4'.repeat(64))
var leaf6 = branch3.addChild('5'.repeat(64))
var leaf7 = branch3.addChild('6'.repeat(64))

console.log(JSON.stringify(root1))

// var account2 = {
//   id: '2'.repeat(64),
//   referrals: [],
// }

// var account3 = {
//   id: '3'.repeat(64),
//   referrals: [],
// }

// var account4 = {
//   id: '4'.repeat(64),
//   referrals: [],
// }

// var account1 = {
//   id: '1'.repeat(64),
//   referrals: [account3, account4],
// }

// var network = {
//   id: '0'.repeat(64),
//   referrals: [account1, account2],
// }

// function createTree() {
//   let root = new TreeNode(network.id)
//   addNodes(root, network.referrals)
//   printTree(root)
// }

// function printTree(node) {
//   console.log(node.value)
//   if (!node) {
//     return
//   } else {
//     for (const child of node.children) {
//       printTree(child)
//     }
//   }
// }

// const addNodes = (parent, children) => {
//   if (children.length === 0) {
//     return
//   }
//   for (const account of children) {
//     let node = new TreeNode(account.id)
//     parent.addChild(node)
//     addNodes(node, account.referrals)
//   }
// }

// createTree()
