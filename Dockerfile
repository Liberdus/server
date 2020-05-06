# Node.js LTS 10.x.x from Docker Hub
FROM node:10-alpine

# Create app directory
WORKDIR /usr/src/app

# Install deps for native module building
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
