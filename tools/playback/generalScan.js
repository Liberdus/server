const path = require("path");
const scanner = require("../playback/scanner.js")({
  baseDir: "../..",
  serverPath: "appmain.js"
});

const INSTANCE_DIR = process.argv[2] || null; // path.join('.', 'instances')
let files = scanner.LoadPlaybackLogs(INSTANCE_DIR);

let compositeLines = scanner.MergePlaybackLogs(files);

scanner.WriteLines(
  path.join(scanner.instanceDir, "playbackMerged.txt"),
  compositeLines
);

// todo aggregate fatal results in a nice way
let fatalLines = scanner.MergeOtherLogs(files, "fatal");
scanner.WriteLinesRaw(
  path.join(scanner.instanceDir, "fatalMerged.txt"),
  fatalLines
);

let errorLines = scanner.MergeOtherLogs(files, "error");
scanner.WriteLinesRaw(
  path.join(scanner.instanceDir, "errorMerged.txt"),
  errorLines
);

let shardDumpLines = scanner.MergeOtherLogsLastLine(files, "shardDump", 2);
if (shardDumpLines.length > 0) {
  scanner.WriteLinesRaw(
    path.join(scanner.instanceDir, "shardDumpMerged.txt"),
    shardDumpLines
  );
  scanner.processShardDump(
    path.join(scanner.instanceDir, "shardReport.txt"),
    shardDumpLines
  );
}

scanner.dumpNodeIds();
scanner.validateMessageMatching(scanner.msgPairsSameNode, compositeLines);
scanner.validateMessageMatching(scanner.msgGroups, compositeLines);
scanner.validateGossip(scanner.gossip, compositeLines);
