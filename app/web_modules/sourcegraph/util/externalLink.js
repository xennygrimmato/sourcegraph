// @flow

// isExternalLink returns true if given URL is considered as external link.
export function isExternalLink(url: string): bool {
	// TODO(sqs): remove this special-casing
	if (url.includes("#L") || url.startsWith("/search?q=") || url.startsWith("/search%3F")) return true;

	return (/^https?:\/\/(nodejs\.org|developer\.mozilla\.org)/).test(url);
}
