# Liberdus

## Introduction 

Liberdus is a payment network and the first application to be built with the Shardus distributed ledger framework. We are building this payment network to enable people to govern their own money; and as a result, participate in a more fair and sustainable economy.

For millennia, money has existed in some form or another. Money has made it easy for individuals, governments, and businesses to transact with one another. Over time, our money has evolved and gone through many different forms: metal, paper, and now even digital. During the same timeframe in the western world, our governments have evolved from feudal, totalitarian states, to more and more democratic forms of government. However, our money and its rules remain relatively un-democratic. But… We believe it can be different. 

The Liberdus team believes a more democratic form of money can be achieved with the use of distributed ledger technologies and an on-chain governance system – so that every decision about the rules of the money is made by the people who use it. This is what the Liberdus project aims to achieve.

For more info, please checkout our [Whitepaper](https://liberdus.com/Liberdus-Whitepaper-19.10.19.pdf)

## Installation

### For demos, testing, etc.

1. Clone this repository with `git clone https://gitlab.com/liberdus/server.git`
2. Checkout the `dist` branch with `git checkout dist`
3. Install dependencies with `npm install`

### For Liberdus/Shardus development:

1. Ensure you have access to [`shardus-global-server`](https://gitlab.com/shardus/global/shardus-global-server)
2. Make sure your git installation is set to cache credentials with `git config --global credential.helper cache`
3. Force git to prompt for credentials by cloning [`shardus-global-server`](https://gitlab.com/shardus/global/shardus-global-server):  
   `git clone https://gitlab.com/shardus/global/shardus-global-server.git`
4. In another directory, clone this repository with `git clone https://gitlab.com/liberdus/server.git`
5. Install dependencies with `npm install`

## Usage

`shardus create {# of nodes}` will start a network of local Liberdus nodes and apps to interact with the nodes:
`shardus stop` will stop all nodes and apps.
`shadrus clean` cleans the residual files and folders left by archiver and monitor-server.

After running a network, and `instances` folder will be created. To run a new network, you must run `rm -rf instances` to delete this folder.

[Shardus Monitor](https://gitlab.com/shardus/monitor-server) - http://localhost:3000
[Liberdus Client](https://gitlab.com/liberdus/web-client/liberdus-web-client) - http://localhost:3333
[Archive Server](https://gitlab.com/shardus/archive/archive-server) - http://localhost:4000
[Liberdus Explorer](https://gitlab.com/liberdus/explorer-server) - http://localhost:4444    


