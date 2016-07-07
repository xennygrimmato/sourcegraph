var readJson = require('read-package-json');
readJson('package.json', function(err, data) {
  console.log('readJson:', err, data);
});
