var fs = require('fs');
var async = require('async');

async.map(['package.json', 'index.js'], fs.stat, function(err, results){
  console.log('map:', err, results);
});

async.filter(['package.json','index.js'], fs.exists, function(results){
  console.log('filter:', results);
});
