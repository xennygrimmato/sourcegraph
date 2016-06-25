#!/bin/bash

set -e # quit script if anything fails
cd /browser-ext
rm -rf node_modules
rm -rf build/
rm -rf dev/
npm install
npm run build
cd /browser-ext/build
export version_string=`grep \"version\" manifest.json`
version_string=${version_string:14:6}
zip -r /browser-ext/firefox-sourcegraph-dist-${GITHUB_HASH:0:8}-${version_string}.xpi *
zip -r /browser-ext/chrome-sourcegraph-dist-${GITHUB_HASH:0:8}-${version_string}.zip *
