// This function escapes user input "str", and ensures that eveything in "str" is used
// as a literal string when feeding the output to a RegExp constructor.
// Taken from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
export default function(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
