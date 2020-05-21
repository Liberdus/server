#!/usr/bin/env bash

docker buildx build --platform=linux/arm/v7 -t registry.gitlab.com/liberdus/server:raspberrypi -f dev.Dockerfile .
docker push registry.gitlab.com/liberdus/server:raspberrypi