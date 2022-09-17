# Liberdus

## Introduction 

Liberdus is a payment network and the first application to be built with the Shardus distributed ledger framework. We are building this payment network to enable people to govern their own money; and as a result, participate in a more fair and sustainable economy.

For millennia, money has existed in some form or another. Money has made it easy for individuals, governments, and businesses to transact with one another. Over time, our money has evolved and gone through many different forms: metal, paper, and now even digital. During the same timeframe in the western world, our governments have evolved from feudal, totalitarian states, to more and more democratic forms of government. However, our money and its rules remain relatively un-democratic. But… We believe it can be different. 

The Liberdus team believes a more democratic form of money can be achieved with the use of distributed ledger technologies and an on-chain governance system – so that every decision about the rules of the money is made by the people who use it. This is what the Liberdus project aims to achieve.

For more info, please checkout our [Whitepaper](https://liberdus.com/Liberdus-Whitepaper-19.10.19.pdf)

## Installation

### For demos, testing, etc.

1. Clone this repository with `git clone https://gitlab.com/liberdus/server.git`
2. Install dependencies with `npm install`

### For Liberdus/Shardus development:

1. Ensure you have access to [`shardus-global-server`](https://gitlab.com/shardus/global/shardus-global-server)
2. Clone `@shardus/core` repo on local directory from [`shardus-global-server`](https://gitlab.com/shardus/global/shardus-global-server):  
   `git clone https://gitlab.com/shardus/global/shardus-global-server.git`
3. Run `npm install` to install dependencies.
4. In order to link the `@shardus/core` repo to the liberdus repo, run `npm link` and `npm run build:dev`
5. In another directory, clone this repository with `git clone https://gitlab.com/liberdus/server.git`
6. Install dependencies with `npm install`
7. Run `npm link @shardus/core` and `npm run prepare` to link with local `@shardus/core`.

## Usage

`npm start` will start a network of local Liberdus nodes and apps to interact with the nodes:

[Shardus Monitor](https://gitlab.com/shardus/monitor-server) - http://localhost:3000  
[Liberdus Client](https://gitlab.com/liberdus/web-client/liberdus-web-client) - http://localhost:3333  
[Liberdus Explorer](https://gitlab.com/liberdus/explorer-server) - http://localhost:4444    

`npm stop` will stop all nodes and apps.
