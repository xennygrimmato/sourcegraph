var glob = require('glob');

console.log('glob.sync:', glob.sync('*.js'));
glob('*.js', function(err, files) {
  console.log('glob:', err, files);
})
