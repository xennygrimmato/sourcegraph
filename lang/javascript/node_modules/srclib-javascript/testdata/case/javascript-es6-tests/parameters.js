var params = [ "hello", true, 7 ];
// spread operator
var other = [ 1, 2, ...params ];
// rest parameter
function rest (x, y, ...a) {
	a.length;
}
// default parameter
function defaultparam(x = 1) {
	return x;
}

// value provider for default parameter
function paramvalue() {
	return 42;
}

// default parameter call-time evaluation
function defaultparameval(x = paramvalue()) {
	return x;
}

