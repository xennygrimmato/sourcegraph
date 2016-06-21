package httpapi

import (
	"net/http"

	"github.com/gorilla/mux"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/handlerutil"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/routevar"
)

func serveRepoConfig(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	repo, err := resolveLocalRepo(ctx, routevar.ToRepo(mux.Vars(r)))
	if err != nil {
		return err
	}

	config, err := cl.Repos.GetConfig(ctx, &sourcegraph.RepoSpec{ID: repo})
	if err != nil {
		return err
	}
	return writeJSON(w, config)
}
