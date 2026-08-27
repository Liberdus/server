# API Documentation

## Network Endpoints

### GET /network/parameters
Returns current network parameters.

**Response:**
```json
{
  "parameters": {
    "current": object,
    "listOfChanges": array
  }
}
```

## Account Endpoints

### GET /account/:id
Returns account information for the given ID.

**Parameters:**
- `id`: Account identifier

**Response:**
```json
{
  "account": object
}
```

### GET /account/:id/alias
Returns alias information for the given account ID.

**Parameters:**
- `id`: Account identifier

### GET /account/:id/transactions
Returns transactions for the given account ID.

**Parameters:**
- `id`: Account identifier

### GET /account/:id/balance
Returns balance for the given account ID.

**Parameters:**
- `id`: Account identifier

### GET /account/:id/toll
Returns toll information for the given account ID.

**Parameters:**
- `id`: Account identifier

### GET /address/:name
Returns address information for the given name.

**Parameters:**
- `name`: Account name

### GET /account/:id/:friendId/toll
⚠️ **DEPRECATED** - Deprecated in version 2.5.0. This endpoint will be removed in a future version.

Returns toll information between two accounts.

**Parameters:**
- `id`: Account identifier
- `friendId`: Friend's account identifier

**Note:** This endpoint is deprecated because the friend functionality has been removed. Use `/account/:id/toll` instead.

### GET /account/:id/friends
⚠️ **DEPRECATED** - Deprecated in version 2.5.0. This endpoint will be removed in a future version.

Returns friends list for the given account ID.

**Parameters:**
- `id`: Account identifier

**Note:** This endpoint is deprecated because the friend functionality has been removed.

### GET /account/:id/recentMessages
Returns recent messages for the given account ID.

**Parameters:**
- `id`: Account identifier

## Messages Endpoints

### GET /messages/:chatId
Returns messages for a specific chat.

**Parameters:**
- `chatId`: Chat identifier

**Response:**
```json
{
  "messages": array
}
```

## Debug Endpoints

### GET /debug/dump
Returns debug dump information.

### POST /debug/exit
Triggers application exit.

## Staking Endpoints

### PUT /query-certificate
Query staking certificate information.

**Response:**
- Success: Returns signed stake certificate
- Error: Returns error message with 500 status code

## Transaction Inject Endpoint

### POST /inject
Injects a transaction into the system.

**Request Body:**
```json
{
  "tx": string  // JSON stringified transaction object
}
```

**Response:**
```json
{
  "result": object  // Result of transaction processing
}
```

**Error Response:**
```json
{
  "error": string  // Error message if injection fails
}
```

The inject endpoint allows you to submit transactions to the system. The transaction must be provided as a JSON stringified string in the request body's `tx` field. The system will parse the transaction, process it, and return the result or any error that occurred during processing.

## Available Transaction Types

Network Management:
- `init_network`: Initialize the network
- `snapshot`: Create network snapshot
- `snapshot_claim`: Claim from snapshot
- `change_config`: Change network configuration
- `apply_change_config`: Apply configuration changes

Account Management:
- `email`: Email-related operations
- `gossip_email_hash`: Propagate email hash
- `verify`: Verify account
- `register`: Register new account
- `create`: Create account
- `transfer`: Transfer between accounts
- `distribute`: Distribute resources

Messaging and Social:
- `message`: Send messages
- `toll`: Manage toll operations
- `friend`: Add friend
- `remove_friend`: Remove friend

Staking and Rewards:
- `stake`: Stake tokens
- `remove_stake`: Remove stake
- `remove_stake_request`: Request stake removal
- `node_reward`: Node rewards
- `deposit_stake`: Deposit stake
- `withdraw_stake`: Withdraw stake
- `set_cert_time`: Set certificate time
- `query_certificate`: Query certificate
- `init_reward`: Initialize rewards
- `claim_reward`: Claim rewards
- `apply_penalty`: Apply penalties

