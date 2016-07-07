var path = require('path').posix;
var fs = require('fs');
var readJson = require('read-package-json');
var findfiles = require('find-files-excluding-dirs');

// findpkgs finds CommonJS packages in dir, ignoring paths in ignores. The
// callback is called as cb(err, pkgs), where pkgs is an array of objects
// describing the packages that were found.
module.exports = function(dir, exclude, cb) {
  try {
    var files = findfiles(dir, {
      exclude: exclude,
      matcher: function(directory, file) {
        return file == 'package.json';
      }
    });
    if (!files.length) {
        return cb(null, []);
    }

    var pkgs = [];
    files.forEach(function(file) {
      readJson(file, function(err, data) {
        var pkgdir = path.dirname(file);

        var libFiles = findfiles(path.join(pkgdir, 'lib'), {
          matcher: jsmatcher
        });
        if (!err) {
          var mainFile = findMainFile(pkgdir, data.main || 'index');
          if (mainFile && libFiles.indexOf(mainFile) == -1) libFiles.push(mainFile);
        }

        var testFiles = findfiles(path.join(pkgdir, 'test'), {
          matcher: jsmatcher
        });
        pkgs.push({
          dir: pkgdir,
          packageJSONFile: file,
          package: data,
          error: err || undefined,
          libFiles: libFiles,
          testFiles: testFiles,
        });
        if (pkgs.length == files.length) cb(null, pkgs);
      });
    });
  } catch (e) {
    cb(e);
  }
};

function findMainFile(dir, main) {
  var poss = [main];
  if (!/\.js(on)?$/.test(main)) poss.push(main + '.js', main + '.json');
  var found;
  poss.forEach(function(f) {
    if (fs.existsSync(path.join(dir, f))) found = f;
  });
  if (found) return path.join(dir, found);
}

function jsmatcher(directory, file) {
	return /\.js$/.test(file);
}
