// Local workaround for monitor-server 2.8.9's one-shot archiver discovery.
// Reapply after installation until the dependency provides startup retries.
const fs = require('fs')
const path = require('path')

const original = `(0, lib_archiver_discovery_1.setupArchiverDiscovery)({
    customConfigPath: archiverConfigFilePath,
    customArchiverListEnv: 'ARCHIVER_INFO'
}).then(() => {
    console.log('Finished setting up archiver discovery!');
    start();
}).catch((e) => {
    console.error('Error setting up archiver discovery', e);
});`

const replacement = `// liberdus-monitor-discovery-retry
const startAfterArchiverDiscovery = async () => {
    for (;;) {
        try {
            await (0, lib_archiver_discovery_1.setupArchiverDiscovery)({
                customConfigPath: archiverConfigFilePath,
                customArchiverListEnv: 'ARCHIVER_INFO'
            });
            break;
        } catch (e) {
            console.error('Error setting up archiver discovery; retrying in 5 seconds', e);
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
    console.log('Finished setting up archiver discovery!');
    start();
};
startAfterArchiverDiscovery().catch((e) => {
    console.error('Error starting monitor server', e);
    process.exit(1);
});`

function patch(source) {
  const normalized = source.replace(/\r\n/g, '\n')
  if (normalized.includes(replacement)) return source
  if (!normalized.includes(original)) {
    throw new Error('Monitor startup code changed; review scripts/patch-monitor-startup.js before updating the dependency.')
  }
  return normalized.replace(original, replacement)
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..')
  let manifest
  try {
    manifest = require.resolve('@shardus/monitor-server/package.json', {paths: [root]})
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    console.log('Monitor dependency omitted; skipping startup patch.')
    process.exit(0)
  }
  const target = path.join(path.dirname(manifest), 'build/src/server.js')
  const source = fs.readFileSync(target, 'utf8')
  const updated = patch(source)
  if (updated !== source) fs.writeFileSync(target, updated)
  console.log('Monitor archiver-discovery retry patch applied.')
}

module.exports = {original, replacement, patch}
