const fs = require("fs");
// const util = require('util')
// const readdir = util.promisify(fs.readdir)
// const readFile = util.promisify(fs.readFile)
const path = require("path");
const merge = require("deepmerge");
const utils = require("shardus-global-server/src/utils");

const Areq = 1;
const Arecv = 2;
const Brecv = 3;
const Bresp = 4;

class Scanner {
  constructor(config = {}) {
    Object.assign(this, merge(this, config));
    if (!this.baseDir) this.baseDir = ".";
    if (!this.instanceDir)
      this.instanceDir = path.join(this.baseDir, "instances");
    if (!this.instanceNames) this.instanceNames = "shardus-server";
    if (!this.serverPath) {
      this.serverPath = path.join(this.baseDir, "server.js");
    } else {
      this.serverPath = path.join(this.baseDir, this.serverPath);
    }

    this.logFiles = [];
    this.dirToOwnerMap = {};

    this.columnNames = [
      "DateTimeLevel",
      "Timestamp",
      "LogOwner",
      "From",
      "To",
      "Type",
      "Endpoint",
      "ID",
      "Details"
    ];

    this.columnID = {
      DateTimeLevel: 0,
      Timestamp: 1,
      LogOwner: 2,
      From: 3,
      To: 4,
      Type: 5,
      Endpoint: 6,
      ID: 7,
      Details: 8
    };

    this.logTypes = {
      Empty: 0,
      HttpRequest: 1,
      HttpResponseRecv: 2,
      InternalTell: 3,
      InternalAsk: 4,
      InternalAskResp: 5,
      ExternalHttpReq: 6,
      InternalRecv: 7,
      InternalRecvResp: 8,
      GossipSend: 9,
      GossipInSend: 10,
      GossipRcv: 11,
      StateChange: 12,
      Note: 13,
      MAX: 14
    };

    this.logTypeStrings = [];
    this.logTypeStrings.fill("", this.logTypes.MAX);
    for (let key in this.logTypes) {
      if (this.logTypes.hasOwnProperty(key)) {
        this.logTypeStrings[this.logTypes[key]] = key;
      }
    }

    this.msgPairsSameNode = [
      // http
      {
        name: "http",
        ruleList: [
          { n: Areq, t: this.logTypes.HttpRequest },
          { n: Arecv, t: this.logTypes.HttpResponseRecv }
        ]
      },
      // internal ask
      {
        name: "internal ask",
        ruleList: [
          { n: Areq, t: this.logTypes.InternalAsk },
          { n: Arecv, t: this.logTypes.InternalAskResp }
        ]
      },
      // internal ask handler
      {
        name: "internal ask handler",
        ruleList: [
          { n: Brecv, t: this.logTypes.InternalRecv },
          { n: Bresp, t: this.logTypes.InternalRecvResp }
        ]
      }
    ];
    this.msgGroups = [
      // http
      {
        name: "http",
        ruleList: [
          { n: Areq, t: this.logTypes.HttpRequest },
          { n: Arecv, t: this.logTypes.HttpResponseRecv },
          { n: Brecv, t: null },
          { n: Bresp, t: this.logTypes.ExternalHttpReq }
        ]
      },

      // internal ask
      {
        name: "internal ask",
        ruleList: [
          { n: Areq, t: this.logTypes.InternalAsk },
          { n: Brecv, t: this.logTypes.InternalRecv },
          { n: Bresp, t: this.logTypes.InternalRecvResp },
          { n: Arecv, t: this.logTypes.InternalAskResp }
        ]
      },

      // internal tell
      {
        name: "internal tell",
        ruleList: [
          { n: Areq, t: this.logTypes.InternalTell },
          { n: Brecv, t: this.logTypes.InternalRecv }
        ]
      }
    ];

    this.gossip = [
      // gossip
      {
        name: "gossip",
        ruleList: [
          { n: Areq, t: this.logTypes.GossipSend },
          { n: Brecv, t: this.logTypes.GossipRcv }
        ],
        onewayTest: true
      },
      // gossip in
      {
        name: "gossip in",
        ruleList: [
          { n: Areq, t: this.logTypes.GossipInSend },
          { n: Brecv, t: this.logTypes.GossipRcv }
        ],
        onewayTest: true
      }
    ];

    this.unverifiable = [
      // external endpoint
      { n: Bresp, t: this.logTypes.ExternalHttpReq }
    ];
  }

