const crypto = require('shardus-crypto-utils')
crypto('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

for (let i = 1; i < 10; i++) {
  for (let j = 1; j < 10; j++) {
    if (crypto.hash(`dev-issue-${i}-dev-proposal-${j}`) === '151c92a43d584c267d10a86164f2189155c42af491d0c777281795d3977ec2d0') {
      console.log(i, j)
    }
  }
}

// 151c92a43d584c267d10a86164f2189155c42af491d0c777281795d3977ec2d0
