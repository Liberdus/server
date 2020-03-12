// tslint:disable: variable-name

import { Static, Number, String, Record, Dictionary, Array, Unknown, Literal, Boolean, Union } from 'runtypes'

const Sign = Record({
  owner: String,
  sig: String,
})

export const JoinRequest = Record({
  cycleMarker: String,
  nodeInfo: Record({
    activeTimestamp: Number,
    address: String,
    externalIp: String,
    externalPort: Number,
    internalIp: String,
    internalPort: Number,
    joinRequestTimestamp: Number,
    publicKey: String,
  }),
  proofOfWork: Record({
    compute: Record({
      hash: String,
      nonce: String,
    }),
  }),
  selectionNum: String,
  sign: Record({
    owner: String,
    sig: String,
  }),
})

export const StateBroadcast = Record({
  payload: Record({
    stateList: Array(
      Record({
        accountCreated: Boolean,
        accountId: String,
        data: Unknown,
        isPartial: Boolean,
        stateId: String,
        timestamp: Number,
      }),
    ),
    txId: String,
  }),
  sender: String,
  tracker: String,
  tag: String,
})

// {
//   "url": "gossip",
//   "body": {
//     "payload": ... ,
//     "sender": "3badaaf288243f451a3a77847b325563042fabba1524a20fb6603489ecd9a79a",
//     "tracker": "gkey_d7fcxd3870_1581958525257_211",
//     "tag": "712ca321a38dc02182677daa4e97d6fd7cbfb82a764c5278422a0ed2d019e1232f44abb29d37d563a7f82f3b2ff4186468471615b36c7c771bdf5ed655e30ee8"
//   }
// }

const Gossip = Record({
  payload: Unknown,
  sender: String,
  tracker: String,
  tag: String,
})

// -------------------- START OF PAYLOAD TYPES FOR GOSSIP TRANSACTION ----------------------
const CertificatePayload = Record({
  data: Record({
    marker: String,
    sign: Sign,
    signer: String,
  }),
  type: Literal('certificate'),
})

const LostNodePayload = Record({
  data: Record({
    lostMessage: Record({
      cycleCounter: Number,
      investigator: String,
      lastCycleMarker: String,
      sign: Sign,
      source: String,
      target: String,
      tag: String,
    }),
    sign: Sign,
  }),
  type: Literal('lostnodedown'),
})

const SpreadTxToGroupPayload = Record({
  data: Record({
    data: Unknown,
    id: String,
    receipt: Record({
      sign: Sign,
      stateId: Unknown,
      targetStateId: Unknown,
      time: Number,
      txHash: String,
    }),
    status: Number,
    timestamp: Number,
  }),
  type: Literal('spread_tx_to_group'),
})
// -------------------- END OF PAYLOAD TYPES FOR GOSSIP TRANSACTION ----------------------

const PartitionResultsPayload = Record({
  Cycle_number: Number,
  partitionResults: Array(
    Record({
      Cycle_number: Number,
      Partition_hash: String,
      Partition_id: Number,
      hashSet: String,
      sign: Sign,
    }),
  ),
})

// {
//   "url": "cycleupdates",
//   "body": {
//     "payload": {
//       "myCertificate": {
//         "marker": "9c4a2d5206396b86337c45d23bf4e7f436dc2d61bc15435ac9c6776e346c81dc",
//         "sign": {
//           "owner": "0a961cb371ad29a7251083c2e7da67a50c34341997b285c6de8551be690a0e2b",
//           "sig": "46caa92f89f9f66717b5a406099065ab895296e3dcf0ae0da3a7607b294ca9ee3c8c4b260b7c234a298f39fa9fd984c7f93c7166b05b09ea648e66970956e00c417e5a72db2c3cc10648a518569bbd0a9a8245368862ac38819fc905dab509b1"
//         },
//         "signer": "2ba77e62346bfd1ac482ff624030649cbc149bc84a9b95fc160b11b8563f6c62"
//       },
//       "myCycleUpdates": {
//         "active": [],
//         "apoptosis": [],
//         "archiverJoinRequests": [],
//         "bestJoinRequests": [],
//         "lost": {
//           "down": [],
//           "up": []
//         },
//         "scaling": {
//           "down": [],
//           "up": []
//         }
//       }
//     },
//     "sender": "b174c43e3c636fbb5aaac5864b18fdb0fdf0fb124f5738174e91092477690846",
//     "tracker": "key_b174x90846_1581958405253_111",
//     "tag": "2a75b5ab43c3aea0c98e51584f3d969a26fcd1ebe02ad8b3b8a07d6a170ff7285068c465bf2b925741a1f429a3e52804427f9f64aa32fa3db73914d4f64beb98"
//   }
// }

//TODO: NOT SURE WHAT FORM THESE ARRAYS TAKE SO LEAVING UNKNOWN FOR NOW
const CycleUpdatesPayload = Record({
  myCertificate: Record({
    marker: String,
    sign: Sign,
    signer: String,
  }),
  myCycleUpdates: Record({
    active: Array(
      Record({
        nodeId: String,
        sign: Sign,
        status: Literal('active'),
        timestamp: Number,
      }),
    ),
    apoptosis: Array(Unknown),
    archiverJoinRequests: Array(Unknown),
    bestJoinRequests: Array(Unknown),
    lost: Record({
      down: Array(Unknown),
      up: Array(Unknown),
    }),
    scaling: Record({
      down: Array(Unknown),
      up: Array(Unknown),
    }),
  }),
})

const CycleChainPayload = Record({
  end: Number,
  start: Number,
})

const GetAccountDataWithQueueHintsPayload = Record({
  accountIds: Array(String),
})

const GetAccountStatePayload = Record({
  accountState: String,
  accountStart: String,
  tsStart: Number,
  tsEnd: Number,
})

export type JoinRequest = Static<typeof JoinRequest>
export type Gossip = Static<typeof Gossip>

// {"payload":{},"sender":"2365xdb640","tag":"1074xx1140f","tracker":"key_2365xdb640_1581448859447_0"}
export const InternalAsk = Record({
  payload: Union(Record({}), Dictionary(Unknown, 'string')),
  sender: String,
  tag: String,
  tracker: String,
})
export type InternalAsk = Static<typeof InternalAsk>
