# NOTE: This Dockerfile compiles an image that uses Alpine Linux as its OS
#
# Build time is very slow because the native modules used by our app
# (sodium-native, sqlite3) need to be be compiled for Alpine.
#
# However, the resulting image size is much smaller than dev (733MB vs 1.25GB).
#
# Ship this one, but don't use it for development. Use 'Dockerfile-dev' instead.

# Node.js LTS 12.x.x from Docker Hub
FROM node:16

# Create app directory
WORKDIR /usr/src/app

# Install packages for native module building
RUN apk add --no-cache --virtual .gyp git python make g++ libtool autoconf automake

# Bundle app source
COPY . .

# Install node_modules
RUN npm set unsafe-perm true
RUN npm install

# Remove module building packages
RUN apk del .gyp

# Define run command
CMD [ "node", "dist/index.js" ]
