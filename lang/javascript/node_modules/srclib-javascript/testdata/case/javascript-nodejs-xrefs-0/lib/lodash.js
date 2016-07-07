var _ = require('lodash');

_.each([1, 2, 3], console.log);

var thrice = _.map([1, 2, 3], function(num){ return num * 3; });
console.log('thrice:', thrice);

var list = [[0, 1], [2, 3], [4, 5]];
var flat = _.reduceRight(list, function(a, b) { return a.concat(b); }, []);
console.log('flat:', flat);

var even = _.find([1, 2, 3, 4, 5, 6], function(num){ return num % 2 == 0; });
console.log('even:', even);

var evens = _.filter([1, 2, 3, 4, 5, 6], function(num){ return num % 2 == 0; });
console.log('evens:', evens);

var odds = _.reject([1, 2, 3, 4, 5, 6], function(num){ return num % 2 == 0; });
console.log('odds:', odds);
