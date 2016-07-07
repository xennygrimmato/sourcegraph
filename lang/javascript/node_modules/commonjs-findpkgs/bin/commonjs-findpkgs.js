#!/usr/bin/env nodejs

var path = require('path').posix;
var findpkgs = require('../findpkgs');

if (process.argv[2] == '-h') {
  console.error('Usage: commonjs-findpkgs [dir] (defaults to working dir)');
  process.exit(1)
}

var ignores;
if (process.argv[2] == '--ignore') {
  ignores = JSON.parse(process.argv[3]);
  process.argv.splice(2, 2);
}

var dir = process.argv[2];
if (!dir) dir = '.';

findpkgs(dir, ignores, function(err, pkgs) {
  if (err) {
    console.error(err);
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(pkgs, null, 2));
});
