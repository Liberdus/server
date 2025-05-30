# NOTE: This Dockerfile compiles an image that uses Debian Stretch as its OS
#
# Build time is fast because the native modules used by our app
# (sodium-native, sqlite3) have precomiled binaries for Debian.
#
# However, the resulting image size is very large (~1.25GB).
#
# Useful for development, but don't ship it. Use 'Dockerfile' instead.
FROM node:18.16.1

# Link this Dockerfile to the image in the GHCR
LABEL "org.opencontainers.image.source"="https://github.com/liberdus/server"

# Create app directory
WORKDIR /usr/src/app

# Bundle app source
COPY . .

# Install Rust build chain for modules
RUN apt-get update && apt-get install -y \
    build-essential \
    curl
RUN curl https://sh.rustup.rs -sSf | bash -s -- -RUN curl https://sh.rustup.rs -sSf | bash -s -- -y \
    --default-toolchain 1.74.1y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install node_modules
RUN npm install

# Define run command
CMD [ "node", "dist/index.js" ]
