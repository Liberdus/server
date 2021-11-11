# NOTE: This Dockerfile compiles an image that uses Debian Stretch as its OS
#
# Build time is fast because the native modules used by our app
# (sodium-native, sqlite3) have precomiled binaries for Debian.
#
# However, the resulting image size is very large (~1.25GB).
#
# Useful for development, but don't ship it. Use 'Dockerfile' instead.

# Node.js LTS 12.x.x from Docker Hub
FROM node:16

# Create app directory
WORKDIR /usr/src/app

# Bundle app source
COPY . .

### Install packages for rust building ###

# Update default packages
RUN apt-get update

# Get Ubuntu packages
RUN apt-get install -y \
    build-essential \
    curl

# Update new packages
RUN apt-get update

# Get Rust
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y

# Add to path
ENV PATH="/root/.cargo/bin:${PATH}"

###

# Workaround for git permissions when installing shardus-global-server with npm
RUN --mount=type=secret,id=mysecret git config --global credential.helper "$(cat /run/secrets/mysecret)"

# Install node_modules
RUN npm set unsafe-perm true
RUN npm install

# Undo git workaround
RUN git config --global credential.helper cache

# Define run command
CMD [ "node", "dist/index.js" ]
