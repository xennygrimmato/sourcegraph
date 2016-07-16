/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Perf measurements
global.vscodeStart = Date.now();

var app = require('electron').app;
var fs = require('fs');
var path = require('path');
var paths = require('./paths');
var pkg = require('../package.json');

function stripComments(content) {
	var regexp = /("(?:[^\\\"]*(?:\\.)?)*")|('(?:[^\\\']*(?:\\.)?)*')|(\/\*(?:\r?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))/g;
	var result = content.replace(regexp, function (match, m1, m2, m3, m4) {
		// Only one of m1, m2, m3, m4 matches
		if (m3) {
			// A block comment. Replace with nothing
			return '';
		}
		else if (m4) {
			// A line comment. If it ends in \r?\n then keep it.
			var length_1 = m4.length;
			if (length_1 > 2 && m4[length_1 - 1] === '\n') {
				return m4[length_1 - 2] === '\r' ? '\r\n' : '\n';
			}
			else {
				return '';
			}
		}
		else {
			// We match a string
			return match;
		}
	});
	return result;
};

function getNLSConfiguration() {
	var locale = undefined;
	var localeOpts = '--locale';
	for (var i = 0; i < process.argv.length; i++) {
		var arg = process.argv[i];
		if (arg.slice(0, localeOpts.length) == localeOpts) {
			var segments = arg.split('=');
			locale = segments[1];
			break;
		}
	}

	if (!locale) {
		var userData = app.getPath('userData');
		var localeConfig = path.join(userData, 'User', 'locale.json');
		if (fs.existsSync(localeConfig)) {
			try {
				var content = stripComments(fs.readFileSync(localeConfig, 'utf8'));
				var value = JSON.parse(content).locale;
				if (value && typeof value === 'string') {
					locale = value;
				}
			} catch (e) {
			}
		}
	}

	var appLocale = app.getLocale();
	locale = locale || appLocale;
	// Language tags are case insensitve however an amd loader is case sensitive
	// To make this work on case preserving & insensitive FS we do the following:
	// the language bundles have lower case language tags and we always lower case
	// the locale we receive from the user or OS.
	locale = locale ? locale.toLowerCase() : locale;
	if (locale === 'pseudo') {
		return { locale: locale, availableLanguages: {}, pseudo: true }
	}
	var initialLocale = locale;
	if (process.env['VSCODE_DEV']) {
		return { locale: locale, availableLanguages: {} };
	}

	// We have a built version so we have extracted nls file. Try to find
	// the right file to use.

	// Check if we have an English locale. If so fall to default since that is our
	// English translation (we don't ship *.nls.en.json files)
	if (locale && (locale == 'en' || locale.startsWith('en-'))) {
		return { locale: locale, availableLanguages: {} };
	}

	function resolveLocale(locale) {
		while (locale) {
			var candidate = path.join(__dirname, 'vs', 'code', 'electron-main', 'main.nls.') + locale + '.js';
			if (fs.existsSync(candidate)) {
				return { locale: initialLocale, availableLanguages: { '*': locale } };
			} else {
				var index = locale.lastIndexOf('-');
				if (index > 0) {
					locale = locale.substring(0, index);
				} else {
					locale = null;
				}
			}
		}
		return null;
	}

	var resolvedLocale = resolveLocale(locale);
	if (!resolvedLocale && appLocale && appLocale !== locale) {
		resolvedLocale = resolveLocale(appLocale);
	}
	return resolvedLocale ? resolvedLocale : { locale: initialLocale, availableLanguages: {} };
}

// Update cwd based on environment and platform
try {
	if (process.platform === 'win32') {
		process.env['VSCODE_CWD'] = process.cwd(); // remember as environment variable
		process.chdir(path.dirname(app.getPath('exe'))); // always set application folder as cwd
	} else if (process.env['VSCODE_CWD']) {
		process.chdir(process.env['VSCODE_CWD']);
	}
} catch (err) {
	console.error(err);
}

// Set userData path before app 'ready' event
var userData = paths.getUserDataPath(process.platform, pkg.name, process.argv);
app.setPath('userData', userData);

// Mac: when someone drops a file to the not-yet running VSCode, the open-file event fires even before
// the app-ready event. We listen very early for open-file and remember this upon startup as path to open.
global.macOpenFiles = [];
app.on('open-file', function (event, path) {
	global.macOpenFiles.push(path);
});

// Load our code once ready
app.once('ready', function () {
	var nlsConfig = getNLSConfiguration();
	process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfig);
	require('./bootstrap-amd').bootstrap('vs/code/electron-main/main');
});
