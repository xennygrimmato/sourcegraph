package httpapi

import (
	"net/http"

	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/handlerutil"
)

func serveSourcegraphDesktopUpdateURL(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	clientVersion := r.Header.Get("Sourcegraph-Version")

	latestVersion, err := cl.Desktop.GetLatest(ctx, &sourcegraph.ClientDesktopVersion{
		ClientVersion: clientVersion,
	})
	if err != nil {
		return err
	}

	if latestVersion.Version == clientVersion {
		w.WriteHeader(http.StatusNoContent)
		return nil
	}

	url := map[string]string{
		"url": "https://github.com/attfarhan/desktop-test/releases/download/" + latestVersion.Version + "/Sourcegraph.zip",
	}
	return writeJSON(w, url)
}