  // const Areq = 1    a->b
  // const Brecv = 3   a->b
  // const Bresp = 4     b->a
  // const Arecv = 2     b->a

  validateMessageMatching(rules, lines) {
    function SelectNode(job, rule) {
      if (rule.n === Areq || rule.n === Arecv) {
        return job.nodeA;
      }
      if (rule.n === Brecv || rule.n === Bresp) {
        return job.nodeB;
      }
      return "error"; // todo support other typeS?
    }

    let searchStarters = [];
    let searches = {};
    for (let ruleEntry of rules) {
      let searchString = this.logTypeStrings[ruleEntry.ruleList[0].t];
      searchStarters.push(searchString);
      searches[searchString] = ruleEntry;
    }

    // scan hosts
    let validNodes = {};
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let owner = line.columns[this.columnID.LogOwner];
      //   if (owner.startsWith('temp_') === false) {
      //     validNodes[owner] = true
      //   }
      validNodes[owner] = owner.startsWith("temp_") === false;
    }

    let jobs = [];
    // main loop
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let type = line.columns[this.columnID.Type];
      if (searchStarters.includes(type)) {
        let search = searches[type];
        let rule = search.ruleList[0];
        let job = { search, startingLine: i };

        if (rule.n === Areq) {
          job.nodeA = line.columns[this.columnID.LogOwner];
          job.nodeB = line.columns[this.columnID.To];
        } else {
          // Brecv.   todo other cases?
          job.nodeA = line.columns[this.columnID.From];
          job.nodeB = line.columns[this.columnID.LogOwner];
        }
        job.validated = false;
        job.index = 1;
        job.line = line;
        job.idKey = line.columns[this.columnID.ID];
        // throw out jobs involving nodes we wont track yet
        if (!validNodes[job.nodeA]) {
          continue;
        }
        if (!validNodes[job.nodeB]) {
          continue;
        }
        job.endPoint = line.columns[this.columnID.Endpoint];
        jobs.push(job);
      }
    }

    let failedCount = 0;
    // individual matching
    for (let job of jobs) {
      //   let startingLine = lines[job.index]
      for (
        let jobIndex = 1;
        jobIndex < job.search.ruleList.length;
        jobIndex++
      ) {
        let rule = job.search.ruleList[jobIndex];
        let targetNode = SelectNode(job, rule);
        let targetType = this.logTypeStrings[rule.t];
        let targetEndpoint = job.endPoint;
        let targetID = job.idKey;
        // let targetDesc =

        // if (job.startingLine > 462) {
        //   console.log('test')
        // }

        let foundNext = false;
        let startOffset = Math.max(0, job.startingLine - 500);
        let maxOffset = Math.min(2000, lines.length - startOffset);
        for (let i = 0; i < maxOffset; i++) {
          let index = i + startOffset;
          let line = lines[index];

          // if (index === 462) {
          //   console.log('test')
          // }
          if (
            line.columns[this.columnID.LogOwner] === targetNode &&
            line.columns[this.columnID.Type] === targetType &&
            line.columns[this.columnID.ID] === targetID &&
            line.columns[this.columnID.Endpoint] === targetEndpoint
          ) {
            foundNext = true;
            job.index++;
            break;
          }
        }
        if (foundNext === false) {
          failedCount++;

          let startingLine = lines[job.startingLine];
          console.log(
            `failed to match job in ${startingLine.file.parentFolder}\t${
              startingLine.file.owner
            } at line : ${job.startingLine + 1}\t${job.search.name}\t${
              job.line.columns[this.columnID.Timestamp]
            }\t${job.endPoint}`
          );
          continue;
        }
      }
    }

    console.log(
      `validateMessageMatching scanned ${jobs.length} jobs with ${failedCount} failures`
    );
  }

  validateMessageMatchingOld(rules, lines) {
    function SelectNode(job, rule) {
      if (rule.n === Areq || rule.n === Arecv) {
        return job.nodeA;
      }
      if (rule.n === Brecv || rule.n === Bresp) {
        return job.nodeB;
      }
      return "error"; // todo support other typeS?
    }

    let searchStarters = [];
    let searches = {};
    for (let ruleEntry of rules) {
      let searchString = this.logTypeStrings[ruleEntry.ruleList[0].t];
      searchStarters.push(searchString);
      searches[searchString] = ruleEntry;
    }

    // scan hosts
    let validNodes = {};
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let owner = line.columns[this.columnID.LogOwner];
      //   if (owner.startsWith('temp_') === false) {
      //     validNodes[owner] = true
      //   }
      validNodes[owner] = owner.startsWith("temp_") === false;
    }

    let jobs = [];
    // main loop
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let type = line.columns[this.columnID.Type];
      if (searchStarters.includes(type)) {
        let search = searches[type];
        let rule = search.ruleList[0];
        let job = { search, startingLine: i };

        if (rule.n === Areq) {
          job.nodeA = line.columns[this.columnID.LogOwner];
          job.nodeB = line.columns[this.columnID.To];
        } else {
          // Brecv.   todo other cases?
          job.nodeA = line.columns[this.columnID.From];
          job.nodeB = line.columns[this.columnID.LogOwner];
        }
        job.validated = false;
        job.index = 1;
        job.line = line;

        // throw out jobs involving nodes we wont track yet
        if (!validNodes[job.nodeA]) {
          continue;
        }
        if (!validNodes[job.nodeB]) {
          continue;
        }
        job.endPoint = line.columns[this.columnID.Endpoint];
        jobs.push(job);
      }
    }

    // individual matching
    for (let job of jobs) {
      //   let startingLine = lines[job.index]
      for (
        let jobIndex = 1;
        jobIndex < job.search.ruleList.length;
        jobIndex++
      ) {
        let rule = job.search.ruleList[jobIndex];
        let targetNode = SelectNode(job, rule);
        let targetType = this.logTypeStrings[rule.t];
        let targetEndpoint = job.endPoint;

        // let targetDesc =
        let foundNext = false;
        let maxOffset = Math.min(200, lines.length - job.startingLine);
        for (let i = 0; i < maxOffset; i++) {
          let line = lines[i + job.startingLine];
          if (
            line.columns[this.columnID.LogOwner] === targetNode &&
            line.columns[this.columnID.Type] === targetType &&
            line.columns[this.columnID.Endpoint] === targetEndpoint
          ) {
            foundNext = true;
            job.index++;
            break;
          }
        }
        if (foundNext === false) {
          console.log(
            `failed to match job at line : ${job.startingLine + 1}\t${
              job.search.name
            }\t${job.line.columns[this.columnID.Timestamp]}`
          );
          continue;
        }
      }
    }
  }

  validateGossip(rules, lines) {
    let searchStarters = [];
    let searches = {};
    for (let ruleEntry of rules) {
      let searchString = this.logTypeStrings[ruleEntry.ruleList[0].t];
      searchStarters.push(searchString);
      searches[searchString] = ruleEntry;
    }

    // scan hosts
    let validNodes = {};
    let validNodesOnlyCount = {};
    let validNodesByLine = []; // based on out line number figure out what nodes are valid
    let validNodeCount = 0;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let owner = line.columns[this.columnID.LogOwner];

      let before = validNodes[owner];
      let nodeIsValid = owner.startsWith("temp_") === false;
      let after = (validNodes[owner] = nodeIsValid);
      if (nodeIsValid) {
        validNodesOnlyCount[owner] = 0;
      }
      // did we see a new valid node
      if (!before && after) {
        validNodeCount++;
        validNodesByLine.push({
          line: i,
          validNodesOnlyCount: utils.deepCopy(validNodesOnlyCount),
          count: validNodeCount
        });
      }
    }

    let ignoreEndpoints = ["certificate"];
    let gossipKeys = {};
    let jobs = [];
    // main loop
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let type = line.columns[this.columnID.Type];
      if (searchStarters.includes(type)) {
        let search = searches[type];
        let rule = search.ruleList[0];
        let job = { search, startingLine: i };

        if (rule.n === Areq) {
          job.nodeA = line.columns[this.columnID.LogOwner];
          job.nodeB = line.columns[this.columnID.To];
        } else {
          // Brecv.   todo other cases?
          job.nodeA = line.columns[this.columnID.From];
          job.nodeB = line.columns[this.columnID.LogOwner];
        }
        job.owner = line.columns[this.columnID.LogOwner];
        job.validated = false;
        job.index = 1;
        job.line = line;
        job.idKey = line.columns[this.columnID.ID];
        if (gossipKeys[job.idKey]) {
          continue; // we already have a job for solving this gossip key!!
        }
        gossipKeys[job.idKey] = true;
        // throw out jobs involving nodes we wont track yet
        if (!validNodes[job.nodeA]) {
          continue;
        }
        if (!validNodes[job.nodeB]) {
          continue;
        }
        job.endPoint = line.columns[this.columnID.Endpoint];

        if (ignoreEndpoints.includes(job.endPoint)) {
          continue;
        }

        jobs.push(job);

        job.validNodes = [];
        for (let validNodeEntry of validNodesByLine) {
          if (validNodeEntry.line <= job.startingLine) {
            job.validNodes = validNodeEntry;
          } else {
            break;
          }
        }
      }
    }
    let failedCount = 0;
    // gossip matching
    for (let job of jobs) {
      let nodeCheckList = utils.deepCopy(job.validNodes.validNodesOnlyCount);
      //   let startingLine = lines[job.index]
      for (
        let jobIndex = 1;
        jobIndex < job.search.ruleList.length;
        jobIndex++
      ) {
        let rule = job.search.ruleList[jobIndex];
        // let targetNode = SelectNode(job, rule)
        let targetType = this.logTypeStrings[rule.t];
        let targetEndpoint = job.endPoint;
        let targetID = job.idKey;

        // if (job.startingLine === 26259) {
        //   console.log('exam start')
        // }
        // let targetDesc =
        let foundNext = false;
        let startOffset = Math.max(0, job.startingLine - 500);
        let maxOffset = Math.min(5000, lines.length - startOffset);
        let nodesRecievingMessage = 1; // count the node saw this in the first place?
        nodeCheckList[job.owner] = -1; // take ourself out of the search
        for (let i = 0; i < maxOffset; i++) {
          let index = i + startOffset;
          let line = lines[index];

          // if (index === 26263) {
          //   console.log('exam start')
          // }

          if (
            line.columns[this.columnID.Type] === targetType &&
            line.columns[this.columnID.ID] === targetID &&
            line.columns[this.columnID.Endpoint] === targetEndpoint
          ) {
            if (nodeCheckList[line.columns[this.columnID.LogOwner]] === 0) {
              nodesRecievingMessage++;
              nodeCheckList[line.columns[this.columnID.LogOwner]]++;
            }
          }

          // hardcoded checks for sending
          if (
            line.columns[this.columnID.Type] === "GossipSend" &&
            line.columns[this.columnID.ID] === targetID
          ) {
            if (nodeCheckList[line.columns[this.columnID.LogOwner]] === 0) {
              nodesRecievingMessage++;
              nodeCheckList[line.columns[this.columnID.LogOwner]]++;
            }
          }
          if (
            line.columns[this.columnID.Type] === "GossipInSend" &&
            line.columns[this.columnID.ID] === targetID
          ) {
            if (nodeCheckList[line.columns[this.columnID.LogOwner]] === 0) {
              nodesRecievingMessage++;
              nodeCheckList[line.columns[this.columnID.LogOwner]]++;
            }
          }
        }
        if (nodesRecievingMessage === job.validNodes.count) {
          foundNext = true;
          job.index++;
        }

        if (foundNext === false) {
          failedCount++;
          let failed = "";
          for (let nodeName of Object.keys(nodeCheckList)) {
            if (nodeCheckList[nodeName] === 0) {
              failed += nodeName + ", ";
            }
          }
          console.log(
            `failed to match job at line : ${job.startingLine + 1}\t${
              job.search.name
            }\t${job.line.columns[this.columnID.Timestamp]}\t${
              job.endPoint
            }\t\t${failed}`
          );
          continue;
        }
      }
    }
    console.log(
      `validateGossip scanned ${jobs.length} jobs with ${failedCount} failures`
    );
  }

  LoadPlaybackLogs(INSTANCE_DIR) {
    if (INSTANCE_DIR) {
      this.instanceDir = INSTANCE_DIR;
    }
    console.log("LoadPlaybackLogs");
    fs.readdirSync(this.instanceDir, { withFileTypes: true }).forEach(
      dirEnt => {
        if (dirEnt.isDirectory()) {
          this.LoadLogs(path.join(this.instanceDir, dirEnt.name), dirEnt.name);
        }
      }
    );
    console.log(`loaded ${this.logFiles.length} files`);
    return this.logFiles;
  }

  LoadLogs(filePath, parentFolder) {
    function grabFileData(name, requireColumns) {
      let filename = path.join(filePath + "/logs", name);
      let fileData = { name: filename, lines: [], logOwners: {} };
      require("fs")
        .readFileSync(filename, "utf-8")
        .split(/\r?\n/)
        .forEach(function(line) {
          // console.log(line)
          let lineData = { raw: line, columns: [] };
          lineData.columns = line.split("\t");

          if (requireColumns === false || lineData.columns.length > 2) {
            fileData.lines.push(lineData);
          }
          lineData.file = fileData; // reference to parent log
        });
      fileData.parentFolder = parentFolder;
      return fileData;
    }

    // first pass: grab
    fs.readdirSync(filePath + "/logs", { withFileTypes: true }).forEach(
      dirEnt => {
        if (dirEnt.isFile()) {
          if (dirEnt.name.includes("playback")) {
            let fileData = grabFileData(dirEnt.name, true);
            fileData.owner = this.GetFileOwnerID(fileData);
            fileData.fileType = "playback";

            this.dirToOwnerMap[parentFolder] = fileData.owner;
            this.logFiles.push(fileData);
          }
        }
      }
    );

    fs.readdirSync(filePath + "/logs", { withFileTypes: true }).forEach(
      dirEnt => {
        if (dirEnt.isFile()) {
          if (dirEnt.name.includes("fatal")) {
            let fileData = grabFileData(dirEnt.name, false);
            fileData.owner = this.dirToOwnerMap[parentFolder];
            fileData.fileType = "fatal";
            this.logFiles.push(fileData);
          }
        }
      }
    );

    fs.readdirSync(filePath + "/logs", { withFileTypes: true }).forEach(
      dirEnt => {
        if (dirEnt.isFile()) {
          if (dirEnt.name.includes("errorFile")) {
            let fileData = grabFileData(dirEnt.name, false);
            fileData.owner = this.dirToOwnerMap[parentFolder];
            fileData.fileType = "error";
            this.logFiles.push(fileData);
          }
        }
      }
    );

    fs.readdirSync(filePath + "/logs", { withFileTypes: true }).forEach(
      dirEnt => {
        if (dirEnt.isFile()) {
          if (dirEnt.name.includes("shardDump")) {
            let fileData = grabFileData(dirEnt.name, false);
            fileData.owner = this.dirToOwnerMap[parentFolder];
            fileData.fileType = "shardDump";
            this.logFiles.push(fileData);
          }
        }
      }
    );
  }

  ClearFileData() {
    this.logFiles = [];
  }

  GetFileOwnerID(fileObject) {
    let result = "unknown";
    if (fileObject.lines.length > 0) {
      let lastLine = fileObject.lines[fileObject.lines.length - 1];
      result = lastLine.columns[this.columnID.LogOwner];
    }
    return result;
  }

  MergePlaybackLogs(files) {
    let self = this;
    let count = 0;
    let sortLines = function(a, b) {
      count++;
      let value = 0;
      try {
        value =
          a.columns[self.columnID.Timestamp] -
          b.columns[self.columnID.Timestamp];
      } catch (ex) {
        console.log("error on count :" + count);
      }
      //   let value = a.columns[self.columnID.Timestamp] - b.columns[self.columnID.Timestamp]
      return value;
    };

    let compositeLines = [];
    for (let file of files) {
      if (file.fileType === "playback") {
        compositeLines = compositeLines.concat(file.lines);
      }
    }
    compositeLines.sort(sortLines);
    // compositeLines.sort((a, b) => a.columns[this.columnID.Timestamp] - b.columns[this.columnID.Timestamp])
    console.log(`merged ${files.length} files`);
    return compositeLines;
  }

  MergeOtherLogs(files, logType) {
    // let self = this
    // let count = 0
    // let sortLines = function (a, b) {
    //   count++
    //   let value = 0
    //   try {
    //     value = a.columns[self.columnID.Timestamp] - b.columns[self.columnID.Timestamp]
    //   } catch (ex) {
    //     console.log('error on count :' + count)
    //   }
    //   //   let value = a.columns[self.columnID.Timestamp] - b.columns[self.columnID.Timestamp]
    //   return value
    // }

    let compositeLines = [];
    for (let file of files) {
      if (file.fileType === logType) {
        compositeLines = compositeLines.concat(file.lines);
      }
    }
    // compositeLines.sort(sortLines)
    // compositeLines.sort((a, b) => a.columns[this.columnID.Timestamp] - b.columns[this.columnID.Timestamp])
    console.log(`merged ${files.length} files`);
    return compositeLines;
  }

  MergeOtherLogsLastLine(files, logType, count = 1) {
    let compositeLines = [];
    for (let file of files) {
      if (file.fileType === logType) {
        let linesToGrab = Math.min(file.lines.length, count);
        for (let i = 0; i < linesToGrab; i++) {
          let line = file.lines[file.lines.length - i - 1];
          compositeLines.push(line);
        }
      }
    }
    // compositeLines.sort(sortLines)
    // compositeLines.sort((a, b) => a.columns[this.columnID.Timestamp] - b.columns[this.columnID.Timestamp])
    console.log(`merged ${files.length} files`);
    return compositeLines;
  }

  WriteLines(path, lines, filter = null, seperator = "\t") {
    let stream = fs.createWriteStream(path, {
      flags: "w"
    });
    if (filter) {
      for (let lineData of lines) {
        if (filter(lineData)) {
          stream.write(lineData.columns.join(seperator) + "\n");
        }
      }
    } else {
      for (let lineData of lines) {
        stream.write(lineData.columns.join(seperator) + "\n");
      }
    }
    console.log("wrote lines to file: " + path);
  }

  WriteLinesRaw(path, lines, filter = null) {
    let stream = fs.createWriteStream(path, {
      flags: "w"
    });
    if (filter) {
      for (let lineData of lines) {
        if (filter(lineData)) {
          stream.write(lineData.file.parentFolder + "\t" + lineData.raw + "\n");
        }
      }
    } else {
      for (let lineData of lines) {
        stream.write(lineData.file.parentFolder + "\t" + lineData.raw + "\n");
      }
    }
    console.log("wrote lines to file: " + path);
  }

  LinesToConsole(lines, filter = null, maxLines = 20) {
    let count = 0;
    for (let lineData of lines) {
      if (count > maxLines) {
        return;
      }
      if (filter(lineData)) {
        console.log(lineData);
        count++;
      }
    }
  }

  FilterLines(lines, filter) {
    let output = [];
    for (let lineData of lines) {
      if (filter(lineData)) {
        output.push(lineData);
      }
    }
  }

  dumpNodeIds() {
    console.log("Node Key:");
    for (let fileData of this.logFiles) {
      console.log(`${fileData.parentFolder}\t${fileData.owner}`);
    }
  }

  processShardDump(path, lines) {
    let stream = fs.createWriteStream(path, {
      flags: "w"
    });
    let dataByParition = new Map();

    // let partitionDump = { partitions: [] }
    // partitionDump.cycle = this.currentCycleShardData.cycleNumber
    let rangesCovered = [];
    let nodesListsCovered = [];
    let nodeLists = [];
    let numNodes = 0;
    let newestCycle = 0;
    let partitionObjects = [];
    for (let line of lines) {
      let index = line.raw.indexOf('{"allNodeIds');
      if (index > 0) {
        let string = line.raw.slice(index);
        console.log(string);
        let partitionObj = JSON.parse(string);
        partitionObjects.push(partitionObj);

        if (partitionObj.cycle > newestCycle) {
          newestCycle = partitionObj.cycle;
        }
        partitionObj.owner = line.raw.slice(0, index);
      }
    }

    for (let partitionObj of partitionObjects) {
      // let partition = { parititionID: key, accounts: [] }
      // accounts.push({ id: wrappedAccount.accountId, hash: wrappedAccount.stateId })

      // we only want data for nodes that were active in the latest cycle.
      if (partitionObj.cycle === newestCycle) {
        for (let partition of partitionObj.partitions) {
          let results = dataByParition.get(partition.parititionID);
          if (results == null) {
            results = [];
            dataByParition.set(partition.parititionID, results);
          }
          results.push({
            owner: partitionObj.owner,
            accounts: partition.accounts,
            ownerId: partitionObj.rangesCovered.id
          });
        }
        rangesCovered.push(partitionObj.rangesCovered);
        nodesListsCovered.push(partitionObj.nodesCovered);
        nodeLists.push(partitionObj.allNodeIds);
        numNodes = partitionObj.allNodeIds.length;
      }
    }

    // need to only count stuff from the newestCycle.

    let allPassed = true;
    // let uniqueVotesByPartition = new Array(numNodes).fill(0)
    for (var [key, value] of dataByParition) {
      let results = value;
      let votes = {};
      for (let entry of results) {
        entry.accounts.sort(function(a, b) {
          return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
        });
        let string = utils.stringifyReduce(entry.accounts);
        let voteEntry = votes[string];
        if (voteEntry == null) {
          voteEntry = {};
          voteEntry.voteCount = 0;
          voteEntry.ownerIds = [];
          votes[string] = voteEntry;
        }
        voteEntry.voteCount++;
        votes[string] = voteEntry;

        voteEntry.ownerIds.push(entry.ownerId);
      }
      for (let key2 of Object.keys(votes)) {
        let voteEntry = votes[key2];
        let voters = "";
        if (key2 !== "[]") {
          voters = `---voters:${JSON.stringify(voteEntry.ownerIds)}`;
        }

        stream.write(
          `partition: ${key}  votes: ${voteEntry.voteCount} values: ${key2} \t\t\t${voters}\n`
        );
        // stream.write(`            ---voters: ${JSON.stringify(voteEntry.ownerIds)}\n`)
      }
      let numUniqueVotes = Object.keys(votes).length;
      if (numUniqueVotes > 2 || (numUniqueVotes > 1 && votes["[]"] == null)) {
        allPassed = false;
        stream.write(
          `partition: ${key} failed.  Too many different version of data: ${numUniqueVotes} \n`
        );
      }
    }

    // for (let i = 0; i < uniqueVotesByPartition.length; i++) {
    //   if (uniqueVotesByPartition[i] > 1) {
    //     allPassed = false
    //     stream.write(`partition: ${i} failed do to different version of patitiondata: ${uniqueVotesByPartition[i]} \n`)
    //   }
    // }
    stream.write(`partition tests all passed: ${allPassed}\n`);
    // rangesCovered

    rangesCovered.sort(function(a, b) {
      return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
    });

    let isStored = function(i, rangeCovered) {
      let key = i;
      let minP = rangeCovered.stMin;
      let maxP = rangeCovered.stMax;
      if (minP === maxP) {
        if (i !== minP) {
          return false;
        }
      } else if (maxP > minP) {
        // are we outside the min to max range
        if (key < minP || key > maxP) {
          return false;
        }
      } else {
        // are we inside the min to max range (since the covered rage is inverted)
        if (key > maxP && key < minP) {
          return false;
        }
      }
      return true;
    };
    let isConsensus = function(i, rangeCovered) {
      let key = i;
      let minP = rangeCovered.cMin;
      let maxP = rangeCovered.cMax;
      if (minP === maxP) {
        if (i !== minP) {
          return false;
        }
      } else if (maxP > minP) {
        // are we outside the min to max range
        if (key < minP || key > maxP) {
          return false;
        }
      } else {
        // are we inside the min to max range (since the covered rage is inverted)
        if (key > maxP && key < minP) {
          return false;
        }
      }
      return true;
    };

    for (let range of rangesCovered) {
      let partitionGraph = "";
      for (let i = 0; i < range.numP; i++) {
        let isC = isConsensus(i, range);
        let isSt = isStored(i, range);

        if (i === range.hP) {
          partitionGraph += "H";
        } else if (isC && isSt) {
          partitionGraph += "C";
        } else if (isC) {
          partitionGraph += "!";
        } else if (isSt) {
          partitionGraph += "e";
        } else {
          partitionGraph += "_";
        }
      }

      stream.write(
        `node: ${range.id} ${range.ipPort}\thome: ${
          range.hP
        }\tgraph: ${partitionGraph}   data:${JSON.stringify(range)}\n`
      );
    }
    stream.write(`\n\n`);
    nodesListsCovered.sort(function(a, b) {
      return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
    });
    for (let nodesCovered of nodesListsCovered) {
      let partitionGraph = "";
      let consensusMap = {};
      let storedMap = {};
      for (let entry of nodesCovered.consensus) {
        consensusMap[entry.idx] = { hp: entry.hp };
      }
      for (let entry of nodesCovered.stored) {
        storedMap[entry.idx] = { hp: entry.hp };
      }

      for (let i = 0; i < nodesCovered.numP; i++) {
        let isC = consensusMap[i] != null;
        let isSt = storedMap[i] != null;
        if (i === nodesCovered.idx) {
          partitionGraph += "O";
        } else if (isC && isSt) {
          partitionGraph += "C";
        } else if (isC) {
          partitionGraph += "!";
        } else if (isSt) {
          partitionGraph += "e";
        } else {
          partitionGraph += "_";
        }
      }

      stream.write(
        `node: ${nodesCovered.id} ${nodesCovered.ipPort}\thome: ${
          nodesCovered.hP
        }\tgraph: ${partitionGraph} data:${JSON.stringify(nodesCovered)}\n`
      );
    }
    stream.write(`\n\n`);
    // for (let nodesCovered of nodesListsCovered) {
    //   let partitionGraph = ''
    //   let consensusMap = {}
    //   let storedMap = {}
    //   for (let entry of nodesCovered.consensus) {
    //     consensusMap[entry.idx] = { hp: entry.hp }
    //   }
    //   for (let entry of nodesCovered.stored) {
    //     storedMap[entry.idx] = { hp: entry.hp }
    //   }

    //   for (let i = 0; i < nodesCovered.numP; i++) {
    //     let isC = consensusMap[i] != null
    //     let isSt = storedMap[i] != null
    //     if (i === nodesCovered.idx) {
    //       partitionGraph += 'O'
    //     } else if (isC && isSt) {
    //       partitionGraph += `${consensusMap[i].hp}`
    //     } else if (isC) {
    //       partitionGraph += `${consensusMap[i].hp}`
    //     } else if (isSt) {
    //       partitionGraph += `${storedMap[i].hp}`
    //     } else {
    //       partitionGraph += '_'
    //     }
    //   }

    //   stream.write(`node: ${nodesCovered.id} ${nodesCovered.ipPort}\thome: ${nodesCovered.hP}\tgraph: ${partitionGraph} data:${JSON.stringify(nodesCovered)}\n`)
    // }

    for (let list of nodeLists) {
      stream.write(`${JSON.stringify(list)} \n`);
    }
  }
}

module.exports = function(config = {}) {
  const relBaseDir = config.baseDir || ".";
  const relInstanceDir =
    config.instanceDir || path.join(relBaseDir, "instances");
  const parentModuleDirname = path.parse(module.parent.filename).dir;
  config.baseDir = path.resolve(path.join(parentModuleDirname, relBaseDir));
  config.instanceDir = path.resolve(
    path.join(parentModuleDirname, relInstanceDir)
  );
  return new Scanner(config);
};
