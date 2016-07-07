var fs = require('fs');

fs.readFile('package.json', function(err, data) {
  console.error('fs.read:', err, data);
});