Each transaction type requires specific parameters and follows a particular format. The transaction object must include a `type` field matching one of the above transaction types.

## Network Management Transactions

Note: All network management transactions interact with the network account, which maintains global parameters and snapshots. These transactions typically require appropriate permissions and valid signatures.

#### `init_network`
Initializes the network account with initial configuration.

**Transaction Parameters:**
```json
{
  "type": "init_network",
  "timestamp": number
}
```

#### `snapshot`
Creates a network snapshot of the current state.

**Transaction Parameters:**
```json
{
  "type": "snapshot",
  "from": string,  // Account ID initiating snapshot
  "snapshot": object,  // Snapshot data
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Must be signed by the account specified in 'from' field
- Signature must be cryptographically valid
- Account must exist in the system

#### `snapshot_claim`
Allows claiming assets or state from a previously created snapshot.

#### `change_config`
Submits configuration changes to be applied to the network at a specified cycle.

**Transaction Parameters:**
```json
{
  "type": "change_config",
  "from": string,  // Account ID initiating the change
  "cycle": number, // Target cycle number (-1 for latest cycle + 3)
  "config": string, // JSON stringified configuration changes
  "timestamp": number
}
```

Requirements:
- The `config` field must be a valid JSON string
- The transaction must target the network account
- If `cycle` is -1, the change will be scheduled for 3 cycles after the current cycle
- The account specified in `from` must exist in the system

The transaction schedules a configuration change to be applied at the specified cycle. When successful, it triggers an `apply_change_config` transaction to be executed at the appropriate time.

#### `apply_change_config`
Applies scheduled configuration changes to the network.

**Transaction Parameters:**
```json
{
  "type": "apply_change_config",
  "timestamp": number,
  "network": string,  // Network account ID
  "change": {
    "cycle": number,  // Cycle number when change should be applied
    "change": object  // Parsed configuration changes
  }
}
```

This transaction is automatically triggered by the system to apply configuration changes that were previously submitted through `change_config`. It executes after a short delay (typically 10 seconds) from the original change_config transaction.

## Account Management Transactions

Note: Account management transactions handle user account creation, registration, and token transfers. These transactions typically require valid signatures and sufficient balances where applicable.

#### `register`
Registers an alias for a user account.

**Transaction Parameters:**
```json
{
  "type": "register",
  "from": string,    // Account ID registering the alias
  "alias": string,   // Desired alias (max 20 characters)
  "aliasHash": string, // Hash of the alias
  "timestamp": number,
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Alias must be less than 21 characters
- Alias must contain only alphanumeric characters
- Account must not already have a registered alias
- Requested alias must not be already taken
- Must be signed by the account specified in 'from' field
- Signature must be cryptographically valid

#### `create`
Creates or adds tokens to an account.

**Transaction Parameters:**
```json
{
  "type": "create",
  "from": string,    // Source account ID
  "to": string,      // Target account ID
  "amount": bigint,  // Amount to create (must be > 0)
  "timestamp": number
}
```

Requirements:
- Amount must be greater than 0
- Target account must exist
- Amount must be specified as a BigInt

#### `transfer`
Transfers tokens between accounts.

**Transaction Parameters:**
```json
{
  "type": "transfer",
  "from": string,    // Source account ID
  "to": string,      // Target account ID
  "amount": bigint,  // Amount to transfer (must be > 0)
  "deductTxFeeFromAmount": boolean, // Optional, defaults to false. Supported from version 2.4.9.
  "timestamp": number,
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Both source and target accounts must exist
- Amount must be greater than 0
- Source account must have sufficient balance to cover:
  - Transfer amount
  - Transaction fee, unless `deductTxFeeFromAmount` is `true`
- If `deductTxFeeFromAmount` is `true`, the transfer amount must be greater than the transaction fee
- Must be signed by the source account
- Signature must be cryptographically valid

The transaction will:
1. Deduct amount from source account
2. Add amount to target account, minus transaction fee when `deductTxFeeFromAmount` is `true`
3. Deduct transaction fee from source account when `deductTxFeeFromAmount` is false or omitted
4. Update timestamps for both accounts

#### `email` ⚠️ DEPRECATED
**Deprecated in version 2.5.0** - This transaction type is deprecated and will be removed in a future version. New transactions of this type will be rejected when network version >= 2.5.0.

Initiates the email verification process for an account.

**Transaction Parameters:**
```json
{
  "type": "email",
  "email": string,    // Email address (max 30 characters)
  "signedTx": {
    "from": string,   // Account ID to verify
    "emailHash": string, // Hash of the email address
    "sign": {
      "owner": string // Must match 'from' field
    }
  },
  "timestamp": number
}
```

Requirements:
- Email must be less than 31 characters
- Account must exist
- Email hash must match the provided email
- Must be signed by the account owner
- Signature must be cryptographically valid

The transaction will:
1. Send verification email to the provided address
2. Generate verification code
3. Store email hash and verification code hash
4. Trigger gossip_email_hash transaction

#### `gossip_email_hash` ⚠️ DEPRECATED
**Deprecated in version 2.5.0** - This transaction type is deprecated and will be removed in a future version. New transactions of this type will be rejected when network version >= 2.5.0.

Internal transaction to propagate email verification data across nodes.

**Transaction Parameters:**
```json
{
  "type": "gossip_email_hash",
  "nodeId": string,   // ID of node handling verification
  "from": string,     // Node address
  "account": string,  // Account being verified
  "emailHash": string, // Hash of the email
  "verified": string, // Hash of verification code
  "timestamp": number
}
```

This transaction is automatically triggered by the system after an email transaction and should not be manually created.

#### `verify` ⚠️ DEPRECATED
**Deprecated in version 2.5.0** - This transaction type is deprecated and will be removed in a future version. New transactions of this type will be rejected when network version >= 2.5.0.

Completes the email verification process using the code received via email.

**Transaction Parameters:**
```json
{
  "type": "verify",
  "from": string,    // Account ID being verified
  "code": string,    // 6-digit verification code
  "timestamp": number,
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Account must have pending verification (email transaction processed)
- Code must be exactly 6 digits
- Code must match the verification code sent via email
- Account must not be already verified
- Must be signed by the account owner
- Signature must be cryptographically valid

The transaction will:
1. Mark account as verified
2. Add faucet amount to account balance
3. Update account timestamp

#### `distribute`
Distributes tokens to multiple recipients in a single transaction.

**Transaction Parameters:**
```json
{
  "type": "distribute",
  "from": string,      // Source account ID
  "recipients": string[], // Array of recipient account IDs
  "amount": bigint,    // Amount to send to each recipient
  "timestamp": number,
  "sign": {
    "owner": string    // Must match 'from' field
  }
}
```

Requirements:
- Source account must exist
- All recipient accounts must exist
- Amount must be greater than 0
- Source account must have sufficient balance to cover:
  - Amount × number of recipients
  - Transaction fee
  - Maintenance amount
- Must be signed by the source account
- Signature must be cryptographically valid

The transaction will:
1. Deduct transaction fee from source account
2. For each recipient:
   - Deduct amount from source account
   - Add amount to recipient account
3. Deduct maintenance amount from source account
4. Update timestamps for all affected accounts

## Messaging and Social Transactions

Note: Messaging and social transactions handle user interactions, friend relationships, and messaging fees. These transactions typically require valid signatures and may involve toll payments for messaging non-friends.

#### `message`
Sends a message to another user.

**Transaction Parameters:**
```json
{
  "type": "message",
  "from": string,    // Sender account ID
  "to": string,      // Recipient account ID
  "chatId": string,  // Chat identifier
  "message": string, // Message content (max 5kb)
  "timestamp": number,
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Both sender and recipient accounts must exist
- Message size must be less than 5kb
- Sender must have sufficient balance to cover:
  - Transaction fee
  - Toll fee (if recipient is not a friend)
  - Maintenance amount
- Must be signed by the sender account
- Signature must be cryptographically valid

The transaction will:
1. Deduct fees from sender account
2. Add toll payment to recipient account (if not friends)
3. Store message in chat history
4. Update chat references for both users
5. Update timestamps for all affected accounts

#### `friend` ⚠️ DEPRECATED
**Deprecated in version 2.5.0** - This transaction type is deprecated and will be removed in a future version. New transactions of this type will be rejected when network version >= 2.5.0.

Adds another user as a friend to avoid toll payments for messaging.

**Transaction Parameters:**
```json
{
  "type": "friend",
  "from": string,    // Account ID adding the friend
  "to": string,      // Friend's account ID
  "alias": string,   // Friend's alias
  "timestamp": number,
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Source account must exist
- Source account must have sufficient balance for transaction fee
- Must be signed by the source account
- Signature must be cryptographically valid

The transaction will:
1. Deduct transaction fee from source account
2. Add friend to source account's friend list
3. Store friend's alias
4. Update account timestamp

#### `toll`
Sets the toll amount required for non-friends to send messages.

**Transaction Parameters:**
```json
{
  "type": "toll",
  "from": string,    // Account ID setting the toll
  "toll": bigint,    // Toll amount (1 to 1,000,000 tokens)
  "timestamp": number,
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Account must exist
- Toll amount must be between 1 and 1,000,000 tokens
- Account must have sufficient balance for transaction fee
- Must be signed by the account
- Signature must be cryptographically valid

The transaction will:
1. Deduct transaction fee from account
2. Set new toll amount for the account
3. Update account timestamp

Note: If a user has not set a toll amount, the system's default toll will be used for messages from non-friends.

#### `remove_friend` ⚠️ DEPRECATED
**Deprecated in version 2.5.0** - This transaction type is deprecated and will be removed in a future version. New transactions of this type will be rejected when network version >= 2.5.0.

Removes a friend from the user's friend list, requiring toll payments for future messages.

**Transaction Parameters:**
```json
{
  "type": "remove_friend",
  "from": string,    // Account ID removing the friend
  "to": string,      // Friend's account ID to remove
  "timestamp": number,
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Both accounts must exist
- Must be signed by the source account
- Signature must be cryptographically valid

The transaction will:
1. Remove friend from source account's friend list
2. Update account timestamp

Note: After removing a friend, future messages to that account will require toll payments according to their toll settings.

## Staking and Rewards Transactions

Note: Staking transactions handle node operation stakes, rewards, and penalties. These transactions typically require valid signatures and sufficient balances.

#### `stake`
Stakes tokens to participate in node operations.

**Transaction Parameters:**
```json
{
  "type": "stake",
  "from": string,    // Account ID staking tokens
  "stake": bigint,   // Amount to stake
  "timestamp": number,
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Account must exist
- Account must have sufficient balance to cover stake amount
- Stake amount must be greater than or equal to required stake amount
- Must be signed by the account owner
- Signature must be cryptographically valid

The transaction will:
1. Deduct required stake amount from account
2. Set account's stake amount
3. Update account timestamp

#### `deposit_stake`
Deposits stake for a node operator (nominee) from a nominator.

**Transaction Parameters:**
```json
{
  "type": "deposit_stake",
  "nominator": string,  // Account ID providing stake
  "nominee": string,    // Node operator receiving stake
  "stake": bigint,     // Amount to stake (must be > 0)
  "timestamp": number,
  "sign": {
    "owner": string    // Must match nominator field
  }
}
```

Requirements:
- Nominator account must exist
- Nominator must have sufficient balance for stake + fees
- Combined stake (existing + new) must meet minimum requirement
- Nominator can only stake to one nominee at a time
- Nominee must not be staked by another nominator
- Must wait for restake cooldown period if applicable
- Must be signed by the nominator
- Signature must be cryptographically valid

The transaction will:
1. Deduct stake amount + fees from nominator
2. Update nominator's operator info with stake and nominee
3. Link nominee to nominator
4. Update stake lock and timestamp for nominee
5. Update timestamps for both accounts

#### `withdraw_stake`
Withdraws stake from a node operator, returning it to the nominator.

**Transaction Parameters:**
```json
{
  "type": "withdraw_stake",
  "nominator": string,  // Account ID withdrawing stake
  "nominee": string,    // Node operator to withdraw from
  "force": boolean,     // Whether to force withdrawal
  "timestamp": number,
  "sign": {
    "owner": string    // Must match nominator field
  }
}
```

Requirements:
- Both nominator and nominee accounts must exist
- Nominator must have active stake with the nominee
- Node must not be in standby list or active in network
- Stake certificate must be expired
- Must be signed by the nominator
- Signature must be cryptographically valid

The transaction will:
1. Calculate rewards (if any)
2. Return stake + rewards to nominator (minus fees)
3. Clear stake information from both accounts
4. Update operator statistics
5. Reset node's reward/penalty information
6. Update timestamps for both accounts

Note: Force withdrawal may be allowed in certain conditions based on system flags.

#### `remove_stake_request`
Initiates a request to remove stake from node operations.

**Transaction Parameters:**
```json
{
  "type": "remove_stake_request",
  "from": string,    // Account ID requesting stake removal
  "stake": bigint,   // Amount of stake to remove
  "timestamp": number,
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Account must exist
- Account must have sufficient stake (>= required stake amount)
- Requested stake amount must not exceed required stake amount
- Must be signed by the account owner
- Signature must be cryptographically valid

The transaction will:
1. Mark account with remove stake request timestamp
2. Update account timestamp

#### `remove_stake`
Completes the stake removal process after a waiting period.

**Transaction Parameters:**
```json
{
  "type": "remove_stake",
  "from": string,    // Account ID removing stake
  "stake": bigint,   // Amount of stake to remove
  "timestamp": number,
  "sign": {
    "owner": string  // Must match 'from' field
  }
}
```

Requirements:
- Account must exist
- Account must have sufficient stake (>= required stake amount)
- Account must have an active remove stake request
- Requested stake amount must not exceed required stake amount
- Must wait for 2 × nodeRewardInterval after request
- Must be signed by the account owner
- Signature must be cryptographically valid

The transaction will:
1. Return stake amount to account balance
2. Clear account's stake amount
3. Clear remove stake request
4. Update account timestamp

Note: The two-step removal process (request followed by removal) ensures proper handling of node rewards and network stability.

#### `node_reward`
Distributes rewards to node operators for their participation in the network.

**Transaction Parameters:**
```json
{
  "type": "node_reward",
  "from": string,    // Node account ID
  "nodeId": string,  // Node identifier
  "to": string,      // Recipient account ID
  "timestamp": number
}
```

Requirements:
- Node must exist in the network
- Must wait for nodeRewardInterval after node activation
- If node has previous rewards, must wait for nodeRewardInterval since last reward
- If recipient has stake, it must meet minimum stake requirement

The transaction will:
1. Add reward amount to node balance
2. If recipient is different from node:
   - Transfer node balance to recipient if they meet stake requirements
   - Reset node balance to 0
3. Update node reward timestamp
4. Update timestamps for affected accounts

#### `init_reward`
Initializes reward tracking for a node when it becomes active in the network.

**Transaction Parameters:**
```json
{
  "type": "init_reward",
  "nominee": string,         // Node account ID
  "nodeActivatedTime": number, // Time node became active
  "timestamp": number,
  "sign": {
    "owner": string         // Node signature
  }
}
```

Requirements:
- Node account must exist
- Node must have a nominator
- Node must not have reward start time set for this activation
- Node activation time must be valid
- Must be signed by the node
- Signature must be cryptographically valid

The transaction will:
1. Set node's reward start time
2. Clear reward end time
3. Set reward rate from current network parameters
4. Reset rewarded flag
5. Update node timestamp

Note: This transaction is typically triggered automatically by the system when a node joins the network.

#### `set_cert_time`
Sets or renews the certificate expiration time for a node operator.

**Transaction Parameters:**
```json
{
  "type": "set_cert_time",
  "nominee": string,     // Node account ID
  "nominator": string,   // Operator account ID
  "duration": number,    // Certificate duration in cycles
  "timestamp": number,
  "sign": {
    "owner": string     // Must match nominee field
  }
}
```

Requirements:
- Both nominee and nominator accounts must exist
- Duration must be greater than 0 and not exceed certCycleDuration
- Nominator must have sufficient stake (>= minimum required stake)
- Must be signed by the nominee (node)
- Signature must be cryptographically valid

The transaction will:
1. Calculate certificate expiration time
2. Update operator's certificate expiration
3. Deduct transaction fee (if applicable)
4. Update account timestamps

Note: Transaction fee may be waived if current certificate is more than 50% expired.

#### `query_certificate`
Queries and validates stake certificates for node operators.

**Transaction Parameters:**
```json
{
  "type": "query_certificate",
  "nominee": string,    // Node account ID
  "nominator": string,  // Operator account ID
  "sign": {
    "owner": string    // Must match nominee field
  }
}
```

Requirements:
- Both nominee and nominator accounts must exist
- Operator must have valid certificate
- Certificate must not be expired
- Must be signed by the nominee (node)
- Signature must be cryptographically valid

The transaction will:
1. Verify operator account status
2. Check certificate validity
3. Return signed stake certificate with:
   - Nominator and nominee IDs
   - Stake amount
   - Certificate expiration time
   - Validator signatures

Note: This transaction is used to verify node operator status and stake commitments.

#### `claim_reward`
Claims rewards for a node's participation in the network.

**Transaction Parameters:**
```json
{
  "type": "claim_reward",
  "nominee": string,              // Node account ID
  "nominator": string,            // Operator account ID
  "deactivatedNodeId": string,    // ID of deactivated node
  "nodeDeactivatedTime": number,  // Time node was deactivated
  "cycle": number,                // Cycle number
  "timestamp": number,
  "sign": {
    "owner": string              // Node signature
  }
}
```

Requirements:
- Node account must exist and have a nominator
- Node must have valid reward start time
- Node must not have reward end time set for this period
- Node must not have been already rewarded
- Must be signed by the node
- Signature must be cryptographically valid

The transaction will:
1. Calculate reward based on:
   - Node's reward rate
   - Duration in network
   - Network reward interval
2. Update node account:
   - Add reward amount
   - Set reward end time
   - Update node statistics
3. Update operator account:
   - Update operator statistics
   - Record node operation history
4. Update timestamps for both accounts

#### `apply_penalty`
Applies penalties to nodes for violations of network rules.

**Transaction Parameters:**
```json
{
  "type": "apply_penalty",
  "reportedNodeId": string,           // ID of node being penalized
  "reportedNodePublickKey": string,   // Public key of node
  "nominator": string,                // Operator account ID
  "violationType": number,            // Type of violation
  "violationData": object,            // Details of violation
  "timestamp": number,
  "sign": {
    "owner": string                   // Node signature
  }
}
```

Violation Types:
- Left Network Early: Node left before proper deactivation
- Node Refuted: Node was proven to act maliciously
- Syncing Too Long: Node failed to sync in required time
- Double Vote: Node voted multiple times (not implemented)

Requirements:
- Node and operator accounts must exist
- Violation type must be valid
- Violation must not have been already penalized
- Corresponding slashing must be enabled in network
- Must be signed by reporting node
- Signature must be cryptographically valid

The transaction will:
1. Calculate penalty amount based on violation type
2. Update operator account:
   - Reduce stake by penalty amount
   - Update penalty statistics
3. Update node account:
   - Reduce stake lock by penalty amount
   - Add penalty amount
   - Update penalty history
   - Set reward end time if applicable
4. Update timestamps for both accounts

Note: Penalty amounts are typically a percentage of staked amount, configured per violation type.
