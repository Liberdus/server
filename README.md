# Liberdus

## Introduction 

Liberdus is a payment network and the first application to be built with the Shardus distributed ledger framework. We are building this payment network to enable people to govern their own money; and as a result, participate in a more fair and sustainable economy.

For millennia, money has existed in some form or another. Money has made it easy for individuals, governments, and businesses to transact with one another. Over time, our money has evolved and gone through many different forms: metal, paper, and now even digital. During the same timeframe in the western world, our governments have evolved from feudal, totalitarian states, to more and more democratic forms of government. However, our money and its rules remain relatively un-democratic. But… We believe it can be different. 

The Liberdus team believes a more democratic form of money can be achieved with the use of distributed ledger technologies and an on-chain governance system – so that every decision about the rules of the money is made by the people who use it. This is what the Liberdus project aims to achieve.

For more info, please checkout our [Whitepaper](https://liberdus.com/Liberdus-Whitepaper-19.10.19.pdf)

## Installation

### Prerequisites

1. **Node.js v20.19.3** (recommended via [nvm](https://github.com/nvm-sh/nvm)):
   ```bash
   nvm install 20.19.3
   ```
2. **Build tools** (Linux):
   ```bash
   sudo apt-get install -y build-essential libssl-dev pkg-config
   ```
3. **Rust 1.82** – [rustup](https://www.rust-lang.org/tools/install):
   ```bash
   rustup default 1.82
   ```
   Or install the latest Rust and use `rustup default 1.82` if you need this exact version.
4. **npm** (included with Node.js; update with `npm install -g npm` if needed)
5. **Shardus CLI**: `npm install -g shardus@4.3.1`

### Clone, install, and run (quick start)

```bash
git clone https://github.com/Liberdus/server.git
cd server
npm install
```

**Start the network** (e.g. with 10 nodes):

```bash
shardus create 10
```

**Stop the network:**

```bash
shardus stop
```

**Clean the network** (remove residual files and instance data):

```bash
shardus clean
rm -rf instances
```

### For demos, testing, etc.

1. Clone this repository with `git clone https://gitlab.com/liberdus/server.git`
2. Checkout the `dist` branch with `git checkout dist`
3. Install dependencies with `npm i`
4. Compile with `npm run compile`

### For Liberdus/Shardus development:

1. Ensure you have access to [`shardus-global-server`](https://gitlab.com/shardus/global/shardus-global-server)
2. Make sure your git installation is set to cache credentials with `git config --global credential.helper cache`
3. Force git to prompt for credentials by cloning [`shardus-global-server`](https://gitlab.com/shardus/global/shardus-global-server):  
   `git clone https://gitlab.com/shardus/global/shardus-global-server.git`
4. In another directory, clone this repository with `git clone https://gitlab.com/liberdus/server.git`
5. Install dependencies with `npm i`
6. Compile with `npm run compile`

## Usage

- **Start a network:** `shardus create {# of nodes}` (e.g. `shardus create 10`) – starts local Liberdus nodes and apps.
- **Stop the network:** `shardus stop` – stops all nodes and apps.
- **Clean the network:** `shardus clean` – cleans residual files and folders from archiver and monitor-server. Then run `rm -rf instances` to remove the `instances` folder so you can start a fresh network.

[Shardus Monitor](https://gitlab.com/shardus/monitor-server) - http://localhost:3000
[Liberdus Client](https://gitlab.com/liberdus/web-client/liberdus-web-client) - http://localhost:3333
[Archive Server](https://gitlab.com/shardus/archive/archive-server) - http://localhost:4000
[Liberdus Explorer](https://gitlab.com/liberdus/explorer-server) - http://localhost:4444

### Interacting with the network via client.js

Run the client script to connect to a node and interact with the network:

```bash
node client.js localhost:9002
```

Replace `localhost:9002` with the host and port of any node in your network (e.g. `localhost:9001`, `localhost:9003`).

**For detailed instructions on how to play around** (creating accounts, registering, transfers, messages between two accounts, and using the HTTP API), see the comment block at the top of **`client.js`**.

### Creating a key pair for testing

Create a public/private key pair and add the **public key** to the server config so you can use the client for testing:

1. Generate a key pair:

```bash
node -e "
const crypto = require('@shardus/lib-crypto-utils');
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc');
const pair = crypto.generateKeypair();
console.log('PUBLIC_KEY:', pair.publicKey);
console.log('SECRET_KEY:', pair.secretKey);
" 2>&1
```

2. Add the **PUBLIC_KEY** to `src/config/index.ts` in the `devPublicKeys` object (and `multisigKeys` if needed) with `DevSecurityLevel.High`.

3. Set environment variables for the client script (use the values from step 1):

   - `DEV_PUBLIC_KEY` – your public key  
   - `DEV_PRIVATE_KEY` – your secret key  

Then run `node client.js localhost:9002` to interact with the network.

### Querying the node via HTTP (account, transactions, chatId / messages)

You can query account data, transactions, and messages directly from any node using HTTP (e.g. in a browser or with `curl`).

- **Account** – get account info by account ID (address):
  ```bash
  curl "http://localhost:9002/account/7e79d53c067e9d0a095c9675db38330ec72ffd5b000000000000000000000000"
  ```
  Replace the long hex string with the account ID (public key / address) you want to look up.

- **Account transactions** – list transactions for an account:
  ```bash
  curl "http://localhost:9004/account/f43eb22eb9ca0afe5f0fc620ba1ac932711eefe000000000000000000000000/transactions"
  ```
  Use your node host/port and the account ID.

- **Messages (chat)** – get messages for a chat; the **chatId** is the first path segment after `/messages/`:
  ```bash
  curl "http://localhost:9002/messages/7569adbc2fd289d0e613eb488c7968988c41a5d8c2a1e1c4c038038d7c957955/0"
  ```
  The response is JSON with a `messages` array; each message includes `chatId`, `from`, `message` (body/handle/timestamp), and signature fields. The chatId is derived from the two participants’ addresses (sorted and hashed). You can obtain it from the client when using `message poll <alias>` or from a previous message response.


