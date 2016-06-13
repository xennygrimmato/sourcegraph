export function supportsAnnotatingFile(path) {
	if (!path) return false;

	const pathParts = path.split("/");
	let lang = pathParts[pathParts.length - 1].split(".")[1] || null;
	lang = lang ? lang.toLowerCase() : null;
	return lang === "go" || lang === "java";
}

export function parseGitHubURL(loc = window.location) {
	// TODO: this method has problems handling branch revisions with "/" character.
	const urlsplit = loc.pathname.slice(1).split("/");
	let user = urlsplit[0];
	let repo = urlsplit[1]
	let rev;
	if (urlsplit[3] && (urlsplit[2] === "tree" || urlsplit[2] === "blob")) {
		// TODO(rothfels): safely handle "commit" and other routes
		rev = urlsplit[3];
	}
	let path;
	if (urlsplit[2] === "blob") {
		path = urlsplit.slice(4).join("/");
	}
	return {user, repo, rev, path, isPullRequest: urlsplit[2] === "pull"};
}

export function parseGitHubRepoURI(loc = window.location) {
	const {user, repo} = parseGitHubURL(loc);
	return `github.com/${user}/${repo}`;
}

export function isGitHubURL(loc = window.location) {
	return Boolean(loc.href.match(/https:\/\/(www.)?github.com/));
}

export function isSourcegraphURL(loc = window.location) {
	return Boolean(loc.href.match(/https:\/\/(www.)?sourcegraph.com/));
}

export function getCurrentBranch() {
	if (document.getElementsByClassName("select-menu-button js-menu-target css-truncate")[0]) {
		if (document.getElementsByClassName("select-menu-button js-menu-target css-truncate")[0].title !== "") {
			return document.getElementsByClassName("select-menu-button js-menu-target css-truncate")[0].title
		} else {
			return document.getElementsByClassName("js-select-button css-truncate-target")[0].innerText;
		}
	} else {
		return "master";
	}
}
