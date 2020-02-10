"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
var fs = require('fs');
var path = require('path');
var shardus = require('shardus-global-server');
var crypto = require('shardus-crypto-utils');
var stringify = require('fast-stable-stringify');
var axios = require('axios');
var Decimal = require('decimal.js');
var set = require('dot-prop').set;
var _ = require('lodash');
var heapdump = require('heapdump');
crypto('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc');
// THE ENTIRE APP STATE FOR THIS NODE
var accounts = {};
var networkAccount = '0'.repeat(64);
// DYNAMIC LOCAL DATA HELD BY THE NODES
var IN_SYNC = false;
var CURRENT, NEXT;
var WINDOWS, NEXT_WINDOWS, DEV_WINDOWS, NEXT_DEV_WINDOWS;
var ISSUE, DEV_ISSUE;
// VARIABLE FOR HELPING NODES DETERMINE WHEN TO RELEASE DEVELOPER FUNDS
var DEVELOPER_FUND, NEXT_DEVELOPER_FUND;
// HELPFUL TIME CONSTANTS IN MILLISECONDS
var ONE_SECOND = 1000;
var ONE_MINUTE = 60 * ONE_SECOND;
var ONE_HOUR = 60 * ONE_MINUTE;
var ONE_DAY = 24 * ONE_HOUR;
var ONE_WEEK = 7 * ONE_DAY;
var ONE_YEAR = 365 * ONE_DAY;
var TIME_FOR_PROPOSALS = ONE_MINUTE + (ONE_SECOND * 30);
var TIME_FOR_VOTING = ONE_MINUTE + (ONE_SECOND * 30);
var TIME_FOR_GRACE = ONE_MINUTE + (ONE_SECOND * 30);
var TIME_FOR_APPLY = ONE_MINUTE + (ONE_SECOND * 30);
var TIME_FOR_DEV_PROPOSALS = ONE_MINUTE + (ONE_SECOND * 30);
var TIME_FOR_DEV_VOTING = ONE_MINUTE + (ONE_SECOND * 30);
var TIME_FOR_DEV_GRACE = ONE_MINUTE + (ONE_SECOND * 30);
var TIME_FOR_DEV_APPLY = ONE_MINUTE + (ONE_SECOND * 30);
// MIGHT BE USEFUL TO HAVE TIME CONSTANTS IN THE FORM OF CYCLES
var cycleDuration = 15;
var CYCLES_PER_MINUTE = ONE_MINUTE / 1000 / cycleDuration;
var CYCLES_PER_HOUR = 60 * CYCLES_PER_MINUTE;
var CYCLES_PER_DAY = 24 * CYCLES_PER_HOUR;
var CYCLES_PER_WEEK = 7 * CYCLES_PER_DAY;
var CYCLES_PER_YEAR = 365 * CYCLES_PER_DAY;
var config = {};
if (process.env.BASE_DIR) {
    if (fs.existsSync(path.join(process.env.BASE_DIR, 'config.json'))) {
        config = JSON.parse(fs.readFileSync(path.join(process.env.BASE_DIR, 'config.json')));
    }
    config.server.baseDir = process.env.BASE_DIR;
}
// CONFIGURATION PARAMETERS PASSED INTO SHARDUS
set(config, 'server.p2p', {
    cycleDuration: cycleDuration,
    existingArchivers: JSON.parse(process.env.APP_SEEDLIST || '[{ "ip": "127.0.0.1", "port": 4000, "publicKey": "758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3" }]'),
    maxNodesPerCycle: 10,
    minNodes: 10,
    maxNodes: 10,
    minNodesToAllowTxs: 1,
    maxNodesToRotate: 1,
    maxPercentOfDelta: 40
});
if (process.env.APP_IP) {
    set(config, 'server.ip', {
        externalIp: process.env.APP_IP,
        internalIp: process.env.APP_IP
    });
}
set(config, 'server.loadDetection', {
    queueLimit: 1000,
    desiredTxTime: 15,
    highThreshold: 0.8,
    lowThreshold: 0.2
});
set(config, 'server.reporting', {
    recipient: "http://" + (process.env.APP_MONITOR || '0.0.0.0') + ":3000/api",
    interval: 1
});
set(config, 'server.rateLimiting', {
    limitRate: true,
    loadLimit: 0.5
});
set(config, 'server.sharding', {
    nodesPerConsensusGroup: 5
});
set(config, 'logs', {
    dir: './logs',
    files: { main: '', fatal: '', net: '', app: '' },
    options: {
        appenders: {
            app: {
                type: 'file',
                maxLogSize: 10000000,
                backups: 10
            },
            errorFile: {
                type: 'file',
                maxLogSize: 10000000,
                backups: 2
            },
            errors: {
                type: 'logLevelFilter',
                level: 'ERROR',
                appender: 'errorFile'
            },
            main: {
                type: 'file',
                maxLogSize: 10000000,
                backups: 2
            },
            fatal: {
                type: 'file',
                maxLogSize: 10000000,
                backups: 2
            },
            net: {
                type: 'file',
                maxLogSize: 10000000,
                backups: 2
            },
            playback: {
                type: 'file',
                maxLogSize: 10000000,
                backups: 2
            },
            shardDump: {
                type: 'file',
                maxLogSize: 10000000,
                backups: 2
            }
        },
        categories: {
            "default": { appenders: ['out'], level: 'fatal' },
            app: { appenders: ['app', 'errors'], level: 'trace' },
            main: { appenders: ['main', 'errors'], level: 'trace' },
            fatal: { appenders: ['fatal'], level: 'fatal' },
            net: { appenders: ['net'], level: 'trace' },
            playback: { appenders: ['playback'], level: 'trace' },
            shardDump: { appenders: ['shardDump'], level: 'trace' }
        }
    }
});
/**
 * @typedef {import('shardus-enterprise-server/src/shardus')} Shardus
 * @typedef {import('shardus-enterprise-server/src/shardus').App} App
 * @typedef {import('shardus-enterprise-server/src/shardus').IncomingTransaction} IncomingTransaction
 * @typedef {import('shardus-enterprise-server/src/shardus').IncomingTransactionResult} IncomingTransactionResult
 * @implements {App}
 */
