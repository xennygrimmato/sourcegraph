// @flow weak

function index(op, callback) {
	callback(null, {messages: ["a", "b"]});
}

module.exports = {index: index};
