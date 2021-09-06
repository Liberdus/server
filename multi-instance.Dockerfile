# NOTE: This Dockerfile compiles an image that uses Debian Stretch as its OS
#
# Build time is fast because the native modules used by our app
# (sodium-native, sqlite3) have precomiled binaries for Debian.
#
# However, the resulting image size is very large (~1.25GB).
#
# Useful for development, but don't ship it. Use 'Dockerfile' instead.

# Node.js LTS 12.x.x from Docker Hub
FROM node:12

# Create app directory
WORKDIR /usr/src/app

# Bundle app source
COPY . .

# Install node_modules
RUN npm set unsafe-perm true
RUN npm install

# Install shardus-network tool
RUN npm install https://gitlab.com/shardus/tools/shardus-network.git#external-support-nodes

COPY node_modules/shardus-global-server node_modules/shardus-global-server 

RUN npm run compile

# Start a local network of 10 nodes
CMD [ "sh", "-c", "npx shardus-network create --auto-ip --existing-archivers \"$server_p2p_existingArchivers\" --monitor-url \"$server_reporting_recipient\" 10" ]
