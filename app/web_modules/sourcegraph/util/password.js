import sjcl from "sjcl";

export default function(password) {
	let hex = sjcl.codec.hex;
	return hex.fromBits(sjcl.misc.pbkdf2(password, hex.toBits("78 57 8E 5A 5D 63 CB 06"), 4096));
}
