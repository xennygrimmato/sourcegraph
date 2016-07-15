#!/bin/bash
set -ex

docker run -d -p 4444:4444 selenium/standalone-chrome