var dapp = shardus(config);
// INITIAL PARAMETERS THE NODES SET WHEN THEY BECOME ACTIVE
function syncParameters(timestamp) {
    return __awaiter(this, void 0, void 0, function () {
        var account, proposalWindow, votingWindow, graceWindow, applyWindow;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dapp.getLocalOrRemoteAccount(networkAccount)
                    // IF THE NETWORK ACCOUNT HAS BEEN INITIALIZED
                ];
                case 1:
                    account = _a.sent();
                    // IF THE NETWORK ACCOUNT HAS BEEN INITIALIZED
                    if (account && account.data) {
                        console.log("NETWORK ACCOUNT: " + stringify(account.data));
                        dapp.log("NETWORK ACCOUNT: " + stringify(account.data));
                        CURRENT = account.data.current;
                        NEXT = account.data.next;
                        WINDOWS = account.data.windows;
                        NEXT_WINDOWS = account.data.nextWindows;
                        ISSUE = account.data.issue;
                        IN_SYNC = true;
                    }
                    else {
                        proposalWindow = [timestamp, timestamp + TIME_FOR_PROPOSALS];
                        votingWindow = [
                            proposalWindow[1],
                            proposalWindow[1] + TIME_FOR_VOTING
                        ];
                        graceWindow = [votingWindow[1], votingWindow[1] + TIME_FOR_GRACE];
                        applyWindow = [graceWindow[1], graceWindow[1] + TIME_FOR_APPLY];
                        CURRENT = {
                            nodeRewardInterval: ONE_MINUTE * 2,
                            nodeRewardAmount: 10,
                            nodePenalty: 100,
                            transactionFee: 0.001,
                            stakeRequired: 500,
                            maintenanceInterval: ONE_MINUTE,
                            maintenanceFee: 0.01,
                            proposalFee: 500,
                            devProposalFee: 20
                        };
                        NEXT = {
                            nodeRewardInterval: ONE_MINUTE * 2,
                            nodeRewardAmount: 10,
                            nodePenalty: 100,
                            transactionFee: 0.001,
                            stakeRequired: 500,
                            maintenanceInterval: ONE_MINUTE,
                            maintenanceFee: 0.01,
                            proposalFee: 500,
                            devProposalFee: 20
                        };
                        WINDOWS = {
                            proposalWindow: proposalWindow,
                            votingWindow: votingWindow,
                            graceWindow: graceWindow,
                            applyWindow: applyWindow
                        };
                        NEXT_WINDOWS = {
                            proposalWindow: proposalWindow,
                            votingWindow: votingWindow,
                            graceWindow: graceWindow,
                            applyWindow: applyWindow
                        };
                        ISSUE = 1;
                        IN_SYNC = false;
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function syncDevParameters(timestamp) {
    return __awaiter(this, void 0, void 0, function () {
        var account, devProposalWindow, devVotingWindow, devGraceWindow, devApplyWindow;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dapp.getLocalOrRemoteAccount(networkAccount)
                    // IF THE NETWORK ACCOUNT HAS BEEN INITIALIZED
                ];
                case 1:
                    account = _a.sent();
                    // IF THE NETWORK ACCOUNT HAS BEEN INITIALIZED
                    if (account && account.data) {
                        console.log("NETWORK ACCOUNT: " + stringify(account.data));
                        dapp.log("NETWORK ACCOUNT: " + stringify(account.data));
                        DEV_WINDOWS = account.data.devWindows;
                        NEXT_DEV_WINDOWS = account.data.nextDevWindows;
                        DEVELOPER_FUND = account.data.developerFund;
                        NEXT_DEVELOPER_FUND = account.data.nextDeveloperFund;
                        DEV_ISSUE = account.data.devIssue;
                        IN_SYNC = true;
                    }
                    else {
                        devProposalWindow = [timestamp, timestamp + TIME_FOR_DEV_PROPOSALS];
                        devVotingWindow = [
                            devProposalWindow[1],
                            devProposalWindow[1] + TIME_FOR_DEV_VOTING
                        ];
                        devGraceWindow = [
                            devVotingWindow[1],
                            devVotingWindow[1] + TIME_FOR_DEV_GRACE
                        ];
                        devApplyWindow = [
                            devGraceWindow[1],
                            devGraceWindow[1] + TIME_FOR_DEV_APPLY
                        ];
                        DEV_WINDOWS = {
                            devProposalWindow: devProposalWindow,
                            devVotingWindow: devVotingWindow,
                            devGraceWindow: devGraceWindow,
                            devApplyWindow: devApplyWindow
                        };
                        NEXT_DEV_WINDOWS = {
                            devProposalWindow: devProposalWindow,
                            devVotingWindow: devVotingWindow,
                            devGraceWindow: devGraceWindow,
                            devApplyWindow: devApplyWindow
                        };
                        DEVELOPER_FUND = [];
                        NEXT_DEVELOPER_FUND = [];
                        DEV_ISSUE = 1;
                        IN_SYNC = false;
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// CREATE A USER ACCOUNT
function createAccount(accountId, timestamp) {
    var account = {
        id: accountId,
        data: {
            balance: 5000,
            toll: 1,
            chats: {},
            friends: {},
            transactions: []
        },
        hash: '',
        lastMaintenance: timestamp,
        timestamp: 0
    };
    account.hash = crypto.hashObj(account);
    return account;
}
// CREATE A NODE ACCOUNT FOR MINING
function createNode(accountId) {
    var account = {
        id: accountId,
        balance: 0,
        hash: '',
        timestamp: 0
    };
    account.hash = crypto.hashObj(account);
    return account;
}
function createChat(accountId) {
    var chat = {
        id: accountId,
        messages: [],
        timestamp: 0,
        hash: ''
    };
    chat.hash = crypto.hashObj(chat);
    return chat;
}
// CREATE AN ALIAS ACCOUNT
function createAlias(accountId) {
    var alias = {
        id: accountId,
        hash: '',
        timestamp: 0
    };
    alias.hash = crypto.hashObj(alias);
    return alias;
}
// CREATE THE INITIAL NETWORK ACCOUNT
function createNetworkAccount(accountId) {
    var account = {
        id: accountId,
        current: CURRENT,
        next: {},
        windows: WINDOWS,
        nextWindows: {},
        devWindows: DEV_WINDOWS,
        nextDevWindows: {},
        issue: ISSUE,
        devIssue: DEV_ISSUE,
        developerFund: [],
        nextDeveloperFund: [],
        hash: '',
        timestamp: 0
    };
    account.hash = crypto.hashObj(account);
    return account;
}
// CREATE AN ISSUE ACCOUNT
function createIssue(accountId) {
    var issue = {
        id: accountId,
        proposals: [],
        proposalCount: 0,
        hash: '',
        timestamp: 0
    };
    issue.hash = crypto.hashObj(issue);
    return issue;
}
// CREATE A DEV_ISSUE ACCOUNT
function createDevIssue(accountId) {
    var devIssue = {
        id: accountId,
        devProposals: [],
        devProposalCount: 0,
        hash: '',
        timestamp: 0
    };
    devIssue.hash = crypto.hashObj(devIssue);
    return devIssue;
}
// CREATE A PROPOSAL ACCOUNT
function createProposal(accountId) {
    var proposal = {
        id: accountId,
        power: 0,
        totalVotes: 0,
        hash: '',
        timestamp: 0
    };
    proposal.hash = crypto.hashObj(proposal);
    return proposal;
}
// CREATE A DEV_PROPOSAL ACCOUNT
function createDevProposal(accountId) {
    var devProposal = {
        id: accountId,
        approve: 0,
        reject: 0,
        totalVotes: 0,
        hash: '',
        timestamp: 0
    };
    devProposal.hash = crypto.hashObj(devProposal);
    return devProposal;
}
// API
dapp.registerExternalPost('inject', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        try {
            result = dapp.put(req.body);
            res.json({ result: result });
        }
        catch (error) {
            dapp.log(error);
            res.json({ error: error });
        }
        return [2 /*return*/];
    });
}); });
dapp.registerExternalGet('network/parameters/node', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        try {
            res.json({
                parameters: {
                    CURRENT: CURRENT,
                    NEXT: NEXT,
                    ISSUE: ISSUE,
                    DEV_ISSUE: DEV_ISSUE,
                    DEVELOPER_FUND: DEVELOPER_FUND,
                    NEXT_DEVELOPER_FUND: NEXT_DEVELOPER_FUND,
                    WINDOWS: WINDOWS,
                    NEXT_WINDOWS: NEXT_WINDOWS,
                    DEV_WINDOWS: DEV_WINDOWS,
                    NEXT_DEV_WINDOWS: NEXT_DEV_WINDOWS,
                    IN_SYNC: IN_SYNC
                }
            });
        }
        catch (error) {
            dapp.log(error);
            res.json({ error: error });
        }
        return [2 /*return*/];
    });
}); });
dapp.registerExternalGet('network/parameters/node/next', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        try {
            res.json({ parameters: NEXT });
        }
        catch (error) {
            dapp.log(error);
            res.json({ error: error });
        }
        return [2 /*return*/];
    });
}); });
dapp.registerExternalGet('network/parameters', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var network, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(networkAccount)];
            case 1:
                network = _a.sent();
                res.json({
                    parameters: {
                        CURRENT: network.data.current,
                        NEXT: network.data.next,
                        DEVELOPER_FUND: network.data.developerFund,
                        NEXT_DEVELOPER_FUND: network.data.nextDeveloperFund,
                        WINDOWS: network.data.windows,
                        DEV_WINDOWS: network.data.devWindows,
                        NEXT_WINDOWS: network.data.nextWindows,
                        NEXT_DEV_WINDOWS: network.data.nextDevWindows,
                        ISSUE: network.data.issue,
                        DEV_ISSUE: network.data.devIssue
                    }
                });
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                dapp.log(error_1);
                res.json({ error: error_1 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('network/parameters/next', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var network, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(networkAccount)];
            case 1:
                network = _a.sent();
                res.json({ parameters: network.data.next });
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                dapp.log(error_2);
                res.json({ error: error_2 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('network/windows/all', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        try {
            res.json({
                windows: WINDOWS,
                devWindows: DEV_WINDOWS
            });
        }
        catch (error) {
            res.json({ error: error });
        }
        return [2 /*return*/];
    });
}); });
dapp.registerExternalGet('network/windows', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var network, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(networkAccount)];
            case 1:
                network = _a.sent();
                res.json({ windows: network.data.windows });
                return [3 /*break*/, 3];
            case 2:
                error_3 = _a.sent();
                res.json({ error: error_3 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('network/windows/dev', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var network, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(networkAccount)];
            case 1:
                network = _a.sent();
                res.json({ devWindows: network.data.devWindows });
                return [3 /*break*/, 3];
            case 2:
                error_4 = _a.sent();
                res.json({ error: error_4 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('issues', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var issues, i, issue, error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 5, , 6]);
                issues = [];
                i = 1;
                _a.label = 1;
            case 1:
                if (!(i <= ISSUE)) return [3 /*break*/, 4];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("issue-" + i))];
            case 2:
                issue = _a.sent();
                if (issue && issue.data) {
                    issues.push(issue.data);
                }
                _a.label = 3;
            case 3:
                i++;
                return [3 /*break*/, 1];
            case 4:
                res.json({ issues: issues });
                return [3 /*break*/, 6];
            case 5:
                error_5 = _a.sent();
                dapp.log(error_5);
                res.json({ error: error_5 });
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('issues/latest', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var issue, error_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("issue-" + ISSUE))];
            case 1:
                issue = _a.sent();
                res.json({ issue: issue && issue.data });
                return [3 /*break*/, 3];
            case 2:
                error_6 = _a.sent();
                dapp.log(error_6);
                res.json({ error: error_6 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('issues/count', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        try {
            res.json({ count: ISSUE });
        }
        catch (error) {
            dapp.log(error);
            res.json({ error: error });
        }
        return [2 /*return*/];
    });
}); });
dapp.registerExternalGet('issues/dev', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var devIssues, i, devIssue, error_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 5, , 6]);
                devIssues = [];
                i = 1;
                _a.label = 1;
            case 1:
                if (!(i <= DEV_ISSUE)) return [3 /*break*/, 4];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("dev-issue-" + i))];
            case 2:
                devIssue = _a.sent();
                if (devIssue && devIssue.data) {
                    devIssues.push(devIssue.data);
                }
                _a.label = 3;
            case 3:
                i++;
                return [3 /*break*/, 1];
            case 4:
                res.json({ devIssues: devIssues });
                return [3 /*break*/, 6];
            case 5:
                error_7 = _a.sent();
                dapp.log(error_7);
                res.json({ error: error_7 });
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('issues/dev/latest', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var devIssue, error_8;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("dev-issue-" + DEV_ISSUE))];
            case 1:
                devIssue = _a.sent();
                res.json({ devIssue: devIssue && devIssue.data });
                return [3 /*break*/, 3];
            case 2:
                error_8 = _a.sent();
                dapp.log(error_8);
                res.json({ error: error_8 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('issues/dev/count', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        try {
            res.json({ count: DEV_ISSUE });
        }
        catch (error) {
            dapp.log(error);
            res.json({ error: error });
        }
        return [2 /*return*/];
    });
}); });
dapp.registerExternalGet('proposals', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var proposals, i, issue, proposalCount, j, proposal, error_9;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 8, , 9]);
                proposals = [];
                i = 1;
                _a.label = 1;
            case 1:
                if (!(i <= ISSUE)) return [3 /*break*/, 7];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("issue-" + i))];
            case 2:
                issue = _a.sent();
                proposalCount = issue && issue.data.proposalCount;
                j = 1;
                _a.label = 3;
            case 3:
                if (!(j <= proposalCount)) return [3 /*break*/, 6];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("issue-" + i + "-proposal-" + j))];
            case 4:
                proposal = _a.sent();
                if (proposal && proposal.data) {
                    proposals.push(proposal.data);
                }
                _a.label = 5;
            case 5:
                j++;
                return [3 /*break*/, 3];
            case 6:
                i++;
                return [3 /*break*/, 1];
            case 7:
                res.json({ proposals: proposals });
                return [3 /*break*/, 9];
            case 8:
                error_9 = _a.sent();
                dapp.log(error_9);
                res.json({ error: error_9 });
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('proposals/latest', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var issue, proposalCount, proposals, i, proposal, error_10;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 6, , 7]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("issue-" + ISSUE))];
            case 1:
                issue = _a.sent();
                proposalCount = issue && issue.data.proposalCount;
                proposals = [];
                i = 1;
                _a.label = 2;
            case 2:
                if (!(i <= proposalCount)) return [3 /*break*/, 5];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("issue-" + ISSUE + "-proposal-" + i))];
            case 3:
                proposal = _a.sent();
                if (proposal && proposal.data) {
                    proposals.push(proposal.data);
                }
                _a.label = 4;
            case 4:
                i++;
                return [3 /*break*/, 2];
            case 5:
                res.json({ proposals: proposals });
                return [3 /*break*/, 7];
            case 6:
                error_10 = _a.sent();
                dapp.log(error_10);
                res.json({ error: error_10 });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('proposals/count', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var issue, error_11;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("issue-" + ISSUE))];
            case 1:
                issue = _a.sent();
                res.json({ count: issue && issue.data.proposalCount });
                return [3 /*break*/, 3];
            case 2:
                error_11 = _a.sent();
                dapp.log(error_11);
                res.json({ error: error_11 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('proposals/dev', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var devProposals, i, devIssue, devProposalCount, j, devProposal, error_12;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 8, , 9]);
                devProposals = [];
                i = 1;
                _a.label = 1;
            case 1:
                if (!(i <= DEV_ISSUE)) return [3 /*break*/, 7];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("dev-issue-" + i))];
            case 2:
                devIssue = _a.sent();
                devProposalCount = devIssue && devIssue.data.devProposalCount;
                j = 1;
                _a.label = 3;
            case 3:
                if (!(j <= devProposalCount)) return [3 /*break*/, 6];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("dev-issue-" + i + "-dev-proposal-" + j))];
            case 4:
                devProposal = _a.sent();
                if (devProposal && devProposal.data) {
                    devProposals.push(devProposal.data);
                }
                _a.label = 5;
            case 5:
                j++;
                return [3 /*break*/, 3];
            case 6:
                i++;
                return [3 /*break*/, 1];
            case 7:
                res.json({ devProposals: devProposals });
                return [3 /*break*/, 9];
            case 8:
                error_12 = _a.sent();
                dapp.log(error_12);
                res.json({ error: error_12 });
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('proposals/dev/latest', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var issue, devProposalCount, devProposals, i, devProposal, error_13;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 6, , 7]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("dev-issue-" + DEV_ISSUE))];
            case 1:
                issue = _a.sent();
                devProposalCount = issue && issue.data.devProposalCount;
                devProposals = [];
                i = 1;
                _a.label = 2;
            case 2:
                if (!(i <= devProposalCount)) return [3 /*break*/, 5];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("dev-issue-" + DEV_ISSUE + "-dev-proposal-" + i))];
            case 3:
                devProposal = _a.sent();
                if (devProposal && devProposal.data) {
                    devProposals.push(devProposal.data);
                }
                _a.label = 4;
            case 4:
                i++;
                return [3 /*break*/, 2];
            case 5:
                res.json({ devProposals: devProposals });
                return [3 /*break*/, 7];
            case 6:
                error_13 = _a.sent();
                dapp.log(error_13);
                res.json({ error: error_13 });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('proposals/dev/count', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var devIssue, error_14;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("dev-issue-" + DEV_ISSUE))];
            case 1:
                devIssue = _a.sent();
                res.json({ count: devIssue && devIssue.data.devProposalCount });
                return [3 /*break*/, 3];
            case 2:
                error_14 = _a.sent();
                dapp.log(error_14);
                res.json({ error: error_14 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('account/:id', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, account, error_15;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params['id'];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(id)];
            case 1:
                account = _a.sent();
                res.json({ account: account && account.data });
                return [3 /*break*/, 3];
            case 2:
                error_15 = _a.sent();
                dapp.log(error_15);
                res.json({ error: error_15 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('account/:id/alias', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, account, error_16;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params['id'];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(id)];
            case 1:
                account = _a.sent();
                res.json({ handle: account && account.data.alias });
                return [3 /*break*/, 3];
            case 2:
                error_16 = _a.sent();
                dapp.log(error_16);
                res.json({ error: error_16 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('account/:id/transactions', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, account, error_17;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params['id'];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(id)];
            case 1:
                account = _a.sent();
                res.json({ transactions: account && account.data.data.transactions });
                return [3 /*break*/, 3];
            case 2:
                error_17 = _a.sent();
                dapp.log(error_17);
                res.json({ error: error_17 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('account/:id/balance', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, account, error_18;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params['id'];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(id)];
            case 1:
                account = _a.sent();
                if (account) {
                    res.json({ balance: account && account.data.data.balance });
                }
                else {
                    res.json({ error: 'No account with the given id' });
                }
                return [3 /*break*/, 3];
            case 2:
                error_18 = _a.sent();
                dapp.log(error_18);
                res.json({ error: error_18 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('account/:id/toll', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, account, error_19;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params['id'];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(id)];
            case 1:
                account = _a.sent();
                if (account) {
                    res.json({ toll: account.data.data.toll });
                }
                else {
                    res.json({ error: 'No account with the given id' });
                }
                return [3 /*break*/, 3];
            case 2:
                error_19 = _a.sent();
                dapp.log(error_19);
                res.json({ error: error_19 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('address/:name', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var name_1, account, error_20;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                name_1 = req.params['name'];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(name_1)];
            case 1:
                account = _a.sent();
                if (account && account.data) {
                    res.json({ address: account.data.address });
                }
                else {
                    res.json({ error: 'No account exists for the given handle' });
                }
                return [3 /*break*/, 3];
            case 2:
                error_20 = _a.sent();
                dapp.log(error_20);
                res.json({ error: error_20 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('account/:id/:friendId/toll', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, friendId, account, error_21;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = req.params['id'];
                friendId = req.params['friendId'];
                if (!id) {
                    res.json({
                        error: 'No provided id in the route: account/:id/:friendId/toll'
                    });
                }
                if (!friendId) {
                    res.json({
                        error: 'No provided friendId in the route: account/:id/:friendId/toll'
                    });
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(id)];
            case 2:
                account = _a.sent();
                if (account && account.data.data.friends[friendId]) {
                    res.json({ toll: 0 });
                }
                else if (account) {
                    res.json({ toll: account.data.data.toll });
                }
                else {
                    res.json({ error: 'No account found with the given id' });
                }
                return [3 /*break*/, 4];
            case 3:
                error_21 = _a.sent();
                dapp.log(error_21);
                res.json({ error: error_21 });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('account/:id/friends', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, account, error_22;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params['id'];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(id)];
            case 1:
                account = _a.sent();
                if (account) {
                    res.json({ friends: account.data.data.friends });
                }
                else {
                    res.json({ error: 'No account for given id' });
                }
                return [3 /*break*/, 3];
            case 2:
                error_22 = _a.sent();
                dapp.log(error_22);
                res.json({ error: error_22 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('account/:id/recentMessages', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, messages_1, account, error_23;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params['id'];
                messages_1 = [];
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(id)];
            case 1:
                account = _a.sent();
                if (account) {
                    Object.values(account.data.data.chats).forEach(function (chat) {
                        messages_1.push.apply(messages_1, chat.messages);
                    });
                    res.json({ messages: messages_1 });
                }
                else {
                    res.json({ error: 'No account for given id' });
                }
                return [3 /*break*/, 3];
            case 2:
                error_23 = _a.sent();
                dapp.log(error_23);
                res.json({ error: error_23 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('accounts', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        res.json({ accounts: accounts });
        return [2 /*return*/];
    });
}); });
dapp.registerExternalGet('messages/:chatId', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var chatId, chat, error_24;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                chatId = req.params.chatId;
                return [4 /*yield*/, dapp.getLocalOrRemoteAccount(chatId)];
            case 1:
                chat = _a.sent();
                if (!chat) {
                    res.json({ error: "Chat doesn't exist" });
                    return [2 /*return*/];
                }
                if (!chat.data.messages) {
                    res.json({ error: 'no chat history for this request' });
                }
                else {
                    res.json({ messages: chat.data.messages });
                }
                return [3 /*break*/, 3];
            case 2:
                error_24 = _a.sent();
                dapp.log(error_24);
                res.json({ error: error_24 });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
dapp.registerExternalGet('debug/dump', function (req, res) {
    var D = new Date();
    var dateString = D.getDate() + '-' + (D.getMonth() + 1) + '-' + D.getFullYear() + '_' + D.getHours() + ':' + D.getMinutes();
    // 16-5-2015 9:50
    heapdump.writeSnapshot(config.server.baseDir + "/logs/ " + dateString + '.heapsnapshot', function (error, filename) {
        if (error) {
            console.log(error);
            res.json({ error: error });
        }
        else {
            console.log('dump written to', filename);
            res.json({ success: 'Dump was written to ' + filename });
        }
    });
});
// SDK SETUP FUNCTIONS
dapp.setup({
    sync: function () {
        return __awaiter(this, void 0, void 0, function () {
            var timestamp, nodeId, address, proposalWindow, votingWindow, graceWindow, applyWindow, devProposalWindow, devVotingWindow, devGraceWindow, devApplyWindow, account;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!dapp.p2p.isFirstSeed) return [3 /*break*/, 3];
                        return [4 /*yield*/, _sleep(ONE_SECOND * 20)];
                    case 1:
                        _a.sent();
                        timestamp = Date.now();
                        nodeId = dapp.getNodeId();
                        address = dapp.getNode(nodeId).address;
                        proposalWindow = [timestamp, timestamp + TIME_FOR_PROPOSALS];
                        votingWindow = [
                            proposalWindow[1],
                            proposalWindow[1] + TIME_FOR_VOTING
                        ];
                        graceWindow = [votingWindow[1], votingWindow[1] + TIME_FOR_GRACE];
                        applyWindow = [graceWindow[1], graceWindow[1] + TIME_FOR_APPLY];
                        devProposalWindow = [timestamp, timestamp + TIME_FOR_DEV_PROPOSALS];
                        devVotingWindow = [
                            devProposalWindow[1],
                            devProposalWindow[1] + TIME_FOR_DEV_VOTING
                        ];
                        devGraceWindow = [
                            devVotingWindow[1],
                            devVotingWindow[1] + TIME_FOR_DEV_GRACE
                        ];
                        devApplyWindow = [
                            devGraceWindow[1],
                            devGraceWindow[1] + TIME_FOR_DEV_APPLY
                        ];
                        CURRENT = {
                            nodeRewardInterval: ONE_MINUTE * 2,
                            nodeRewardAmount: 10,
                            nodePenalty: 100,
                            transactionFee: 0.01,
                            stakeRequired: 500,
                            maintenanceInterval: 600000,
                            maintenanceFee: 0,
                            proposalFee: 500,
                            devProposalFee: 100
                        };
                        NEXT = {
                            nodeRewardInterval: ONE_MINUTE * 2,
                            nodeRewardAmount: 10,
                            nodePenalty: 100,
                            transactionFee: 0.01,
                            stakeRequired: 500,
                            maintenanceInterval: 600000,
                            maintenanceFee: 0,
                            proposalFee: 500,
                            devProposalFee: 100
                        };
                        WINDOWS = {
                            proposalWindow: proposalWindow,
                            votingWindow: votingWindow,
                            graceWindow: graceWindow,
                            applyWindow: applyWindow
                        };
                        NEXT_WINDOWS = {
                            proposalWindow: proposalWindow,
                            votingWindow: votingWindow,
                            graceWindow: graceWindow,
                            applyWindow: applyWindow
                        };
                        DEV_WINDOWS = {
                            devProposalWindow: devProposalWindow,
                            devVotingWindow: devVotingWindow,
                            devGraceWindow: devGraceWindow,
                            devApplyWindow: devApplyWindow
                        };
                        NEXT_DEV_WINDOWS = {
                            devProposalWindow: devProposalWindow,
                            devVotingWindow: devVotingWindow,
                            devGraceWindow: devGraceWindow,
                            devApplyWindow: devApplyWindow
                        };
                        DEVELOPER_FUND = [];
                        NEXT_DEVELOPER_FUND = [];
                        ISSUE = 1;
                        DEV_ISSUE = 1;
                        IN_SYNC = true;
                        dapp.set({
                            type: 'issue',
                            nodeId: nodeId,
                            from: address,
                            to: networkAccount,
                            issue: crypto.hash("issue-" + ISSUE),
                            proposal: crypto.hash("issue-" + ISSUE + "-proposal-1"),
                            timestamp: Date.now()
                        });
                        dapp.set({
                            type: 'dev_issue',
                            nodeId: nodeId,
                            from: address,
                            to: networkAccount,
                            devIssue: crypto.hash("dev-issue-" + DEV_ISSUE),
                            timestamp: Date.now()
                        });
                        return [4 /*yield*/, _sleep(ONE_SECOND * 10)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 9];
                    case 3: return [4 /*yield*/, dapp.getRemoteAccount(networkAccount)];
                    case 4:
                        account = _a.sent();
                        _a.label = 5;
                    case 5:
                        if (!!account) return [3 /*break*/, 8];
                        return [4 /*yield*/, _sleep(1000)];
                    case 6:
                        _a.sent();
                        return [4 /*yield*/, dapp.getRemoteAccount(networkAccount)];
                    case 7:
                        account = _a.sent();
                        return [3 /*break*/, 5];
                    case 8:
                        if (account && account.data) {
                            CURRENT = account.data.current;
                            NEXT = account.data.next;
                            WINDOWS = account.data.windows;
                            DEV_WINDOWS = account.data.devWindows;
                            NEXT_WINDOWS = account.data.nextWindows;
                            NEXT_DEV_WINDOWS = account.data.nextDevWindows;
                            DEVELOPER_FUND = account.data.developerFund;
                            NEXT_DEVELOPER_FUND = account.data.nextDeveloperFund;
                            ISSUE = account.data.issue;
                            DEV_ISSUE = account.data.devIssue;
                            IN_SYNC = true;
                        }
                        else {
                            dapp.log('ERROR: Unable to sync network data');
                        }
                        _a.label = 9;
                    case 9: return [2 /*return*/];
                }
            });
        });
    },
    validateTransaction: function (tx, wrappedStates) {
        var response = {
            result: 'fail',
            reason: 'Transaction is not valid.'
        };
        var from = wrappedStates[tx.from] && wrappedStates[tx.from].data;
        var to = wrappedStates[tx.to] && wrappedStates[tx.to].data;
        switch (tx.type) {
            case 'snapshot': {
                // if (tx.sign.owner !== ADMIN_ADDRESS) {
                //   response.reason = 'not signed by ADMIN account'
                //   return response
                // }
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'email': {
                var source = wrappedStates[tx.signedTx.from] && wrappedStates[tx.signedTx.from].data;
                if (!source) {
                    response.reason = 'no account associated with address in signed tx';
                    return response;
                }
                if (tx.signedTx.sign.owner !== tx.signedTx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx.signedTx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (tx.signedTx.emailHash !== crypto.hash(tx.email)) {
                    response.reason = 'Hash of the email does not match the signed email hash';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'gossip_email_hash': {
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'verify': {
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (typeof from.verified !== 'string') {
                    response.reason = 'From account has not been sent a verification email';
                    return response;
                }
                if (from.verified === true) {
                    response.reason = 'From account has already been verified';
                    return response;
                }
                if (crypto.hash(tx.code) !== from.verified) {
                    response.reason = 'Hash of code in tx does not match the hash of the verification code sent';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'register': {
                var alias = wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data;
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (!alias) {
                    response.reason = 'Alias account was not found for some reason';
                    return response;
                }
                if (alias.inbox === tx.alias) {
                    response.reason = 'This alias is already taken';
                    return response;
                }
                // if (from.data.balance < CURRENT.transactionFee) {
                //   response.reason = "From account doesn't have enough tokens to cover the transaction fee"
                //   return response
                // }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'create': {
                if (to === undefined || to === null) {
                    response.reason = "target account doesn't exist";
                    return response;
                }
                if (tx.amount < 1) {
                    response.reason = 'create amount needs to be positive (1 or greater)';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'transfer': {
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (from === undefined || from === null) {
                    response.reason = "from account doesn't exist";
                    return response;
                }
                if (to === undefined || to === null) {
                    response.reason = "To account doesn't exist";
                    return response;
                }
                if (from.data.balance < tx.amount + CURRENT.transactionFee) {
                    response.reason =
                        "from account doesn't have sufficient balance to cover the transaction";
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'distribute': {
                var recipients = tx.recipients.map(function (recipientId) { return wrappedStates[recipientId].data; });
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (from === undefined || from === null) {
                    response.reason = "from account doesn't exist";
                    return response;
                }
                recipients.forEach(function (recipient) {
                    if (!recipient) {
                        response.reason = 'no account for one of the recipients';
                        return response;
                    }
                });
                if (from.data.balance <
                    recipients.length * tx.amount + CURRENT.transactionFee) {
                    response.reason =
                        "from account doesn't have sufficient balance to cover the transaction";
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'message': {
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (typeof from === 'undefined' || from === null) {
                    response.reason = '"from" account does not exist.';
                    return response;
                }
                if (typeof to === 'undefined' || to === null) {
                    response.reason = '"target" account does not exist.';
                    return response;
                }
                if (to.data.friends[tx.from]) {
                    if (from.data.balance < 1) {
                        response.reason = 'from account does not have sufficient funds.';
                        return response;
                    }
                }
                else {
                    if (from.data.balance < to.data.toll + CURRENT.transactionFee) {
                        response.reason = 'from account does not have sufficient funds.';
                        return response;
                    }
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'toll': {
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (!from) {
                    response.reason = 'from account does not exist';
                    return response;
                }
                if (from.data.balance < CURRENT.transactionFee) {
                    response.reason =
                        'from account does not have sufficient funds to complete toll transaction';
                    return response;
                }
                if (!tx.toll) {
                    response.reason = 'Toll was not defined in the transaction';
                    return response;
                }
                if (tx.toll < 1) {
                    response.reason = 'Toll must be greater than or equal to 1';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'friend': {
                if (typeof from === 'undefined' || from === null) {
                    response.reason = 'from account does not exist';
                    return response;
                }
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (from.data.balance < CURRENT.transactionFee) {
                    response.reason =
                        "From account doesn't have enough tokens to cover the transaction fee";
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'remove_friend': {
                if (typeof from === 'undefined' || from === null) {
                    response.reason = 'from account does not exist';
                    return response;
                }
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (from.data.balance < CURRENT.transactionFee) {
                    response.reason =
                        "From account doesn't have enough tokens to cover the transaction fee";
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'stake': {
                if (typeof from === 'undefined' || from === null) {
                    response.reason = 'from account does not exist';
                    return response;
                }
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (from.data.balance < CURRENT.stakeRequired) {
                    response.reason = "From account has insufficient balance, the cost required to operate a node is " + CURRENT.stakeRequired;
                    return response;
                }
                if (tx.stake < CURRENT.stakeRequired) {
                    response.reason = "Stake amount sent: " + tx.stake + " is less than the cost required to operate a node: " + CURRENT.stakeRequired;
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'node_reward': {
                // const network = wrappedStates[tx.network] && wrappedStates[tx.network].data
                // dapp.log(network.current.nodeRewardInterval)
                // let nodeInfo
                // try {
                //   nodeInfo = dapp.getNode(tx.nodeId)
                // } catch (err) {
                //   dapp.log(err)
                // }
                // if (!nodeInfo) {
                //   response.reason = 'no nodeInfo'
                //   return response
                // }
                // if (
                //   tx.timestamp - nodeInfo.activeTimestamp <
                //   CURRENT.nodeRewardInterval
                // ) {
                //   response.reason = 'Too early for this node to get paid'
                //   return response
                // }
                if (!from) {
                    response.result = 'pass';
                    response.reason = 'This transaction in valid';
                    return response;
                }
                if (from) {
                    if (!from.nodeRewardTime) {
                        response.result = 'pass';
                        response.reason = 'This transaction in valid';
                        return response;
                    }
                    if (tx.timestamp - from.nodeRewardTime < CURRENT.nodeRewardInterval) {
                        response.reason = 'Too early for this node to get paid';
                        return response;
                    }
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'snapshot_claim': {
                if (from === undefined || from === null) {
                    response.reason = "from account doesn't exist";
                    return response;
                }
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (from.claimedSnapshot) {
                    response.reason = 'Already claimed tokens from the snapshot';
                    return response;
                }
                if (!to) {
                    response.reason =
                        'Snapshot account does not exist yet, OR wrong snapshot address provided in the "to" field';
                    return response;
                }
                if (!to.snapshot) {
                    response.reason = 'Snapshot hasnt been taken yet';
                    return response;
                }
                if (!to.snapshot[tx.from]) {
                    response.reason =
                        'Your address did not hold any ULT on the Ethereum blockchain during the snapshot';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'issue': {
                var issue = wrappedStates[tx.issue] && wrappedStates[tx.issue].data;
                // let nodeInfo
                // try {
                //   nodeInfo = dapp.getNode(tx.nodeId)
                // } catch (err) {
                //   dapp.log(err)
                // }
                // if (!nodeInfo) {
                //   response.reason = 'no nodeInfo'
                //   return response
                // }
                if (issue.active) {
                    response.reason = 'Issue is already active';
                    return response;
                }
                var issueHash = crypto.hash("issue-" + to.issue);
                if (issueHash !== tx.issue) {
                    response.reason = "issue id (" + issueHash + ") does not match current network issue (" + tx.issue + ")";
                    return response;
                }
                var proposalHash = crypto.hash("issue-" + to.issue + "-proposal-1");
                if (proposalHash !== tx.proposal) {
                    response.reason = "The current default proposalHash (" + proposalHash + ") does not match the one in this issue tx (" + tx.proposal + ")";
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'dev_issue': {
                var devIssue = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data;
                // let nodeInfo
                // try {
                //   nodeInfo = dapp.getNode(tx.nodeId)
                // } catch (err) {
                //   dapp.log(err)
                // }
                // if (!nodeInfo) {
                //   response.reason = 'no nodeInfo'
                //   return response
                // }
                if (devIssue.active) {
                    response.reason = 'devIssue is already active';
                    return response;
                }
                var devIssueHash = crypto.hash("dev-issue-" + to.devIssue);
                if (devIssueHash !== tx.devIssue) {
                    response.reason = "devIssue id (" + devIssueHash + ") does not match current network devIssue (" + tx.devIssue + ")";
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'proposal': {
                var issue = wrappedStates[tx.issue] && wrappedStates[tx.issue].data;
                var parameters = tx.parameters;
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (!issue) {
                    response.reason = "Issue doesn't exist";
                    return response;
                }
                if (!issue.active) {
                    response.reason = 'This issue is no longer active';
                    return response;
                }
                if (tx.proposal !==
                    crypto.hash("issue-" + ISSUE + "-proposal-" + (issue.proposalCount + 1))) {
                    response.reason = 'Must give the next issue proposalCount hash';
                    return response;
                }
                if (from.data.balance < CURRENT.proposalFee + CURRENT.transactionFee) {
                    response.reason =
                        'From account has insufficient balance to submit a proposal';
                    return response;
                }
                if (parameters.transactionFee < 0) {
                    response.reason = 'Min transaction fee permitted is 0';
                    return response;
                }
                if (parameters.transactionFee > 10) {
                    response.reason = 'Max transaction fee permitted is 10';
                    return response;
                }
                if (parameters.maintenanceFee > 0.1) {
                    response.reason = 'Max maintenanceFee fee permitted is 10%';
                    return response;
                }
                if (parameters.maintenanceFee < 0) {
                    response.reason = 'Min maintenanceFee fee permitted is 0%';
                    return response;
                }
                if (parameters.maintenanceInterval > 1000000000000) {
                    response.reason = 'Max maintenanceInterval permitted is 1000000000000';
                    return response;
                }
                if (parameters.maintenanceInterval < 600000) {
                    response.reason = 'Min maintenanceInterval permitted is 600000 (10 minutes)';
                    return response;
                }
                if (parameters.nodeRewardInterval < 60000) {
                    response.reason = 'Min nodeRewardInterval permitted is 60000 (1 minute)';
                    return response;
                }
                if (parameters.nodeRewardInterval > 900000000000) {
                    response.reason = 'Max nodeRewardInterval fee permitted is 900000000000';
                    return response;
                }
                if (parameters.nodeRewardAmount < 0) {
                    response.reason = 'Min nodeRewardAmount permitted is 0 tokens';
                    return response;
                }
                if (parameters.nodeRewardAmount > 1000000000) {
                    response.reason = 'Max nodeRewardAmount permitted is 1000000000';
                    return response;
                }
                if (parameters.proposalFee < 0) {
                    response.reason = 'Min proposalFee permitted is 0 tokens';
                    return response;
                }
                if (parameters.proposalFee > 1000000000) {
                    response.reason = 'Max proposalFee permitted is 1000000000 tokens';
                    return response;
                }
                if (parameters.devProposalFee < 0) {
                    response.reason = 'Min devProposalFee permitted is 0 tokens';
                    return response;
                }
                if (parameters.devProposalFee > 1000000000) {
                    response.reason = 'Max devProposalFee permitted is 1000000000 tokens';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'dev_proposal': {
                var devIssue = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data;
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (!devIssue) {
                    response.reason = "devIssue doesn't exist";
                    return response;
                }
                if (!devIssue.active) {
                    response.reason = 'This devIssue is no longer active';
                    return response;
                }
                if (tx.devProposal !==
                    crypto.hash("dev-issue-" + DEV_ISSUE + "-dev-proposal-" + (devIssue.devProposalCount +
                        1))) {
                    response.reason = 'Must give the next devIssue devProposalCount hash';
                    return response;
                }
                if (from.data.balance < CURRENT.devProposalFee + CURRENT.transactionFee) {
                    response.reason =
                        'From account has insufficient balance to submit a devProposal';
                    return response;
                }
                if (tx.payments.reduce(function (acc, payment) { return Decimal(payment.amount).plus(acc); }, 0) > 1) {
                    response.reason = 'tx payment amounts added up to more than 100%';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'vote': {
                var proposal = wrappedStates[tx.proposal] && wrappedStates[tx.proposal].data;
                var issue = wrappedStates[tx.issue] && wrappedStates[tx.issue].data;
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (!issue) {
                    response.reason = "issue doesn't exist";
                    return response;
                }
                if (!issue.active) {
                    response.reason = 'issue no longer active';
                    return response;
                }
                if (!proposal) {
                    response.reason = "Proposal doesn't exist";
                    return response;
                }
                if (tx.amount <= 0) {
                    response.reason = 'Must send tokens to vote';
                    return response;
                }
                if (from.data.balance < tx.amount + CURRENT.transactionFee) {
                    response.reason =
                        'From account has insufficient balance to cover the amount sent in the transaction';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'dev_vote': {
                var devProposal = wrappedStates[tx.devProposal] && wrappedStates[tx.devProposal].data;
                var devIssue = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data;
                if (tx.sign.owner !== tx.from) {
                    response.reason = 'not signed by from account';
                    return response;
                }
                if (crypto.verifyObj(tx) === false) {
                    response.reason = 'incorrect signing';
                    return response;
                }
                if (!devProposal) {
                    response.reason = "devProposal doesn't exist";
                    return response;
                }
                if (!devIssue) {
                    response.reason = "devIssue doesn't exist";
                    return response;
                }
                if (!devIssue.active) {
                    response.reason = 'devIssue no longer active';
                    return response;
                }
                if (tx.amount <= 0) {
                    response.reason = 'Must send tokens in order to vote';
                    return response;
                }
                if (from.data.balance < tx.amount + CURRENT.transactionFee) {
                    response.reason =
                        'From account has insufficient balance to cover the amount sent in the transaction';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'tally': {
                var issue = wrappedStates[tx.issue] && wrappedStates[tx.issue].data;
                var proposals = tx.proposals.map(function (id) { return wrappedStates[id].data; });
                // let nodeInfo
                // try {
                //   nodeInfo = dapp.getNode(tx.nodeId)
                // } catch (err) {
                //   dapp.log(err)
                // }
                // if (!nodeInfo) {
                //   response.reason = 'no nodeInfo'
                //   return response
                // }
                if (!issue) {
                    response.reason = "Issue doesn't exist";
                    return response;
                }
                if (!issue.active) {
                    response.reason = 'This issue is no longer active';
                    return response;
                }
                if (issue.winner) {
                    response.reason =
                        'The winner for this issue has already been determined';
                    return response;
                }
                if (to.id !== networkAccount) {
                    response.reason = 'To account must be the network account';
                    return response;
                }
                if (proposals.length !== issue.proposalCount) {
                    response.reason =
                        'The number of proposals sent in with the transaction dont match the issues proposalCount';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'dev_tally': {
                var devIssue = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data;
                var devProposals = tx.devProposals.map(function (id) { return wrappedStates[id].data; });
                // let nodeInfo
                // try {
                //   nodeInfo = dapp.getNode(tx.nodeId)
                // } catch (err) {
                //   dapp.log(err)
                // }
                // if (!nodeInfo) {
                //   response.reason = 'no nodeInfo'
                //   return response
                // }
                if (!devIssue) {
                    response.reason = "devIssue doesn't exist";
                    return response;
                }
                if (!devIssue.active) {
                    response.reason = 'This devIssue is no longer active';
                    return response;
                }
                if (devIssue.winners !== undefined) {
                    response.reason =
                        'The winners for this devIssue has already been determined';
                    return response;
                }
                if (to.id !== networkAccount) {
                    response.reason = 'To account must be the network account';
                    return response;
                }
                if (devProposals.length !== devIssue.devProposalCount) {
                    response.reason =
                        'The number of devProposals sent in with the transaction dont match the devIssue proposalCount';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'apply_parameters': {
                var issue = wrappedStates[tx.issue].data;
                // let nodeInfo
                // try {
                //   nodeInfo = dapp.getNode(tx.nodeId)
                // } catch (err) {
                //   dapp.log(err)
                // }
                // if (!nodeInfo) {
                //   response.reason = 'no nodeInfo'
                //   return response
                // }
                if (!issue) {
                    response.reason = "Issue doesn't exist";
                    return response;
                }
                if (!issue.active) {
                    response.reason = 'This issue is no longer active';
                    return response;
                }
                if (to.id !== networkAccount) {
                    response.reason = 'To account must be the network account';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'apply_dev_parameters': {
                var devIssue = wrappedStates[tx.devIssue].data;
                // let nodeInfo
                // try {
                //   nodeInfo = dapp.getNode(tx.nodeId)
                // } catch (err) {
                //   dapp.log(err)
                // }
                // if (!nodeInfo) {
                //   response.reason = 'no nodeInfo'
                //   return response
                // }
                if (!devIssue) {
                    response.reason = "devIssue doesn't exist";
                    return response;
                }
                if (!devIssue.active) {
                    response.reason = 'This devIssue is no longer active';
                    return response;
                }
                if (to.id !== networkAccount) {
                    response.reason = 'To account must be the network account';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
            case 'developer_payment': {
                var developer = wrappedStates[tx.developer] && wrappedStates[tx.developer].data;
                // let nodeInfo
                // try {
                //   nodeInfo = dapp.getNode(tx.nodeId)
                // } catch (err) {
                //   dapp.log(err)
                // }
                // if (!nodeInfo) {
                //   response.reason = 'no nodeInfo'
                //   return response
                // }
                if (to.id !== networkAccount) {
                    response.reason = 'To account must be the network account';
                    return response;
                }
                if (!to.developerFund.some(function (payment) { return payment.id === tx.payment.id; })) {
                    response.reason = 'This payment doesnt exist';
                    return response;
                }
                if (tx.developer !== tx.payment.address) {
                    response.reason = 'tx developer does not match address in payment';
                    return response;
                }
                if (tx.timestamp < tx.payment.timestamp) {
                    response.reason = 'This payment is not ready to be released';
                    return response;
                }
                if (!developer || !developer.data) {
                    response.reason = 'No account exists for the passed in tx.developer';
                    return response;
                }
                if (typeof developer.data.balance === 'string') {
                    response.reason = 'developer.data.balance is a string for some reason';
                    return response;
                }
                if (typeof tx.payment.amount === 'string') {
                    response.reason = 'payment.amount is a string for some reason';
                    return response;
                }
                response.result = 'pass';
                response.reason = 'This transaction is valid!';
                return response;
            }
        }
    },
    // THIS NEEDS TO BE FAST, BUT PROVIDES BETTER RESPONSE IF SOMETHING GOES WRONG
    validateTxnFields: function (tx) {
        // Validate tx fields here
        var result = 'pass';
        var reason = 'This transaction is valid!';
        var txnTimestamp = tx.timestamp;
        if (typeof tx.type !== 'string') {
            result = 'fail';
            reason = '"type" must be a string.';
            throw new Error(reason);
        }
        if (typeof txnTimestamp !== 'number') {
            result = 'fail';
            reason = '"timestamp" must be a number.';
            throw new Error(reason);
        }
        switch (tx.type) {
            case 'snapshot': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.to !== 'string') {
                    result = 'fail';
                    reason = '"To" must be a string.';
                    throw new Error(reason);
                }
                if (tx.to !== networkAccount) {
                    result = 'fail';
                    reason = '"To" must be ' + networkAccount;
                    throw new Error(reason);
                }
                if (typeof tx.snapshot !== 'object') {
                    result = 'fail';
                    reason = '"Snapshot" must be an object.';
                    throw new Error(reason);
                }
                break;
            }
            case 'email': {
                if (typeof tx.signedTx !== 'object') {
                    result = 'fail';
                    reason = '"signedTx" must be an object.';
                    throw new Error(reason);
                }
                var signedTx = tx.signedTx;
                if (signedTx) {
                    if (typeof signedTx !== 'object') {
                        result = 'fail';
                        reason = '"signedTx" must be a object.';
                        throw new Error(reason);
                    }
                    if (typeof signedTx.sign !== 'object') {
                        result = 'fail';
                        reason = '"sign" property on signedTx must be an object.';
                        throw new Error(reason);
                    }
                    if (typeof signedTx.from !== 'string') {
                        result = 'fail';
                        reason = '"From" must be a string.';
                        throw new Error(reason);
                    }
                    if (typeof signedTx.emailHash !== 'string') {
                        result = 'fail';
                        reason = '"emailHash" must be a string.';
                        throw new Error(reason);
                    }
                }
                if (typeof tx.email !== 'string') {
                    result = 'fail';
                    reason = '"email" must be a string.';
                    throw new Error(reason);
                }
                if (tx.email.length > 30) {
                    result = 'fail';
                    reason = '"Email" length must be less than 31 characters (30 max)';
                    throw new Error(reason);
                }
                break;
            }
            case 'verify': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.code !== 'string') {
                    result = 'fail';
                    reason = '"Code" must be a string.';
                    throw new Error(reason);
                }
                if (tx.code.length !== 6) {
                    result = 'fail';
                    reason = '"Code" length must be 6 digits.';
                    throw new Error(reason);
                }
                if (typeof parseInt(tx.code) !== 'number') {
                    result = 'fail';
                    reason = '"Code" must be parseable to an integer.';
                    throw new Error(reason);
                }
                break;
            }
            case 'register': {
                if (typeof tx.aliasHash !== 'string') {
                    result = 'fail';
                    reason = '"aliasHash" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.alias !== 'string') {
                    result = 'fail';
                    reason = '"alias" must be a string.';
                    throw new Error(reason);
                }
                if (tx.alias.length >= 20) {
                    result = 'fail';
                    reason = '"alias" must be less than 21 characters (20 max)';
                    throw new Error(reason);
                }
                break;
            }
            case 'create': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.to !== 'string') {
                    result = 'fail';
                    reason = '"To" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.amount !== 'number') {
                    result = 'fail';
                    reason = '"Amount" must be a number.';
                    throw new Error(reason);
                }
                break;
            }
            case 'transfer': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.to !== 'string') {
                    result = 'fail';
                    reason = '"To" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.amount !== 'number') {
                    result = 'fail';
                    reason = '"Amount" must be a number.';
                    throw new Error(reason);
                }
                if (tx.amount <= 0) {
                    result = 'fail';
                    reason = '"Amount" must be a positive number.';
                    throw new Error(reason);
                }
                break;
            }
            case 'distribute': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (Array.isArray(tx.recipients) !== true) {
                    result = 'fail';
                    reason = '"Recipients" must be an array.';
                    throw new Error(reason);
                }
                if (typeof tx.amount !== 'number') {
                    result = 'fail';
                    reason = '"Amount" must be a number.';
                    throw new Error(reason);
                }
                if (tx.amount <= 0) {
                    result = 'fail';
                    reason = '"Amount" must be a positive number.';
                    throw new Error(reason);
                }
                break;
            }
            case 'message': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.to !== 'string') {
                    result = 'fail';
                    reason = '"To" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.message !== 'string') {
                    result = 'fail';
                    reason = '"Message" must be a string.';
                    throw new Error(reason);
                }
                if (tx.message.length > 5000) {
                    result = 'fail';
                    reason = '"Message" length must be less than 5000 characters.';
                    throw new Error(reason);
                }
                break;
            }
            case 'toll': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.toll !== 'number') {
                    result = 'fail';
                    reason = '"Toll" must be a number.';
                    throw new Error(reason);
                }
                if (tx.toll < 1) {
                    result = 'fail';
                    reason = 'Minimum "toll" allowed is 1 token';
                    throw new Error(reason);
                }
                if (tx.toll > 1000000) {
                    result = 'fail';
                    reason = 'Maximum toll allowed is 1,000,000 tokens.';
                    throw new Error(reason);
                }
                break;
            }
            case 'friend': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.to !== 'string') {
                    result = 'fail';
                    reason = '"To" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.alias !== 'string') {
                    result = 'fail';
                    reason = '"Message" must be a string.';
                    throw new Error(reason);
                }
                break;
            }
            case 'remove_friend': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.to !== 'string') {
                    result = 'fail';
                    reason = '"To" must be a string.';
                    throw new Error(reason);
                }
                break;
            }
            case 'stake': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.stake !== 'number') {
                    result = 'fail';
                    reason = '"Stake" must be a number.';
                    throw new Error(reason);
                }
                break;
            }
            case 'snapshot_claim': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.to !== 'string') {
                    result = 'fail';
                    reason = '"To" must be a string.';
                    throw new Error(reason);
                }
                break;
            }
            case 'proposal': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.proposal !== 'string') {
                    result = 'fail';
                    reason = '"Proposal" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.issue !== 'string') {
                    result = 'fail';
                    reason = '"Issue" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.parameters !== 'object') {
                    result = 'fail';
                    reason = '"Parameters" must be an object.';
                    throw new Error(reason);
                }
                if (tx.timestamp < WINDOWS.proposalWindow[0] ||
                    tx.timestamp > WINDOWS.proposalWindow[1]) {
                    result = 'fail';
                    reason = '"Network is not currently accepting issues or proposals"';
                    throw new Error(reason);
                }
                break;
            }
            case 'dev_proposal': {
                if (typeof tx.devIssue !== 'string') {
                    result = 'fail';
                    reason = '"devIssue" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.devProposal !== 'string') {
                    result = 'fail';
                    reason = '"devProposal" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.totalAmount !== 'number') {
                    result = 'fail';
                    reason = '"totalAmount" must be a number.';
                    throw new Error(reason);
                }
                if (tx.totalAmount < 1) {
                    result = 'fail';
                    reason = 'Minimum "totalAmount" allowed is 1 token';
                    throw new Error(reason);
                }
                if (tx.totalAmount > 100000) {
                    result = 'fail';
                    reason = 'Maximum "totalAmount" allowed is 100,000 tokens';
                    throw new Error(reason);
                }
                if (Array.isArray(tx.payments) !== true) {
                    result = 'fail';
                    reason = '"payments" must be an array.';
                    throw new Error(reason);
                }
                if (typeof tx.description !== 'string') {
                    result = 'fail';
                    reason = '"description" must be a string.';
                    throw new Error(reason);
                }
                if (tx.description.length < 1) {
                    result = 'fail';
                    reason = 'Minimum "description" character count is 1';
                    throw new Error(reason);
                }
                if (tx.description.length > 1000) {
                    result = 'fail';
                    reason = 'Maximum "description" character count is 1000';
                    throw new Error(reason);
                }
                if (typeof tx.payAddress !== 'string') {
                    result = 'fail';
                    reason = '"payAddress" must be a string.';
                    throw new Error(reason);
                }
                if (tx.payAddress.length !== 64) {
                    result = 'fail';
                    reason = '"payAddress" length must be 64 characters (A valid public address)';
                    throw new Error(reason);
                }
                if (tx.timestamp < DEV_WINDOWS.devProposalWindow[0] ||
                    tx.timestamp > DEV_WINDOWS.devProposalWindow[1]) {
                    result = 'fail';
                    reason = 'Network is not accepting dev proposals';
                    throw new Error(reason);
                }
                break;
            }
            case 'vote': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.amount !== 'number') {
                    result = 'fail';
                    reason = '"amount" must be a number.';
                    throw new Error(reason);
                }
                if (tx.amount < 1) {
                    result = 'fail';
                    reason = 'Minimum voting "amount" allowed is 1 token';
                    throw new Error(reason);
                }
                if (typeof tx.issue !== 'string') {
                    result = 'fail';
                    reason = '"issue" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.proposal !== 'string') {
                    result = 'fail';
                    reason = '"Proposal" must be a string.';
                    throw new Error(reason);
                }
                if (tx.timestamp < WINDOWS.votingWindow[0] ||
                    tx.timestamp > WINDOWS.votingWindow[1]) {
                    result = 'fail';
                    reason = 'Network is not currently accepting votes';
                    throw new Error(reason);
                }
                break;
            }
            case 'dev_vote': {
                if (typeof tx.from !== 'string') {
                    result = 'fail';
                    reason = '"From" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.amount !== 'number') {
                    result = 'fail';
                    reason = '"amount" must be a number.';
                    throw new Error(reason);
                }
                if (tx.amount < 1) {
                    result = 'fail';
                    reason = 'Minimum voting "amount" allowed is 1 token';
                    throw new Error(reason);
                }
                if (typeof tx.approve !== 'boolean') {
                    result = 'fail';
                    reason = '"approve" must be a boolean.';
                    throw new Error(reason);
                }
                if (typeof tx.devProposal !== 'string') {
                    result = 'fail';
                    reason = '"devProposal" must be a string.';
                    throw new Error(reason);
                }
                if (typeof tx.devIssue !== 'string') {
                    result = 'fail';
                    reason = '"devIssue" must be a string.';
                    throw new Error(reason);
                }
                if (tx.timestamp < DEV_WINDOWS.devVotingWindow[0] ||
                    tx.timestamp > DEV_WINDOWS.devVotingWindow[1]) {
                    result = 'fail';
                    reason = 'Network is not currently accepting dev votes';
                    throw new Error(reason);
                }
                break;
            }
            case 'developer_payment': {
                if (typeof tx.payment !== 'object') {
                    result = 'fail';
                    reason = '"Payment" must be an object.';
                    throw new Error(reason);
                }
                if (typeof tx.payment.amount !== 'number') {
                    result = 'fail';
                    reason = '"payment.amount" must be a number.';
                    throw new Error(reason);
                }
            }
        }
        return {
            result: result,
            reason: reason,
            txnTimestamp: txnTimestamp
        };
    },
    apply: function (tx, wrappedStates) {
        var from = wrappedStates[tx.from] && wrappedStates[tx.from].data;
        var to = wrappedStates[tx.to] && wrappedStates[tx.to].data;
        // Validate the tx
        var _a = this.validateTransaction(tx, wrappedStates), result = _a.result, reason = _a.reason;
        if (result !== 'pass') {
            throw new Error("invalid transaction, reason: " + reason + ". tx: " + stringify(tx));
        }
        // Create an applyResponse which will be used to tell Shardus that the tx has been applied
        var txId;
        if (!tx.sign) {
            txId = crypto.hashObj(tx);
        }
        else {
            txId = crypto.hashObj(tx, true); // compute from tx
        }
        var applyResponse = dapp.createApplyResponse(txId, tx.timestamp);
        // Apply the tx
        switch (tx.type) {
            case 'snapshot': {
                to.snapshot = tx.snapshot;
                from.timestamp = tx.timestamp;
                to.timestamp = tx.timestamp;
                dapp.log('Applied snapshot tx', to);
                break;
            }
            // TODO: Have nodes determine who actually sends the email
            case 'email': {
                var source = wrappedStates[tx.signedTx.from] && wrappedStates[tx.signedTx.from].data;
                var nodeId = dapp.getNodeId();
                var address = dapp.getNode(nodeId).address;
                var closest = dapp.getClosestNodes(tx.signedTx.from, 5)[0];
                if (nodeId === closest) {
                    var baseNumber = 99999;
                    var randomNumber = Math.floor((Math.random() * 899999)) + 1;
                    var verificationNumber = baseNumber + randomNumber;
                    axios.post('http://arimaa.com/mailAPI/index.cgi', {
                        from: 'liberdus.verify',
                        to: "" + tx.email,
                        subject: 'Verify your email for liberdus',
                        message: "Please verify your email address by sending a \"verify\" transaction with the number: " + verificationNumber,
                        secret: 'Liberdus'
                    });
                    dapp.put({
                        type: 'gossip_email_hash',
                        nodeId: nodeId,
                        account: source.id,
                        from: address,
                        emailHash: tx.signedTx.emailHash,
                        verified: crypto.hash("" + verificationNumber),
                        timestamp: Date.now()
                    });
                }
                dapp.log('Applied email tx', source);
                break;
            }
            case 'gossip_email_hash': {
                // const targets = tx.targets.map(target => wrappedStates[target].data)
                var account = wrappedStates[tx.account].data;
                account.emailHash = tx.emailHash;
                account.verified = tx.verified;
                account.timestamp = tx.timestamp;
                dapp.log('Applied gossip_email_hash tx', account);
                break;
            }
            case 'verify': {
                from.verified = true;
                from.timestamp = tx.timestamp;
                dapp.log('Applied verify tx', from);
                break;
            }
            case 'register': {
                var alias = wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data;
                // from.data.balance -= CURRENT.transactionFee
                // from.data.balance -= maintenanceAmount(tx.timestamp, from)
                alias.inbox = tx.alias;
                from.alias = tx.alias;
                alias.address = tx.from;
                // from.data.transactions.push({ ...tx, txId })
                alias.timestamp = tx.timestamp;
                from.timestamp = tx.timestamp;
                dapp.log('Applied register tx', from);
                break;
            }
            case 'create': {
                to.data.balance += tx.amount;
                to.timestamp = tx.timestamp;
                // to.data.transactions.push({ ...tx, txId })
                dapp.log('Applied create tx', to);
                break;
            }
            case 'transfer': {
                from.data.balance -= tx.amount + CURRENT.transactionFee;
                from.data.balance -= maintenanceAmount(tx.timestamp, from);
                to.data.balance += tx.amount;
                from.data.transactions.push(__assign(__assign({}, tx), { txId: txId }));
                to.data.transactions.push(__assign(__assign({}, tx), { txId: txId }));
                from.timestamp = tx.timestamp;
                to.timestamp = tx.timestamp;
                dapp.log('Applied transfer tx', from, to);
                break;
            }
            case 'distribute': {
                var recipients = tx.recipients.map(function (recipientId) { return wrappedStates[recipientId].data; });
                from.data.balance -= CURRENT.transactionFee;
                // from.data.transactions.push({ ...tx, txId })
                recipients.forEach(function (recipient) {
                    from.data.balance -= tx.amount;
                    recipient.data.balance += tx.amount;
                    // recipient.data.transactions.push({ ...tx, txId })
                });
                from.data.balance -= maintenanceAmount(tx.timestamp, from);
                dapp.log('Applied distribute transaction', from, recipients);
                break;
            }
            case 'message': {
                var chat = wrappedStates[tx.chatId].data;
                from.data.balance -= CURRENT.transactionFee;
                if (!to.data.friends[from.id]) {
                    from.data.balance -= to.data.toll;
                    to.data.balance += to.data.toll;
                }
                from.data.balance -= maintenanceAmount(tx.timestamp, from);
                // TODO: Chat data between two accounts should be stored in one place
                if (!from.data.chats[tx.to])
                    from.data.chats[tx.to] = tx.chatId;
                if (!to.data.chats[tx.from])
                    to.data.chats[tx.from] = tx.chatId;
                chat.messages.push(tx.message);
                // from.data.transactions.push({ ...tx, txId })
                // to.data.transactions.push({ ...tx, txId })
                chat.timestamp = tx.timestamp;
                from.timestamp = tx.timestamp;
                to.timestamp = tx.timestamp;
                dapp.log('Applied message tx', chat, from, to);
                break;
            }
            case 'toll': {
                from.data.balance -= CURRENT.transactionFee;
                from.data.balance -= maintenanceAmount(tx.timestamp, from);
                from.data.toll = tx.toll;
                // from.data.transactions.push({ ...tx, txId })
                from.timestamp = tx.timestamp;
                dapp.log('Applied toll tx', from);
                break;
            }
            case 'friend': {
                from.data.balance -= CURRENT.transactionFee;
                from.data.balance -= maintenanceAmount(tx.timestamp, from);
                from.data.friends[tx.to] = tx.alias;
                // from.data.transactions.push({ ...tx, txId })
                from.timestamp = tx.timestamp;
                dapp.log('Applied friend tx', from);
                break;
            }
            case 'remove_friend': {
                from.data.friends[tx.to] = null;
                from.timestamp = tx.timestamp;
                // from.data.transactions.push({ ...tx, txId })
                dapp.log('Applied remove_friend tx', from);
                break;
            }
            case 'stake': {
                from.data.balance -= tx.stake;
                from.data.balance -= maintenanceAmount(tx.timestamp, from);
                from.data.stake = tx.stake;
                from.timestamp = tx.timestamp;
                // from.data.transactions.push({ ...tx, txId })
                dapp.log('Applied stake tx', from);
                break;
            }
            case 'node_reward': {
                to.balance += CURRENT.nodeRewardAmount;
                from.nodeRewardTime = tx.timestamp;
                from.timestamp = tx.timestamp;
                to.timestamp = tx.timestamp;
                dapp.log('Applied node_reward tx', from, to);
                break;
            }
            case 'snapshot_claim': {
                from.data.balance += to.snapshot[tx.from];
                to.snapshot[tx.from] = 0;
                // from.data.transactions.push({ ...tx, txId })
                from.claimedSnapshot = true;
                from.timestamp = tx.timestamp;
                to.timestamp = tx.timestamp;
                dapp.log('Applied snapshot_claim tx', from, to);
                break;
            }
            case 'issue': {
                var issue = wrappedStates[tx.issue].data;
                var proposal = wrappedStates[tx.proposal].data;
                proposal.parameters = to.current;
                proposal.parameters.title = 'Default parameters';
                proposal.parameters.description = 'Keep the current network parameters as they are';
                proposal.number = 1;
                issue.number = to.issue;
                issue.active = true;
                issue.proposals.push(proposal.id);
                issue.proposalCount++;
                issue.timestamp = tx.timestamp;
                proposal.timestamp = tx.timestamp;
                from.timestamp = tx.timestamp;
                dapp.log('Applied issue tx', from, issue, proposal);
                break;
            }
            case 'dev_issue': {
                var devIssue = wrappedStates[tx.devIssue].data;
                devIssue.number = to.devIssue;
                devIssue.active = true;
                devIssue.timestamp = tx.timestamp;
                from.timestamp = tx.timestamp;
                dapp.log('Applied dev_issue tx', from, devIssue);
                break;
            }
            case 'proposal': {
                var proposal = wrappedStates[tx.proposal].data;
                var issue = wrappedStates[tx.issue].data;
                from.data.balance -= CURRENT.proposalFee;
                from.data.balance -= CURRENT.transactionFee;
                from.data.balance -= maintenanceAmount(tx.timestamp, from);
                proposal.parameters = tx.parameters;
                issue.proposalCount++;
                proposal.number = issue.proposalCount;
                issue.proposals.push(proposal.id);
                // from.data.transactions.push({ ...tx, txId })
                from.timestamp = tx.timestamp;
                issue.timestamp = tx.timestamp;
                proposal.timestamp = tx.timestamp;
                dapp.log('Applied proposal tx', from, issue, proposal);
                break;
            }
            case 'dev_proposal': {
                var devIssue = wrappedStates[tx.devIssue].data;
                var devProposal = wrappedStates[tx.devProposal].data;
                from.data.balance -= CURRENT.devProposalFee;
                from.data.balance -= CURRENT.transactionFee;
                from.data.balance -= maintenanceAmount(tx.timestamp, from);
                devProposal.totalAmount = tx.totalAmount;
                devProposal.payAddress = tx.payAddress;
                devProposal.title = tx.title;
                devProposal.description = tx.description;
                devProposal.payments = tx.payments;
                devIssue.devProposalCount++;
                devProposal.number = devIssue.devProposalCount;
                devIssue.devProposals.push(devProposal.id);
                // from.data.transactions.push({ ...tx, txId })
                from.timestamp = tx.timestamp;
                devIssue.timestamp = tx.timestamp;
                devProposal.timestamp = tx.timestamp;
                dapp.log('Applied dev_proposal tx', from, devIssue, devProposal);
                break;
            }
            case 'vote': {
                var proposal = wrappedStates[tx.proposal].data;
                from.data.balance -= tx.amount;
                from.data.balance -= CURRENT.transactionFee;
                from.data.balance -= maintenanceAmount(tx.timestamp, from);
                proposal.power += tx.amount;
                proposal.totalVotes++;
                // from.data.transactions.push({ ...tx, txId })
                from.timestamp = tx.timestamp;
                proposal.timestamp = tx.timestamp;
                dapp.log('Applied vote tx', from, proposal);
                break;
            }
            case 'dev_vote': {
                var devProposal = wrappedStates[tx.devProposal].data;
                from.data.balance -= tx.amount;
                from.data.balance -= CURRENT.transactionFee;
                from.data.balance -= maintenanceAmount(tx.timestamp, from);
                if (tx.approve) {
                    devProposal.approve += tx.amount;
                }
                else {
                    devProposal.reject += tx.amount;
                }
                devProposal.totalVotes++;
                // from.data.transactions.push({ ...tx, txId })
                from.timestamp = tx.timestamp;
                devProposal.timestamp = tx.timestamp;
                dapp.log('Applied dev_vote tx', from, devProposal);
                break;
            }
            case 'tally': {
                var issue = wrappedStates[tx.issue].data;
                var margin = 100 / (2 * (issue.proposalCount + 1)) / 100;
                var defaultProposal = wrappedStates[crypto.hash("issue-" + issue.number + "-proposal-1")].data;
                var sortedProposals = tx.proposals
                    .map(function (id) { return wrappedStates[id].data; })
                    .sort(function (a, b) { return a.power < b.power; });
                var winner = defaultProposal;
                for (var _i = 0, sortedProposals_1 = sortedProposals; _i < sortedProposals_1.length; _i++) {
                    var proposal = sortedProposals_1[_i];
                    proposal.winner = false;
                }
                if (sortedProposals.length >= 2) {
                    var firstPlace = sortedProposals[0];
                    var secondPlace = sortedProposals[1];
                    var marginToWin = secondPlace.power + margin * secondPlace.power;
                    if (firstPlace.power >= marginToWin) {
                        winner = firstPlace;
                    }
                }
                winner.winner = true; // CHICKEN DINNER
                to.next = winner.parameters;
                to.nextWindows.proposalWindow = [
                    to.windows.applyWindow[1],
                    to.windows.applyWindow[1] + TIME_FOR_PROPOSALS
                ];
                to.nextWindows.votingWindow = [
                    to.nextWindows.proposalWindow[1],
                    to.nextWindows.proposalWindow[1] + TIME_FOR_VOTING
                ];
                to.nextWindows.graceWindow = [
                    to.nextWindows.votingWindow[1],
                    to.nextWindows.votingWindow[1] + TIME_FOR_GRACE
                ];
                to.nextWindows.applyWindow = [
                    to.nextWindows.graceWindow[1],
                    to.nextWindows.graceWindow[1] + TIME_FOR_APPLY
                ];
                issue.winner = winner.id;
                from.timestamp = tx.timestamp;
                to.timestamp = tx.timestamp;
                issue.timestamp = tx.timestamp;
                winner.timestamp = tx.timestamp;
                dapp.log('Applied tally tx', from, to, issue, winner);
                break;
            }
            case 'dev_tally': {
                var devIssue = wrappedStates[tx.devIssue].data;
                var devProposals = tx.devProposals.map(function (id) { return wrappedStates[id].data; });
                devIssue.winners = [];
                for (var _b = 0, devProposals_1 = devProposals; _b < devProposals_1.length; _b++) {
                    var devProposal = devProposals_1[_b];
                    if (devProposal.approve >=
                        devProposal.reject + devProposal.reject * 0.15) {
                        devProposal.approved = true;
                        var payments = [];
                        for (var _c = 0, _d = devProposal.payments; _c < _d.length; _c++) {
                            var payment = _d[_c];
                            payments.push({
                                timestamp: tx.timestamp + TIME_FOR_DEV_GRACE + payment.delay,
                                amount: payment.amount * devProposal.totalAmount,
                                address: devProposal.payAddress,
                                id: crypto.hashObj(payment)
                            });
                        }
                        to.nextDeveloperFund = __spreadArrays(to.nextDeveloperFund, payments);
                        devProposal.timestamp = tx.timestamp;
                        devIssue.winners.push(devProposal.id);
                    }
                    else {
                        devProposal.approved = false;
                        devProposal.timestamp = tx.timestamp;
                    }
                }
                to.nextDevWindows.devProposalWindow = [
                    to.devWindows.devApplyWindow[1],
                    to.devWindows.devApplyWindow[1] + TIME_FOR_DEV_PROPOSALS
                ];
                to.nextDevWindows.devVotingWindow = [
                    to.nextDevWindows.devProposalWindow[1],
                    to.nextDevWindows.devProposalWindow[1] + TIME_FOR_DEV_VOTING
                ];
                to.nextDevWindows.devGraceWindow = [
                    to.nextDevWindows.devVotingWindow[1],
                    to.nextDevWindows.devVotingWindow[1] + TIME_FOR_DEV_GRACE
                ];
                to.nextDevWindows.devApplyWindow = [
                    to.nextDevWindows.devGraceWindow[1],
                    to.nextDevWindows.devGraceWindow[1] + TIME_FOR_DEV_APPLY
                ];
                from.timestamp = tx.timestamp;
                to.timestamp = tx.timestamp;
                devIssue.timestamp = tx.timestamp;
                dapp.log('Applied dev_tally tx', from, to, devIssue, devProposals);
                break;
            }
            case 'apply_parameters': {
                var issue = wrappedStates[tx.issue].data;
                to.current = to.next;
                to.next = {};
                to.windows = to.nextWindows;
                to.nextWindows = {};
                to.issue++;
                issue.active = false;
                from.timestamp = tx.timestamp;
                to.timestamp = tx.timestamp;
                issue.timestamp = tx.timestamp;
                dapp.log('Applied apply_parameters tx', from, issue, to);
                break;
            }
            case 'apply_dev_parameters': {
                var devIssue = wrappedStates[tx.devIssue].data;
                to.devWindows = to.nextDevWindows;
                to.nextDevWindows = {};
                to.developerFund = __spreadArrays(to.developerFund, to.nextDeveloperFund).sort(function (a, b) { return a.timestamp - b.timestamp; });
                to.nextDeveloperFund = [];
                to.devIssue++;
                devIssue.active = false;
                from.timestamp = tx.timestamp;
                to.timestamp = tx.timestamp;
                devIssue.timestamp = tx.timestamp;
                dapp.log('Applied apply_dev_parameters tx', from, devIssue, to);
                break;
            }
            case 'developer_payment': {
                var developer = wrappedStates[tx.developer].data;
                developer.data.balance += tx.payment.amount;
                to.developerFund = to.developerFund.filter(function (payment) { return payment.id !== tx.payment.id; });
                // developer.data.transactions.push({ ...tx, txId })
                from.timestamp = tx.timestamp;
                developer.timestamp = tx.timestamp;
                to.timestamp = tx.timestamp;
                dapp.log('Applied developer_payment tx', from, to, developer);
                break;
            }
        }
        return applyResponse;
    },
    getKeyFromTransaction: function (tx) {
        var result = {
            sourceKeys: [],
            targetKeys: [],
            allKeys: [],
            timestamp: tx.timestamp
        };
        switch (tx.type) {
            case 'snapshot':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.to];
                break;
            case 'email':
                result.sourceKeys = [tx.signedTx.from];
                break;
            case 'gossip_email_hash':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.account];
                break;
            case 'verify':
                result.sourceKeys = [tx.from];
                break;
            case 'register':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.aliasHash];
                break;
            case 'create':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.to];
                break;
            case 'transfer':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.to];
                break;
            case 'distribute':
                result.targetKeys = tx.recipients;
                result.sourceKeys = [tx.from];
                break;
            case 'message':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.to, tx.chatId];
                break;
            case 'toll':
                result.sourceKeys = [tx.from];
                break;
            case 'friend':
                result.sourceKeys = [tx.from];
                break;
            case 'remove_friend':
                result.sourceKeys = [tx.from];
                break;
            case 'node_reward':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.to];
                break;
            case 'bond':
                result.sourceKeys = [tx.from];
                break;
            case 'claim_reward':
                result.sourceKeys = [tx.from];
                break;
            case 'snapshot_claim':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.to];
                break;
            case 'issue':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.to, tx.issue, tx.proposal];
                break;
            case 'dev_issue':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.to, tx.devIssue];
                break;
            case 'proposal':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.issue, tx.proposal];
                break;
            case 'dev_proposal':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.devIssue, tx.devProposal];
                break;
            case 'vote':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.issue, tx.proposal];
                break;
            case 'dev_vote':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.devIssue, tx.devProposal];
                break;
            case 'tally':
                result.sourceKeys = [tx.from];
                result.targetKeys = __spreadArrays(tx.proposals, [tx.issue, tx.to]);
                break;
            case 'dev_tally':
                result.sourceKeys = [tx.from];
                result.targetKeys = __spreadArrays(tx.devProposals, [tx.devIssue, tx.to]);
                break;
            case 'apply_parameters':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.to, tx.issue];
                break;
            case 'apply_dev_parameters':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.to, tx.devIssue];
                break;
            case 'developer_payment':
                result.sourceKeys = [tx.from];
                result.targetKeys = [tx.developer, tx.to];
                break;
        }
        result.allKeys = result.allKeys.concat(result.sourceKeys, result.targetKeys);
        return result;
    },
    getStateId: function (accountAddress, mustExist) {
        if (mustExist === void 0) { mustExist = true; }
        var account = accounts[accountAddress];
        if ((typeof account === 'undefined' || account === null) &&
            mustExist === true) {
            throw new Error('Could not get stateId for account ' + accountAddress);
        }
        var stateId = account.hash;
        return stateId;
    },
    deleteLocalAccountData: function () {
        accounts = {};
    },
    setAccountData: function (accountRecords) {
        for (var _i = 0, accountRecords_1 = accountRecords; _i < accountRecords_1.length; _i++) {
            var account = accountRecords_1[_i];
            // possibly need to clone this so others lose their ref
            accounts[account.id] = account;
        }
    },
    getRelevantData: function (accountId, tx) {
        var account = accounts[accountId];
        var accountCreated = false;
        // Create the account if it doesn't exist
        if (typeof account === 'undefined' || account === null) {
            if (accountId === networkAccount) {
                account = createNetworkAccount(accountId);
                accounts[accountId] = account;
                accountCreated = true;
            }
            if (tx.type === 'issue') {
                if (accountId === tx.issue) {
                    account = createIssue(accountId);
                    accounts[accountId] = account;
                    accountCreated = true;
                }
                if (accountId === tx.proposal) {
                    account = createProposal(accountId);
                    accounts[accountId] = account;
                    accountCreated = true;
                }
            }
            if (tx.type === 'dev_issue') {
                if (accountId === tx.devIssue) {
                    account = createDevIssue(accountId);
                    accounts[accountId] = account;
                    accountCreated = true;
                }
            }
            if (tx.type === 'dev_proposal') {
                if (accountId === tx.devProposal) {
                    account = createDevProposal(accountId);
                    accounts[accountId] = account;
                    accountCreated = true;
                }
            }
            if (tx.type === 'proposal') {
                if (accountId === tx.proposal) {
                    account = createProposal(accountId);
                    accounts[accountId] = account;
                    accountCreated = true;
                }
            }
            if (tx.type === 'register') {
                if (accountId === tx.aliasHash) {
                    account = createAlias(accountId);
                    accounts[accountId] = account;
                    accountCreated = true;
                }
            }
            if (tx.type === 'message') {
                if (accountId === tx.chatId) {
                    account = createChat(accountId);
                    accounts[accountId] = account;
                    accountCreated = true;
                }
            }
            if (tx.type === 'node_reward') {
                if (accountId === tx.from && accountId === tx.to) {
                    account = createNode(accountId);
                    accounts[accountId] = account;
                    accountCreated = true;
                }
            }
        }
        if (typeof account === 'undefined' || account === null) {
            if (tx.nodeId) {
                account = createNode(accountId);
                accounts[accountId] = account;
                accountCreated = true;
            }
            else {
                account = createAccount(accountId, tx.timestamp);
                accounts[accountId] = account;
                accountCreated = true;
            }
        }
        // Wrap it for Shardus
        var wrapped = dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account);
        return wrapped;
    },
    updateAccountFull: function (wrappedData, localCache, applyResponse) {
        var accountId = wrappedData.accountId;
        var accountCreated = wrappedData.accountCreated;
        var updatedAccount = wrappedData.data;
        // Update hash
        var hashBefore = updatedAccount.hash;
        updatedAccount.hash = ''; // DON'T THINK THIS IS NECESSARY
        var hashAfter = crypto.hashObj(updatedAccount);
        updatedAccount.hash = hashAfter;
        // Save updatedAccount to db / persistent storage
        accounts[accountId] = updatedAccount;
        // Add data to our required response object
        dapp.applyResponseAddState(applyResponse, updatedAccount, updatedAccount, accountId, applyResponse.txId, applyResponse.txTimestamp, hashBefore, hashAfter, accountCreated);
    },
    // TODO: This might be useful in making some optimizations
    updateAccountPartial: function (wrappedData, localCache, applyResponse) {
        this.updateAccountFull(wrappedData, localCache, applyResponse);
    },
    getAccountDataByRange: function (accountStart, accountEnd, tsStart, tsEnd, maxRecords) {
        var results = [];
        var start = parseInt(accountStart, 16);
        var end = parseInt(accountEnd, 16);
        // Loop all accounts
        for (var _i = 0, _a = Object.values(accounts); _i < _a.length; _i++) {
            var account = _a[_i];
            // Skip if not in account id range
            var id = parseInt(account.id, 16);
            if (id < start || id > end)
                continue;
            // Skip if not in timestamp range
            var timestamp = account.timestamp;
            if (timestamp < tsStart || timestamp > tsEnd)
                continue;
            // Add to results
            var wrapped = {
                accountId: account.id,
                stateId: account.hash,
                data: account,
                timestamp: account.timestamp
            };
            results.push(wrapped);
            // Return results early if maxRecords reached
            if (results.length >= maxRecords) {
                results.sort(function (a, b) { return a.timestamp - b.timestamp; });
                return results;
            }
        }
        results.sort(function (a, b) { return a.timestamp - b.timestamp; });
        return results;
    },
    getAccountData: function (accountStart, accountEnd, maxRecords) {
        var results = [];
        var start = parseInt(accountStart, 16);
        var end = parseInt(accountEnd, 16);
        // Loop all accounts
        for (var _i = 0, _a = Object.values(accounts); _i < _a.length; _i++) {
            var account = _a[_i];
            // Skip if not in account id range
            var id = parseInt(account.id, 16);
            if (id < start || id > end)
                continue;
            // Add to results
            var wrapped = {
                accountId: account.id,
                stateId: account.hash,
                data: account,
                timestamp: account.timestamp
            };
            results.push(wrapped);
            // Return results early if maxRecords reached
            if (results.length >= maxRecords) {
                results.sort(function (a, b) { return a.timestamp - b.timestamp; });
                return results;
            }
        }
        results.sort(function (a, b) { return a.timestamp - b.timestamp; });
        return results;
    },
    getAccountDataByList: function (addressList) {
        var results = [];
        for (var _i = 0, addressList_1 = addressList; _i < addressList_1.length; _i++) {
            var address = addressList_1[_i];
            var account = accounts[address];
            if (account) {
                var wrapped = {
                    accountId: account.id,
                    stateId: account.hash,
                    data: account,
                    timestamp: account.timestamp
                };
                results.push(wrapped);
            }
        }
        results.sort(function (a, b) { return parseInt(a.accountId, 16) - parseInt(b.accountId, 16); });
        return results;
    },
    calculateAccountHash: function (account) {
        account.hash = ''; // Not sure this is really necessary
        account.hash = crypto.hashObj(account);
        return account.hash;
    },
    resetAccountData: function (accountBackupCopies) {
        for (var _i = 0, accountBackupCopies_1 = accountBackupCopies; _i < accountBackupCopies_1.length; _i++) {
            var recordData = accountBackupCopies_1[_i];
            accounts[recordData.id] = recordData;
        }
    },
    deleteAccountData: function (addressList) {
        for (var _i = 0, addressList_2 = addressList; _i < addressList_2.length; _i++) {
            var address = addressList_2[_i];
            delete accounts[address];
        }
    },
    getAccountDebugValue: function (wrappedAccount) {
        return "" + stringify(wrappedAccount);
    },
    close: function () {
        dapp.log('Shutting down server...');
    }
});
dapp.registerExceptionHandler();
// HELPER METHOD TO WAIT
function _sleep(ms) {
    if (ms === void 0) { ms = 0; }
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
        });
    });
}
function maintenanceAmount(timestamp, account) {
    var amount;
    if (timestamp - account.lastMaintenance < CURRENT.maintenanceInterval) {
        amount = 0;
    }
    else {
        amount =
            account.data.balance *
                (CURRENT.maintenanceFee *
                    Math.floor((timestamp - account.lastMaintenance) / CURRENT.maintenanceInterval));
        account.lastMaintenance = timestamp;
    }
    return amount;
}
// NODE_REWARD TRANSACTION FUNCTION
function nodeReward(address, nodeId) {
    var payAddress = address;
    var tx = {
        type: 'node_reward',
        timestamp: Date.now(),
        nodeId: nodeId,
        from: address,
        to: payAddress
    };
    dapp.put(tx);
}
// ISSUE TRANSACTION FUNCTION
function generateIssue(address, nodeId) {
    return __awaiter(this, void 0, void 0, function () {
        var tx;
        return __generator(this, function (_a) {
            tx = {
                type: 'issue',
                nodeId: nodeId,
                from: address,
                to: networkAccount,
                issue: crypto.hash("issue-" + ISSUE),
                proposal: crypto.hash("issue-" + ISSUE + "-proposal-1"),
                timestamp: Date.now()
            };
            dapp.put(tx);
            dapp.log('GENERATED_ISSUE: ', nodeId);
            return [2 /*return*/];
        });
    });
}
// DEV_ISSUE TRANSACTION FUNCTION
function generateDevIssue(address, nodeId) {
    return __awaiter(this, void 0, void 0, function () {
        var tx;
        return __generator(this, function (_a) {
            tx = {
                type: 'dev_issue',
                nodeId: nodeId,
                from: address,
                to: networkAccount,
                devIssue: crypto.hash("dev-issue-" + DEV_ISSUE),
                timestamp: Date.now()
            };
            dapp.put(tx);
            dapp.log('GENERATED_DEV_ISSUE: ', nodeId);
            return [2 /*return*/];
        });
    });
}
// TALLY TRANSACTION FUNCTION
function tallyVotes(address, nodeId) {
    return __awaiter(this, void 0, void 0, function () {
        var issue, tx, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("issue-" + ISSUE))];
                case 1:
                    issue = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 3, , 5]);
                    tx = {
                        type: 'tally',
                        nodeId: nodeId,
                        from: address,
                        to: networkAccount,
                        issue: issue.data.id,
                        proposals: issue.data.proposals,
                        timestamp: Date.now()
                    };
                    dapp.put(tx);
                    dapp.log('GENERATED_TALLY: ', nodeId);
                    return [3 /*break*/, 5];
                case 3:
                    err_1 = _a.sent();
                    dapp.log('ERR: ', err_1);
                    return [4 /*yield*/, _sleep(1000)];
                case 4:
                    _a.sent();
                    return [2 /*return*/, tallyVotes(address, nodeId)];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// DEV_TALLY TRANSACTION FUNCTION
function tallyDevVotes(address, nodeId) {
    return __awaiter(this, void 0, void 0, function () {
        var devIssue, tx, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 4]);
                    return [4 /*yield*/, dapp.getLocalOrRemoteAccount(crypto.hash("dev-issue-" + DEV_ISSUE)).data];
                case 1:
                    devIssue = _a.sent();
                    tx = {
                        type: 'dev_tally',
                        nodeId: nodeId,
                        from: address,
                        to: networkAccount,
                        devIssue: devIssue.id,
                        devProposals: devIssue.devProposals,
                        timestamp: Date.now()
                    };
                    dapp.put(tx);
                    dapp.log('GENERATED_DEV_TALLY: ', nodeId);
                    return [3 /*break*/, 4];
                case 2:
                    err_2 = _a.sent();
                    dapp.log('ERR: ', err_2);
                    return [4 /*yield*/, _sleep(1000)];
                case 3:
                    _a.sent();
                    return [2 /*return*/, tallyDevVotes(address, nodeId)];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// APPLY_PARAMETERS TRANSACTION FUNCTION
function applyParameters(address, nodeId) {
    return __awaiter(this, void 0, void 0, function () {
        var tx;
        return __generator(this, function (_a) {
            tx = {
                type: 'apply_parameters',
                nodeId: nodeId,
                from: address,
                to: networkAccount,
                issue: crypto.hash("issue-" + ISSUE),
                timestamp: Date.now()
            };
            dapp.put(tx);
            dapp.log('GENERATED_APPLY: ', nodeId);
            return [2 /*return*/];
        });
    });
}
// APPLY_DEV_PARAMETERS TRANSACTION FUNCTION
function applyDevParameters(address, nodeId) {
    return __awaiter(this, void 0, void 0, function () {
        var tx;
        return __generator(this, function (_a) {
            tx = {
                type: 'apply_dev_parameters',
                nodeId: nodeId,
                from: address,
                to: networkAccount,
                devIssue: crypto.hash("dev-issue-" + DEV_ISSUE),
                timestamp: Date.now()
            };
            dapp.put(tx);
            dapp.log('GENERATED_DEV_APPLY: ', nodeId);
            return [2 /*return*/];
        });
    });
}
// RELEASE DEVELOPER FUNDS FOR A PAYMENT
function releaseDeveloperFunds(payment, address, nodeId) {
    var tx = {
        type: 'developer_payment',
        nodeId: nodeId,
        from: address,
        to: networkAccount,
        developer: payment.address,
        payment: payment,
        timestamp: Date.now()
    };
    dapp.put(tx);
    dapp.log('GENERATED_DEV_FUND_RELEASE: ', nodeId);
}
// CODE THAT GETS EXECUTED WHEN NODES START
;
(function () { return __awaiter(void 0, void 0, void 0, function () {
    // THIS CODE IS CALLED ON EVERY NODE ON EVERY CYCLE
    function networkMaintenance() {
        return __awaiter(this, void 0, void 0, function () {
            var _loop_1, _i, DEVELOPER_FUND_1, payment, state_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        expectedInterval += cycleInterval;
                        try {
                            cycleData = dapp.getLatestCycles()[0];
                            cycleStartTimestamp = cycleData.start * 1000 + (ONE_SECOND * 30);
                            (luckyNode = dapp.getClosestNodes(cycleData.marker, 2)[0]);
                            nodeId = dapp.getNodeId();
                            nodeAddress = dapp.getNode(nodeId).address;
                        }
                        catch (err) {
                            dapp.log('ERR: ', err);
                            return [2 /*return*/, setTimeout(networkMaintenance, 1000)];
                        }
                        dapp.log("\n      CYCLE_DATA: ", cycleData, "\n      luckyNode: ", luckyNode, "\n      IN_SYNC: ", IN_SYNC, "\n      CURRENT: ", CURRENT, "\n      NEXT: ", NEXT, "\n      DEVELOPER_FUND: ", DEVELOPER_FUND, "\n      NEXT_DEVELOPER_FUND: ", NEXT_DEVELOPER_FUND, "\n      ISSUE: ", ISSUE, "\n      DEV_ISSUE: ", DEV_ISSUE, "\n      nodeId: ", nodeId, "\n    ");
                        if (_.isEmpty(CURRENT) || _.isEmpty(WINDOWS) || _.isEmpty(DEV_WINDOWS)) {
                            IN_SYNC = false;
                        }
                        if (!!IN_SYNC) return [3 /*break*/, 3];
                        return [4 /*yield*/, syncParameters(cycleStartTimestamp + cycleInterval)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, syncDevParameters(cycleStartTimestamp + cycleInterval)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, setTimeout(networkMaintenance, 1000)];
                    case 3:
                        // THIS IS FOR NODE_REWARD
                        if (cycleStartTimestamp - lastReward > CURRENT.nodeRewardInterval) {
                            nodeReward(nodeAddress, nodeId);
                            lastReward = cycleStartTimestamp;
                        }
                        // AUTOMATIC (ISSUE | TALLY | APPLY_PARAMETERS) TRANSACTION GENERATION
                        // IS THE NETWORK READY TO GENERATE A NEW ISSUE?
                        dapp.log('ISSUE_DEBUG ---------- ', 'ISSUE_GENERATED: ', issueGenerated, 'LUCKY_NODE: ', luckyNode, 'NODE_ID: ', nodeId, 'CYCLE_START_TIME: ', cycleStartTimestamp, 'ISSUE_WINDOW_START_TIME: ', WINDOWS.proposalWindow[0], 'ISSUE_WINDOW_END_TIME: ', WINDOWS.proposalWindow[1], 'WITHIN_ISSUE_WINDOW: ', cycleStartTimestamp >= WINDOWS.proposalWindow[0] &&
                            cycleStartTimestamp <= WINDOWS.proposalWindow[1]);
                        if (!(cycleStartTimestamp >= WINDOWS.proposalWindow[0] &&
                            cycleStartTimestamp <= WINDOWS.proposalWindow[1])) return [3 /*break*/, 6];
                        if (!!issueGenerated) return [3 /*break*/, 6];
                        if (!(nodeId === luckyNode && ISSUE > 1)) return [3 /*break*/, 5];
                        return [4 /*yield*/, generateIssue(nodeAddress, nodeId)];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        issueGenerated = true;
                        applyGenerated = false;
                        _a.label = 6;
                    case 6:
                        dapp.log('TALLY_DEBUG ---------- ', 'TALLY_GENERATED: ', tallyGenerated, 'LUCKY_NODE: ', luckyNode, 'NODE_ID: ', nodeId, 'CYCLE_START_TIME: ', cycleStartTimestamp, 'TALLY_WINDOW_START_TIME: ', WINDOWS.graceWindow[0], 'TALLY_WINDOW_END_TIME: ', WINDOWS.graceWindow[1], 'WITHIN_TALLY_WINDOW: ', cycleStartTimestamp >= WINDOWS.graceWindow[0] &&
                            cycleStartTimestamp <= WINDOWS.graceWindow[1]);
                        if (!(cycleStartTimestamp >= WINDOWS.graceWindow[0] &&
                            cycleStartTimestamp <= WINDOWS.graceWindow[1])) return [3 /*break*/, 11];
                        syncedNextParams.push(1);
                        if (!(syncedNextParams.length === 3)) return [3 /*break*/, 8];
                        return [4 /*yield*/, syncParameters(cycleStartTimestamp)];
                    case 7:
                        _a.sent();
                        syncedNextParams = [];
                        _a.label = 8;
                    case 8:
                        if (!!tallyGenerated) return [3 /*break*/, 11];
                        if (!(nodeId === luckyNode)) return [3 /*break*/, 10];
                        return [4 /*yield*/, tallyVotes(nodeAddress, nodeId)];
                    case 9:
                        _a.sent();
                        _a.label = 10;
                    case 10:
                        tallyGenerated = true;
                        _a.label = 11;
                    case 11:
                        dapp.log('APPLY_DEBUG ---------- ', 'APPLY_GENERATED: ', applyGenerated, 'LUCKY_NODE: ', luckyNode, 'NODE_ID: ', nodeId, 'CYCLE_START_TIME: ', cycleStartTimestamp, 'APPLY_WINDOW_START_TIME: ', WINDOWS.applyWindow[0], 'APPLY_WINDOW_END_TIME: ', WINDOWS.applyWindow[1], 'WITHIN_APPLY_WINDOW: ', cycleStartTimestamp >= WINDOWS.applyWindow[0] &&
                            cycleStartTimestamp <= WINDOWS.applyWindow[1]);
                        if (!(cycleStartTimestamp >= WINDOWS.applyWindow[0] &&
                            cycleStartTimestamp <= WINDOWS.applyWindow[1])) return [3 /*break*/, 14];
                        if (!!applyGenerated) return [3 /*break*/, 14];
                        if (!(nodeId === luckyNode)) return [3 /*break*/, 13];
                        return [4 /*yield*/, applyParameters(nodeAddress, nodeId)];
                    case 12:
                        _a.sent();
                        _a.label = 13;
                    case 13:
                        WINDOWS = NEXT_WINDOWS;
                        // NEXT_WINDOWS = {}
                        CURRENT = NEXT;
                        // NEXT = {}
                        ISSUE++;
                        applyGenerated = true;
                        issueGenerated = false;
                        tallyGenerated = false;
                        _a.label = 14;
                    case 14:
                        dapp.log('DEV_ISSUE_DEBUG ---------- ', 'DEV_ISSUE_GENERATED: ', tallyGenerated, 'LUCKY_NODE: ', luckyNode, 'NODE_ID: ', nodeId, 'CYCLE_START_TIME: ', cycleStartTimestamp, 'DEV_ISSUE_WINDOW_START_TIME: ', DEV_WINDOWS.devProposalWindow[0], 'DEV_ISSUE_WINDOW_END_TIME: ', DEV_WINDOWS.devProposalWindow[1], 'WITHIN_DEV_ISSUE_WINDOW: ', cycleStartTimestamp >= DEV_WINDOWS.devProposalWindow[0] &&
                            cycleStartTimestamp <= DEV_WINDOWS.devProposalWindow[1]);
                        if (!(cycleStartTimestamp >= DEV_WINDOWS.devProposalWindow[0] &&
                            cycleStartTimestamp <= DEV_WINDOWS.devProposalWindow[1])) return [3 /*break*/, 17];
                        if (!!devIssueGenerated) return [3 /*break*/, 17];
                        if (!(nodeId === luckyNode && DEV_ISSUE >= 2)) return [3 /*break*/, 16];
                        return [4 /*yield*/, generateDevIssue(nodeAddress, nodeId)];
                    case 15:
                        _a.sent();
                        _a.label = 16;
                    case 16:
                        devIssueGenerated = true;
                        devApplyGenerated = false;
                        _a.label = 17;
                    case 17:
                        dapp.log('DEV_TALLY_DEBUG ---------- ', 'DEV_TALLY_GENERATED: ', devTallyGenerated, 'LUCKY_NODE: ', luckyNode, 'NODE_ID: ', nodeId, 'CYCLE_START_TIME: ', cycleStartTimestamp, 'DEV_TALLY_WINDOW_START_TIME: ', DEV_WINDOWS.devGraceWindow[0], 'DEV_TALLY_WINDOW_END_TIME: ', DEV_WINDOWS.devGraceWindow[1], 'WITHIN_DEV_TALLY_WINDOW: ', cycleStartTimestamp >= DEV_WINDOWS.devGraceWindow[0] &&
                            cycleStartTimestamp <= DEV_WINDOWS.devGraceWindow[1]);
                        if (!(cycleStartTimestamp >= DEV_WINDOWS.devGraceWindow[0] &&
                            cycleStartTimestamp <= DEV_WINDOWS.devGraceWindow[1])) return [3 /*break*/, 22];
                        syncedNextDevParams.push(1);
                        if (!(syncedNextDevParams.length === 3)) return [3 /*break*/, 19];
                        return [4 /*yield*/, syncDevParameters(cycleStartTimestamp)];
                    case 18:
                        _a.sent();
                        syncedNextDevParams = [];
                        _a.label = 19;
                    case 19:
                        if (!!devTallyGenerated) return [3 /*break*/, 22];
                        if (!(nodeId === luckyNode)) return [3 /*break*/, 21];
                        return [4 /*yield*/, tallyDevVotes(nodeAddress, nodeId)];
                    case 20:
                        _a.sent();
                        _a.label = 21;
                    case 21:
                        devTallyGenerated = true;
                        _a.label = 22;
                    case 22:
                        dapp.log('DEV_APPLY_DEBUG ---------- ', 'DEV_APPLY_GENERATED: ', devApplyGenerated, 'LUCKY_NODE: ', luckyNode, 'NODE_ID: ', nodeId, 'CYCLE_START_TIME: ', cycleStartTimestamp, 'DEV_APPLY_WINDOW_START_TIME: ', DEV_WINDOWS.devApplyWindow[0], 'DEV_APPLY_WINDOW_END_TIME: ', DEV_WINDOWS.devApplyWindow[1], 'WITHIN_DEV_APPLY_WINDOW: ', cycleStartTimestamp >= DEV_WINDOWS.devApplyWindow[0] &&
                            cycleStartTimestamp <= DEV_WINDOWS.devApplyWindow[1]);
                        if (!(cycleStartTimestamp >= DEV_WINDOWS.devApplyWindow[0] &&
                            cycleStartTimestamp <= DEV_WINDOWS.devApplyWindow[1])) return [3 /*break*/, 25];
                        if (!!devApplyGenerated) return [3 /*break*/, 25];
                        if (!(nodeId === luckyNode)) return [3 /*break*/, 24];
                        return [4 /*yield*/, applyDevParameters(nodeAddress, nodeId)];
                    case 23:
                        _a.sent();
                        _a.label = 24;
                    case 24:
                        DEV_WINDOWS = NEXT_DEV_WINDOWS;
                        // NEXT_DEV_WINDOWS = {}
                        DEVELOPER_FUND = __spreadArrays(DEVELOPER_FUND, NEXT_DEVELOPER_FUND);
                        NEXT_DEVELOPER_FUND = [];
                        DEV_ISSUE++;
                        devApplyGenerated = true;
                        devIssueGenerated = false;
                        devTallyGenerated = false;
                        _a.label = 25;
                    case 25:
                        _loop_1 = function (payment) {
                            // PAY DEVELOPER IF THE CURRENT TIME IS GREATER THAN THE PAYMENT TIME
                            if (cycleStartTimestamp >= payment.timestamp) {
                                if (nodeId === luckyNode) {
                                    releaseDeveloperFunds(payment, nodeAddress, nodeId);
                                }
                                DEVELOPER_FUND = DEVELOPER_FUND.filter(function (p) { return p.id !== payment.id; });
                            }
                            else {
                                return "break";
                            }
                        };
                        // LOOP THROUGH IN-MEMORY DEVELOPER_FUND
                        for (_i = 0, DEVELOPER_FUND_1 = DEVELOPER_FUND; _i < DEVELOPER_FUND_1.length; _i++) {
                            payment = DEVELOPER_FUND_1[_i];
                            state_1 = _loop_1(payment);
                            if (state_1 === "break")
                                break;
                        }
                        // return setTimeout(networkMaintenance, expectedInterval - cycleStartTimestamp) NO GOOD
                        return [2 /*return*/, setTimeout(networkMaintenance, expectedInterval - Date.now())];
                }
            });
        });
    }
    var cycleInterval, issueGenerated, tallyGenerated, applyGenerated, devIssueGenerated, devTallyGenerated, devApplyGenerated, syncedNextParams, syncedNextDevParams, nodeId, nodeAddress, cycleStartTimestamp, lastReward, expectedInterval, cycleData, luckyNode;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                cycleInterval = cycleDuration * ONE_SECOND;
                issueGenerated = false;
                tallyGenerated = false;
                applyGenerated = false;
                devIssueGenerated = false;
                devTallyGenerated = false;
                devApplyGenerated = false;
                syncedNextParams = [];
                syncedNextDevParams = [];
                return [4 /*yield*/, dapp.start()];
            case 1:
                _a.sent();
                dapp.p2p.on('active', function () { return __awaiter(void 0, void 0, void 0, function () {
                    var cycleData;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                if (!dapp.p2p.isFirstSeed) return [3 /*break*/, 2];
                                return [4 /*yield*/, _sleep(ONE_SECOND * 20)];
                            case 1:
                                _a.sent();
                                _a.label = 2;
                            case 2:
                                cycleData = dapp.getLatestCycles()[0];
                                nodeId = dapp.getNodeId();
                                nodeAddress = dapp.getNode(nodeId).address;
                                cycleStartTimestamp = cycleData.start * 1000;
                                lastReward = cycleStartTimestamp;
                                expectedInterval = cycleStartTimestamp + cycleInterval;
                                return [2 /*return*/, setTimeout(networkMaintenance, expectedInterval - Date.now())];
                        }
                    });
                }); });
                return [2 /*return*/];
        }
    });
}); })();
