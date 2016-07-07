var fs = require("fs");
var path = require("path").posix;

/**
 * FS walk matcher callback function
 *
 * @callback FsWalkMatcherCallback
 * @param {string} directory
 * @param {string} name
 */


/**
 * @typedef {Object} FsWalkOptions
 * @property exclude {string[]} list of items to exclude (exact match)
 * @property  matcher {FsWalkMatcherCallback} function that determines if file matches and should be included into search results
 */

/**
 * 
 * @param {string} directory directory to search in
 * @param {FsWalkOptions} options 
 * @returns {string[]} list of files found (unsorted)
 */
module.exports = function(directory, options) {
    var files = [];
	try {
		if (!fs.statSync(directory).isDirectory()) {
			return files;
		}
	} catch (e) {
		return files;
	}
    collect(directory, options || {}, files);
    files.sort();
    return files;
};

/**
 *
 * @param {string} directory
 * @param {FsWalkOptions} options
 * @param {string[]} files
 */
function collect(directory, options, files) {
    fs.readdirSync(directory).forEach(function(file) {
        if (options.exclude) {
            if (options.exclude.some(function(name) {
                    return file == name;
                })) {
                return;
            }
        }
        var p = path.join(directory, file);
        var isDirectory;
        try {
        	isDirectory = fs.statSync(p).isDirectory();
        } catch (e) {
        	// permissions, links in Docker mode
        	return;
        }

        if (isDirectory) {
            collect(p, options, files);
        } else {
            if (options.matcher && !options.matcher(directory, file)) {
                return;
            }
            files.push(p);
        }
    });
}
