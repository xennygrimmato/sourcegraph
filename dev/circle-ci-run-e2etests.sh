#!/bin/bash
set -ex

VERSION=$1

make dist PACKAGEFLAGS="--os=linux $VERSION"

cp release/$VERSION/linux-amd64 ./src

# Note: process is basically guaranteed to start here because it's already been tested
#       so extensively prior to this script even running, hence we don't do any
#       complex error checking.
src pgsql create -c --db=app
src pgsql create -c --db=graph
src serve &

WRITE_SCREENSHOTS=$CIRCLE_ARTIFACTS TARGET=http://localhost:3080 go test ./test/e2e -v -parallel=50
