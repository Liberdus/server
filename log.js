 ✘ kyle@root  ~/Desktop/liberdus   typescript ●  npm i
npm WARN deprecated core-js@2.6.11: core-js@<3 is no longer maintained and not recommended for usage due to the number of issues. Please, upgrade your dependencies to the actual version of core-js@3.
npm WARN deprecated circular-json@0.3.3: CircularJSON is in maintenance only, flatted is its successor.
npm ERR! prepareGitDep 1> 
npm ERR! prepareGitDep > fsevents@1.2.11 install /Users/kyle/.npm/_cacache/tmp/git-clone-23cf266f/node_modules/fsevents
npm ERR! prepareGitDep > node-gyp rebuild
npm ERR! prepareGitDep 
npm ERR! prepareGitDep   SOLINK_MODULE(target) Release/.node
npm ERR! prepareGitDep   CXX(target) Release/obj.target/fse/fsevents.o
npm ERR! prepareGitDep   SOLINK_MODULE(target) Release/fse.node
npm ERR! prepareGitDep 
npm ERR! prepareGitDep > sodium-native@2.2.2 install /Users/kyle/.npm/_cacache/tmp/git-clone-23cf266f/node_modules/sodium-native
npm ERR! prepareGitDep > node-gyp-build "node preinstall.js" "node postinstall.js"
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 
npm ERR! prepareGitDep > sqlite3@4.1.1 install /Users/kyle/.npm/_cacache/tmp/git-clone-23cf266f/node_modules/sqlite3
npm ERR! prepareGitDep > node-pre-gyp install --fallback-to-build
npm ERR! prepareGitDep 
npm ERR! prepareGitDep [sqlite3] Success: "/Users/kyle/.npm/_cacache/tmp/git-clone-23cf266f/node_modules/sqlite3/lib/binding/node-v64-darwin-x64/node_sqlite3.node" is installed via remote
npm ERR! prepareGitDep 
npm ERR! prepareGitDep > core-js@2.6.11 postinstall /Users/kyle/.npm/_cacache/tmp/git-clone-23cf266f/node_modules/core-js
npm ERR! prepareGitDep > node -e "try{require('./postinstall')}catch(e){}"
npm ERR! prepareGitDep 
npm ERR! prepareGitDep Thank you for using core-js ( https://github.com/zloirock/core-js ) for polyfilling JavaScript standard library!
npm ERR! prepareGitDep 
npm ERR! prepareGitDep The project needs your help! Please consider supporting of core-js on Open Collective or Patreon: 
npm ERR! prepareGitDep > https://opencollective.com/core-js 
npm ERR! prepareGitDep > https://www.patreon.com/zloirock 
npm ERR! prepareGitDep 
npm ERR! prepareGitDep Also, the author of core-js ( https://github.com/zloirock ) is looking for a good job -)
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 
npm ERR! prepareGitDep > nodemon@1.18.4 postinstall /Users/kyle/.npm/_cacache/tmp/git-clone-23cf266f/node_modules/nodemon
npm ERR! prepareGitDep > node bin/postinstall || exit 0
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 
npm ERR! prepareGitDep > shardus-global-server@0.0.0 prepare /Users/kyle/.npm/_cacache/tmp/git-clone-23cf266f
npm ERR! prepareGitDep > npm run compile
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 
npm ERR! prepareGitDep > shardus-global-server@0.0.0 compile /Users/kyle/.npm/_cacache/tmp/git-clone-23cf266f
npm ERR! prepareGitDep > tsc -p .
npm ERR! prepareGitDep 
npm ERR! prepareGitDep src/consensus/index.js:1:1 - error TS9006: Declaration emit for this file requires using private name 'internal' from module '"events"'. An explicit type annotation may unblock declaration emit.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 1 const EventEmitter = require('events')
npm ERR! prepareGitDep   ~~~~~
npm ERR! prepareGitDep 
npm ERR! prepareGitDep src/load-detection/index.js:1:1 - error TS9006: Declaration emit for this file requires using private name 'internal' from module '"events"'. An explicit type annotation may unblock declaration emit.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 1 const EventEmitter = require('events')
npm ERR! prepareGitDep   ~~~~~
npm ERR! prepareGitDep 
npm ERR! prepareGitDep src/network/index.js:1:1 - error TS9006: Declaration emit for this file requires using private name 'internal' from module '"events"'. An explicit type annotation may unblock declaration emit.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 1 const EventEmitter = require('events')
npm ERR! prepareGitDep   ~~~~~
npm ERR! prepareGitDep 
npm ERR! prepareGitDep src/p2p/index.js:1:1 - error TS9006: Declaration emit for this file requires using private name 'internal' from module '"events"'. An explicit type annotation may unblock declaration emit.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 1 const util = require('util')
npm ERR! prepareGitDep   ~~~~~
npm ERR! prepareGitDep 
npm ERR! prepareGitDep src/p2p/p2p-state.js:1:1 - error TS9006: Declaration emit for this file requires using private name 'internal' from module '"events"'. An explicit type annotation may unblock declaration emit.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 1 const EventEmitter = require('events')
npm ERR! prepareGitDep   ~~~~~
npm ERR! prepareGitDep 
npm ERR! prepareGitDep src/shardus/index.js:1:1 - error TS9006: Declaration emit for this file requires using private name 'internal' from module '"events"'. An explicit type annotation may unblock declaration emit.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 1 const Logger = require('../logger')
npm ERR! prepareGitDep   ~~~~~
npm ERR! prepareGitDep 
npm ERR! prepareGitDep src/state-manager/index.js:1:1 - error TS9006: Declaration emit for this file requires using private name 'internal' from module '"events"'. An explicit type annotation may unblock declaration emit.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 1 const EventEmitter = require('events')
npm ERR! prepareGitDep   ~~~~~
npm ERR! prepareGitDep 
npm ERR! prepareGitDep src/statistics/index.js:1:1 - error TS9006: Declaration emit for this file requires using private name 'internal' from module '"events"'. An explicit type annotation may unblock declaration emit.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 1 const path = require('path')
npm ERR! prepareGitDep   ~~~~~
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 
npm ERR! prepareGitDep Found 8 errors.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 
npm ERR! prepareGitDep 2> npm WARN install Usage of the `--dev` option is deprecated. Use `--only=dev` instead.
npm ERR! prepareGitDep node-pre-gyp WARN Using request for node-pre-gyp https download 
npm ERR! prepareGitDep npm ERR! code ELIFECYCLE
npm ERR! prepareGitDep npm ERR! errno 1
npm ERR! prepareGitDep npm ERR! shardus-global-server@0.0.0 compile: `tsc -p .`
npm ERR! prepareGitDep npm ERR! Exit status 1
npm ERR! prepareGitDep npm ERR! 
npm ERR! prepareGitDep npm ERR! Failed at the shardus-global-server@0.0.0 compile script.
npm ERR! prepareGitDep npm ERR! This is probably not a problem with npm. There is likely additional logging output above.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep npm ERR! A complete log of this run can be found in:
npm ERR! prepareGitDep npm ERR!     /Users/kyle/.npm/_logs/2020-02-10T21_47_24_433Z-debug.log
npm ERR! prepareGitDep npm ERR! code ELIFECYCLE
npm ERR! prepareGitDep npm ERR! errno 1
npm ERR! prepareGitDep npm ERR! shardus-global-server@0.0.0 prepare: `npm run compile`
npm ERR! prepareGitDep npm ERR! Exit status 1
npm ERR! prepareGitDep npm ERR! 
npm ERR! prepareGitDep npm ERR! Failed at the shardus-global-server@0.0.0 prepare script.
npm ERR! prepareGitDep npm ERR! This is probably not a problem with npm. There is likely additional logging output above.
npm ERR! prepareGitDep 
npm ERR! prepareGitDep npm ERR! A complete log of this run can be found in:
npm ERR! prepareGitDep npm ERR!     /Users/kyle/.npm/_logs/2020-02-10T21_47_24_521Z-debug.log
npm ERR! prepareGitDep 
npm ERR! premature close

npm ERR! A complete log of this run can be found in:
npm ERR!     /Users/kyle/.npm/_logs/2020-02-10T21_47_24_615Z-debug.log