package httpapi

import (
	"github.com/sourcegraph/go-github/github"
	"net/http"
)

func serveSourcegraphDesktopUpdateURL(w http.ResponseWriter, r *http.Request) error {
	latestVersion, err := getLatestRelease()
	if err != nil {
		return err
	}
	clientVersion := r.Header.Get("Sourcegraph-Version")
	if latestVersion == clientVersion {
		w.WriteHeader(http.StatusNoContent)
		return nil
	}

	url := map[string]string{
		"url": "https://github.com/attfarhan/desktop-test/releases/download/" + latestVersion + "/Sourcegraph.zip",
	}
	return writeJSON(w, url)
}

func getLatestRelease() (string, error) {
	client := github.NewClient(nil)
	latestRelease, _, err := client.Repositories.GetLatestRelease("attfarhan", "desktop-test")
	if err != nil {
		return "", err
	}

	return (*latestRelease.TagName), nil
}
